import { NextResponse } from 'next/server';
import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import { createStoredFile, normalizeFolder, sanitizeName } from '@/lib/store';
import type { StoredChunk } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type FinalizeBody = {
  id?: string;
  name?: string;
  mime?: string;
  size?: number;
  folder?: string;
  chunks?: Array<{ index?: number; messageId?: number; fileId?: string; size?: number; botIndex?: number }>;
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
        botIndex: chunk.botIndex === undefined ? undefined : Number(chunk.botIndex),
      }))
      .filter((chunk) => chunk.fileId)
      .sort((a, b) => a.index - b.index);

    if (chunks.length !== rawChunks.length) {
      return jsonError('One or more chunks were malformed. Please retry.', 400);
    }

    if (!Number.isSafeInteger(body.size) || (body.size ?? 0) <= 0 ||
      chunks.some((chunk, index) => chunk.index !== index || !Number.isSafeInteger(chunk.messageId) || chunk.messageId <= 0 || !Number.isSafeInteger(chunk.size) || chunk.size <= 0 || (chunk.botIndex !== undefined && (!Number.isSafeInteger(chunk.botIndex) || chunk.botIndex < 0))) ||
      chunks.reduce((sum, chunk) => sum + chunk.size, 0) !== body.size) {
      return jsonError('Chunks are incomplete or invalid. Please retry.', 400);
    }
    if (body.id !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) {
      return jsonError('Invalid upload ID.', 400);
    }

    const file = await createStoredFile({
      id: body.id,
      name: sanitizeName(body.name),
      mime: String(body.mime || 'application/octet-stream').slice(0, 200),
      size: Number(body.size),
      folder: normalizeFolder(body.folder),
      chunks,
    });

    return NextResponse.json({ success: true, file });
  });
}
