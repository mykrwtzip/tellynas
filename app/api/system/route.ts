import { NextResponse } from 'next/server';
import { requireSession, withApiGuard } from '@/lib/api';
import { appConfig, missingEnvVars, useDemoDriver } from '@/lib/config';
import { getDriver } from '@/lib/driver';
import { getIndexBackend, isIndexPersistent } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    const driver = getDriver();
    const connection = await driver.checkConnection();

    return NextResponse.json({
      driver: driver.mode,
      indexBackend: getIndexBackend(),
      indexPersistent: isIndexPersistent(),
      serverless: appConfig.serverless,
      demo: useDemoDriver(),
      connection,
      chunkSizeMb: Math.round(appConfig.chunkSize / 1024 / 1024),
      missingEnv: missingEnvVars(),
      usingDefaultPassword: appConfig.appPassword === 'changeme',
    });
  });
}
