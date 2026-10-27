'use client';

import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  RotateCcw,
  UploadCloud,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
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
    (item) => item.status === 'uploading' || item.status === 'finalizing' || item.status === 'queued',
  );
  const failed = items.filter((item) => item.status === 'error');
  const finished = items.filter((item) => item.status === 'done');

  const totalBytes = items.reduce((sum, item) => sum + item.size, 0);
  const doneBytes = items.reduce(
    (sum, item) => sum + (item.status === 'done' ? item.size : item.uploadedBytes),
    0,
  );
  const overall = totalBytes > 0 ? (doneBytes / totalBytes) * 100 : 0;

  const title =
    active.length > 0
      ? `Uploading ${active.length} file${active.length === 1 ? '' : 's'}`
      : failed.length > 0
        ? `${failed.length} failed`
        : `${finished.length} uploaded`;

  return (
    <div className="animate-slide-up fixed right-3 bottom-3 z-40 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-line bg-surface/95 shadow-float backdrop-blur-xl sm:right-5 sm:bottom-5">
      <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
        <div
          className={cn(
            'flex size-8 items-center justify-center rounded-lg',
            active.length > 0 ? 'bg-accent-soft text-accent' : 'bg-success/12 text-success',
          )}
        >
          {active.length > 0 ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-fg">{title}</p>
          <p className="truncate text-[11px] text-muted">
            {formatBytes(doneBytes)} of {formatBytes(totalBytes)}
          </p>
        </div>
        {active.length > 0 && (
          <button
            type="button"
            onClick={onCancelAll}
            className="rounded-md px-2 py-1 text-[11px] text-muted transition hover:bg-surface-2 hover:text-danger"
          >
            Cancel all
          </button>
        )}
        <IconButton
          label={minimised ? 'Expand uploads' : 'Minimise uploads'}
          onClick={() => setMinimised((value) => !value)}
          className="size-7"
        >
          {minimised ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </IconButton>
      </div>

      {!minimised && (
        <>
          <div className="px-3.5 pt-2.5">
            <ProgressBar value={overall} />
          </div>

          <div className="max-h-64 overflow-y-auto p-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="group flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2/60"
              >
                <span className="shrink-0">
                  {item.status === 'done' && <CheckCircle2 className="size-4 text-success" />}
                  {item.status === 'error' && <AlertCircle className="size-4 text-danger" />}
                  {item.status === 'cancelled' && <X className="size-4 text-muted" />}
                  {(item.status === 'uploading' || item.status === 'finalizing') && (
                    <Loader2 className="size-4 animate-spin text-accent" />
                  )}
                  {item.status === 'queued' && <UploadCloud className="size-4 text-muted" />}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] text-fg">{item.name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="shrink-0 text-[10.5px] text-muted">
                      {item.status === 'error'
                        ? item.error?.slice(0, 60)
                        : item.status === 'done'
                          ? formatBytes(item.size)
                          : `${formatBytes(item.uploadedBytes)} / ${formatBytes(item.size)}`}
                    </p>
                    {item.status !== 'done' && item.status !== 'error' && (
                      <div className="flex-1">
                        <ProgressBar value={item.progress} className="h-1" />
                      </div>
                    )}
                  </div>
                </div>

                {item.status === 'error' ? (
                  <button
                    type="button"
                    onClick={() => onRetry(item.id)}
                    aria-label={`Retry ${item.name}`}
                    className="rounded-md p-1 text-muted transition hover:bg-surface-3 hover:text-fg"
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
                    className="rounded-md p-1 text-muted transition hover:bg-surface-3 hover:text-fg"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {active.length === 0 && (
            <div className="border-t border-line px-3.5 py-2">
              <button
                type="button"
                onClick={onClearFinished}
                className="text-[11.5px] font-medium text-accent transition hover:underline"
              >
                Clear finished uploads
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
