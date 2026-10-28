import { NextResponse } from 'next/server';
import { requireSession, withApiGuard } from '@/lib/api';
import { appConfig, missingEnvVars, useDemoDriver } from '@/lib/config';
import { getDriver } from '@/lib/driver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    const driver = getDriver();
    const demo = useDemoDriver();
    const connection = await driver.checkConnection();

    return NextResponse.json({
      driver: driver.mode,
      persistent: !demo,
      serverless: appConfig.serverless,
      demo,
      connection,
      chunkSizeMb: Math.round(appConfig.chunkSize / 1024 / 1024),
      missingEnv: missingEnvVars(),
      usingDefaultPassword: appConfig.appPassword === 'changeme',
    });
  });
}
