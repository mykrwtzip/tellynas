import { NextResponse } from 'next/server';
import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import { deleteStoredFile, getStoredFile, updateStoredFile } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    const { id } = await context.params;
    const file = await getStoredFile(id);
    if (!file) return jsonError('File not found.', 404);
    return NextResponse.json({ file });
  });
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

    const updated = await updateStoredFile(id, body);
    if (!updated) return jsonError('File not found.', 404);
    return NextResponse.json({ success: true, file: updated });
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    const { id } = await context.params;
    const removed = await deleteStoredFile(id);
    if (!removed) return jsonError('File not found.', 404);
    return NextResponse.json({ success: true });
  });
}
