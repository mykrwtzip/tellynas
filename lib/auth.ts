/**
 * Stateless session auth built on a signed (HMAC-SHA256) cookie.
 *
 * Deliberately dependency-free: no `atob` / `btoa`, no Node `Buffer`, only
 * `globalThis.crypto` (available in Node 18+, Edge, and browsers) so the exact
 * same helpers work in route handlers and server components.
 */

import { appConfig } from './config';

export const SESSION_COOKIE = 'tellynas_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

type SessionPayload = {
  sub: string;
  iat: number;
  exp: number;
};

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Base64url (RFC 4648 §5) without any runtime base64 helpers. */
export function toBase64Url(bytes: Uint8Array): string {
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];

    output += ALPHABET[b0 >> 2];
    output += ALPHABET[((b0 & 0b11) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    output += ALPHABET[((b1 & 0b1111) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    output += ALPHABET[b2 & 0b111111];
  }
  return output;
}

export function fromBase64Url(value: string): Uint8Array {
  const clean = value.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base64url input');
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

function getCrypto(): Crypto {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) {
    throw new Error(
      'Web Crypto is unavailable. Node.js 18+ (or an Edge runtime) is required.',
    );
  }
  return crypto;
}

async function getKey(): Promise<CryptoKey> {
  return getCrypto().subtle.importKey(
    'raw',
    encoder.encode(appConfig.authSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function sign(data: string): Promise<Uint8Array> {
  const signature = await getCrypto().subtle.sign(
    'HMAC',
    await getKey(),
    encoder.encode(data),
  );
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

    const payload = JSON.parse(decoder.decode(fromBase64Url(body))) as SessionPayload;
    if (!payload?.exp || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    // Malformed cookie, missing secret, unavailable crypto — all mean "no session".
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
