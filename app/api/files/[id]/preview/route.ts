import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import { getDriver } from '@/lib/driver';
import { getStoredFile } from '@/lib/store';
import type { StoredChunk } from '@/lib/types';
import { createStoredFileStream, parseRangeHeader } from '@/lib/stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

const TEXT_KINDS = /^text\/|^application\/(json|xml|javascript|x-sh|yaml)/;

export async function GET(request: Request, context: RouteContext) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    const { id } = await context.params;
    const file = await getStoredFile(id);
    if (!file) return jsonError('File not found.', 404);

    const etag = `"${file.id}-${file.updatedAt}"`;
    if (
      !request.headers.get('range') &&
      request.headers.get('if-none-match') === etag
    ) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const driver = getDriver();
    const fetchChunk = (chunk: StoredChunk) =>
      driver.getChunkStream(chunk.fileId, chunk.botIndex);
    const baseHeaders: Record<string, string> = {
      'Content-Type': TEXT_KINDS.test(file.mime)
        ? `${file.mime.split(';')[0]}; charset=utf-8`
        : file.mime || 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      ETag: etag,
      'Accept-Ranges': 'bytes',
    };

    const range = parseRangeHeader(request.headers.get('range'), file.size);
    if (range) {
      const stream = createStoredFileStream(file.chunks, fetchChunk, range);
      return new Response(stream, {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes ${range.start}-${range.end}/${file.size}`,
          'Content-Length': String(range.end - range.start + 1),
        },
      });
    }

    const stream = createStoredFileStream(file.chunks, fetchChunk);
    return new Response(stream, {
      headers: { ...baseHeaders, 'Content-Length': String(file.size) },
    });
  });
}
