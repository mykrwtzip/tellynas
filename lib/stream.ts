import type { StoredChunk } from './types';

type ChunkFetcher = (chunk: StoredChunk) => Promise<{ stream: ReadableStream<Uint8Array> }>;

type SliceEntry = {
  chunk: StoredChunk;
  chunkStart: number;
  chunkEnd: number;
};

async function* iterateRange(
  chunks: StoredChunk[],
  fetchChunk: ChunkFetcher,
  start: number,
  end: number,
): AsyncGenerator<Uint8Array> {
  const needed: SliceEntry[] = [];
  let cursor = 0;

  for (const chunk of chunks) {
    const chunkStart = cursor;
    const chunkEnd = cursor + chunk.size - 1;
    cursor += chunk.size;

    if (chunkEnd < start) continue;
    if (chunkStart > end) break;
    needed.push({ chunk, chunkStart, chunkEnd });
  }

  if (needed.length === 0) return;

  // Prefetch several chunk streams ahead so multi-part downloads and media
  // playback stay smooth without dead-air pauses between slices. More bots =
  // more parallel fetches.
  const PREFETCH_AHEAD = 3;
  const prefetchWindow: ReturnType<ChunkFetcher>[] = [];

  // Prime the prefetch window with the first PREFETCH_AHEAD chunks.
  for (let i = 0; i < Math.min(PREFETCH_AHEAD, needed.length); i += 1) {
    prefetchWindow.push(fetchChunk(needed[i].chunk));
  }

  try {
    for (let idx = 0; idx < needed.length; idx += 1) {
      const current = needed[idx];

      // The current chunk's fetch is at the front of the window.
      const currentFetch = prefetchWindow.shift() ?? fetchChunk(current.chunk);

      // Refill the window so we always have PREFETCH_AHEAD chunks in flight.
      const nextIdx = idx + PREFETCH_AHEAD;
      if (nextIdx < needed.length) {
        prefetchWindow.push(fetchChunk(needed[nextIdx].chunk));
      }
      // Prevent unhandled rejections for any prefetched stream we don't consume.
      prefetchWindow.forEach((p) => p.catch(() => undefined));

      const { stream } = await currentFetch;
      const reader = stream.getReader();
      let position = current.chunkStart;

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value || value.byteLength === 0) continue;

          const bufferStart = position;
          const bufferEnd = position + value.byteLength - 1;
          position += value.byteLength;

          if (bufferEnd < start) continue;
          if (bufferStart > end) {
            await reader.cancel().catch(() => undefined);
            return;
          }

          const from = Math.max(0, start - bufferStart);
          const to = Math.min(value.byteLength - 1, end - bufferStart);
          yield value.subarray(from, to + 1);
        }
      } finally {
        reader.releaseLock();
      }
    }
  } finally {
    prefetchWindow.forEach((p) =>
      p.then(({ stream }) => stream.cancel().catch(() => undefined)).catch(() => undefined),
    );
  }
}

/**
 * Streams a stored file (or a byte range of it) by chaining the streams of the
 * stored slices with lookahead prefetching.
 */
export function createStoredFileStream(
  chunks: StoredChunk[],
  fetchChunk: ChunkFetcher,
  options: { start?: number; end?: number } = {},
): ReadableStream<Uint8Array> {
  const start = Math.max(0, options.start ?? 0);
  const end = options.end ?? Number.MAX_SAFE_INTEGER;
  const iterator = iterateRange(chunks, fetchChunk, start, end);

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.(undefined).catch(() => undefined);
    },
  });
}

/** Parses a single "bytes=start-end" Range header. */
export function parseRangeHeader(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  let start: number;
  let end: number;

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;

  return { start, end: Math.min(end, size - 1) };
}
