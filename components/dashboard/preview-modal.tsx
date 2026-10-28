'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileQuestion,
  Maximize2,
  Minimize2,
  PencilLine,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBytes, formatDateTime } from '@/lib/format';
import { kindFromName } from '@/lib/file-types';
import { api } from '@/lib/client-api';
import type { StoredFile } from '@/lib/types';
import { Button, IconButton, Kbd, Spinner } from '@/components/ui';

type Props = {
  file: StoredFile | null;
  positionLabel?: string;
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
  positionLabel,
  onClose,
  onNavigate,
  onDownload,
  onToggleStar,
  onDelete,
  onRename,
  canNavigate,
}: Props) {
  const [text, setText] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const kind = file ? kindFromName(file.name, file.mime) : 'other';
  const isText = kind === 'text' || kind === 'code';

  useEffect(() => {
    setZoomed(false);
    setCopied(false);
  }, [file?.id]);

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

  const lines = useMemo(() => (text ? text.split('\n') : []), [text]);

  if (!file) return null;

  const url = api.previewUrl(file.id);

  const copyContent = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-zinc-950/92 text-zinc-100 backdrop-blur-md">
      {/* Top stage bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13.5px] font-medium text-white">{file.name}</p>
            {positionLabel && (
              <span className="shrink-0 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10.5px] text-zinc-400">
                {positionLabel}
              </span>
            )}
          </div>
          <p className="truncate font-mono text-[11px] text-zinc-400">
            {formatBytes(file.size)} · {formatDateTime(file.createdAt)}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {kind === 'image' && (
            <IconButton
              label={zoomed ? 'Fit to screen' : 'Actual size'}
              onClick={() => setZoomed((v) => !v)}
              className="text-zinc-300 hover:bg-white/10 hover:text-white"
            >
              {zoomed ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </IconButton>
          )}

          <IconButton
            label={file.starred ? 'Remove star' : 'Add star'}
            onClick={() => onToggleStar(file)}
            className="text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            <Star
              className={cn(
                'size-4',
                file.starred ? 'fill-amber-400 text-amber-400' : 'text-zinc-300',
              )}
            />
          </IconButton>

          <IconButton
            label="Rename"
            onClick={() => onRename(file)}
            className="text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            <PencilLine className="size-4" />
          </IconButton>

          <IconButton
            label="Download"
            onClick={() => onDownload(file)}
            className="text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            <Download className="size-4" />
          </IconButton>

          <IconButton
            label="Delete"
            onClick={() => onDelete(file)}
            className="text-zinc-300 hover:bg-red-500/20 hover:text-red-300"
          >
            <Trash2 className="size-4" />
          </IconButton>

          <div className="mx-1 h-4 w-px bg-white/15" />

          <IconButton
            label="Close preview"
            onClick={onClose}
            className="text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </IconButton>
        </div>
      </header>

      {/* Stage */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 sm:p-6"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {canNavigate && (
          <>
            <button
              type="button"
              aria-label="Previous file"
              onClick={() => onNavigate(-1)}
              className="fixed top-1/2 left-3 z-20 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-zinc-900/80 text-zinc-200 backdrop-blur transition hover:bg-zinc-800 hover:text-white sm:flex"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              aria-label="Next file"
              onClick={() => onNavigate(1)}
              className="fixed top-1/2 right-3 z-20 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-zinc-900/80 text-zinc-200 backdrop-blur transition hover:bg-zinc-800 hover:text-white sm:flex"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}

        {kind === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={file.name}
            onClick={() => setZoomed((v) => !v)}
            className={cn(
              'rounded-lg shadow-2xl transition-all',
              zoomed
                ? 'max-h-none max-w-none cursor-zoom-out'
                : 'max-h-full max-w-full cursor-zoom-in object-contain',
            )}
          />
        )}

        {kind === 'video' && (
          <video
            src={url}
            controls
            autoPlay
            className="max-h-full max-w-5xl rounded-xl border border-white/10 bg-black shadow-2xl"
          />
        )}

        {kind === 'audio' && (
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-900/90 p-6 shadow-2xl">
            <p className="truncate text-[14px] font-medium text-white">{file.name}</p>
            <p className="mt-0.5 font-mono text-[11.5px] text-zinc-400">
              {formatBytes(file.size)} · {file.mime}
            </p>
            <audio src={url} controls autoPlay className="mt-5 w-full" />
          </div>
        )}

        {kind === 'pdf' && (
          <iframe
            src={url}
            title={file.name}
            className="h-full w-full max-w-5xl rounded-xl border border-white/15 bg-white shadow-2xl"
          />
        )}

        {isText && (
          <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-white/15 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/70 px-4 py-2 text-[11.5px] text-zinc-400">
              <div className="flex items-center gap-2 font-mono">
                <span>{file.mime}</span>
                {text && <span>· {lines.length} lines</span>}
                {loadingText && <Spinner className="size-3.5 text-zinc-400" />}
              </div>
              {text && (
                <button
                  type="button"
                  onClick={() => void copyContent()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-200 transition hover:bg-white/10"
                >
                  {copied ? (
                    <>
                      <Check className="size-3 text-emerald-400" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" /> Copy
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4 font-mono text-[12.5px] leading-relaxed">
              {loadingText ? (
                <p className="text-zinc-500">Loading file…</p>
              ) : textError ? (
                <p className="text-red-400">{textError}</p>
              ) : (
                <table className="w-full border-collapse">
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-white/[0.03]">
                        <td className="w-10 pr-4 text-right select-none text-zinc-600 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="whitespace-pre-wrap break-all text-zinc-200">
                          {line || ' '}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {kind !== 'image' &&
          kind !== 'video' &&
          kind !== 'audio' &&
          kind !== 'pdf' &&
          !isText && (
            <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-zinc-900/90 p-7 text-center shadow-2xl">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <FileQuestion className="size-6 text-zinc-300" />
              </div>
              <p className="mt-4 truncate text-[14px] font-medium text-white">{file.name}</p>
              <p className="mt-1 text-[12.5px] text-zinc-400">
                No inline preview available for <span className="font-mono">{file.mime}</span>.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <Button
                  variant="primary"
                  onClick={() => onDownload(file)}
                  icon={<Download className="size-3.5" />}
                  className="bg-white text-zinc-950 hover:bg-zinc-200"
                >
                  Download
                </Button>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3.5 text-[13px] font-medium text-white transition hover:bg-white/10"
                >
                  <ExternalLink className="size-3.5" />
                  Open raw
                </a>
              </div>
            </div>
          )}
      </div>

      {/* Footer keyboard hints */}
      <footer className="flex h-10 shrink-0 items-center justify-between border-t border-white/10 px-4 text-[11px] text-zinc-400">
        <span className="font-mono">{file.mime}</span>
        {canNavigate && (
          <div className="hidden items-center gap-2 sm:flex">
            <Kbd className="border-white/15 bg-white/5 text-zinc-300">←</Kbd>
            <Kbd className="border-white/15 bg-white/5 text-zinc-300">→</Kbd>
            <span>browse</span>
            <span className="mx-1 text-white/20">·</span>
            <Kbd className="border-white/15 bg-white/5 text-zinc-300">ESC</Kbd>
            <span>close</span>
          </div>
        )}
      </footer>
    </div>
  );
}
