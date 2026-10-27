import { NextResponse } from 'next/server';
import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import { getDriver } from '@/lib/driver';
import { getIndex, mutateIndex, normalizeFolder, sanitizeName } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const index = await getIndex();
  const file = index.files.find((entry) => entry.id === id);
  if (!file) return jsonError('File not found.', 404);
  return NextResponse.json({ file });
}

export async function PATCH(request: Request, context: RouteContext) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    const { id } = await context.params;
    let body: { name?: string; folder?: string; starred?: boolean };
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON body.', 400);
    }

    const updated = await mutateIndex((index) => {
      const file = index.files.find((entry) => entry.id === id);
      if (!file) return null;

      if (typeof body.name === 'string' && body.name.trim()) {
        file.name = sanitizeName(body.name, file.name);
      }
      if (typeof body.folder === 'string') {
        file.folder = normalizeFolder(body.folder);
      }
      if (typeof body.starred === 'boolean') {
        file.starred = body.starred;
      }
      file.updatedAt = Date.now();

      if (typeof body.folder === 'string') {
        const segments = file.folder.split('/').filter(Boolean);
        for (let i = 0; i < segments.length; i += 1) {
          const path = segments.slice(0, i + 1).join('/');
          if (!index.folders.some((entry) => entry.path === path)) {
            index.folders.push({ path, createdAt: Date.now() });
          }
        }
      }

      return file;
    });

    if (!updated) return jsonError('File not found.', 404);
    return NextResponse.json({ success: true, file: updated });
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    const { id } = await context.params;

    const removed = await mutateIndex((index) => {
      const position = index.files.findIndex((entry) => entry.id === id);
      if (position === -1) return null;
      const [file] = index.files.splice(position, 1);
      return file;
    });

    if (!removed) return jsonError('File not found.', 404);

    await getDriver().deleteMessages(removed.chunks.map((chunk) => chunk.messageId));
    return NextResponse.json({ success: true });
  });
}
