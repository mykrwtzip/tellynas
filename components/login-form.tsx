'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Moon, ShieldAlert, Sun } from 'lucide-react';
import { api, ApiError, type SessionInfo } from '@/lib/client-api';
import { useTheme } from './theme';
import { Button, IconButton } from './ui';

type Props = {
  next?: string;
  runtime: SessionInfo['runtime'];
};

export function LoginThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <IconButton label="Toggle theme" onClick={toggleTheme}>
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </IconButton>
  );
}

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
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <div>
        <label htmlFor="username" className="mb-1.5 block text-[12px] font-medium text-fg-soft">
          Username
        </label>
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
          className="h-10 w-full rounded-lg border border-line-strong bg-surface-2/70 px-3 text-[13.5px] text-fg transition-colors outline-none placeholder:text-muted/60 focus:border-fg focus:bg-surface"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-[12px] font-medium text-fg-soft">
          Password
        </label>
        <div className="relative flex items-center">
          <input
            id="password"
            ref={passwordRef}
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            className="h-10 w-full rounded-lg border border-line-strong bg-surface-2/70 pr-9 pl-3 text-[13.5px] text-fg transition-colors outline-none placeholder:text-muted/60 focus:border-fg focus:bg-surface"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-2 rounded-md p-1 text-muted transition-colors hover:text-fg"
          >
            {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="animate-pop-in flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={loading}
        className="w-full justify-center"
      >
        <span>{loading ? 'Signing in…' : 'Continue to Drive'}</span>
        {!loading && <ArrowRight className="size-3.5" />}
      </Button>

      {runtime.usingDefaultPassword && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-warning">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Default credentials active (
            <span className="font-mono font-medium">{runtime.defaultUsername}</span> /{' '}
            <span className="font-mono font-medium">changeme</span>). Update your password
            before sharing this deployment.
          </span>
        </div>
      )}
    </form>
  );
}
