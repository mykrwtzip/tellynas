import { jsonError, requireSession } from '@/lib/api';
import { getDriver } from '@/lib/driver';
import { getIndex } from '@/lib/store';
import { createStoredFileStream, parseRangeHeader } from '@/lib/stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

const TEXT_KINDS = /^text\/|^application\/(json|xml|javascript|x-sh|yaml)/;

export async function GET(request: Request, context: RouteContext) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const index = await getIndex();
  const file = index.files.find((entry) => entry.id === id);
  if (!file) return jsonError('File not found.', 404);

  const driver = getDriver();
  const fetchChunk = (fileId: string) => driver.getChunkStream(fileId);
  const baseHeaders: Record<string, string> = {
    'Content-Type': TEXT_KINDS.test(file.mime)
      ? `${file.mime.split(';')[0]}; charset=utf-8`
      : file.mime || 'application/octet-stream',
    'Content-Disposition': 'inline',
    'Cache-Control': 'private, max-age=300',
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
}
