import archiver from 'archiver';
import { Readable } from 'node:stream';
import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import { getIndex } from '@/lib/store';
import { getDriver } from '@/lib/driver';
import { createStoredFileStream } from '@/lib/stream';
import type { StoredFile } from '@/lib/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  return withApiGuard(async () => {
    const form = await request.formData();
    let ids: unknown;
    try { ids = JSON.parse(String(form.get('ids') || '')); } catch { return jsonError('Invalid selection.', 400); }
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || ids.some(id => typeof id !== 'string')) return jsonError('Select between 1 and 100 files.', 400);
    const index = await getIndex();
    const selected = [...new Set(ids as string[])].map(id => index.files.find(f => f.id === id && !f.archived));
    if (selected.some(file => !file)) return jsonError('A selected file is unavailable.', 404);
    const driver = getDriver();
    const archive = archiver('zip', { zlib: { level: 0 } });
    const used = new Set<string>();
    for (const file of selected as StoredFile[]) {
      const safeName = file.name.replace(/[\\/\x00-\x1f]/g, '_').replace(/^\.+$/, '_') || 'file';
      let name = safeName;
      let counter = 1;
      while (used.has(name.toLowerCase())) name = `${counter++}-${safeName}`;
      used.add(name.toLowerCase());
      // Start each remote stream only when the ZIP writer consumes it.
      const data = Readable.from((async function* () {
        const stream = createStoredFileStream(file.chunks, chunk => driver.getChunkStream(chunk.fileId, chunk.botIndex));
        const reader = stream.getReader();
        try { while (true) { const { value, done } = await reader.read(); if (done) break; yield value; } }
        finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      })());
      data.on('error', error => archive.destroy(error));
      archive.append(data, { name, date: new Date(file.createdAt) });
    }
    void archive.finalize().catch(error => archive.destroy(error));
    return new Response(Readable.toWeb(archive) as ReadableStream, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="tellynas-files.zip"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  });
}
