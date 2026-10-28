import { NextResponse } from 'next/server';
import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import { createShare, getStoredFile } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    const { id } = await context.params;
    const file = await getStoredFile(id);
    if (!file) return jsonError('File not found.', 404);

    let body: { expiresAt?: number };
    try {
      body = (await request.json()) as { expiresAt?: number };
    } catch {
      body = {};
    }

    const expiresAt = body.expiresAt ? Number(body.expiresAt) : undefined;
    if (
      expiresAt !== undefined &&
      (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
    ) {
      return jsonError('Expiry must be a time in the future.', 400);
    }

    const token = crypto.randomUUID();
    const share = await createShare({ targetId: id, token, expiresAt });

    return NextResponse.json({
      success: true,
      token,
      url: `/api/share/${token}/download`,
    });
  });
}
