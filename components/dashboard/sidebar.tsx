'use client';

import { useMemo, useState } from 'react';
import {
  Archive,
  ChevronRight,
  Clock3,
  Code2,
  FileAudio,
  FileImage,
  Files,
  FileText,
  FileVideo,
  FolderClosed,
  FolderOpen,
  Moon,
  PanelLeftClose,
  Plus,
  Search,
  Settings2,
  Star,
  Sun,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { kindFromName, matchesCategory, type MediaCategory } from '@/lib/file-types';
import type { FolderNode, LibraryView } from '@/lib/use-library';
import type { StorageStats, StoredFile } from '@/lib/types';
import { BrandMark } from '@/components/brand';
import { useTheme } from '@/components/theme';
import { IconButton, Kbd } from '@/components/ui';

export const INTERNAL_FILE_MIME = 'application/x-tellynas-files';

type Props = {
  view: LibraryView;
  folder: string;
  files: StoredFile[];
  folders: FolderNode[];
  stats: StorageStats;
  starredCount: number;
  archivedCount: number;
  demo: boolean;
  username: string | null;
  onNavigateView: (view: LibraryView) => void;
  onNavigateFolder: (path: string) => void;
  onUploadClick: () => void;
  onNewFolder: () => void;
  onOpenCommand: () => void;
  onOpenSettings: () => void;
  onDropFilesToFolder: (fileIds: string[], targetFolder: string) => void;
  onCloseMobile?: () => void;
};

const WORKSPACE_VIEWS: Array<{
  id: 'all' | 'recent' | 'starred' | 'archive';
  label: string;
  icon: typeof Files;
}> = [
  { id: 'all', label: 'All files', icon: Files },
  { id: 'recent', label: 'Recent', icon: Clock3 },
  { id: 'starred', label: 'Starred', icon: Star },
  { id: 'archive', label: 'Archive', icon: Archive },
];

const CATEGORY_VIEWS: Array<{ id: MediaCategory; label: string; icon: typeof Files; dot: string }> = [
  { id: 'images', label: 'Images', icon: FileImage, dot: 'bg-sky-400' },
  { id: 'videos', label: 'Videos', icon: FileVideo, dot: 'bg-indigo-400' },
  { id: 'audio', label: 'Audio', icon: FileAudio, dot: 'bg-pink-400' },
  { id: 'documents', label: 'Documents', icon: FileText, dot: 'bg-rose-400' },
  { id: 'code', label: 'Code', icon: Code2, dot: 'bg-teal-400' },
  { id: 'archives', label: 'Archives', icon: Archive, dot: 'bg-orange-400' },
];

export function Sidebar({
  view,
  folder,
  files,
  folders,
  stats,
  starredCount,
  archivedCount,
  demo,
  username,
  onNavigateView,
  onNavigateFolder,
  onUploadClick,
  onNewFolder,
  onOpenCommand,
  onOpenSettings,
  onDropFilesToFolder,
  onCloseMobile,
}: Props) {
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const categoryCounts = useMemo(() => {
    const counts: Record<MediaCategory, number> = {
      images: 0,
      videos: 0,
      audio: 0,
      documents: 0,
      code: 0,
      archives: 0,
    };
    for (const file of files) {
      const kind = kindFromName(file.name, file.mime);
      for (const cat of CATEGORY_VIEWS) {
        if (matchesCategory(kind, cat.id)) counts[cat.id] += 1;
      }
    }
    return counts;
  }, [files]);

  const breakdown = useMemo(() => {
    if (stats.totalBytes <= 0) return [];
    const buckets = [
      { key: 'images', label: 'Images', bytes: 0, color: 'bg-sky-400' },
      { key: 'videos', label: 'Video', bytes: 0, color: 'bg-indigo-400' },
      { key: 'documents', label: 'Docs', bytes: 0, color: 'bg-rose-400' },
      { key: 'code', label: 'Code', bytes: 0, color: 'bg-teal-400' },
      { key: 'other', label: 'Other', bytes: 0, color: 'bg-zinc-400' },
    ];
    for (const file of files) {
      const kind = kindFromName(file.name, file.mime);
      if (kind === 'image') buckets[0].bytes += file.size;
      else if (kind === 'video' || kind === 'audio') buckets[1].bytes += file.size;
      else if (matchesCategory(kind, 'documents')) buckets[2].bytes += file.size;
      else if (kind === 'code') buckets[3].bytes += file.size;
      else buckets[4].bytes += file.size;
    }
    return buckets
      .filter((bucket) => bucket.bytes > 0)
      .map((bucket) => ({
        ...bucket,
        percent: Math.max(4, (bucket.bytes / stats.totalBytes) * 100),
      }));
  }, [files, stats.totalBytes]);

  const tree = useMemo(() => {
    const visible: FolderNode[] = [];
    for (const node of folders) {
      const ancestors = node.path.split('/').slice(0, -1);
      let hidden = false;
      for (let i = 1; i <= ancestors.length; i += 1) {
        if (collapsed.has(ancestors.slice(0, i).join('/'))) {
          hidden = true;
          break;
        }
      }
      if (!hidden) visible.push(node);
    }
    return visible;
  }, [folders, collapsed]);

  const toggleCollapse = (path: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const hasChildren = (path: string) => folders.some((node) => node.parent === path);

  const go = (action: () => void) => {
    action();
    onCloseMobile?.();
  };

  const handleFolderDrop = (event: React.DragEvent, targetPath: string) => {
    if (!event.dataTransfer.types.includes(INTERNAL_FILE_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    try {
      const ids = JSON.parse(event.dataTransfer.getData(INTERNAL_FILE_MIME)) as string[];
      if (Array.isArray(ids) && ids.length > 0) {
        onDropFilesToFolder(ids, targetPath);
      }
    } catch {
      /* ignore invalid payload */
    }
  };

  return (
    <aside className="flex h-full w-[252px] shrink-0 select-none flex-col border-r border-line bg-sidebar">
      {/* Workspace header */}
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3.5 pb-2.5">
        <button
          type="button"
          onClick={() => go(() => onNavigateFolder(''))}
          className="flex min-w-0 items-center gap-2.5 rounded-lg p-1 text-left transition-colors hover:bg-surface-2"
        >
          <BrandMark className="size-7 rounded-[8px]" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[14px] font-semibold tracking-tight text-fg">
                Tellynas
              </span>
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  demo ? 'bg-warning' : 'bg-success',
                )}
                title={demo ? 'Demo workspace' : 'Synced'}
              />
            </div>
          </div>
        </button>

        {onCloseMobile && (
          <IconButton label="Close menu" onClick={onCloseMobile} className="size-7 lg:hidden">
            <PanelLeftClose className="size-4" />
          </IconButton>
        )}
      </div>

      {/* Quick command search + Upload CTA */}
      <div className="space-y-2 px-3 pb-2">
        <button
          type="button"
          onClick={() => go(onOpenCommand)}
          className="flex h-8 w-full items-center gap-2 rounded-lg border border-line-strong bg-surface px-2.5 text-[12.5px] text-muted shadow-2xs transition-colors hover:border-fg/25 hover:text-fg"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="flex-1 text-left">Search or jump…</span>
          <Kbd>⌘K</Kbd>
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => go(onUploadClick)}
            className="flex h-8.5 flex-1 items-center justify-center gap-1.5 rounded-lg bg-fg px-3 text-[12.5px] font-medium text-bg shadow-xs transition-all hover:opacity-90 active:scale-[0.985]"
          >
            <Upload className="size-3.5" />
            <span>Upload files</span>
          </button>
          <button
            type="button"
            onClick={() => go(onNewFolder)}
            title="New folder (N)"
            aria-label="New folder"
            className="flex size-8.5 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg-soft shadow-2xs transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      {/* Scrollable navigation */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2.5 py-2">
        {/* Main views */}
        <nav aria-label="Workspace">
          <p className="px-2 pb-1 font-mono text-[10px] font-medium tracking-wider text-muted uppercase">
            Drive
          </p>
          <div className="space-y-0.5">
            {WORKSPACE_VIEWS.map((entry) => {
              const active = view === entry.id && (entry.id !== 'all' || folder === '');
              const isRootDrop = entry.id === 'all' && dropTarget === '__root__';
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() =>
                    go(() =>
                      entry.id === 'all' ? onNavigateFolder('') : onNavigateView(entry.id),
                    )
                  }
                  onDragOver={(event) => {
                    if (
                      entry.id === 'all' &&
                      event.dataTransfer.types.includes(INTERNAL_FILE_MIME)
                    ) {
                      event.preventDefault();
                      setDropTarget('__root__');
                    }
                  }}
                  onDragLeave={() => {
                    if (dropTarget === '__root__') setDropTarget(null);
                  }}
                  onDrop={(event) => {
                    if (entry.id === 'all') handleFolderDrop(event, '');
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors',
                    active
                      ? 'bg-surface-2 font-medium text-fg ring-1 ring-line'
                      : 'text-fg-soft hover:bg-surface-2/70 hover:text-fg',
                    isRootDrop && 'bg-accent-soft text-accent ring-1 ring-accent',
                  )}
                >
                  <entry.icon
                    className={cn('size-4 shrink-0', active ? 'text-fg' : 'text-muted')}
                  />
                  <span className="flex-1 text-left">{entry.label}</span>
                  {entry.id === 'all' && (
                    <span className="font-mono text-[11px] text-muted tabular-nums">
                      {stats.fileCount}
                    </span>
                  )}
                  {entry.id === 'starred' && starredCount > 0 && (
                    <span className="font-mono text-[11px] text-muted tabular-nums">
                      {starredCount}
                    </span>
                  )}
                  {entry.id === 'archive' && archivedCount > 0 && (
                    <span className="font-mono text-[11px] text-muted tabular-nums">
                      {archivedCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Smart media filters */}
        <nav aria-label="Categories">
          <p className="px-2 pb-1 font-mono text-[10px] font-medium tracking-wider text-muted uppercase">
            File types
          </p>
          <div className="space-y-0.5">
            {CATEGORY_VIEWS.map((cat) => {
              const active = view === cat.id;
              const count = categoryCounts[cat.id];
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => go(() => onNavigateView(cat.id))}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors',
                    active
                      ? 'bg-surface-2 font-medium text-fg ring-1 ring-line'
                      : 'text-fg-soft hover:bg-surface-2/70 hover:text-fg',
                  )}
                >
                  <cat.icon
                    className={cn('size-3.5 shrink-0', active ? 'text-fg' : 'text-muted')}
                  />
                  <span className="flex-1 text-left">{cat.label}</span>
                  {count > 0 && (
                    <span className="font-mono text-[11px] text-muted tabular-nums">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Folder tree */}
        <div>
          <div className="flex items-center justify-between px-2 pb-1">
            <p className="font-mono text-[10px] font-medium tracking-wider text-muted uppercase">
              Folders
            </p>
            <button
              type="button"
              onClick={() => go(onNewFolder)}
              aria-label="Create folder"
              title="New folder (N)"
              className="rounded p-0.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <Plus className="size-3.5" />
            </button>
          </div>

          {folders.length === 0 ? (
            <p className="px-2 py-2 text-[12px] leading-relaxed text-muted">
              No folders yet.
            </p>
          ) : (
            <div className="space-y-0.5">
              {tree.map((node) => {
                const active = view === 'all' && folder === node.path;
                const collapsedNow = collapsed.has(node.path);
                const isDropping = dropTarget === node.path;
                return (
                  <div
                    key={node.path}
                    className="flex items-center"
                    style={{ paddingLeft: node.depth * 12 }}
                    onDragOver={(event) => {
                      if (event.dataTransfer.types.includes(INTERNAL_FILE_MIME)) {
                        event.preventDefault();
                        setDropTarget(node.path);
                      }
                    }}
                    onDragLeave={() => {
                      if (dropTarget === node.path) setDropTarget(null);
                    }}
                    onDrop={(event) => handleFolderDrop(event, node.path)}
                  >
                    {hasChildren(node.path) ? (
                      <button
                        type="button"
                        aria-label={collapsedNow ? 'Expand folder' : 'Collapse folder'}
                        onClick={() => toggleCollapse(node.path)}
                        className="mr-0.5 rounded p-0.5 text-muted transition hover:text-fg"
                      >
                        <ChevronRight
                          className={cn(
                            'size-3.5 transition-transform duration-150',
                            !collapsedNow && 'rotate-90',
                          )}
                        />
                      </button>
                    ) : (
                      <span className="mr-0.5 w-[18px] shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={() => go(() => onNavigateFolder(node.path))}
                      className={cn(
                        'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] transition-colors',
                        active
                          ? 'bg-surface-2 font-medium text-fg ring-1 ring-line'
                          : 'text-fg-soft hover:bg-surface-2/70 hover:text-fg',
                        isDropping && 'bg-accent-soft text-accent ring-1 ring-accent',
                      )}
                    >
                      {active ? (
                        <FolderOpen className="size-3.5 shrink-0 text-fg" />
                      ) : (
                        <FolderClosed className="size-3.5 shrink-0 text-muted" />
                      )}
                      <span className="truncate">{node.name}</span>
                      {node.totalCount > 0 && (
                        <span className="ml-auto font-mono text-[10.5px] text-muted tabular-nums">
                          {node.totalCount}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Storage & Account footer */}
      <div className="border-t border-line p-3">
        <div className="rounded-xl border border-line bg-surface p-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11.5px] font-medium text-fg-soft">Storage</span>
            <span className="font-mono text-[11.5px] font-semibold text-fg tabular-nums">
              {formatBytes(stats.totalBytes)}
            </span>
          </div>

          {/* Segmented breakdown bar */}
          <div className="mt-2 flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2">
            {breakdown.length === 0 ? (
              <div className="h-full w-0 rounded-full bg-muted/40" />
            ) : (
              breakdown.map((segment) => (
                <div
                  key={segment.key}
                  style={{ width: `${segment.percent}%` }}
                  title={`${segment.label}: ${formatBytes(segment.bytes)}`}
                  className={cn('h-full first:rounded-l-full last:rounded-r-full', segment.color)}
                />
              ))
            )}
          </div>

          <div className="mt-2 flex items-center justify-between font-mono text-[10.5px] text-muted">
            <span>{stats.fileCount} files</span>
            <span>{stats.folderCount} folders</span>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-fg-soft transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-3 font-mono text-[10px] font-semibold text-fg uppercase">
              {(username || 'U')[0]}
            </div>
            <span className="truncate font-medium">{username || 'Account'}</span>
          </button>

          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton label="Toggle theme" onClick={toggleTheme} className="size-7">
              {theme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </IconButton>
            <IconButton label="Settings" onClick={onOpenSettings} className="size-7">
              <Settings2 className="size-3.5" />
            </IconButton>
          </div>
        </div>
      </div>
    </aside>
  );
}
