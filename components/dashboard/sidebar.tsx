'use client';

import { useMemo, useState } from 'react';
import {
  ChevronRight,
  Clock3,
  FolderClosed,
  FolderOpen,
  HardDrive,
  Settings2,
  Sparkles,
  Star,
  Files,
  Plus,
  PanelLeftClose,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import type { FolderNode, LibraryView } from '@/lib/use-library';
import type { StorageStats } from '@/lib/types';
import { Badge, IconButton } from '@/components/ui';

type Props = {
  view: LibraryView;
  folder: string;
  folders: FolderNode[];
  stats: StorageStats;
  starredCount: number;
  demo: boolean;
  username: string | null;
  onNavigateView: (view: LibraryView) => void;
  onNavigateFolder: (path: string) => void;
  onNewFolder: () => void;
  onOpenSettings: () => void;
  onCloseMobile?: () => void;
};

const VIEWS: Array<{ id: LibraryView; label: string; icon: typeof Files }> = [
  { id: 'all', label: 'All files', icon: Files },
  { id: 'recent', label: 'Recent', icon: Clock3 },
  { id: 'starred', label: 'Starred', icon: Star },
];

export function Sidebar({
  view,
  folder,
  folders,
  stats,
  starredCount,
  demo,
  username,
  onNavigateView,
  onNavigateFolder,
  onNewFolder,
  onOpenSettings,
  onCloseMobile,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const tree = useMemo(() => {
    const visible: FolderNode[] = [];
    for (const node of folders) {
      // Hide children whose ancestor is collapsed.
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

  return (
    <aside className="flex h-full w-[268px] shrink-0 flex-col border-r border-line bg-surface/70 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <div className="flex size-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--accent),#22d3ee)] text-white shadow-[0_10px_24px_-10px_var(--accent)]">
          <Sparkles className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-tight font-semibold tracking-tight">
            Tellynas
          </p>
          <p className="truncate text-[11px] text-muted">
            {demo ? 'Demo storage' : 'Telegram storage'}
          </p>
        </div>
        {onCloseMobile && (
          <IconButton label="Close menu" onClick={onCloseMobile} className="lg:hidden">
            <PanelLeftClose className="size-4" />
          </IconButton>
        )}
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={() => go(onNewFolder)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-3 py-2.5 text-[13px] font-medium text-white shadow-[0_12px_28px_-14px_var(--accent)] transition hover:brightness-110"
        >
          <Plus className="size-4" />
          New folder
        </button>
      </div>

      <nav className="mt-4 px-2">
        <p className="px-3 pb-1.5 text-[10px] font-semibold tracking-[0.12em] text-muted uppercase">
          Library
        </p>
        {VIEWS.map((entry) => {
          const active = view === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => go(() => onNavigateView(entry.id))}
              className={cn(
                'group mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors',
                active
                  ? 'bg-accent-soft font-medium text-accent'
                  : 'text-fg-soft hover:bg-surface-2 hover:text-fg',
              )}
            >
              <entry.icon className={cn('size-4', active ? 'text-accent' : 'text-muted')} />
              <span className="flex-1 text-left">{entry.label}</span>
              {entry.id === 'all' && (
                <span className="text-[11px] text-muted tabular-nums">{stats.fileCount}</span>
              )}
              {entry.id === 'starred' && starredCount > 0 && (
                <span className="text-[11px] text-muted tabular-nums">{starredCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-5 flex min-h-0 flex-1 flex-col px-2">
        <div className="flex items-center justify-between px-3 pb-1.5">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-muted uppercase">
            Folders
          </p>
          <span className="text-[10px] text-muted tabular-nums">{folders.length}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {folders.length === 0 ? (
            <p className="px-3 py-3 text-[12px] leading-relaxed text-muted">
              No folders yet. Create one to organise your files.
            </p>
          ) : (
            tree.map((node) => {
              const active = view === 'all' && folder === node.path;
              const collapsedNow = collapsed.has(node.path);
              return (
                <div
                  key={node.path}
                  className="group flex items-center"
                  style={{ paddingLeft: node.depth * 12 }}
                >
                  {hasChildren(node.path) ? (
                    <button
                      type="button"
                      aria-label={collapsedNow ? 'Expand folder' : 'Collapse folder'}
                      onClick={() => toggleCollapse(node.path)}
                      className="mr-0.5 rounded p-0.5 text-muted transition hover:text-fg"
                    >
                      <ChevronRight
                        className={cn('size-3.5 transition-transform', !collapsedNow && 'rotate-90')}
                      />
                    </button>
                  ) : (
                    <span className="mr-0.5 w-[18px] shrink-0" />
                  )}
                  <button
                    type="button"
                    onClick={() => go(() => onNavigateFolder(node.path))}
                    className={cn(
                      'mb-0.5 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] transition-colors',
                      active
                        ? 'bg-accent-soft font-medium text-accent'
                        : 'text-fg-soft hover:bg-surface-2 hover:text-fg',
                    )}
                  >
                    {active ? (
                      <FolderOpen className="size-3.5 shrink-0" />
                    ) : (
                      <FolderClosed className="size-3.5 shrink-0 text-muted" />
                    )}
                    <span className="truncate">{node.name}</span>
                    {node.totalCount > 0 && (
                      <span className="ml-auto text-[10px] text-muted tabular-nums">
                        {node.totalCount}
                      </span>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="border-t border-line p-3">
        <div className="rounded-xl border border-line bg-surface-2/70 p-3">
          <div className="flex items-center gap-2 text-[11px] font-medium text-fg-soft">
            <HardDrive className="size-3.5 text-accent" />
            Storage used
          </div>
          <p className="mt-1.5 text-lg leading-none font-semibold tracking-tight">
            {formatBytes(stats.totalBytes)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="neutral">{stats.fileCount} files</Badge>
            <Badge tone="neutral">{stats.chunkCount} msgs</Badge>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
            Telegram has no practical cap — every chunk is a saved message.
          </p>
        </div>

        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-[12px] text-fg-soft transition hover:bg-surface-2 hover:text-fg"
          >
            <Settings2 className="size-3.5 text-muted" />
            <span className="truncate">Settings</span>
          </button>
          <span className="max-w-[92px] truncate text-[11px] text-muted">{username}</span>
        </div>
      </div>
    </aside>
  );
}
