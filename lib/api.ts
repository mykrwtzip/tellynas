import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './auth';

export type ApiError = { error: string };

export const jsonError = (message: string, status = 400) =>
  NextResponse.json<ApiError>({ error: message }, { status });

export async function getSession() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** Returns a 401 response when the caller has no valid session, otherwise null. */
export async function requireSession(): Promise<NextResponse<ApiError> | null> {
  const session = await getSession();
  if (session) return null;
  return jsonError('Your session expired. Please sign in again.', 401);
}

/** Wraps a handler so unexpected errors always become JSON, never HTML. */
export async function withApiGuard<T>(
  handler: () => Promise<T>,
): Promise<T | NextResponse<ApiError>> {
  try {
    return await handler();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected server error.';
    console.error('[tellynas] API error:', error);
    return jsonError(message, 500);
  }
}
