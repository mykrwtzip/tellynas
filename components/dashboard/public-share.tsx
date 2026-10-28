'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client-api';

type Share = Awaited<ReturnType<typeof api.shares>>[number];

export function PublicShare({ fileId, targetType = 'file' }: { fileId: string; targetType?: 'file' | 'folder' }) {
  const [links, setLinks] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    let active = true;
    api.shares().then(shares => { if (active) setLinks(shares.filter(item => item.file.id === fileId && (item.share.targetType || 'file') === targetType)); })
      .catch(() => { if (active) setError('Could not load public links.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fileId, targetType]);

  const create = async () => {
    const number = Number(days);
    if (days && (!Number.isFinite(number) || number <= 0 || number > 36500)) {
      setError('Enter a number of days between 0 and 36500, or leave it blank.');
      return;
    }
    if (password && (password.length < 12 || password.length > 128)) { setError('Password must be 12–128 characters.'); return; }
    setBusy(true); setError('');
    try {
      const options = { expiresAt: days ? Date.now() + number * 86400000 : undefined, password: password || undefined };
      const created = targetType === 'folder' ? await api.createFolderShare(fileId, options) : await api.createShare(fileId, options);
      const shares = await api.shares();
      setLinks(shares.filter(item => item.file.id === fileId && (item.share.targetType || 'file') === targetType));
      if (!shares.some(item => item.share.token === created.token)) setError('Link created, but could not refresh the list. Check Settings → Privacy & public links.');
      setDays(''); setPassword('');
    } catch { setError('Could not create the link. Please try again.'); }
    finally { setBusy(false); }
  };

  const revoke = async (token: string) => {
    setBusy(true); setError('');
    try { await api.revokeShare(token); setLinks(current => current.filter(item => item.share.token !== token)); }
    catch { setError('Could not revoke the link. Please try again.'); }
    finally { setBusy(false); }
  };

  return <section className="rounded-xl border border-line bg-surface p-3">
    <h3 className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted">Public {targetType} links</h3>
    <p className="mt-2 text-xs leading-relaxed text-muted">Anyone with a link can {targetType === 'folder' ? 'view and download all current and future files in this folder and its subfolders' : 'download this file'} without signing in. Share only with people you trust.</p>
    {loading ? <p className="mt-2 text-xs text-muted">Loading links…</p> : <>
      {links.map(item => <div key={item.share.token} className="mt-3 space-y-1.5">
        <input aria-label="Public download link" readOnly value={typeof window === 'undefined' ? item.downloadUrl : window.location.origin + item.downloadUrl} onFocus={e => e.currentTarget.select()} className="w-full rounded border border-line bg-surface-2 px-2 py-1 text-xs text-fg" />
        <p className="text-[11px] text-muted">{item.share.expiresAt ? `Expires ${new Date(item.share.expiresAt).toLocaleString()}` : 'No expiry'}{item.share.passwordProtected ? ' · Password protected' : ''}</p>
        <div className="flex gap-4 text-xs"><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(window.location.origin + item.downloadUrl); setCopied(item.share.token); } catch { setError('Could not copy automatically. Select the link above to copy it.'); } }} className="text-fg underline">{copied === item.share.token ? 'Copied' : 'Copy link'}</button><button type="button" disabled={busy} onClick={() => void revoke(item.share.token)} className="text-danger underline disabled:opacity-50">Revoke</button></div>
      </div>)}
      <label className="mt-3 block text-xs text-muted">Expires after days (optional)
        <input type="number" min="0.01" max="36500" step="any" value={days} onChange={e => setDays(e.target.value)} placeholder="Never" className="mt-1 w-full rounded border border-line bg-surface-2 px-2 py-1.5 text-fg" />
      </label>
      <label className="mt-2 block text-xs text-muted">Password (optional, at least 12 characters)
        <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} maxLength={128} className="mt-1 w-full rounded border border-line bg-surface-2 px-2 py-1.5 text-fg" />
      </label>
      <button type="button" disabled={busy} onClick={() => void create()} className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-fg disabled:opacity-50">{busy ? 'Working…' : 'Create public link'}</button>
    </>}
    {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
  </section>;
}
