import sharp from 'sharp';
import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import { getDriver } from '@/lib/driver';
import { getStoredFile } from '@/lib/store';
import { createStoredFileStream } from '@/lib/stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const cache = new Map<string, Uint8Array>();
const MAX_ITEMS = 150;
const pending = new Map<string, Promise<Uint8Array>>();

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  return withApiGuard(async () => {
    const { id } = await context.params;
    const file = await getStoredFile(id);
    if (!file) return jsonError('File not found.', 404);
    // Avoid decoding unbounded or active content, including SVG.
    if (!/^image\/(jpeg|png|webp|gif|avif)$/i.test(file.mime) || file.size > 20 * 1024 * 1024) return jsonError('Thumbnail unavailable.', 415);
    const key = `${file.id}-${file.updatedAt}`;
    const etag = `"thumb-${key}"`;
    const headers = { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=300', ETag: etag, 'X-Content-Type-Options': 'nosniff' };
    if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
    let thumbnail = cache.get(key);
    if (!thumbnail) {
      let work = pending.get(key);
      if (!work) {
        work = (async () => {
          const driver = getDriver();
          const stream = createStoredFileStream(file.chunks, chunk => driver.getChunkStream(chunk.fileId, chunk.botIndex));
          const bytes = await new Response(stream).arrayBuffer();
          const result = await sharp(Buffer.from(bytes), { limitInputPixels: 40_000_000 }).rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
          cache.set(key, result);
          if (cache.size > MAX_ITEMS) cache.delete(cache.keys().next().value!);
          return result;
        })().finally(() => pending.delete(key));
        pending.set(key, work);
      }
      thumbnail = await work;
    }
    return new Response(thumbnail as BodyInit, { headers });
  });
}
