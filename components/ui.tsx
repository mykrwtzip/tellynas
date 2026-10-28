'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MoreHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/cn';

/* -------------------------------- Button -------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-fg text-bg shadow-xs ring-1 ring-black/10 dark:ring-white/15 hover:opacity-90 active:scale-[0.985]',
  secondary:
    'bg-surface text-fg border border-line-strong shadow-2xs hover:bg-surface-2 active:scale-[0.985]',
  ghost: 'text-fg-soft hover:bg-surface-2 hover:text-fg',
  danger:
    'bg-danger-soft text-danger border border-danger/25 hover:bg-danger hover:text-white active:scale-[0.985]',
  subtle: 'bg-accent-soft text-accent border border-accent/20 hover:bg-accent/15',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-lg',
  md: 'h-8.5 px-3.5 text-[13px] gap-1.5 rounded-lg',
  lg: 'h-10 px-4 text-[13.5px] gap-2 rounded-xl',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-medium transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  active = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors',
        'hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40',
        active && 'bg-surface-2 text-fg ring-1 ring-line-strong',
        className,
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------- Badge --------------------------------- */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-surface-2 text-muted border-line',
    accent: 'bg-accent-soft text-accent border-accent/25',
    success: 'bg-success/12 text-success border-success/25',
    warning: 'bg-warning/12 text-warning border-warning/25',
    danger: 'bg-danger-soft text-danger border-danger/25',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface-2 px-1.5 font-mono text-[10px] font-medium text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-muted', className)} />;
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-1 w-full overflow-hidden rounded-full bg-surface-3', className)}>
      <div
        className="h-full rounded-full bg-fg transition-[width] duration-200"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/* -------------------------------- Modal --------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  icon?: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const widths = {
    sm: 'max-w-[380px]',
    md: 'max-w-[480px]',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[95vw] h-[92vh]',
  } as const;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="animate-fade-in absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'animate-pop-in relative flex w-full flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-float outline-none',
          widths[size],
        )}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-[14.5px] font-semibold tracking-tight text-fg">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{description}</p>
            )}
          </div>
          <IconButton label="Close dialog" onClick={onClose} className="-mt-1 -mr-1.5 size-7">
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* --------------------------------- Menu ---------------------------------- */

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
  dividerBefore?: boolean;
};

function MenuList({
  items,
  onDone,
}: {
  items: MenuItem[];
  onDone: () => void;
}) {
  return (
    <>
      {items.map((item) => (
        <div key={item.label}>
          {item.dividerBefore && <div className="my-1 border-t border-line" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={(event) => {
              event.stopPropagation();
              onDone();
              item.onSelect();
            }}
            className={cn(
              'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors',
              item.danger
                ? 'text-danger hover:bg-danger-soft'
                : 'text-fg-soft hover:bg-surface-2 hover:text-fg',
              item.disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
            )}
          >
            {item.icon && <span className="shrink-0 opacity-80">{item.icon}</span>}
            <span className="flex-1 truncate">{item.label}</span>
            {item.shortcut && (
              <span className="font-mono text-[10.5px] text-muted">{item.shortcut}</span>
            )}
          </button>
        </div>
      ))}
    </>
  );
}

export function Menu({
  items,
  label = 'More actions',
  trigger,
  align = 'end',
  className,
}: {
  items: MenuItem[];
  label?: string;
  trigger?: ReactNode;
  align?: 'start' | 'end';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect && typeof window !== 'undefined') {
      const width = 204;
      const estimatedHeight = items.length * 33 + 16;
      const rawLeft = align === 'end' ? rect.right - width : rect.left;
      const left = Math.max(8, Math.min(rawLeft, window.innerWidth - width - 8));
      const openUpward =
        rect.bottom + estimatedHeight > window.innerHeight - 8 &&
        rect.top > estimatedHeight;
      const top = openUpward
        ? Math.max(8, rect.top - estimatedHeight - 4)
        : rect.bottom + 4;
      setCoords({ top, left });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onScrollOrResize = () => setOpen(false);

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (open) setOpen(false);
          else openMenu();
        }}
        className={cn(
          'inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted transition-colors',
          'hover:bg-surface-3 hover:text-fg',
          open && 'bg-surface-3 text-fg',
          className,
        )}
      >
        {trigger ?? <MoreHorizontal className="size-4" />}
      </button>

      {open &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: coords.top, left: coords.left }}
            onClick={(event) => event.stopPropagation()}
            className="animate-pop-in fixed z-50 w-[204px] overflow-hidden rounded-xl border border-line-strong bg-surface/98 p-1 shadow-float backdrop-blur-md"
          >
            <MenuList items={items} onDone={() => setOpen(false)} />
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ----------------------------- Context Menu ------------------------------ */

export function ContextMenuPortal({
  state,
  onClose,
}: {
  state: { x: number; y: number; title?: string; items: MenuItem[] } | null;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onScrollOrResize = () => onClose();

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [state, onClose]);

  if (!state || typeof document === 'undefined') return null;

  const width = 216;
  const estimatedHeight = state.items.length * 34 + (state.title ? 34 : 12);
  const left = Math.max(8, Math.min(state.x, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(state.y, window.innerHeight - estimatedHeight - 8));

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{ top, left }}
      onContextMenu={(event) => event.preventDefault()}
      className="animate-pop-in fixed z-50 w-[216px] overflow-hidden rounded-xl border border-line-strong bg-surface/98 p-1 shadow-float backdrop-blur-md"
    >
      {state.title && (
        <div className=" truncate border-b border-line px-2.5 py-1.5 text-[11px] font-medium text-muted">
          {state.title}
        </div>
      )}
      <MenuList items={state.items} onDone={onClose} />
    </div>,
    document.body,
  );
}
