import { NextResponse } from 'next/server';
import { jsonError, withApiGuard } from '@/lib/api';
import { getShares } from '@/lib/store';
import { checkSharePassword, shareCookieName, shareGrant } from '@/lib/share-security';

export const runtime = 'nodejs';
// This is only a per-process safety net. Production should additionally use a
// shared rate limiter at the reverse proxy / hosting firewall.
const attempts = new Map<string, { count: number; until: number }>();
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const key = `${ip}:${token}`;
  const now = Date.now();
  if (attempts.size > 10000) for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  const entry = attempts.get(key);
  if (entry && entry.until > now && entry.count >= 8) return jsonError('Too many attempts. Try again later.', 429);
  attempts.set(key, { count: entry && entry.until > now ? entry.count + 1 : 1, until: entry && entry.until > now ? entry.until : now + 300000 });
  return withApiGuard(async () => {
    const share = (await getShares()).find(s => s.token === token);
    if (!share || (share.expiresAt && share.expiresAt <= now)) return jsonError('Link unavailable.', 404);
    const body = await request.json().catch(() => null);
    if (!share.passwordHash || typeof body?.password !== 'string' || body.password.length > 128 || !(await checkSharePassword(body.password, share.passwordHash))) return jsonError('Incorrect password.', 403);
    attempts.delete(key);
    const response = NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(shareCookieName(token), shareGrant(share), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 3600 });
    return response;
  });
}
