'use client';

import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import { formatBytes } from '@/lib/format';
import type { UploadItem } from '@/lib/use-uploads';
import { IconButton, ProgressBar } from '@/components/ui';

type Props = {
  items: UploadItem[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
  onClearFinished: () => void;
  onCancelAll: () => void;
};

export function UploadPanel({
  items,
  onCancel,
  onRetry,
  onDismiss,
  onClearFinished,
  onCancelAll,
}: Props) {
  const [minimised, setMinimised] = useState(false);

  if (items.length === 0) return null;

  const active = items.filter(
    (item) =>
      item.status === 'uploading' ||
      item.status === 'finalizing' ||
      item.status === 'queued',
  );
  const failed = items.filter((item) => item.status === 'error');
  const finished = items.filter((item) => item.status === 'done');

  const totalBytes = items.reduce((sum, item) => sum + item.size, 0);
  const doneBytes = items.reduce(
    (sum, item) => sum + (item.status === 'done' ? item.size : item.uploadedBytes),
    0,
  );
  const overall = totalBytes > 0 ? Math.round((doneBytes / totalBytes) * 100) : 0;

  const title =
    active.length > 0
      ? `Uploading ${active.length} ${active.length === 1 ? 'file' : 'files'}`
      : failed.length > 0
        ? `${failed.length} upload${failed.length === 1 ? '' : 's'} failed`
        : `${finished.length} uploaded`;

  return (
    <div className="animate-slide-up fixed right-3 bottom-3 z-40 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-line-strong bg-surface shadow-float sm:right-4 sm:bottom-4">
      <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2">
          {active.length > 0 ? (
            <Loader2 className="size-3.5 animate-spin text-fg" />
          ) : failed.length > 0 ? (
            <AlertCircle className="size-3.5 text-danger" />
          ) : (
            <CheckCircle2 className="size-3.5 text-success" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium text-fg">{title}</p>
          <p className="truncate font-mono text-[10.5px] text-muted tabular-nums">
            {formatBytes(doneBytes)} / {formatBytes(totalBytes)} · {overall}%
          </p>
        </div>
        {active.length > 0 ? (
          <button
            type="button"
            onClick={onCancelAll}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-muted transition hover:bg-surface-2 hover:text-danger"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={onClearFinished}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-muted transition hover:bg-surface-2 hover:text-fg"
          >
            Clear
          </button>
        )}
        <IconButton
          label={minimised ? 'Expand transfers' : 'Minimise transfers'}
          onClick={() => setMinimised((value) => !value)}
          className="size-6.5"
        >
          {minimised ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </IconButton>
      </div>

      {!minimised && (
        <>
          <div className="px-3 pt-2">
            <ProgressBar value={overall} />
          </div>

          <div className="max-h-56 divide-y divide-[var(--border-subtle)] overflow-y-auto px-2 py-1.5">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2.5 py-2 px-1.5"
              >
                <span className="shrink-0">
                  {item.status === 'done' && <CheckCircle2 className="size-3.5 text-success" />}
                  {item.status === 'error' && <AlertCircle className="size-3.5 text-danger" />}
                  {item.status === 'cancelled' && <X className="size-3.5 text-muted" />}
                  {(item.status === 'uploading' || item.status === 'finalizing') && (
                    <Loader2 className="size-3.5 animate-spin text-fg" />
                  )}
                  {item.status === 'queued' && <Upload className="size-3.5 text-muted" />}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-fg">{item.name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="shrink-0 font-mono text-[10px] text-muted tabular-nums">
                      {item.status === 'error'
                        ? item.error?.slice(0, 48)
                        : item.status === 'finalizing'
                          ? 'Saving metadata…'
                          : item.status === 'done'
                            ? formatBytes(item.size)
                            : `${Math.round(item.progress)}%`}
                    </p>
                    {(item.status === 'uploading' || item.status === 'finalizing') && (
                      <div className="flex-1">
                        <ProgressBar value={item.progress} />
                      </div>
                    )}
                  </div>
                </div>

                {item.status === 'error' ? (
                  <button
                    type="button"
                    onClick={() => onRetry(item.id)}
                    aria-label={`Retry ${item.name}`}
                    className="rounded-md p-1 text-muted transition hover:bg-surface-2 hover:text-fg"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                ) : item.status === 'queued' ||
                  item.status === 'uploading' ||
                  item.status === 'finalizing' ? (
                  <button
                    type="button"
                    onClick={() => onCancel(item.id)}
                    aria-label={`Cancel ${item.name}`}
                    className="rounded-md p-1 text-muted transition hover:bg-danger-soft hover:text-danger"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onDismiss(item.id)}
                    aria-label={`Dismiss ${item.name}`}
                    className="rounded-md p-1 text-muted transition hover:bg-surface-2 hover:text-fg"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
