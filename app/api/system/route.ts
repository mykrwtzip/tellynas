import { NextResponse } from 'next/server';
import { requireSession, withApiGuard } from '@/lib/api';
import { appConfig, missingEnvVars, useDemoDriver } from '@/lib/config';
import { getDriver } from '@/lib/driver';
import { getDirectoryCacheStats } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    const driver = getDriver();
    const demo = useDemoDriver();
    // Run connection check with a soft timeout so the UI never hangs on a dead Telegram endpoint
    const connection = await Promise.race([
      driver.checkConnection(),
      new Promise<{ ok: boolean; detail: string }>((resolve) =>
        setTimeout(() => resolve({ ok: false, detail: 'Connection check timed out after 15s — Telegram may be slow. Retry.' }), 15_000),
      ),
    ]);

    return NextResponse.json({
      driver: driver.mode,
      persistent: !demo,
      serverless: appConfig.serverless,
      demo,
      connection,
      chunkSizeMb: Math.round(appConfig.chunkSize / 1024 / 1024),
      missingEnv: missingEnvVars(),
      usingDefaultPassword: appConfig.appPassword === 'changeme',
      botCount: appConfig.botTokens.length,
      chatIdConfigured: Boolean(appConfig.telegramChatId),
      cache: getDirectoryCacheStats(),
    });
  });
}
