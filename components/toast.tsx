'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastVariant = 'success' | 'error' | 'info';

export type ToastItem = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: number) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      toastCounter += 1;
      const id = toastCounter;
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.variant === 'error' ? 6500 : 3400);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (title, description) => push({ title, description, variant: 'success' }),
      error: (title, description) => push({ title, description, variant: 'error' }),
      info: (title, description) => push({ title, description, variant: 'info' }),
    }),
    [toasts, push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <Providers>');
  return context;
}

function ToastViewport() {
  const { toasts, dismiss } = useToast();

  const icons: Record<ToastVariant, ReactNode> = {
    success: <CheckCircle2 className="size-4 text-success" />,
    error: <AlertCircle className="size-4 text-danger" />,
    info: <Info className="size-4 text-accent" />,
  };

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-3.5 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="animate-pop-in pointer-events-auto flex w-full max-w-[340px] items-start gap-2.5 rounded-xl border border-line-strong bg-surface/95 px-3.5 py-2.5 shadow-float backdrop-blur-md"
        >
          <div className="mt-0.5 shrink-0">{icons[toast.variant]}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium text-fg">{toast.title}</p>
            {toast.description && (
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                {toast.description}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => dismiss(toast.id)}
            className={cn(
              '-mt-0.5 -mr-1.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md',
              'text-muted transition-colors hover:bg-surface-2 hover:text-fg',
            )}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
