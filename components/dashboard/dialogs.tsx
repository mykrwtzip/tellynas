'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  FolderInput,
  FolderPlus,
  HardDrive,
  Info,
  LogOut,
  Moon,
  RefreshCw,
  Server,
  Sun,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import type { SystemInfo } from '@/lib/client-api';
import { Badge, Button, Modal, Spinner } from '@/components/ui';
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
      <label htmlFor="prompt-input" className="mb-1.5 block text-xs font-medium text-fg-soft">
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
        className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
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
        <div className="flex size-9 items-center justify-center rounded-xl bg-danger-soft text-danger">
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
            className="bg-danger text-white hover:brightness-110"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {details ?? (
        <p className="text-[13px] leading-relaxed text-muted">
          This removes the Telegram messages that hold the data. It cannot be undone.
        </p>
      )}
    </Modal>
  );
}

/* ------------------------------- Move dialog ------------------------------ */

export function MoveDialog({
  open,
  fileName,
  folders,
  currentFolder,
  busy,
  onMove,
  onClose,
}: {
  open: boolean;
  fileName: string;
  folders: string[];
  currentFolder: string;
  busy?: boolean;
  onMove: (folder: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(currentFolder);

  useEffect(() => {
    if (open) setSelected(currentFolder);
  }, [open, currentFolder]);

  const options = useMemo(() => ['', ...folders.filter(Boolean)], [folders]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Move file"
      description={fileName}
      size="sm"
      icon={
        <div className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
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
            disabled={selected === currentFolder}
            onClick={() => onMove(selected)}
          >
            Move here
          </Button>
        </>
      }
    >
      <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
        {options.map((path) => {
          const active = selected === path;
          const disabled = path === currentFolder;
          return (
            <button
              key={path || 'root'}
              type="button"
              disabled={disabled}
              onClick={() => setSelected(path)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors',
                active
                  ? 'border-accent/40 bg-accent-soft text-accent'
                  : 'border-transparent text-fg-soft hover:bg-surface-2',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <FolderInput className="size-3.5 shrink-0" />
              <span className="flex-1 truncate">{path || 'Home (root)'}</span>
              {active && <Check className="size-3.5" />}
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
  indexBackend,
  indexPersistent,
  stats,
  onRefreshSystem,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  system: SystemInfo | null;
  sessionUsername: string | null;
  indexBackend: string;
  indexPersistent: boolean;
  stats: { fileCount: number; folderCount: number; totalBytes: number; chunkCount: number };
  onRefreshSystem: () => void;
  onLogout: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = () => {
    setLoggingOut(true);
    onLogout();
  };

  const rows = [
    {
      icon: <Server className="size-4" />,
      label: 'Storage driver',
      value: system ? (system.demo ? 'Demo (memory)' : 'Telegram Bot API') : 'Checking…',
    },
    {
      icon: <HardDrive className="size-4" />,
      label: 'Index backend',
      value: indexPersistent ? indexBackend : `${indexBackend} (volatile)`,
    },
    {
      icon: <Info className="size-4" />,
      label: 'Chunk size',
      value: system ? `${system.chunkSizeMb} MB per Telegram message` : '—',
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      description="Connection, appearance and account."
      size="md"
      footer={
        <>
          <Button
            variant="ghost"
            icon={<RefreshCw className="size-4" />}
            onClick={onRefreshSystem}
          >
            Re-check
          </Button>
          <Button
            variant="danger"
            icon={<LogOut className="size-4" />}
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
          <h3 className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
            Connection
          </h3>
          <div className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-xl border border-line bg-surface-2/50">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="text-muted">{row.icon}</span>
                <span className="flex-1 text-[12.5px] text-fg-soft">{row.label}</span>
                <span className="text-[12px] font-medium text-fg">{row.value}</span>
              </div>
            ))}
            <div className="flex items-start gap-3 px-3.5 py-2.5">
              <span className="mt-0.5 text-muted">
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
                <p className="text-[12.5px] text-fg-soft">Status</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                  {system?.connection.detail ?? 'Checking the Telegram connection…'}
                </p>
              </div>
            </div>
          </div>

          {system && system.missingEnv.length > 0 && (
            <div className="mt-2 rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-warning">
              Missing environment variables:{' '}
              <code className="font-mono">{system.missingEnv.join(', ')}</code>. Uploads are
              simulated in memory until they are set.
            </div>
          )}
          {!indexPersistent && (
            <div className="mt-2 rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-warning">
              The file index is not persistent on this host (read-only serverless disk).
              Uploads work, but the list resets when the instance restarts. Set{' '}
              <code className="font-mono">UPSTASH_REDIS_REST_URL</code> and{' '}
              <code className="font-mono">UPSTASH_REDIS_REST_TOKEN</code> to keep it.
            </div>
          )}
          {system?.usingDefaultPassword && (
            <div className="mt-2 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[12px] leading-relaxed text-danger">
              Default password in use. Set <code className="font-mono">APP_PASSWORD</code> and{' '}
              <code className="font-mono">AUTH_SECRET</code> for a secure deployment.
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
            Appearance
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: 'light', label: 'Light', icon: <Sun className="size-4" /> },
                { id: 'dark', label: 'Dark', icon: <Moon className="size-4" /> },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setTheme(option.id)}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] transition',
                  theme === option.id
                    ? 'border-accent/50 bg-accent-soft font-medium text-accent'
                    : 'border-line text-fg-soft hover:bg-surface-2',
                )}
              >
                {option.icon}
                {option.label}
                {theme === option.id && <Check className="ml-auto size-3.5" />}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
            Account & library
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">Signed in as {sessionUsername ?? 'unknown'}</Badge>
            <Badge tone="neutral">{stats.fileCount} files</Badge>
            <Badge tone="neutral">{stats.folderCount} folders</Badge>
            <Badge tone="neutral">{formatBytes(stats.totalBytes)} stored</Badge>
            <Badge tone="neutral">{stats.chunkCount} Telegram messages</Badge>
          </div>
        </section>
      </div>
    </Modal>
  );
}

/* ---------------------------- Upload new folder --------------------------- */

export const FolderPlusIcon = FolderPlus;
