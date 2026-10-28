'use client';

import {
  Download,
  Eye,
  Folder,
  FolderInput,
  PencilLine,
  RotateCcw,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { PublicShare } from './public-share';
import { api } from '@/lib/client-api';
import { extensionLabel, formatBytes, formatDateTime } from '@/lib/format';
import { iconForKind, kindFromName, KIND_STYLES } from '@/lib/file-types';
import type { StoredFile } from '@/lib/types';
import { Button, IconButton, Kbd } from '@/components/ui';

type Props = {
  file: StoredFile | null;
  currentFolder: string;
  visibleCount: number;
  visibleBytes: number;
  onClose: () => void;
  onOpenPreview: (file: StoredFile) => void;
  onDownload: (file: StoredFile) => void;
  onToggleStar: (file: StoredFile) => void;
  onRename: (file: StoredFile) => void;
  onMove: (file: StoredFile) => void;
  onDelete: (file: StoredFile) => void;
  onNavigateFolder: (folder: string) => void;
  onRestore?: (file: StoredFile) => void;

};

const SHORTCUTS = [
  { keys: '⌘K', label: 'Command menu' },
  { keys: 'U', label: 'Upload files' },
  { keys: 'N', label: 'New folder' },
  { keys: '⌘V', label: 'Paste to upload' },
  { keys: 'I', label: 'Toggle inspector' },
  { keys: '/', label: 'Focus search' },
];

export function InspectorPanel({
  file,
  currentFolder,
  visibleCount,
  visibleBytes,
  onClose,
  onOpenPreview,
  onDownload,
  onToggleStar,
  onRename,
  onMove,
  onDelete,
  onRestore,
  onNavigateFolder,
}: Props) {
  if (!file) {
    return (
      <aside className="flex h-full w-[288px] shrink-0 flex-col border-l border-line bg-sidebar">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-[12.5px] font-semibold text-fg">Details</span>
          <IconButton label="Close inspector" onClick={onClose} className="size-7">
            <X className="size-3.5" />
          </IconButton>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div className="rounded-xl border border-line bg-surface p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg border border-line-strong bg-surface-2 text-fg-soft">
                <Folder className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-fg">
                  {currentFolder ? currentFolder.split('/').pop() : 'Drive'}
                </p>
                <p className="truncate font-mono text-[11px] text-muted">
                  /{currentFolder}
                </p>
              </div>
            </div>

            <dl className="mt-3.5 space-y-2 border-t border-line pt-3 text-[12px]">
              <div className="flex justify-between">
                <dt className="text-muted">Items in view</dt>
                <dd className="font-mono font-medium text-fg tabular-nums">
                  {visibleCount}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Size in view</dt>
                <dd className="font-mono font-medium text-fg tabular-nums">
                  {formatBytes(visibleBytes)}
                </dd>
              </div>
            </dl>
          </div>

          <p className="text-[12px] leading-relaxed text-muted">
            Select a file or click its info icon to inspect metadata, preview, or
            organise it. Drag files directly onto any folder to move them.
          </p>

          <div>
            <p className="mb-2 font-mono text-[10px] font-medium tracking-wider text-muted uppercase">
              Shortcuts
            </p>
            <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-line bg-surface">
              {SHORTCUTS.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between px-3 py-2 text-[12px]"
                >
                  <span className="text-fg-soft">{item.label}</span>
                  <Kbd>{item.keys}</Kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    );
  }

  const kind = kindFromName(file.name, file.mime);
  const style = KIND_STYLES[kind];
  const Icon = iconForKind(kind);

  return (
    <aside className="flex h-full w-[296px] shrink-0 flex-col border-l border-line bg-sidebar">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-[12.5px] font-semibold text-fg">File details</span>
        <IconButton label="Close inspector" onClick={onClose} className="size-7">
          <X className="size-3.5" />
        </IconButton>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Preview box */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onOpenPreview(file)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onOpenPreview(file);
          }}
          className="group relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-line-strong bg-surface"
        >
          {kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={api.previewUrl(file.id)}
              alt={file.name}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="bg-dot-grid flex size-full flex-col items-center justify-center gap-2">
              <div
                className={cn(
                  'flex size-11 items-center justify-center rounded-xl ring-1',
                  style.tile,
                )}
              >
                <Icon className={cn('size-5', style.icon)} />
              </div>
              <span className="font-mono text-[10.5px] font-medium text-muted">
                {extensionLabel(file.name)}
              </span>
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-[11.5px] font-medium text-zinc-950 shadow">
              <Eye className="size-3.5" /> Open preview
            </span>
          </div>
        </div>

        {/* Title & star */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="break-words text-[13.5px] leading-snug font-semibold text-fg">
              {file.name}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-muted">
              {style.label} · {formatBytes(file.size)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onToggleStar(file)}
            aria-label={file.starred ? 'Remove star' : 'Add star'}
            className={cn(
              'mt-0.5 rounded-lg border p-1.5 transition-colors',
              file.starred
                ? 'border-amber-400/35 bg-amber-400/10 text-amber-400'
                : 'border-line bg-surface text-muted hover:text-fg',
            )}
          >
            <Star className={cn('size-3.5', file.starred && 'fill-amber-400')} />
          </button>
        </div>

        {/* Primary actions */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={<Download className="size-3.5" />}
            onClick={() => onDownload(file)}
          >
            Download
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Eye className="size-3.5" />}
            onClick={() => onOpenPreview(file)}
          >
            Preview
          </Button>
        </div>

        {/* Metadata list */}
        <div className="rounded-xl border border-line bg-surface p-3">
          <dl className="space-y-2.5 text-[12px]">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Location</dt>
              <dd className="min-w-0">
                <button
                  type="button"
                  onClick={() => onNavigateFolder(file.folder)}
                  className="inline-flex max-w-[165px] items-center gap-1 truncate rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-soft hover:text-fg"
                >
                  <Folder className="size-3 shrink-0" />
                  <span className="truncate">/{file.folder || ''}</span>
                </button>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Type</dt>
              <dd className="truncate font-mono text-[11px] text-fg-soft">{file.mime}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Size</dt>
              <dd className="font-mono text-[11px] text-fg-soft tabular-nums">
                {file.size.toLocaleString()} B
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Uploaded</dt>
              <dd className="text-[11.5px] text-fg-soft">
                {formatDateTime(file.createdAt)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Modified</dt>
              <dd className="text-[11.5px] text-fg-soft">
                {formatDateTime(file.updatedAt)}
              </dd>
            </div>
          </dl>
        </div>


        <PublicShare key={file.id} fileId={file.id} />

        {/* Manage actions */}
        <div className="space-y-1.5 pt-1">
          <button
            type="button"
            onClick={() => onRename(file)}
            className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] text-fg-soft transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <PencilLine className="size-3.5 text-muted" />
            <span>Rename file</span>
          </button>
          <button
            type="button"
            onClick={() => onMove(file)}
            className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] text-fg-soft transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <FolderInput className="size-3.5 text-muted" />
            <span>Move to folder&hellip;</span>
          </button>
          {file.archived ? (
            <>
              <button
                type="button"
                onClick={() => onRestore?.(file)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] text-fg-soft transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <RotateCcw className="size-3.5 text-muted" />
                <span>Restore file</span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(file)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-danger/20 bg-danger-soft/50 px-3 py-2 text-[12.5px] text-danger transition-colors hover:bg-danger-soft"
              >
                <Trash2 className="size-3.5" />
                <span>Delete forever</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onDelete(file)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-danger/20 bg-danger-soft/50 px-3 py-2 text-[12.5px] text-danger transition-colors hover:bg-danger-soft"
            >
              <Trash2 className="size-3.5" />
              <span>Delete file</span>
            </button>
          )}
        </div>
      </div>

    </aside>
  );
}
