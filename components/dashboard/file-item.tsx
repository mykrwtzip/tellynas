'use client';

import {
  Download,
  Eye,
  Folder,
  FolderInput,
  Info,
  PencilLine,
  Play,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  baseNameOf,
  extensionLabel,
  formatBytes,
  formatRelativeTime,
} from '@/lib/format';
import { kindFromName, iconForKind, KIND_STYLES, type FileKind } from '@/lib/file-types';
import { api } from '@/lib/client-api';
import type { StoredFile } from '@/lib/types';
import { Menu, type MenuItem } from '@/components/ui';
import { INTERNAL_FILE_MIME } from './sidebar';

export type FileActionHandlers = {
  onOpen: (file: StoredFile) => void;
  onInspect: (file: StoredFile) => void;
  onDownload: (file: StoredFile) => void;
  onToggleStar: (file: StoredFile) => void;
  onRename: (file: StoredFile) => void;
  onMove: (file: StoredFile) => void;
  onDelete: (file: StoredFile) => void;
  onRestore?: (file: StoredFile) => void;
  onToggleSelect: (file: StoredFile) => void;
  onNavigateFolder?: (folder: string) => void;
  onContextMenu?: (event: React.MouseEvent, items: MenuItem[], title: string) => void;
};

export function buildFileMenuItems(
  file: StoredFile,
  handlers: FileActionHandlers,
): MenuItem[] {
  return [
    {
      label: 'Preview',
      icon: <Eye className="size-3.5" />,
      shortcut: '⏎',
      onSelect: () => handlers.onOpen(file),
    },
    {
      label: 'File details',
      icon: <Info className="size-3.5" />,
      shortcut: 'I',
      onSelect: () => handlers.onInspect(file),
    },
    {
      label: 'Download',
      icon: <Download className="size-3.5" />,
      onSelect: () => handlers.onDownload(file),
    },
    {
      label: file.starred ? 'Remove star' : 'Add to Starred',
      icon: file.starred ? <StarOff className="size-3.5" /> : <Star className="size-3.5" />,
      dividerBefore: true,
      onSelect: () => handlers.onToggleStar(file),
    },
    {
      label: 'Rename',
      icon: <PencilLine className="size-3.5" />,
      onSelect: () => handlers.onRename(file),
    },
    {
      label: 'Move to folder…',
      icon: <FolderInput className="size-3.5" />,
      onSelect: () => handlers.onMove(file),
    },
    ...(file.archived && handlers.onRestore
      ? [
          {
            label: 'Restore',
            icon: <RotateCcw className="size-3.5" />,
            onSelect: () => handlers.onRestore!(file),
            dividerBefore: true,
          },
          {
            label: 'Delete forever',
            icon: <Trash2 className="size-3.5" />,
            danger: true,
            shortcut: '⌫',
            onSelect: () => handlers.onDelete(file),
          },
        ]
      : [
          {
            label: 'Delete',
            icon: <Trash2 className="size-3.5" />,
            danger: true,
            shortcut: '⌫',
            dividerBefore: true,
            onSelect: () => handlers.onDelete(file),
          },
        ]),
  ];
}

