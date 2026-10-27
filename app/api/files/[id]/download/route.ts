import { jsonError, requireSession } from '@/lib/api';
import { getDriver } from '@/lib/driver';
import { getIndex } from '@/lib/store';
import { createStoredFileStream } from '@/lib/stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

const safeAscii = (name: string) => name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');

export async function GET(_request: Request, context: RouteContext) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const index = await getIndex();
  const file = index.files.find((entry) => entry.id === id);
  if (!file) return jsonError('File not found.', 404);

  const driver = getDriver();
  const stream = createStoredFileStream(file.chunks, (fileId) =>
    driver.getChunkStream(fileId),
  );

  return new Response(stream, {
    headers: {
      'Content-Type': file.mime || 'application/octet-stream',
      'Content-Length': String(file.size),
      'Content-Disposition': `attachment; filename="${safeAscii(file.name)}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
