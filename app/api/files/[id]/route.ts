import { NextResponse, NextRequest } from 'next/server';
import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import {
  deleteStoredFile,
  getStoredFile,
  purgeStoredFile,
  updateStoredFile,
} from '@/lib/store';

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
    let body: {
      name?: string;
      folder?: string;
      starred?: boolean;
      archived?: boolean;
    };
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

export async function DELETE(request: NextRequest, context: RouteContext) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    const { id } = await context.params;
    const purge = request.nextUrl.searchParams.get('purge') === '1';

    if (purge) {
      const removed = await purgeStoredFile(id);
      if (!removed) return jsonError('File not found.', 404);
      return NextResponse.json({ success: true, purged: true });
    }

    // Default: move to the Archive (soft delete). The file can be restored or
    // purged forever later from the Archive view.
    const removed = await deleteStoredFile(id);
    if (!removed) return jsonError('File not found.', 404);
    return NextResponse.json({ success: true, archived: true, file: removed });
  });
}
