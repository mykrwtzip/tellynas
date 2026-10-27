'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, ShieldAlert, User } from 'lucide-react';
import { api, ApiError, type SessionInfo } from '@/lib/client-api';
import { Button } from './ui';

type Props = {
  next?: string;
  runtime: SessionInfo['runtime'];
};

export function LoginForm({ next, runtime }: Props) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const target = next && next.startsWith('/') ? next : '/';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await api.login(username.trim(), password);
      router.replace(target);
      router.refresh();
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'Sign in failed. Please try again.';
      setError(message);
      setLoading(false);
      passwordRef.current?.select();
    }
  };

  return (
    <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
      <div>
        <label htmlFor="username" className="mb-1.5 block text-xs font-medium text-fg-soft">
          Username
        </label>
        <div className="group flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
          <User className="size-4 shrink-0 text-muted" />
          <input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={runtime.defaultUsername || 'admin'}
            className="h-11 w-full bg-transparent text-sm text-fg outline-none placeholder:text-muted/70"
          />
        </div>
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-fg-soft">
          Password
        </label>
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
          <Lock className="size-4 shrink-0 text-muted" />
          <input
            id="password"
            ref={passwordRef}
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            className="h-11 w-full bg-transparent text-sm text-fg outline-none placeholder:text-muted/70"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="shrink-0 rounded-md p-1 text-muted transition-colors hover:text-fg"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="animate-fade-in flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2.5 text-[13px] text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={loading}
        className="w-full"
        icon={!loading ? <ArrowRight className="size-4" /> : undefined}
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </Button>

      {runtime.usingDefaultPassword && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/10 px-3 py-2.5 text-[12px] leading-relaxed text-warning">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            Running on default credentials (<strong>{runtime.defaultUsername}</strong> /{' '}
            <strong>changeme</strong>). Set <code>APP_PASSWORD</code> before sharing this
            deployment.
          </span>
        </div>
      )}

      <p className="pt-1 text-center text-[11px] text-muted">
        {runtime.demo
          ? 'Demo mode — uploads stay in server memory until Telegram is configured.'
          : 'Files are uploaded to your private Telegram chat.'}
      </p>
    </form>
  );
}
