'use client';

import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileQuestion,
  Star,
  StarOff,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { formatBytes, formatDateTime } from '@/lib/format';
import { kindFromName } from '@/lib/file-types';
import { api } from '@/lib/client-api';
import type { StoredFile } from '@/lib/types';
import { Badge, Button, IconButton, Spinner } from '@/components/ui';

type Props = {
  file: StoredFile | null;
  onClose: () => void;
  onNavigate: (direction: -1 | 1) => void;
  onDownload: (file: StoredFile) => void;
  onToggleStar: (file: StoredFile) => void;
  onDelete: (file: StoredFile) => void;
  onRename: (file: StoredFile) => void;
  canNavigate: boolean;
};

export function PreviewModal({
  file,
  onClose,
  onNavigate,
  onDownload,
  onToggleStar,
  onDelete,
  canNavigate,
}: Props) {
  const router = useRouter();
  const [text, setText] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);

  const kind = file ? kindFromName(file.name, file.mime) : 'other';
  const isText = kind === 'text' || kind === 'code';

  useEffect(() => {
    if (!file || !isText) {
      setText(null);
      setTextError(null);
      return;
    }

    const controller = new AbortController();
    setLoadingText(true);
    setText(null);
    setTextError(null);

    fetch(api.previewUrl(file.id), { signal: controller.signal, credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load this file (HTTP ${response.status}).`);
        const raw = await response.text();
        setText(raw.length > 200_000 ? `${raw.slice(0, 200_000)}\n\n… truncated preview` : raw);
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setTextError(error.message);
      })
      .finally(() => setLoadingText(false));

    return () => controller.abort();
  }, [file, isText]);

  useEffect(() => {
    if (!file) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' && canNavigate) onNavigate(1);
      if (event.key === 'ArrowLeft' && canNavigate) onNavigate(-1);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [file, onClose, onNavigate, canNavigate]);

  if (!file) return null;

  const url = api.previewUrl(file.id);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/80 backdrop-blur-md">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="truncate text-[11px] text-white/55">
            {formatBytes(file.size)} · uploaded {formatDateTime(file.createdAt)}
            {file.chunks.length > 1 ? ` · ${file.chunks.length} chunks` : ''}
          </p>
        </div>

        {canNavigate && (
          <div className="hidden items-center gap-1 sm:flex">
            <IconButton
              label="Previous file"
              onClick={() => onNavigate(-1)}
              className="text-white/70 hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft className="size-4" />
            </IconButton>
            <IconButton
              label="Next file"
              onClick={() => onNavigate(1)}
              className="text-white/70 hover:bg-white/10 hover:text-white"
            >
              <ChevronRight className="size-4" />
            </IconButton>
          </div>
        )}

        <IconButton
          label={file.starred ? 'Remove star' : 'Add star'}
          onClick={() => onToggleStar(file)}
          className="text-white/70 hover:bg-white/10 hover:text-white"
        >
          {file.starred ? (
            <Star className="size-4 fill-warning text-warning" />
          ) : (
            <StarOff className="size-4" />
          )}
        </IconButton>
        <IconButton
          label="Download"
          onClick={() => onDownload(file)}
          className="text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Download className="size-4" />
        </IconButton>
        <IconButton
          label="Delete"
          onClick={() => onDelete(file)}
          className="text-white/70 hover:bg-red-500/20 hover:text-red-300"
        >
          <Trash2 className="size-4" />
        </IconButton>
        <IconButton
          label="Close preview"
          onClick={onClose}
          className="text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" />
        </IconButton>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        {kind === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={file.name}
            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
          />
        )}

        {kind === 'video' && (
          <video
            src={url}
            controls
            autoPlay
            className="max-h-full max-w-full rounded-xl bg-black shadow-2xl"
          />
        )}

        {kind === 'audio' && (
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 text-white">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="mt-0.5 text-[11px] text-white/50">{formatBytes(file.size)}</p>
            <audio src={url} controls autoPlay className="mt-4 w-full" />
          </div>
        )}

        {kind === 'pdf' && (
          <iframe
            src={url}
            title={file.name}
            className="h-full w-full max-w-5xl rounded-xl bg-white shadow-2xl"
          />
        )}

        {isText && (
          <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b1020]">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-[11px] text-white/50">
              <span className="font-mono">{file.mime}</span>
              {loadingText && <Spinner className="size-3 text-white/50" />}
            </div>
            <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-white/85">
              {loadingText ? 'Loading preview…' : textError ?? text ?? ''}
            </pre>
          </div>
        )}

        {kind !== 'image' &&
          kind !== 'video' &&
          kind !== 'audio' &&
          kind !== 'pdf' &&
          !isText && (
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-white">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white/10">
                <FileQuestion className="size-7" />
              </div>
              <p className="mt-4 text-sm font-medium">{file.name}</p>
              <p className="mt-1 text-[12px] text-white/55">
                This file type cannot be previewed in the browser.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <Button variant="primary" onClick={() => onDownload(file)} icon={<Download className="size-4" />}>
                  Download
                </Button>
                <Button
                  variant="secondary"
                  className={cn('bg-white/10 text-white hover:bg-white/20')}
                  onClick={() => router.push(url)}
                  icon={<ExternalLink className="size-4" />}
                >
                  Open raw
                </Button>
              </div>
            </div>
          )}
      </div>

      <footer className="flex items-center justify-center gap-2 border-t border-white/10 px-4 py-2.5 text-[11px] text-white/45">
        <Badge tone="neutral" className="border-white/15 bg-white/10 text-white/70">
          {file.mime}
        </Badge>
        {canNavigate && <span className="hidden sm:inline">← → to browse · Esc to close</span>}
      </footer>
    </div>
  );
}
