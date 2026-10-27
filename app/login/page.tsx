import type { Metadata } from 'next';
import { ShieldCheck, CloudUpload, FolderTree, Sparkles } from 'lucide-react';
import { publicRuntimeConfig } from '@/lib/config';
import { LoginForm } from '@/components/login-form';

export const metadata: Metadata = {
  title: 'Sign in',
};

const FEATURES = [
  {
    icon: CloudUpload,
    title: 'Chunked uploads',
    body: 'Large files are split into safe chunks and streamed straight to your chat.',
  },
  {
    icon: FolderTree,
    title: 'Real folders',
    body: 'Organise everything visually — thumbnails, search, stars and quick previews.',
  },
  {
    icon: ShieldCheck,
    title: 'Private by default',
    body: 'Signed sessions, single-user access and no third-party analytics.',
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [{ next }, runtime] = await Promise.all([searchParams, publicRuntimeConfig()]);

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl items-stretch gap-6 lg:grid-cols-[1.05fr_1fr]">
        {/* Brand panel */}
        <section className="relative hidden flex-col justify-between overflow-hidden rounded-3xl border border-line bg-surface/70 p-9 shadow-card backdrop-blur lg:flex">
          <div
            className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-[radial-gradient(circle,var(--accent-soft),transparent_70%)]"
            aria-hidden
          />
          <div>
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--accent),#22d3ee)] text-white shadow-[0_12px_30px_-12px_var(--accent)]">
                <Sparkles className="size-5" />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-tight">Tellynas</p>
                <p className="text-xs text-muted">Telegram-grade cloud storage</p>
              </div>
            </div>

            <h1 className="mt-10 text-[34px] leading-[1.15] font-semibold tracking-tight text-fg">
              Your files,
              <br />
              stored on Telegram.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
              Unlimited space without another subscription. Tellynas turns your private
              Telegram chat into a fast, organised drive.
            </p>

            <ul className="mt-8 space-y-4">
              {FEATURES.map((feature) => (
                <li key={feature.title} className="flex gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <feature.icon className="size-4" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-fg">{feature.title}</p>
                    <p className="text-xs leading-relaxed text-muted">{feature.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
              <span className="size-1.5 rounded-full bg-success" />
              {runtime.telegramConfigured ? 'Telegram connected' : 'Demo mode'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
              Bot API · chunks of {Math.round(runtime.chunkSize / 1024 / 1024)} MB
            </span>
          </div>
        </section>

        {/* Form panel */}
        <section className="flex items-center">
          <div className="w-full rounded-3xl border border-line bg-surface p-7 shadow-card sm:p-9">
            <div className="mb-7 lg:hidden">
              <div className="flex items-center gap-2.5">
                <div className="flex size-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--accent),#22d3ee)] text-white">
                  <Sparkles className="size-5" />
                </div>
                <span className="text-lg font-semibold tracking-tight">Tellynas</span>
              </div>
            </div>

            <h2 className="text-2xl font-semibold tracking-tight text-fg">Welcome back</h2>
            <p className="mt-1.5 text-sm text-muted">
              Sign in to open your Telegram drive.
            </p>

            <LoginForm next={next} runtime={runtime} />
          </div>
        </section>
      </div>
    </main>
  );
}
