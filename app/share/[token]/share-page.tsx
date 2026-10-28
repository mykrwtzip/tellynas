'use client';
import { useEffect, useState } from 'react';

type Info = { file?: { name: string; size: number }; downloadUrl?: string; folder?: { name: string; files: { id: string; name: string; folder: string; size: number; downloadUrl: string }[] } };
export function SharePage({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async () => {
    const res = await fetch(`/api/share/${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (res.status === 403) { setLocked(true); setError(''); }
    else if (!res.ok) { setError('This link is unavailable, expired or revoked.'); }
    else { setInfo(await res.json()); setLocked(false); setError(''); }
    setLoading(false);
  };
  useEffect(() => { void load().catch(() => { setError('Could not load this link.'); setLoading(false); }); }, [token]);
  return <main className="flex min-h-dvh items-center justify-center bg-bg p-5 text-fg"><div className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface p-6">
    <h1 className="text-xl font-semibold">{info?.folder ? `Shared folder: ${info.folder.name}` : 'Shared file'}</h1>
    {loading && <p>Loading…</p>}
    {locked && <form className="space-y-3" onSubmit={async e => { e.preventDefault(); setError(''); try { const res = await fetch(`/api/share/${encodeURIComponent(token)}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }); if (!res.ok) { setError(res.status === 429 ? 'Too many attempts. Try again later.' : 'Incorrect password or link unavailable.'); return; } setPassword(''); await load(); } catch { setError('Could not unlock this link.'); } }}><label className="block text-sm">Password<input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-lg border border-line bg-surface-2 p-2" /></label><button className="rounded-lg bg-accent px-4 py-2 text-white">Unlock</button></form>}
    {info?.file && <><p className="break-all">{info.file.name}</p><a className="inline-block rounded-lg bg-accent px-4 py-2 text-white" href={info.downloadUrl}>Download file</a></>}
    {info?.folder && <div className="space-y-2">{info.folder.files.length === 0 && <p className="text-sm text-muted">This folder is empty.</p>}{info.folder.files.map(file => <div key={file.id} className="flex items-center gap-3 border-b border-line py-2 text-sm"><span className="min-w-0 flex-1 break-all">{file.folder && `${file.folder}/`}{file.name}</span><a className="text-accent underline" href={file.downloadUrl}>Download</a></div>)}</div>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </div></main>;
}
