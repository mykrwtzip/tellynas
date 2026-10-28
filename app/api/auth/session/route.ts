import { NextResponse } from 'next/server';
import { getSession } from '@/lib/api';
import { publicRuntimeConfig } from '@/lib/config';
import { getIndexBackend, isIndexPersistent } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  return NextResponse.json({
    authenticated: Boolean(session),
    username: session?.sub ?? null,
    indexBackend: getIndexBackend(),
    indexPersistent: isIndexPersistent(),
    runtime: publicRuntimeConfig(),
  });
}
