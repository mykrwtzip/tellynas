import { NextResponse } from 'next/server';
import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import { getShares, getStoredFile, revokeShare } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ token: string }> };

/* Public: anyone with the token can inspect the shared file. */
export async function GET(_request: Request, context: RouteContext) {
  return withApiGuard(async () => {
    const { token } = await context.params;
    const shares = await getShares();
    const share = shares.find((item) => item.token === token);
    if (!share) return jsonError('Share link not found.', 404);

    if (share.expiresAt !== undefined && Date.now() > share.expiresAt) {
      return jsonError('This share link has expired.', 410);
    }

    const file = await getStoredFile(share.targetId);
    if (!file) return jsonError('The shared file is no longer available.', 410);

    return NextResponse.json({
      share: {
        token: share.token,
        createdAt: share.createdAt,
        expiresAt: share.expiresAt,
      },
      file: { id: file.id, name: file.name, size: file.size, mime: file.mime },
      downloadUrl: `/api/share/${token}/download`,
    });
  });
}

/* Owner only: revoke a share link. */
export async function DELETE(request: Request, context: RouteContext) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    const { token } = await context.params;
    const revoked = await revokeShare(token);
    if (!revoked) return jsonError('Share link not found.', 404);
    return NextResponse.json({ success: true });
  });
}
