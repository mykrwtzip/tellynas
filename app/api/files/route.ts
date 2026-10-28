import { NextResponse } from 'next/server';
import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import {
  childFolders,
  computeStats,
  deleteStoredFiles,
  filesInFolder,
  getIndex,
  normalizeFolder,
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
    const index = await getIndex();

    // The whole library in one payload: the client filters folders, search and
    // starred views locally so navigation feels instant.
    if (wantsAll) {
      return NextResponse.json({
        folder: '',
        files: [...index.files].sort((a, b) => b.createdAt - a.createdAt),
        folders: [...index.folders].sort((a, b) => a.path.localeCompare(b.path)),
        stats: computeStats(index),
      });
    }

    if (query) {
      const matches = index.files
        .filter(
          (file) =>
            file.name.toLowerCase().includes(query) ||
            file.folder.toLowerCase().includes(query),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt);

      if (!folder && matches.length === 0) {
        return NextResponse.json({ folder, files: [], folders: [], stats: computeStats(index) });
      }

      return NextResponse.json({
        folder,
        files: matches,
        folders: [],
        stats: computeStats(index),
        searching: true,
      });
    }

    if (folder && !index.folders.some((entry) => entry.path === folder)) {
      const hasFiles = index.files.some((file) => file.folder.startsWith(folder));
      if (!hasFiles) return jsonError('That folder no longer exists.', 404);
    }

    return NextResponse.json({
      folder,
      files: filesInFolder(index, folder),
      folders: childFolders(index, folder),
      stats: computeStats(index),
    });
  });
}

export async function DELETE(request: Request) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

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

    const deletedCount = await deleteStoredFiles(ids);
    return NextResponse.json({ success: true, deletedCount });
  });
}
