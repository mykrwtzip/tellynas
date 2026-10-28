import { NextResponse } from 'next/server';
import { jsonError, withApiGuard } from '@/lib/api';
import { getDriver } from '@/lib/driver';
import { getShares, getStoredFile } from '@/lib/store';
import { createStoredFileStream } from '@/lib/stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type RouteContext = { params: Promise<{ token: string }> };

/* Public: anyone with the token can download the file (no sign-in required). */
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

    const driver = getDriver();
    const stream = createStoredFileStream(file.chunks, (chunk) =>
      driver.getChunkStream(chunk.fileId, chunk.botIndex),
    );

    const safeAscii = (name: string) =>
      name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');

    return new Response(stream, {
      headers: {
        'Content-Type': file.mime || 'application/octet-stream',
        'Content-Length': String(file.size),
        'Content-Disposition': `attachment; filename="${safeAscii(file.name)}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        'Cache-Control': 'public, max-age=300',
      },
    });
  });
}
