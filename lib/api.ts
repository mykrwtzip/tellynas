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
    // Preserve TelegramError status codes for actionable UI messages
    const status =
      error instanceof Error && 'status' in error && typeof (error as { status?: unknown }).status === 'number'
        ? ((error as { status: number }).status as number)
        : 500;
    // 4xx errors are user-actionable (bad config), don't log as error
    if (status >= 500) console.error('[tellynas] API error:', error);
    else console.warn('[tellynas] API warn:', message);
    return jsonError(message, status >= 400 && status < 600 ? status : 500);
  }
}
