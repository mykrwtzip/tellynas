import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { jsonError, requireSession, withApiGuard } from '@/lib/api';
import { mutateIndex, normalizeFolder, sanitizeName } from '@/lib/store';
import type { StoredChunk, StoredFile } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FinalizeBody = {
  name?: string;
  mime?: string;
  size?: number;
  folder?: string;
  chunks?: Array<{ index?: number; messageId?: number; fileId?: string; size?: number }>;
};

/** Adds " (2)" style suffixes so two files never collide inside one folder. */
function uniqueName(
  existing: string[],
  desired: string,
): string {
  const taken = new Set(existing.map((name) => name.toLowerCase()));
  if (!taken.has(desired.toLowerCase())) return desired;

  const dot = desired.lastIndexOf('.');
  const stem = dot > 0 ? desired.slice(0, dot) : desired;
  const extension = dot > 0 ? desired.slice(dot) : '';

  let counter = 2;
  let candidate = `${stem} (${counter})${extension}`;
  while (taken.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${stem} (${counter})${extension}`;
  }
  return candidate;
}

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

    const computedSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
    const size = Number(body.size);
    const folder = normalizeFolder(body.folder);
    const name = sanitizeName(body.name);
    const mime = String(body.mime || 'application/octet-stream').slice(0, 200);

    const file = await mutateIndex<StoredFile>((index) => {
      const siblings = index.files
        .filter((entry) => entry.folder === folder)
        .map((entry) => entry.name);

      const record: StoredFile = {
        id: randomUUID(),
        name: uniqueName(siblings, name),
        size: Number.isFinite(size) && size > 0 ? size : computedSize,
        mime,
        folder,
        chunks,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        starred: false,
      };

      index.files.push(record);

      // Register every ancestor folder so the tree stays consistent.
      const segments = folder.split('/').filter(Boolean);
      for (let i = 0; i < segments.length; i += 1) {
        const path = segments.slice(0, i + 1).join('/');
        if (!index.folders.some((entry) => entry.path === path)) {
          index.folders.push({ path, createdAt: Date.now() });
        }
      }

      return record;
    });

    return NextResponse.json({ success: true, file });
  });
}
