import { NextResponse } from 'next/server';
import { requireSession, withApiGuard } from '@/lib/api';
import { computeStats, getIndex } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    const index = await getIndex();
    const stats = computeStats(index);

    const byKind = index.files.reduce<Record<string, number>>((acc, file) => {
      const kind = file.mime.split('/')[0] || 'other';
      acc[kind] = (acc[kind] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      ...stats,
      byKind,
      recent: [...index.files]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 6),
      starred: index.files.filter((file) => file.starred).length,
    });
  });
}
