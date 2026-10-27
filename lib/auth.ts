/**
 * Stateless session auth built on a signed (HMAC-SHA256) cookie.
 * Uses Web Crypto so the same helpers run in route handlers and middleware.
 */

import { appConfig } from './config';

export const SESSION_COOKIE = 'tellynas_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

type SessionPayload = {
  sub: string;
  iat: number;
  exp: number;
};

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(appConfig.authSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function sign(data: string): Promise<Uint8Array> {
  const key = await getKey();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return new Uint8Array(signature);
}

export async function createSessionToken(username: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: username,
    iat: now,
    exp: now + SESSION_MAX_AGE,
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = toBase64Url(await sign(body));
  return `${body}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  try {
    const expected = await sign(body);
    const provided = fromBase64Url(signature);
    if (expected.length !== provided.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i += 1) diff |= expected[i] ^ provided[i];
    if (diff !== 0) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(body)),
    ) as SessionPayload;
    if (!payload?.exp || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function credentialsAreValid(username: string, password: string): boolean {
  // Constant-ish time comparison keeps the endpoint from leaking length info.
  const expectedUser = appConfig.appUsername;
  const expectedPass = appConfig.appPassword;
  const safeEqual = (a: string, b: string) => {
    const length = Math.max(a.length, b.length);
    let diff = a.length ^ b.length;
    for (let i = 0; i < length; i += 1) {
      diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return diff === 0;
  };
  return safeEqual(username, expectedUser) && safeEqual(password, expectedPass);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE,
  secure: process.env.NODE_ENV === 'production',
};
