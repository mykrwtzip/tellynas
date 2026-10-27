import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  createSessionToken,
  credentialsAreValid,
  sessionCookieOptions,
} from '@/lib/auth';
import { jsonError } from '@/lib/api';

export const runtime = 'nodejs';

// Extremely small in-memory throttle: 8 attempts / 5 minutes per IP.
const attempts = new Map<string, { count: number; resetAt: number }>();

function isThrottled(ip: string) {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= 8;
}

function recordAttempt(ip: string) {
  const entry = attempts.get(ip);
  if (!entry || Date.now() > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: Date.now() + 5 * 60_000 });
    return;
  }
  entry.count += 1;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local';

  if (isThrottled(ip)) {
    return jsonError('Too many attempts. Please wait a few minutes.', 429);
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid request body.', 400);
  }

  const username = String(body?.username || '').trim();
  const password = String(body?.password || '');

  if (!username || !password) {
    return jsonError('Enter both a username and a password.', 400);
  }

  recordAttempt(ip);

  if (!credentialsAreValid(username, password)) {
    return jsonError('Those credentials do not match.', 401);
  }

  const token = await createSessionToken(username);
  const response = NextResponse.json({ success: true, username });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}
