import { NextResponse } from 'next/server';
import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import { createShare, getIndex, normalizeFolder } from '@/lib/store';
import { hashSharePassword } from '@/lib/share-security';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  return withApiGuard(async () => {
    const body = await request.json().catch(() => null);
    const path = normalizeFolder(body?.path);
    if (!path || !(await getIndex()).folders.some(folder => folder.path === path)) return jsonError('Folder not found.', 404);
    const expiresAt = body?.expiresAt === undefined ? undefined : Number(body.expiresAt);
    if (expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) return jsonError('Expiry must be in the future.', 400);
    if (body?.password !== undefined && (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128)) return jsonError('Share password must be 12–128 characters.', 400);
    const token = crypto.randomUUID();
    await createShare({ token, targetId: path, targetType: 'folder', expiresAt, passwordHash: body.password ? await hashSharePassword(body.password) : undefined });
    return NextResponse.json({ success: true, token, url: `/share/${token}` });
  });
}
