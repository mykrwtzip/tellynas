'use client';

import {
  Download,
  Eye,
  FolderInput,
  PencilLine,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { extensionLabel, formatBytes, formatRelativeTime } from '@/lib/format';
import { kindFromName, iconForKind, KIND_STYLES } from '@/lib/file-types';
import { api } from '@/lib/client-api';
import type { StoredFile } from '@/lib/types';
import { Menu, type MenuItem } from '@/components/ui';

export type FileActionHandlers = {
  onOpen: (file: StoredFile) => void;
  onDownload: (file: StoredFile) => void;
  onToggleStar: (file: StoredFile) => void;
  onRename: (file: StoredFile) => void;
  onMove: (file: StoredFile) => void;
  onDelete: (file: StoredFile) => void;
  onToggleSelect: (file: StoredFile) => void;
};

function menuItems(file: StoredFile, handlers: FileActionHandlers): MenuItem[] {
  return [
    {
      label: 'Preview',
      icon: <Eye className="size-3.5" />,
      onSelect: () => handlers.onOpen(file),
    },
    {
      label: 'Download',
      icon: <Download className="size-3.5" />,
      onSelect: () => handlers.onDownload(file),
    },
    {
      label: file.starred ? 'Remove star' : 'Add star',
      icon: file.starred ? <StarOff className="size-3.5" /> : <Star className="size-3.5" />,
      onSelect: () => handlers.onToggleStar(file),
    },
    {
      label: 'Rename',
      icon: <PencilLine className="size-3.5" />,
      onSelect: () => handlers.onRename(file),
    },
    {
      label: 'Move to folder',
      icon: <FolderInput className="size-3.5" />,
      onSelect: () => handlers.onMove(file),
    },
    {
      label: 'Delete',
      icon: <Trash2 className="size-3.5" />,
      danger: true,
      onSelect: () => handlers.onDelete(file),
    },
  ];
}

function Thumb({ file }: { file: StoredFile }) {
  const kind = kindFromName(file.name, file.mime);
  const style = KIND_STYLES[kind];
  const Icon = iconForKind(kind);

  if (kind === 'image') {
    return (
      <div className="relative h-32 w-full overflow-hidden bg-surface-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={api.previewUrl(file.id)}
          alt={file.name}
          loading="lazy"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />
        <span className="absolute right-2 bottom-2 rounded-md bg-slate-950/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          {extensionLabel(file.name)}
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex h-32 w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_30%_20%,var(--surface-3),transparent_70%)]">
      <div
        className={cn(
          'flex size-14 items-center justify-center rounded-2xl ring-1 transition-transform duration-300 group-hover:scale-105',
          style.tile,
        )}
      >
        <Icon className={cn('size-6', style.icon)} />
      </div>
      <span className="absolute right-2 bottom-2 rounded-md bg-surface/80 px-1.5 py-0.5 text-[10px] font-medium text-muted">
        {extensionLabel(file.name)}
      </span>
    </div>
  );
}

export function FileCard({
  file,
  selected,
  handlers,
}: {
  file: StoredFile;
  selected: boolean;
  handlers: FileActionHandlers;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => handlers.onOpen(file)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handlers.onOpen(file);
        }
      }}
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-surface transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card focus-visible:-translate-y-0.5',
        selected ? 'border-accent/60 ring-2 ring-accent/25' : 'border-line',
      )}
    >
      <div className="absolute top-2 left-2 z-10">
        <button
          type="button"
          aria-label={selected ? `Deselect ${file.name}` : `Select ${file.name}`}
          aria-pressed={selected}
          onClick={(event) => {
            event.stopPropagation();
            handlers.onToggleSelect(file);
          }}
          className={cn(
            'flex size-5 items-center justify-center rounded-[6px] border transition-all',
            selected
              ? 'border-accent bg-accent text-white'
              : 'border-white/50 bg-slate-950/25 opacity-0 backdrop-blur group-hover:opacity-100 focus-visible:opacity-100',
          )}
        >
          {selected && (
            <svg viewBox="0 0 16 16" className="size-3" fill="none" aria-hidden>
              <path
                d="M3.5 8.5l3 3 6-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>

      <Thumb file={file} />

      <div className="min-w-0 p-3">
        <div className="flex items-start gap-1.5">
          <p
            title={file.name}
            className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg"
          >
            {file.name}
          </p>
          {file.starred && (
            <Star className="mt-0.5 size-3.5 shrink-0 fill-warning/80 text-warning" />
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="truncate text-[11px] text-muted">
            {formatBytes(file.size)} · {formatRelativeTime(file.createdAt)}
          </p>
          <div onClick={(event) => event.stopPropagation()}>
            <Menu items={menuItems(file, handlers)} label={`Actions for ${file.name}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function FileRow({
  file,
  selected,
  handlers,
  onContextMenu,
}: {
  file: StoredFile;
  selected: boolean;
  handlers: FileActionHandlers;
  onContextMenu?: (event: React.MouseEvent, file: StoredFile) => void;
}) {
  const kind = kindFromName(file.name, file.mime);
  const style = KIND_STYLES[kind];
  const Icon = iconForKind(kind);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => handlers.onOpen(file)}
      onContextMenu={(event) => onContextMenu?.(event, file)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handlers.onOpen(file);
        }
      }}
      className={cn(
        'group grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors sm:grid-cols-[auto_1fr_92px_120px_auto]',
        selected
          ? 'border-accent/50 bg-accent-soft/60'
          : 'border-transparent hover:border-line hover:bg-surface-2/70',
      )}
    >
      <button
        type="button"
        aria-label={selected ? `Deselect ${file.name}` : `Select ${file.name}`}
        aria-pressed={selected}
        onClick={(event) => {
          event.stopPropagation();
          handlers.onToggleSelect(file);
        }}
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition-all',
          selected
            ? 'border-accent bg-accent text-white'
            : 'border-line-strong opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        {selected && (
          <svg viewBox="0 0 16 16" className="size-3" fill="none" aria-hidden>
            <path
              d="M3.5 8.5l3 3 6-7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg ring-1',
            style.tile,
          )}
        >
          <Icon className={cn('size-4', style.icon)} />
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-fg">
            <span className="truncate">{file.name}</span>
            {file.starred && <Star className="size-3 shrink-0 fill-warning/80 text-warning" />}
          </p>
          <p className="truncate text-[11px] text-muted">
            {formatBytes(file.size)}
            <span className="sm:hidden"> · {formatRelativeTime(file.createdAt)}</span>
          </p>
        </div>
      </div>

      <p className="hidden text-[12px] text-muted tabular-nums sm:block">
        {formatBytes(file.size)}
      </p>
      <p className="hidden truncate text-[12px] text-muted sm:block">
        {formatRelativeTime(file.createdAt)}
      </p>

      <div
        className="flex items-center gap-0.5"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label={`Download ${file.name}`}
          onClick={() => handlers.onDownload(file)}
          className="hidden size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-fg sm:inline-flex"
        >
          <Download className="size-4" />
        </button>
        <Menu items={menuItems(file, handlers)} label={`Actions for ${file.name}`} />
      </div>
    </div>
  );
}
