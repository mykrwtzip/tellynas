'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  Folder,
  FolderInput,
  FolderPlus,
  HardDrive,
  LogOut,
  Moon,
  RefreshCw,
  Search,
  Server,
  Sun,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { api, type SystemInfo } from '@/lib/client-api';
import { Badge, Button, Kbd, Modal, Spinner } from '@/components/ui';
import { useTheme } from '@/components/theme';

/* ------------------------------ Prompt dialog ----------------------------- */

export function PromptDialog({
  open,
  title,
  description,
  label,
  placeholder,
  initialValue = '',
  confirmLabel = 'Save',
  icon,
  busy = false,
  error,
  onConfirm,
  onClose,
  validate,
}: {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  icon?: ReactNode;
  busy?: boolean;
  error?: string | null;
  onConfirm: (value: string) => void;
  onClose: () => void;
  validate?: (value: string) => string | null;
}) {
  const [value, setValue] = useState(initialValue);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setLocalError(null);
    }
  }, [open, initialValue]);

  const submit = () => {
    const trimmed = value.trim();
    const validationError = trimmed
      ? validate?.(trimmed) ?? null
      : 'This field cannot be empty.';
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    setLocalError(null);
    onConfirm(trimmed);
  };

  const message = localError ?? error ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      icon={icon}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <label htmlFor="prompt-input" className="mb-1.5 block text-[12px] font-medium text-fg-soft">
        {label}
      </label>
      <input
        id="prompt-input"
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          setValue(event.target.value);
          setLocalError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }}
        className="h-9.5 w-full rounded-lg border border-line-strong bg-surface-2/70 px-3 text-[13.5px] text-fg transition outline-none focus:border-fg focus:bg-surface"
      />
      {message && (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {message}
        </p>
      )}
    </Modal>
  );
}

/* ------------------------------ Confirm dialog ---------------------------- */

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  busy = false,
  onConfirm,
  onClose,
  details,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  details?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      icon={
        <div className="flex size-8 items-center justify-center rounded-lg border border-danger/25 bg-danger-soft text-danger">
          <Trash2 className="size-4" />
        </div>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            loading={busy}
            className="bg-danger text-white hover:opacity-90"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {details ?? (
        <p className="text-[13px] leading-relaxed text-muted">
          This permanently deletes the selected item and cannot be undone.
        </p>
      )}
    </Modal>
  );
}

/* ------------------------------- Move dialog ------------------------------ */

