import { NextResponse } from 'next/server';
import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import { getShares, getStoredFile } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    const shares = await getShares();

    const result = await Promise.all(
      shares.map(async (share) => {
        const file = await getStoredFile(share.targetId);
        if (!file) return null;
        return {
          share: {
            token: share.token,
            createdAt: share.createdAt,
            expiresAt: share.expiresAt,
          },
          file: { id: file.id, name: file.name, size: file.size, mime: file.mime },
          downloadUrl: `/api/share/${share.token}/download`,
        };
      }),
    );

    return NextResponse.json(result.filter(Boolean));
  });
}
