import { NextResponse } from 'next/server';
import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import { getDriver } from '@/lib/driver';
import {
  childFolders,
  getIndex,
  mutateIndex,
  normalizeFolder,
  sanitizeName,
} from '@/lib/store';
import type { StoredFile } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    const url = new URL(request.url);
    const folder = normalizeFolder(url.searchParams.get('folder'));
    const index = await getIndex();
    return NextResponse.json({ folders: childFolders(index, folder) });
  });
}

export async function POST(request: Request) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    let body: { parent?: string; name?: string };
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON body.', 400);
    }

    const parent = normalizeFolder(body.parent);
    const name = sanitizeName(body.name, '');
    if (!name) return jsonError('Give the folder a name.', 400);

    const path = parent ? `${parent}/${name}` : name;

    const result = await mutateIndex((index) => {
      if (index.folders.some((entry) => entry.path.toLowerCase() === path.toLowerCase())) {
        return { ok: false as const, error: 'A folder with that name already exists.' };
      }

      const segments = path.split('/');
      for (let i = 0; i < segments.length; i += 1) {
        const current = segments.slice(0, i + 1).join('/');
        if (!index.folders.some((entry) => entry.path === current)) {
          index.folders.push({ path: current, createdAt: Date.now() });
        }
      }
      return { ok: true as const, path };
    });

    if (!result.ok) return jsonError(result.error, 409);
    return NextResponse.json({ success: true, path: result.path });
  });
}

export async function PATCH(request: Request) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    let body: { path?: string; name?: string };
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON body.', 400);
    }

    const path = normalizeFolder(body.path);
    const name = sanitizeName(body.name, '');
    if (!path) return jsonError('Missing folder path.', 400);
    if (!name) return jsonError('Give the folder a name.', 400);

    const result = await mutateIndex((index) => {
      const segments = path.split('/');
      const parent = segments.slice(0, -1).join('/');
      const target = parent ? `${parent}/${name}` : name;

      if (
        index.folders.some(
          (entry) => entry.path.toLowerCase() === target.toLowerCase(),
        )
      ) {
        return { ok: false as const, error: 'A folder with that name already exists.' };
      }

      const renamePath = (value: string) =>
        value === path || value.startsWith(`${path}/`)
          ? `${target}${value.slice(path.length)}`
          : value;

      index.folders = index.folders.map((entry) => ({
        ...entry,
        path: renamePath(entry.path),
      }));
      index.files = index.files.map((file) =>
        file.folder === path || file.folder.startsWith(`${path}/`)
          ? { ...file, folder: renamePath(file.folder), updatedAt: Date.now() }
          : file,
      );

      return { ok: true as const, path: target };
    });

    if (!result.ok) return jsonError(result.error, 409);
    return NextResponse.json({ success: true, path: result.path });
  });
}

export async function DELETE(request: Request) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    const url = new URL(request.url);
    const path = normalizeFolder(url.searchParams.get('path'));
    if (!path) return jsonError('Refusing to delete the root folder.', 400);

    const removed = await mutateIndex((index) => {
      const doomed = index.files.filter(
        (file) => file.folder === path || file.folder.startsWith(`${path}/`),
      );
      index.files = index.files.filter((file) => !doomed.includes(file));
      index.folders = index.folders.filter(
        (entry) => entry.path !== path && !entry.path.startsWith(`${path}/`),
      );
      return doomed as StoredFile[];
    });

    const messageIds = removed.flatMap((file) => file.chunks.map((c) => c.messageId));
    if (messageIds.length) {
      await getDriver().deleteMessages(messageIds);
    }

    return NextResponse.json({
      success: true,
      removedFiles: removed.length,
      removedBytes: removed.reduce((sum, file) => sum + file.size, 0),
    });
  });
}
