import { NextResponse } from 'next/server';
import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import { createStoredFile, normalizeFolder, sanitizeName } from '@/lib/store';
import type { StoredChunk } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FinalizeBody = {
  name?: string;
  mime?: string;
  size?: number;
  folder?: string;
  chunks?: Array<{ index?: number; messageId?: number; fileId?: string; size?: number }>;
};

export async function POST(request: Request) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return withApiGuard(async () => {
    let body: FinalizeBody;
    try {
      body = (await request.json()) as FinalizeBody;
    } catch {
      return jsonError('Invalid JSON body.', 400);
    }

    const rawChunks = Array.isArray(body.chunks) ? body.chunks : [];
    if (rawChunks.length === 0) {
      return jsonError('Upload the file chunks before finalizing.', 400);
    }

    const chunks: StoredChunk[] = rawChunks
      .map((chunk) => ({
        index: Number(chunk.index ?? 0),
        messageId: Number(chunk.messageId ?? 0),
        fileId: String(chunk.fileId ?? ''),
        size: Number(chunk.size ?? 0),
      }))
      .filter((chunk) => chunk.fileId)
      .sort((a, b) => a.index - b.index);

    if (chunks.length !== rawChunks.length) {
      return jsonError('One or more chunks were malformed. Please retry.', 400);
    }

    const file = await createStoredFile({
      name: sanitizeName(body.name),
      mime: String(body.mime || 'application/octet-stream').slice(0, 200),
      size: Number(body.size),
      folder: normalizeFolder(body.folder),
      chunks,
    });

    return NextResponse.json({ success: true, file });
  });
}
