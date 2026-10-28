'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { api } from '@/lib/client-api';
import type { StoredFile } from '@/lib/types';
import { buildFileMenuItems, type FileActionHandlers } from './file-item';

export function PhotoGallery({ files, selection, handlers }: { files: StoredFile[]; selection: Set<string>; handlers: FileActionHandlers }) {
  const [size, setSize] = useState(180);
  const [favorites, setFavorites] = useState(false);
  const [album, setAlbum] = useState('all');
  const [format, setFormat] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const folders = Array.from(new Set(files.map(f => f.folder))).sort();
  const formats = Array.from(new Set(files.map(f => f.mime || 'unknown'))).sort();
  const filtered = files.filter(f => {
    const date = new Date(f.createdAt);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return (!favorites || f.starred) && (album === 'all' || `folder:${f.folder}` === album) && (format === 'all' || f.mime === format) && (!from || day >= from) && (!to || day <= to) && f.name.toLowerCase().includes(search.toLowerCase());
  });
  const groups = new Map<string, StoredFile[]>();
  for (const file of filtered) {
    const label = new Date(file.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    groups.set(label, [...(groups.get(label) || []), file]);
  }
  const gallery = useRef<HTMLDivElement>(null);
  const pinch = useRef<{ distance: number; size: number } | null>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  useEffect(() => {
    const el = gallery.current;
    if (!el) return;
    const distance = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const start = (e: TouchEvent) => { if (e.touches.length === 2) pinch.current = { distance: distance(e.touches), size: sizeRef.current }; };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch.current) return;
      e.preventDefault();
      setSize(Math.max(90, Math.min(320, Math.round(pinch.current.size * distance(e.touches) / pinch.current.distance))));
    };
    const end = () => { pinch.current = null; };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end); };
  }, []);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2 text-xs text-muted">
        <button type="button" aria-pressed={favorites} onClick={() => setFavorites(v => !v)} className="rounded border border-line px-2 py-1.5">{favorites ? '★ Favorites' : '☆ All photos'}</button>
        <label>Album <select value={album} onChange={e => setAlbum(e.target.value)} className="rounded border border-line bg-surface p-1.5 text-fg"><option value="all">All folders</option>{folders.map(folder => <option key={folder || '/'} value={`folder:${folder}`}>{folder || 'Root'}</option>)}</select></label>
        <label>Search <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Photo name" className="w-28 rounded border border-line bg-surface p-1.5 text-fg" /></label>
        <label>Format <select value={format} onChange={e => setFormat(e.target.value)} className="rounded border border-line bg-surface p-1.5 text-fg"><option value="all">All types</option>{formats.map(type => <option key={type} value={type}>{type.replace('image/', '').toUpperCase()}</option>)}</select></label>
        <label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="rounded border border-line bg-surface p-1.5 text-fg" /></label>
        <label>To <input type="date" value={to} onChange={e => setTo(e.target.value)} className="rounded border border-line bg-surface p-1.5 text-fg" /></label>
        <span>Pinch to resize photos</span>
        <button type="button" aria-label="Smaller photos" disabled={size <= 90} onClick={() => setSize(s => Math.max(90, s - 30))} className="rounded border border-line p-1.5 disabled:opacity-40"><Minus className="size-3.5" /></button>
        <button type="button" aria-label="Larger photos" disabled={size >= 320} onClick={() => setSize(s => Math.min(320, s + 30))} className="rounded border border-line p-1.5 disabled:opacity-40"><Plus className="size-3.5" /></button>
      </div>
      <p className="mb-3 text-xs text-muted">{filtered.length} matching photos · Date filters use upload date. Existing selections stay selected when filters change.</p>
      <div ref={gallery}>
      {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted">No photos match these filters.</p>}
      {Array.from(groups, ([label, group]) => <section key={label} className="mb-5"><h3 className="mb-2 text-sm font-semibold text-fg">{label} <span className="font-normal text-muted">· upload date</span></h3>
      <div style={{ columnWidth: `${size}px`, columnGap: '6px', touchAction: 'pan-y' }}>
        {group.map(file => (
          <div key={file.id} className="group relative mb-1.5 break-inside-avoid overflow-hidden rounded-md bg-surface-2">
            <button type="button" aria-label={`Open ${file.name}`} className="block w-full" onTouchStart={e => { if (longPress.current) clearTimeout(longPress.current); if (e.touches.length !== 1) return; didLongPress.current = false; longPress.current = setTimeout(() => { didLongPress.current = true; handlers.onToggleSelect(file); }, 550); }} onTouchMove={() => { if (longPress.current) clearTimeout(longPress.current); }} onTouchEnd={() => { if (longPress.current) clearTimeout(longPress.current); }} onTouchCancel={() => { if (longPress.current) clearTimeout(longPress.current); }} onClick={(e) => { if (didLongPress.current) { didLongPress.current = false; return; } if (e.ctrlKey || e.metaKey || e.shiftKey || selection.size) handlers.onToggleSelect(file); else handlers.onOpen(file); }} onContextMenu={e => { if (handlers.onContextMenu) { e.preventDefault(); handlers.onContextMenu(e, buildFileMenuItems(file, handlers), file.name); } }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${file.id}/thumbnail`} onError={e => { const img = e.currentTarget; if (!img.dataset.fallback) { img.dataset.fallback = "1"; img.src = api.previewUrl(file.id); } }} alt={file.name} loading="lazy" draggable={false} className="block w-full transition-opacity group-hover:opacity-90" />
            </button>
            <button type="button" aria-label={`${selection.has(file.id) ? 'Deselect' : 'Select'} ${file.name}`} aria-pressed={selection.has(file.id)} onClick={() => handlers.onToggleSelect(file)} className={`absolute left-2 top-2 flex size-6 items-center justify-center rounded-full border border-white bg-black/50 text-white ${selection.has(file.id) ? 'opacity-100 bg-accent' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100'}`}>
              {selection.has(file.id) && <Check className="size-4" />}
            </button>
          </div>
        ))}
      </div></section>)}
      </div>
    </div>
  );
}