export function MoveDialog({
  open,
  titleLabel,
  folders,
  currentFolder,
  busy,
  onMove,
  onClose,
}: {
  open: boolean;
  titleLabel: string;
  folders: string[];
  currentFolder?: string;
  busy?: boolean;
  onMove: (folder: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(currentFolder ?? '');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (open) {
      setSelected(currentFolder ?? '');
      setFilter('');
    }
  }, [open, currentFolder]);

  const options = useMemo(() => {
    const all = ['', ...folders.filter(Boolean)];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter((path) => (path || 'drive root home').toLowerCase().includes(q));
  }, [filter, folders]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Move to folder"
      description={titleLabel}
      size="sm"
      icon={
        <div className="flex size-8 items-center justify-center rounded-lg border border-line-strong bg-surface-2 text-fg">
          <FolderInput className="size-4" />
        </div>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={currentFolder !== undefined && selected === currentFolder}
            onClick={() => onMove(selected)}
          >
            Move here
          </Button>
        </>
      }
    >
      {folders.length > 4 && (
        <div className="relative mb-2.5">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter folders…"
            className="h-8.5 w-full rounded-lg border border-line bg-surface-2 pl-8 pr-2.5 text-[12.5px] text-fg outline-none focus:border-fg"
          />
        </div>
      )}

      <div className="max-h-60 space-y-0.5 overflow-y-auto rounded-xl border border-line bg-surface-2/35 p-1">
        {options.map((path) => {
          const active = selected === path;
          const disabled = currentFolder !== undefined && path === currentFolder;
          return (
            <button
              key={path || '__root__'}
              type="button"
              disabled={disabled}
              onClick={() => setSelected(path)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors',
                active
                  ? 'bg-surface font-medium text-fg shadow-2xs ring-1 ring-line-strong'
                  : 'text-fg-soft hover:bg-surface/60 hover:text-fg',
                disabled && 'cursor-not-allowed opacity-45',
              )}
            >
              <Folder className="size-3.5 shrink-0 text-muted" />
              <span className="flex-1 truncate font-mono text-[12px]">
                /{path || ''}
                {!path && <span className="ml-1.5 font-sans text-muted">(Drive root)</span>}
              </span>
              {active && <Check className="size-3.5 text-fg" />}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

/* ------------------------------ Settings dialog --------------------------- */

export function SettingsDialog({
  open,
  onClose,
  system,
  sessionUsername,
  stats,
  onRefreshSystem,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  system: SystemInfo | null;
  sessionUsername: string | null;
  stats: { fileCount: number; folderCount: number; totalBytes: number; chunkCount: number };
  onRefreshSystem: () => void;
  onLogout: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const [loggingOut, setLoggingOut] = useState(false);
  const [shares, setShares] = useState<Awaited<ReturnType<typeof api.shares>>>([]);
  const [shareError, setShareError] = useState('');
  const [revoking, setRevoking] = useState('');
  useEffect(() => {
    if (!open) return;
    setShareError('');
    api.shares().then(setShares).catch(() => setShareError('Could not load public links.'));
  }, [open]);
  const revoke = async (token: string) => {
    setRevoking(token); setShareError('');
    try { await api.revokeShare(token); setShares(current => current.filter(item => item.share.token !== token)); }
    catch { setShareError('Could not revoke this link. Please try again.'); }
    finally { setRevoking(''); }
  };

  const logout = () => {
    setLoggingOut(true);
    onLogout();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Workspace settings"
      description="Cloud sync status, theme, shortcuts, and account."
      size="md"
      footer={
        <>
          <Button
            variant="ghost"
            icon={<RefreshCw className="size-3.5" />}
            onClick={onRefreshSystem}
          >
            Re-check status
          </Button>
          <Button
            variant="danger"
            icon={<LogOut className="size-3.5" />}
            loading={loggingOut}
            onClick={logout}
          >
            Sign out
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section>
          <h3 className="mb-2 font-mono text-[10.5px] font-medium tracking-wider text-muted uppercase">
            Cloud storage
          </h3>
          <div className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-xl border border-line bg-surface-2/35">
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <Server className="size-4 text-muted" />
              <span className="flex-1 text-[12.5px] text-fg-soft">Workspace mode</span>
              <Badge tone={system?.demo ? 'warning' : 'success'}>
                {system ? (system.demo ? 'Demo workspace' : 'Connected') : 'Checking…'}
              </Badge>
            </div>
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <HardDrive className="size-4 text-muted" />
              <span className="flex-1 text-[12.5px] text-fg-soft">Cross-device sync</span>
              <span className="font-mono text-[12px] font-medium text-fg">
                {system ? (system.persistent ? 'Enabled' : 'Temporary') : '—'}
              </span>
            </div>
            <div className="flex items-start gap-3 px-3.5 py-2.5">
              <span className="mt-0.5">
                {system ? (
                  system.connection.ok ? (
                    <Check className="size-4 text-success" />
                  ) : (
                    <AlertTriangle className="size-4 text-warning" />
                  )
                ) : (
                  <Spinner className="size-4" />
                )}
              </span>
              <div className="flex-1">
                <p className="text-[12.5px] font-medium text-fg">Status</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                  {system
                    ? system.connection.ok
                      ? 'Your cloud storage is online and synced across devices.'
                      : system.demo
                        ? 'Running in demo mode. Connect cloud storage in your server environment to keep files permanently.'
                        : system.connection.detail
                    : 'Checking your storage connection…'}
                </p>
              </div>
            </div>
          </div>

          {system?.usingDefaultPassword && (
            <div className="mt-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[12px] leading-relaxed text-danger">
              Default password is still active. Change your account password before sharing
              this deployment.
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 font-mono text-[10.5px] font-medium tracking-wider text-muted uppercase">Privacy & public links</h3>
          <p className="mb-2 text-xs text-muted">Anyone with a public link can download the file without signing in. Revoke links below to stop future access.</p>
          {shareError && <p role="alert" className="text-xs text-danger">{shareError}</p>}
          {!shareError && shares.length === 0 && <p className="text-xs text-muted">No public links found.</p>}
          {shares.map(item => <div key={item.share.token} className="flex items-center gap-2 border-b border-line py-2 text-xs"><span className="min-w-0 flex-1 truncate">{item.file.name}</span><button type="button" disabled={!!revoking} onClick={() => void revoke(item.share.token)} className="text-danger underline disabled:opacity-50">{revoking === item.share.token ? 'Revoking…' : 'Revoke'}</button></div>)}
        </section>
        <section>
          <h3 className="mb-2 font-mono text-[10.5px] font-medium tracking-wider text-muted uppercase">
            Appearance
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: 'light', label: 'Light', icon: <Sun className="size-3.5" /> },
                { id: 'dark', label: 'Dark', icon: <Moon className="size-3.5" /> },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setTheme(option.id)}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] transition',
                  theme === option.id
                    ? 'border-fg bg-surface-2 font-medium text-fg'
                    : 'border-line text-fg-soft hover:bg-surface-2/60',
                )}
              >
                {option.icon}
                <span>{option.label}</span>
                {theme === option.id && <Check className="ml-auto size-3.5" />}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-mono text-[10.5px] font-medium tracking-wider text-muted uppercase">
            Keyboard shortcuts
          </h3>
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-line bg-surface-2/35 p-2.5 text-[12px]">
            {[
              ['⌘K', 'Command menu'],
              ['U', 'Upload files'],
              ['N', 'New folder'],
              ['I', 'Details panel'],
              ['⌘V', 'Paste upload'],
              ['⌫', 'Delete selected'],
            ].map(([key, desc]) => (
              <div key={desc} className="flex items-center justify-between rounded-md px-2 py-1">
                <span className="text-fg-soft">{desc}</span>
                <Kbd>{key}</Kbd>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[12px] text-muted">
          <span>
            Signed in as <strong className="font-medium text-fg">{sessionUsername ?? 'user'}</strong>
          </span>
          <span className="font-mono tabular-nums">
            {stats.fileCount} files · {stats.folderCount} folders · {formatBytes(stats.totalBytes)}
          </span>
        </section>
      </div>
    </Modal>
  );
}

export const FolderPlusIcon = FolderPlus;
