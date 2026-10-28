import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { appConfig } from './config';
import type { StorageShare } from './types';

const scrypt = promisify(scryptCallback);
export async function hashSharePassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 32)) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}
export async function checkSharePassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{64}$/.test(hash || '')) return false;
  const candidate = (await scrypt(password, salt, 32)) as Buffer;
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}
export function shareCookieName(token: string) { return `share_${token.replace(/[^a-zA-Z0-9]/g, '')}`; }
export function shareGrant(share: StorageShare) {
  return createHmac('sha256', appConfig.authSecret).update(`share-grant:${share.token}:${share.passwordHash}`).digest('hex');
}
export async function canAccessShare(share: StorageShare) {
  if (!share.passwordHash) return true;
  const grant = (await cookies()).get(shareCookieName(share.token))?.value || '';
  const expected = shareGrant(share);
  if (!/^[a-f0-9]{64}$/.test(grant)) return false;
  return timingSafeEqual(Buffer.from(grant, 'hex'), Buffer.from(expected, 'hex'));
}
