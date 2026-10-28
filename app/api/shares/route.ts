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
        const file = share.targetType === 'folder' ? null : await getStoredFile(share.targetId);

        return {
          share: {
            token: share.token,
            createdAt: share.createdAt,
            expiresAt: share.expiresAt,
            passwordProtected: Boolean(share.passwordHash),
            targetType: share.targetType || 'file',
          },
          file: file ? { id: file.id, name: file.name, size: file.size, mime: file.mime } : { id: share.targetId, name: share.targetType === 'folder' ? `Folder: /${share.targetId}` : 'Unavailable file', size: 0, mime: '' },
          downloadUrl: `/share/${share.token}`,
        };
      }),
    );

    return NextResponse.json(result.filter(Boolean));
  });
}
