'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  Clock3,
  CornerDownLeft,
  FileImage,
  Files,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  LayoutGrid,
  LayoutList,
  Moon,
  PanelRight,
  Search,
  Settings2,
  Star,
  Sun,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { extensionLabel, formatBytes } from '@/lib/format';
import { iconForKind, kindFromName, KIND_STYLES } from '@/lib/file-types';
import type { FolderNode, LibraryView } from '@/lib/use-library';
import type { StoredFile } from '@/lib/types';
import { Kbd } from '@/components/ui';

type PaletteEntry = {
  id: string;
  section: string;
  label: string;
  subtitle?: string;
  shortcut?: string;
  icon: ReactNode;
  onSelect: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  files: StoredFile[];
  folders: FolderNode[];
  theme: 'light' | 'dark';
  layout: 'grid' | 'list';
  onOpenFile: (file: StoredFile) => void;
  onNavigateFolder: (path: string) => void;
  onNavigateView: (view: LibraryView) => void;
  onUpload: () => void;
  onNewFolder: () => void;
  onToggleLayout: () => void;
  onToggleTheme: () => void;
  onToggleInspector: () => void;
  onOpenSettings: () => void;
};

export function CommandPalette({
  open,
  onClose,
  files,
  folders,
  theme,
  layout,
  onOpenFile,
  onNavigateFolder,
  onNavigateView,
  onUpload,
  onNewFolder,
  onToggleLayout,
  onToggleTheme,
  onToggleInspector,
  onOpenSettings,
}: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const entries = useMemo<PaletteEntry[]>(() => {
    const q = query.trim().toLowerCase();

    const commands: PaletteEntry[] = [
      {
        id: 'cmd-upload',
        section: 'Actions',
        label: 'Upload files…',
        shortcut: 'U',
        icon: <Upload className="size-4 text-fg" />,
        onSelect: onUpload,
      },
      {
        id: 'cmd-new-folder',
        section: 'Actions',
        label: 'Create new folder…',
        shortcut: 'N',
        icon: <FolderPlus className="size-4 text-fg" />,
        onSelect: onNewFolder,
      },
      {
        id: 'cmd-inspector',
        section: 'Actions',
        label: 'Toggle details inspector',
        shortcut: 'I',
        icon: <PanelRight className="size-4 text-muted" />,
        onSelect: onToggleInspector,
      },
      {
        id: 'cmd-layout',
        section: 'Actions',
        label: layout === 'grid' ? 'Switch to List view' : 'Switch to Grid view',
        icon:
          layout === 'grid' ? (
            <LayoutList className="size-4 text-muted" />
          ) : (
            <LayoutGrid className="size-4 text-muted" />
          ),
        onSelect: onToggleLayout,
      },
      {
        id: 'cmd-theme',
        section: 'Actions',
        label: theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme',
        icon:
          theme === 'dark' ? (
            <Sun className="size-4 text-muted" />
          ) : (
            <Moon className="size-4 text-muted" />
          ),
        onSelect: onToggleTheme,
      },
      {
        id: 'cmd-settings',
        section: 'Actions',
        label: 'Open settings',
        icon: <Settings2 className="size-4 text-muted" />,
        onSelect: onOpenSettings,
      },
      {
        id: 'nav-all',
        section: 'Views',
        label: 'Go to All files',
        icon: <Files className="size-4 text-muted" />,
        onSelect: () => onNavigateFolder(''),
      },
      {
        id: 'nav-starred',
        section: 'Views',
        label: 'Go to Starred',
        icon: <Star className="size-4 text-amber-400" />,
        onSelect: () => onNavigateView('starred'),
      },
      {
        id: 'nav-recent',
        section: 'Views',
        label: 'Go to Recent uploads',
        icon: <Clock3 className="size-4 text-muted" />,
        onSelect: () => onNavigateView('recent'),
      },
      {
        id: 'nav-archive',
        section: 'Views',
        label: 'Go to Archive',
        icon: <Archive className="size-4 text-muted" />,
        onSelect: () => onNavigateView('archive'),
      },
      {
        id: 'nav-images',
        section: 'Views',
        label: 'Filter: Images',
        icon: <FileImage className="size-4 text-sky-400" />,
        onSelect: () => onNavigateView('images'),
      },
      {
        id: 'nav-videos',
        section: 'Views',
        label: 'Filter: Videos',
        icon: <FileVideo className="size-4 text-indigo-400" />,
        onSelect: () => onNavigateView('videos'),
      },
      {
        id: 'nav-docs',
        section: 'Views',
        label: 'Filter: Documents',
        icon: <FileText className="size-4 text-rose-400" />,
        onSelect: () => onNavigateView('documents'),
      },
    ];

    const folderItems: PaletteEntry[] = folders
      .filter((node) => !q || node.path.toLowerCase().includes(q))
      .slice(0, q ? 12 : 5)
      .map((node) => ({
        id: `folder-${node.path}`,
        section: 'Folders',
        label: node.name,
        subtitle: node.path,
        icon: <Folder className="size-4 text-fg-soft" />,
        onSelect: () => onNavigateFolder(node.path),
      }));

    const fileItems: PaletteEntry[] = files
      .filter(
        (file) =>
          !q ||
          file.name.toLowerCase().includes(q) ||
          file.folder.toLowerCase().includes(q),
      )
      .slice(0, q ? 20 : 6)
      .map((file) => {
        const kind = kindFromName(file.name, file.mime);
        const Icon = iconForKind(kind);
        return {
          id: `file-${file.id}`,
          section: 'Files',
          label: file.name,
          subtitle: `${formatBytes(file.size)}${file.folder ? ` · ${file.folder}` : ''}`,
          shortcut: extensionLabel(file.name),
          icon: <Icon className={cn('size-4', KIND_STYLES[kind].icon)} />,
          onSelect: () => onOpenFile(file),
        };
      });

    const filteredCommands = q
      ? commands.filter((cmd) => cmd.label.toLowerCase().includes(q))
      : commands.slice(0, 8);

    return q
      ? [...fileItems, ...folderItems, ...filteredCommands]
      : [...filteredCommands, ...folderItems, ...fileItems];
  }, [
    files,
    folders,
    layout,
    onNavigateFolder,
    onNavigateView,
    onNewFolder,
    onOpenFile,
    onOpenSettings,
    onToggleInspector,
    onToggleLayout,
    onToggleTheme,
    onUpload,
    query,
    theme,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((current) =>
          entries.length > 0 ? (current + 1) % entries.length : 0,
        );
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) =>
          entries.length > 0 ? (current - 1 + entries.length) % entries.length : 0,
        );
      } else if (event.key === 'Enter' && entries[activeIndex]) {
        event.preventDefault();
        const chosen = entries[activeIndex];
        onClose();
        chosen.onSelect();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, entries, onClose, open]);

  useEffect(() => {
    const activeEl = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <div
        className="animate-fade-in absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        className="animate-pop-in relative flex w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-float"
      >
        {/* Input bar */}
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search files, folders, or type a command…"
            className="h-12 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-muted/70"
          />
          <Kbd>ESC</Kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[360px] overflow-y-auto p-1.5">
          {entries.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted">
              No matching files, folders, or commands.
            </p>
          ) : (
            entries.map((entry, idx) => {
              const prevSection = idx > 0 ? entries[idx - 1].section : null;
              const showHeader = entry.section !== prevSection;
              const active = idx === activeIndex;
              return (
                <div key={entry.id}>
                  {showHeader && (
                    <p className="px-2.5 pt-2 pb-1 font-mono text-[10px] font-medium tracking-wider text-muted uppercase">
                      {entry.section}
                    </p>
                  )}
                  <button
                    type="button"
                    data-idx={idx}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => {
                      onClose();
                      entry.onSelect();
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors',
                      active ? 'bg-surface-2 text-fg' : 'text-fg-soft',
                    )}
                  >
                    <span className="shrink-0">{entry.icon}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {entry.label}
                    </span>
                    {entry.subtitle && (
                      <span className="max-w-[190px] truncate font-mono text-[11px] text-muted">
                        {entry.subtitle}
                      </span>
                    )}
                    {entry.shortcut && (
                      <span className="shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">
                        {entry.shortcut}
                      </span>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between border-t border-line bg-surface-2/40 px-4 py-2 text-[11px] text-muted">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>
                <CornerDownLeft className="size-2.5" />
              </Kbd>{' '}
              open
            </span>
          </div>
          <span className="font-mono text-[10.5px]">{files.length} files indexed</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
