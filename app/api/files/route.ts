import { NextResponse } from 'next/server';
import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import type { StoredFile } from '@/lib/types';
import {
  childFolders,
  computeStats,
  deleteStoredFiles,
  filesInFolder,
  getIndex,
  normalizeFolder,
  purgeStoredFiles,
} from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    const url = new URL(request.url);
    const folder = normalizeFolder(url.searchParams.get('folder'));
    const query = (url.searchParams.get('q') || '').trim().toLowerCase();
    const wantsAll = url.searchParams.get('all') === '1';
    const onlyArchived = url.searchParams.get('archived') === '1';
    const includeArchived = url.searchParams.get('includeArchived') === '1';

    // Support conditional GET via ETag derived from directory updatedAt – saves bandwidth on poll.
    const ifNoneMatch = request.headers.get('if-none-match');

    const index = await getIndex();

    // Derive ETag from the freshest timestamps to enable 304 handling without extra Telegram calls.
    const etagBase = `${index.files.length}:${index.folders.length}:${Math.max(0, ...index.files.map((f) => f.updatedAt), ...index.folders.map((f) => f.createdAt), 0)}`;
    const etag = `"${Buffer.from(etagBase).toString('base64url')}"`;
    if (ifNoneMatch === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'private, no-cache' } });
    }

    // Archived files live in the Archive view; they are hidden from the active
    // library unless explicitly requested.
    const matchesArchiveFilter = (file: StoredFile) =>
      onlyArchived
        ? file.archived
        : includeArchived
          ? true
          : !file.archived;

    const commonHeaders = { ETag: etag, 'Cache-Control': 'private, no-cache' as const };

    // The whole library in one payload: the client filters folders, search and
    // starred views locally so navigation feels instant.
    if (wantsAll) {
      return NextResponse.json(
        {
          folder: '',
          files: [...index.files]
            .filter(matchesArchiveFilter)
            .sort((a, b) => b.createdAt - a.createdAt),
          folders: [...index.folders].sort((a, b) => a.path.localeCompare(b.path)),
          stats: computeStats(index),
        },
        { headers: commonHeaders },
      );
    }

    if (query) {
      const matches = index.files
        .filter(matchesArchiveFilter)
        .filter(
          (file) =>
            file.name.toLowerCase().includes(query) ||
            file.folder.toLowerCase().includes(query),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt);

      if (!folder && matches.length === 0) {
        return NextResponse.json({ folder, files: [], folders: [], stats: computeStats(index) }, { headers: commonHeaders });
      }

      return NextResponse.json(
        {
          folder,
          files: matches,
          folders: [],
          stats: computeStats(index),
          searching: true,
        },
        { headers: commonHeaders },
      );
    }

    if (folder && !index.folders.some((entry) => entry.path === folder)) {
      const hasFiles = index.files.some(
        (file) => matchesArchiveFilter(file) && file.folder.startsWith(folder),
      );
      if (!hasFiles) return jsonError('That folder no longer exists.', 404);
    }

    return NextResponse.json(
      {
        folder,
        files: filesInFolder(index, folder).filter(matchesArchiveFilter),
        folders: childFolders(index, folder),
        stats: computeStats(index),
      },
      { headers: commonHeaders },
    );
  });
}

export async function DELETE(request: Request) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);

  return withApiGuard(async () => {
    let body: { ids?: unknown };
    try {
      body = (await request.json()) as { ids?: unknown };
    } catch {
      return jsonError('Invalid JSON body.', 400);
    }

    const ids = Array.isArray(body.ids)
      ? body.ids.map((id) => String(id || '')).filter(Boolean)
      : [];
    if (ids.length === 0) {
      return jsonError('Select at least one file to delete.', 400);
    }

    const purge = url.searchParams.get('purge') === '1';
    const count = purge
      ? await purgeStoredFiles(ids)
      : await deleteStoredFiles(ids);
    return NextResponse.json({
      success: true,
      deletedCount: count,
      ...(purge ? { purged: true } : { archived: true }),
    });
  });
}
