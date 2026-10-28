'use client';

import { useState } from 'react';
import { ChevronRight, Folder, Link, PencilLine, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { Menu, type MenuItem } from '@/components/ui';
import { INTERNAL_FILE_MIME } from './sidebar';

type FolderItemProps = {
  path: string;
  name: string;
  count: number;
  totalBytes: number;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onShare: () => void;
  onDropFiles: (fileIds: string[], targetPath: string) => void;
  onContextMenu?: (event: React.MouseEvent, items: MenuItem[], title: string) => void;
};

export function FolderCard({
  path,
  name,
  count,
  totalBytes,
  onOpen,
  onRename,
  onDelete,
  onShare,
  onDropFiles,
  onContextMenu,
}: FolderItemProps) {
  const [dragOver, setDragOver] = useState(false);

  const items: MenuItem[] = [
    {
      label: 'Open folder',
      icon: <ChevronRight className="size-3.5" />,
      shortcut: '⏎',
      onSelect: onOpen,
    },
    {
      label: 'Share folder',
      icon: <Link className="size-3.5" />,
      onSelect: onShare,
    },
    {
      label: 'Rename',
      icon: <PencilLine className="size-3.5" />,
      onSelect: onRename,
    },
    {
      label: 'Delete folder',
      icon: <Trash2 className="size-3.5" />,
      danger: true,
      dividerBefore: true,
      onSelect: onDelete,
    },
  ];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onContextMenu={(event) => {
        if (!onContextMenu) return;
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(event, items, name);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(INTERNAL_FILE_MIME)) {
          event.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes(INTERNAL_FILE_MIME)) return;
        event.preventDefault();
        event.stopPropagation();
        setDragOver(false);
        try {
          const ids = JSON.parse(event.dataTransfer.getData(INTERNAL_FILE_MIME)) as string[];
          if (Array.isArray(ids) && ids.length > 0) onDropFiles(ids, path);
        } catch {
          /* ignore */
        }
      }}
      className={cn(
        'group flex cursor-pointer select-none items-center gap-3 rounded-xl border bg-surface px-3.5 py-2.5 transition-all duration-150',
        'hover:border-line-strong hover:bg-surface-2/40',
        dragOver
          ? 'border-accent bg-accent-soft ring-2 ring-accent/25'
          : 'border-line',
      )}
      title={path}
    >
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
          dragOver
            ? 'border-accent/40 bg-accent/15 text-accent'
            : 'border-line-strong bg-surface-2 text-fg-soft group-hover:text-fg',
        )}
      >
        <Folder className="size-4 fill-current/15" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-fg">{name}</p>
        <p className="truncate font-mono text-[11px] text-muted tabular-nums">
          {count} {count === 1 ? 'item' : 'items'}
          {totalBytes > 0 ? ` · ${formatBytes(totalBytes)}` : ''}
        </p>
      </div>
      <div
        className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100"
        onClick={(event) => event.stopPropagation()}
      >
        <Menu label={`Actions for folder ${name}`} items={items} />
      </div>
    </div>
  );
}
