import { NextResponse } from 'next/server';
import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import { appConfig } from '@/lib/config';
import { getDriver } from '@/lib/driver';
import { normalizeFolder, sanitizeName } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Streaming large chunks can take a while on slow connections.
export const maxDuration = 60;

export async function POST(request: Request) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonError('Upload body could not be read. Try a smaller file.', 413);
    }

    const blob = form.get('chunk');
    if (!(blob instanceof Blob) || blob.size === 0) {
      return jsonError('No file chunk was provided.', 400);
    }

    if (blob.size > appConfig.chunkSize + 1024) {
      return jsonError(
        `Chunk exceeds the ${Math.round(appConfig.chunkSize / 1024 / 1024)} MB limit.`,
        413,
      );
    }

    const name = sanitizeName(form.get('name'));
    const index = Number(form.get('index') ?? 0);
    const total = Number(form.get('total') ?? 1);

    if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1) {
      return jsonError('Invalid chunk numbering.', 400);
    }
    if (index < 0 || index >= total) {
      return jsonError('Chunk index is out of range.', 400);
    }

    // `folder` is validated here so an interrupted upload cannot create garbage.
    normalizeFolder(form.get('folder'));

    const data = new Uint8Array(await blob.arrayBuffer());
    const chunk = await getDriver().uploadChunk({ data, name, index, total });

    return NextResponse.json({ success: true, chunk, index, total });
  });
}
