import { NextResponse } from 'next/server';
import { backendKind } from '@/lib/store';
import { appConfig, isTelegramConfigured, useDemoDriver } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public, secret-free health probe.
 *
 * Useful for uptime checks and for verifying a fresh Vercel deployment without
 * signing in. It intentionally never touches the network (no Telegram calls) so
 * it stays fast and cannot fail because of an upstream outage.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      app: 'tellynas',
      timestamp: new Date().toISOString(),
      runtime: {
        node: process.version,
        environment: process.env.NODE_ENV ?? 'unknown',
        vercel: Boolean(process.env.VERCEL),
      },
      storage: {
        driver: useDemoDriver() ? 'demo' : 'telegram',
        telegramConfigured: isTelegramConfigured(),
        indexBackend: backendKind,
        chunkSizeMb: Math.round(appConfig.chunkSize / 1024 / 1024),
      },
      config: {
        usingDefaultPassword: appConfig.appPassword === 'changeme',
        hasAuthSecret: appConfig.authSecret !== `${appConfig.appPassword}::tellynas::session`,
      },
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
