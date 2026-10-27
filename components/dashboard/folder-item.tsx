'use client';

import { ChevronRight, Folder, PencilLine, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Menu } from '@/components/ui';

type FolderItemProps = {
  path: string;
  name: string;
  count: number;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
};

export function FolderCard({ path, name, count, onOpen, onRename, onDelete }: FolderItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        'group flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 transition-all',
        'hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-card',
      )}
      title={path}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/12 text-amber-500 ring-1 ring-amber-400/20">
        <Folder className="size-5 fill-amber-400/25" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-fg">{name}</p>
        <p className="truncate text-[11px] text-muted">
          {count} item{count === 1 ? '' : 's'}
        </p>
      </div>
      <div onClick={(event) => event.stopPropagation()}>
        <Menu
          label={`Actions for folder ${name}`}
          items={[
            {
              label: 'Open',
              icon: <ChevronRight className="size-3.5" />,
              onSelect: onOpen,
            },
            {
              label: 'Rename',
              icon: <PencilLine className="size-3.5" />,
              onSelect: onRename,
            },
            {
              label: 'Delete',
              icon: <Trash2 className="size-3.5" />,
              danger: true,
              onSelect: onDelete,
            },
          ]}
        />
      </div>
    </div>
  );
}