function PreviewStage({ file, kind }: { file: StoredFile; kind: FileKind }) {
  const style = KIND_STYLES[kind];
  const Icon = iconForKind(kind);
  const ext = extensionLabel(file.name);

  if (kind === 'image') {
    return (
      <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-line bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={api.previewUrl(file.id)}
          alt={file.name}
          loading="lazy"
          draggable={false}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <span className="absolute right-2 bottom-2 rounded border border-white/15 bg-black/65 px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-white backdrop-blur-xs">
          {ext}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-dot-grid relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden border-b border-line bg-surface-2/45">
      {/* Architectural miniature document / media card */}
      <div className="relative flex h-[74%] w-[56%] flex-col justify-between rounded-lg border border-line-strong bg-surface p-2.5 shadow-2xs transition-transform duration-200 group-hover:-translate-y-0.5">
        <div className="flex items-center justify-between gap-1">
          <div className={cn('flex size-6 items-center justify-center rounded-md ring-1', style.tile)}>
            {kind === 'video' ? (
              <Play className={cn('size-3 fill-current', style.icon)} />
            ) : (
              <Icon className={cn('size-3.5', style.icon)} />
            )}
          </div>
          <span
            className={cn(
              'rounded border px-1 py-0.2 font-mono text-[9px] font-semibold tracking-tight',
              style.badge,
            )}
          >
            {ext}
          </span>
        </div>

        {/* Subtle decorative content lines */}
        <div className="space-y-1">
          <div className="h-1 w-4/5 rounded-full bg-surface-3" />
          <div className="h-1 w-3/5 rounded-full bg-surface-2" />
          {kind === 'code' && <div className="h-1 w-2/3 rounded-full bg-teal-500/20" />}
        </div>
      </div>
    </div>
  );
}

function handleDragStart(
  event: React.DragEvent,
  file: StoredFile,
  selectedIds: Set<string>,
) {
  const ids = selectedIds.has(file.id) ? [...selectedIds] : [file.id];
  event.dataTransfer.setData(INTERNAL_FILE_MIME, JSON.stringify(ids));
  event.dataTransfer.effectAllowed = 'move';
}

export function FileCard({
  file,
  selected,
  selectedIds,
  showFolderBadge,
  handlers,
}: {
  file: StoredFile;
  selected: boolean;
  selectedIds: Set<string>;
  showFolderBadge?: boolean;
  handlers: FileActionHandlers;
}) {
  const kind = kindFromName(file.name, file.mime);
  const items = buildFileMenuItems(file, handlers);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(event) => handleDragStart(event, file, selectedIds)}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || selectedIds.size > 0) {
          handlers.onToggleSelect(file);
          return;
        }
        handlers.onOpen(file);
      }}
      onContextMenu={(event) => {
        if (!handlers.onContextMenu) return;
        event.preventDefault();
        event.stopPropagation();
        handlers.onContextMenu(event, items, file.name);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handlers.onOpen(file);
        }
      }}
      className={cn(
        'group relative flex cursor-pointer select-none flex-col overflow-hidden rounded-xl border bg-surface transition-all duration-150',
        selected
          ? 'border-accent ring-2 ring-accent/25'
          : 'border-line hover:border-line-strong hover:shadow-card',
      )}
    >
      {/* Selection checkbox + Quick Star */}
      <div className="absolute top-2 right-2 left-2 z-10 flex items-center justify-between pointer-events-none">
        <button
          type="button"
          aria-label={selected ? `Deselect ${file.name}` : `Select ${file.name}`}
          aria-pressed={selected}
          onClick={(event) => {
            event.stopPropagation();
            handlers.onToggleSelect(file);
          }}
          className={cn(
            'pointer-events-auto flex size-5 items-center justify-center rounded-[6px] border transition-all',
            selected
              ? 'border-accent bg-accent text-white opacity-100 shadow-xs'
              : 'border-line-strong bg-surface/90 opacity-0 backdrop-blur-xs group-hover:opacity-100 focus-visible:opacity-100',
          )}
        >
          {selected && (
            <svg viewBox="0 0 16 16" className="size-3" fill="none" aria-hidden>
              <path
                d="M3.5 8.5l3 3 6-7"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        <button
          type="button"
          aria-label={file.starred ? `Remove star from ${file.name}` : `Star ${file.name}`}
          onClick={(event) => {
            event.stopPropagation();
            handlers.onToggleStar(file);
          }}
          className={cn(
            'pointer-events-auto flex size-6 items-center justify-center rounded-md border transition-all',
            file.starred
              ? 'border-amber-400/30 bg-surface/90 text-amber-400 opacity-100'
              : 'border-line-strong bg-surface/90 text-muted opacity-0 backdrop-blur-xs hover:text-fg group-hover:opacity-100 focus-visible:opacity-100',
          )}
        >
          <Star className={cn('size-3', file.starred && 'fill-amber-400')} />
        </button>
      </div>

      <PreviewStage file={file} kind={kind} />

      <div className="min-w-0 p-2.5">
        <p
          title={file.name}
          className="truncate text-[12.5px] font-medium tracking-tight text-fg"
        >
          {file.name}
        </p>

        <div className="mt-1 flex items-center justify-between gap-1">
          <div className="flex min-w-0 items-center gap-1.5 font-mono text-[10.5px] text-muted tabular-nums">
            <span className="shrink-0">{formatBytes(file.size)}</span>
            {showFolderBadge && file.folder ? (
              <span className="truncate font-sans text-[10.5px] text-muted">
                · {baseNameOf(file.folder)}
              </span>
            ) : (
              <span className="truncate font-sans text-[10.5px] text-muted">
                · {formatRelativeTime(file.createdAt)}
              </span>
            )}
          </div>

          <div
            className="flex shrink-0 items-center gap-0.5"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label={`Download ${file.name}`}
              title="Download"
              onClick={() => handlers.onDownload(file)}
              className="inline-flex size-6.5 cursor-pointer items-center justify-center rounded-md text-muted opacity-100 transition-colors hover:bg-surface-2 hover:text-fg sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Download className="size-3.5" />
            </button>
            <Menu
              items={items}
              label={`Actions for ${file.name}`}
              className="size-6.5"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function FileRow({
  file,
  selected,
  selectedIds,
  showFolderBadge,
  handlers,
}: {
  file: StoredFile;
  selected: boolean;
  selectedIds: Set<string>;
  showFolderBadge?: boolean;
  handlers: FileActionHandlers;
}) {
  const kind = kindFromName(file.name, file.mime);
  const style = KIND_STYLES[kind];
  const Icon = iconForKind(kind);
  const items = buildFileMenuItems(file, handlers);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(event) => handleDragStart(event, file, selectedIds)}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || selectedIds.size > 0) {
          handlers.onToggleSelect(file);
          return;
        }
        handlers.onOpen(file);
      }}
      onContextMenu={(event) => {
        if (!handlers.onContextMenu) return;
        event.preventDefault();
        event.stopPropagation();
        handlers.onContextMenu(event, items, file.name);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handlers.onOpen(file);
        }
      }}
      className={cn(
        'group grid cursor-pointer select-none grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 transition-colors sm:grid-cols-[auto_1fr_80px_92px_116px_auto]',
        selected ? 'bg-accent-soft/75' : 'hover:bg-surface-2/65',
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
          'flex size-4.5 shrink-0 items-center justify-center rounded-[5px] border transition-all',
          selected
            ? 'border-accent bg-accent text-white'
            : 'border-line-strong opacity-40 hover:opacity-100 group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        {selected && (
          <svg viewBox="0 0 16 16" className="size-2.5" fill="none" aria-hidden>
            <path
              d="M3.5 8.5l3 3 6-7"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className={cn(
            'flex size-7.5 shrink-0 items-center justify-center rounded-lg ring-1',
            style.tile,
          )}
        >
          <Icon className={cn('size-3.5', style.icon)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-fg">{file.name}</span>
            {file.starred && (
              <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />
            )}
            {showFolderBadge && file.folder && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handlers.onNavigateFolder?.(file.folder);
                }}
                className="hidden shrink-0 items-center gap-1 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-muted transition-colors hover:text-fg md:inline-flex"
              >
                <Folder className="size-2.5" />
                <span className="max-w-[110px] truncate">{file.folder}</span>
              </button>
            )}
          </div>
          <p className="truncate font-mono text-[11px] text-muted sm:hidden">
            {formatBytes(file.size)} · {formatRelativeTime(file.createdAt)}
          </p>
        </div>
      </div>

      <span className="hidden font-mono text-[11px] text-muted sm:block">
        {extensionLabel(file.name)}
      </span>

      <p className="hidden font-mono text-[12px] text-muted tabular-nums sm:block">
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
          aria-label={`Inspect ${file.name}`}
          title="File details"
          onClick={() => handlers.onInspect(file)}
          className="hidden size-7 items-center justify-center rounded-md text-muted opacity-0 transition-all hover:bg-surface-3 hover:text-fg group-hover:opacity-100 sm:inline-flex"
        >
          <Info className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Download ${file.name}`}
          title="Download"
          onClick={() => handlers.onDownload(file)}
          className="hidden size-7 items-center justify-center rounded-md text-muted opacity-0 transition-all hover:bg-surface-3 hover:text-fg group-hover:opacity-100 sm:inline-flex"
        >
          <Download className="size-3.5" />
        </button>
        <Menu items={items} label={`Actions for ${file.name}`} />
      </div>
    </div>
  );
}
