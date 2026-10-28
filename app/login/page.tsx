import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Command, FileCode2, FileImage, FileText, Folder, Star } from 'lucide-react';
import { getSession } from '@/lib/api';
import { publicRuntimeConfig } from '@/lib/config';
import { BrandMark } from '@/components/brand';
import { LoginForm, LoginThemeToggle } from '@/components/login-form';
import { Kbd } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Sign in',
};

const PREVIEW_ROWS = [
  {
    name: 'Brand Guidelines 2026.pdf',
    kind: 'PDF',
    size: '14.8 MB',
    time: '2m ago',
    starred: true,
    icon: FileText,
    color: 'text-rose-500 dark:text-rose-400 bg-rose-500/10',
  },
  {
    name: 'Studio-Keynote-Render.png',
    kind: 'PNG',
    size: '6.2 MB',
    time: '18m ago',
    starred: true,
    icon: FileImage,
    color: 'text-sky-500 dark:text-sky-400 bg-sky-500/10',
  },
  {
    name: 'storage-engine.ts',
    kind: 'TS',
    size: '24 KB',
    time: '1h ago',
    starred: false,
    icon: FileCode2,
    color: 'text-teal-600 dark:text-teal-400 bg-teal-500/10',
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [{ next }, runtime, session] = await Promise.all([
    searchParams,
    publicRuntimeConfig(),
    getSession(),
  ]);

  if (session) {
    redirect(next && next.startsWith('/') ? next : '/');
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-bg">
      {/* Subtle masked architectural dot grid */}
      <div
        className="bg-dot-grid pointer-events-none fixed inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        aria-hidden
      />

      {/* Top minimal bar */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight text-fg">Tellynas</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface/80 px-2 py-0.5 font-mono text-[10.5px] text-muted">
            <span
              className={`size-1.5 rounded-full ${
                runtime.telegramConfigured ? 'bg-success' : 'bg-warning'
              }`}
            />
            {runtime.telegramConfigured ? 'Synced' : 'Demo'}
          </span>
        </div>
        <LoginThemeToggle />
      </header>

      {/* Main content */}
      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 pb-12 sm:px-8 lg:grid-cols-[380px_1fr] lg:gap-16">
        {/* Sign-in card */}
        <section className="mx-auto w-full max-w-[380px]">
          <div className="rounded-2xl border border-line-strong bg-surface p-6 shadow-card sm:p-7">
            <h1 className="text-[22px] font-semibold tracking-tight text-fg">
              Sign in to your drive
            </h1>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {runtime.demo
                ? 'Explore the interactive demo workspace.'
                : 'Access your files, folders, and media from any device.'}
            </p>

            <LoginForm next={next} runtime={runtime} />
          </div>

          <p className="mt-4 text-center text-[11.5px] text-muted">
            End-to-end authenticated session · Instant search &amp; previews
          </p>
        </section>

        {/* Architectural workspace preview on desktop */}
        <section className="hidden lg:block" aria-hidden="true">
          <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-float">
            {/* Window header */}
            <div className="flex items-center justify-between border-b border-line bg-sidebar/70 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-line-strong" />
                  <span className="size-2.5 rounded-full bg-line-strong" />
                  <span className="size-2.5 rounded-full bg-line-strong" />
                </div>
                <div className="ml-3 flex items-center gap-1.5 text-[12px] text-muted">
                  <span>Drive</span>
                  <span>/</span>
                  <span className="font-medium text-fg">Design System</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-[11.5px] text-muted">
                <Command className="size-3" />
                <span>Quick jump</span>
                <Kbd className="ml-1">⌘K</Kbd>
              </div>
            </div>

            {/* Folders mini strip */}
            <div className="p-5">
              <p className="mb-2.5 font-mono text-[10px] font-medium tracking-wider text-muted uppercase">
                Folders
              </p>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { name: 'Assets', meta: '24 files · 148 MB' },
                  { name: 'Releases', meta: '9 files · 612 MB' },
                  { name: 'Archive', meta: '41 files · 1.2 GB' },
                ].map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/45 p-3"
                  >
                    <div className="flex size-8 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg-soft">
                      <Folder className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-fg">{item.name}</p>
                      <p className="truncate font-mono text-[10.5px] text-muted">{item.meta}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Files mini table */}
              <p className="mt-5 mb-2 font-mono text-[10px] font-medium tracking-wider text-muted uppercase">
                Recent files
              </p>
              <div className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-xl border border-line">
                {PREVIEW_ROWS.map((row) => (
                  <div
                    key={row.name}
                    className="grid grid-cols-[1fr_64px_82px_68px] items-center gap-3 px-3.5 py-2.5 text-[12.5px]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className={`flex size-7 shrink-0 items-center justify-center rounded-md ${row.color}`}
                      >
                        <row.icon className="size-3.5" />
                      </div>
                      <span className="truncate font-medium text-fg">{row.name}</span>
                      {row.starred && (
                        <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-muted">{row.kind}</span>
                    <span className="font-mono text-[11.5px] text-muted tabular-nums">
                      {row.size}
                    </span>
                    <span className="text-right text-[11.5px] text-muted">{row.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
