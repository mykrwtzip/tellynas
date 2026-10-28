import { NextResponse } from 'next/server';
import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import {
  childFolders,
  createStoredFolder,
  deleteStoredFolder,
  getIndex,
  normalizeFolder,
  renameStoredFolder,
} from '@/lib/store';

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

    const result = await createStoredFolder(body.parent, body.name);
    if (!result.ok) {
      const status = result.error.includes('already exists') ? 409 : 400;
      return jsonError(result.error, status);
    }
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

    const result = await renameStoredFolder(body.path, body.name);
    if (!result.ok) {
      const status = result.error.includes('already exists') ? 409 : 400;
      return jsonError(result.error, status);
    }
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

    const removed = await deleteStoredFolder(path);
    return NextResponse.json({
      success: true,
      removedFiles: removed.removedFiles,
      removedBytes: removed.removedBytes,
    });
  });
}
