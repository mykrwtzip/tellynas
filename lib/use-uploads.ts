'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api, uploadChunk } from './client-api';
import type { StoredChunk, StoredFile } from './types';

export type UploadStatus =
  | 'queued'
  | 'uploading'
  | 'finalizing'
  | 'done'
  | 'error'
  | 'cancelled';

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  mime: string;
  folder: string;
  status: UploadStatus;
  progress: number;
  uploadedBytes: number;
  error?: string;
};

type InternalItem = UploadItem & {
  file: File;
  /** Chunk indexes that have already been stored (for resumable retries). */
  uploadedChunks: Map<number, StoredChunk>;
};

type Options = {
  chunkSize: number;
  onUploaded: (file: StoredFile) => void;
  onError: (message: string) => void;
  /** How many files upload at the same time. */
  maxConcurrent?: number;
  /** How many slices of one file upload in parallel (per file, capped by global limit). */
  chunkConcurrency?: number;
};

// Browser caps ~6 requests/host; Vercel free ~10 concurrent lambdas.
// 4 files × 8 slices = 32 queued, but global cap below keeps actual in-flight sane.
const DEFAULT_MAX_CONCURRENT = 4;
const DEFAULT_CHUNK_CONCURRENCY = 8;
const GLOBAL_CHUNK_CAP = 12; // max concurrent chunk XHRs across all files
const MAX_RETRIES = 3;

// randomUUID is restricted to secure contexts; getRandomValues also works on
// self-hosted HTTP installations and still produces cryptographically random IDs.
function uploadId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Global semaphore for chunk uploads – prevents browser head-of-line blocking
class Semaphore {
  private count = 0;
  private waiters: Array<() => void> = [];
  constructor(private readonly max: number) {}
  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) throw new ApiError('Upload cancelled.', 0);
    if (this.count < this.max) {
      this.count += 1;
      return () => this.release();
    }
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new ApiError('Upload cancelled.', 0));
      };
      const waiter = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      this.waiters.push(waiter);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    return () => this.release();
  }
  private release() {
    const next = this.waiters.shift();
    if (next) next(); // Transfer the slot directly to the waiter.
    else this.count -= 1;
  }
}

const globalChunkSemaphore = new Semaphore(GLOBAL_CHUNK_CAP);

export function useUploadQueue({
  chunkSize,
  onUploaded,
  onError,
  maxConcurrent,
  chunkConcurrency,
}: Options) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const internal = useRef<InternalItem[]>([]);
  const active = useRef(new Set<string>());
  const controllers = useRef(new Map<string, AbortController>());
  const syncScheduled = useRef(false);

  const maxFilesConcurrent = Math.max(1, maxConcurrent ?? DEFAULT_MAX_CONCURRENT);
  const maxChunkConcurrent = Math.max(1, chunkConcurrency ?? DEFAULT_CHUNK_CONCURRENCY);

  const callbacks = useRef({ onUploaded, onError });
  useEffect(() => {
    callbacks.current = { onUploaded, onError };
  }, [onUploaded, onError]);

  const sync = useCallback((immediate = false) => {
    const flush = () => {
      syncScheduled.current = false;
      setItems(
        internal.current.map(({ file: _file, uploadedChunks: _chunks, ...rest }) => ({ ...rest })),
      );
    };
    if (immediate) {
      flush();
      return;
    }
    if (syncScheduled.current) return;
    syncScheduled.current = true;
    window.setTimeout(flush, 50);
  }, []);

  const chunkBytes = Math.max(1, chunkSize);

  const run = useCallback(
    async (item: InternalItem) => {
      const controller = new AbortController();
      controllers.current.set(item.id, controller);

      const totalChunks = Math.max(1, Math.ceil(item.size / chunkBytes) || 1);
      const loadedPerChunk = new Array<number>(totalChunks).fill(0);

      item.status = 'uploading';
      item.progress = 0;
      sync(true);

      const updateProgress = () => {
        const uploaded = loadedPerChunk.reduce((sum, val) => sum + val, 0);
        item.uploadedBytes = Math.min(item.size, uploaded);
        item.progress =
          item.size > 0 ? Math.min(99, (item.uploadedBytes / item.size) * 100) : 99;
        sync();
      };

      const doUploadChunk = async (index: number): Promise<StoredChunk> => {
        for (let attempt = 0; ; attempt += 1) {
          const release = await globalChunkSemaphore.acquire(controller.signal);
          try {
            const start = index * chunkBytes;
            const blob = item.file.slice(start, Math.min(start + chunkBytes, item.size));
            const form = new FormData();
            form.append('chunk', blob, item.name);
            form.append('name', item.name);
            form.append('folder', item.folder);
            form.append('index', String(index));
            form.append('total', String(totalChunks));
            const result = await uploadChunk(form, {
              signal: controller.signal,
              onProgress: (loaded) => {
                loadedPerChunk[index] = Math.min(blob.size, loaded);
                updateProgress();
              },
            });
            if (!result.chunk || result.chunk.index !== index) throw new ApiError('Invalid chunk response.', 502);
            loadedPerChunk[index] = blob.size;
            item.uploadedChunks.set(index, result.chunk);
            updateProgress();
            return result.chunk;
          } catch (error) {
            loadedPerChunk[index] = 0;
            updateProgress();
            if (controller.signal.aborted || attempt >= MAX_RETRIES ||
                (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429)) throw error;
          } finally {
            release();
          }
          await sleep(500 * (attempt + 1));
        }
      };

      try {
        const pendingIndexes = Array.from({ length: totalChunks }, (_, i) => i).filter(
          (i) => !item.uploadedChunks.has(i),
        );
        for (const idx of item.uploadedChunks.keys()) {
          loadedPerChunk[idx] = Math.min(item.size - idx * chunkBytes, chunkBytes);
        }
        updateProgress();

        let cursor = 0;
        let stopped = false;
        const worker = async () => {
          while (cursor < pendingIndexes.length && !controller.signal.aborted && !stopped) {
            try {
              await doUploadChunk(pendingIndexes[cursor++]);
            } catch (error) {
              stopped = true;
              throw error;
            }
          }
        };
        // Wait for all workers to settle before allowing a retry, so no old worker
        // can mutate the item while the next attempt is running.
        const results = await Promise.allSettled(Array.from({ length: Math.min(maxChunkConcurrent, pendingIndexes.length) }, () => worker()));
        if (controller.signal.aborted) throw new ApiError('Upload cancelled.', 0);
        const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (failure) throw failure.reason;
        const chunks = Array.from(item.uploadedChunks.values()).sort((a, b) => a.index - b.index);
        if (chunks.length !== totalChunks) throw new ApiError('Some chunks are missing. Please retry.', 0);

        item.status = 'finalizing';
        sync(true);

        const { file } = await api.finalize({
          id: item.id,
          name: item.name,
          mime: item.mime || 'application/octet-stream',
          size: item.size,
          folder: item.folder,
          chunks,
        }, controller.signal);

        item.status = 'done';
        item.progress = 100;
        item.uploadedBytes = item.size;
        sync(true);
        callbacks.current.onUploaded(file);
      } catch (error) {
        if (error instanceof ApiError && error.message === 'Upload cancelled.') {
          item.status = 'cancelled';
          item.error = 'Cancelled';
        } else {
          item.status = 'error';
          item.error =
            error instanceof Error ? error.message : 'Something went wrong.';
          callbacks.current.onError(`${item.name}: ${item.error}`);
        }
        sync(true);
      } finally {
        controllers.current.delete(item.id);
      }
    },
    [chunkBytes, maxChunkConcurrent, sync],
  );

  const pump = useCallback(() => {
    while (active.current.size < maxFilesConcurrent) {
      const next = internal.current.find((item) => item.status === 'queued' && !active.current.has(item.id));
      if (!next) return;
      active.current.add(next.id);
      void run(next).finally(() => {
        active.current.delete(next.id);
        sync(true);
        pump();
      });
    }
  }, [maxFilesConcurrent, run, sync]);

  const addFiles = useCallback(
    (files: File[], folder: string) => {
      const accepted = files.filter((file) => file.size > 0);
      if (accepted.length === 0) return;

      accepted.forEach((file) => {
        internal.current.push({
          id: uploadId(),
          name: file.name,
          size: file.size,
          mime: file.type || 'application/octet-stream',
          folder,
          status: 'queued',
          progress: 0,
          uploadedBytes: 0,
          file,
          uploadedChunks: new Map<number, StoredChunk>(),
        });
      });
      sync(true);
      pump();
    },
    [pump, sync],
  );

  const cancel = useCallback(
    (id: string) => {
      const item = internal.current.find((entry) => entry.id === id);
      if (!item) return;
      if (item.status === 'queued') {
        item.status = 'cancelled';
        item.error = 'Cancelled';
        sync(true);
        return;
      }
      controllers.current.get(id)?.abort();
    },
    [sync],
  );

  const retry = useCallback(
    (id: string) => {
      const item = internal.current.find((entry) => entry.id === id);
      if (!item) return;
      item.status = 'queued';
      item.progress = 0;
      item.uploadedBytes = 0;
      item.error = undefined;
      sync(true);
      pump();
    },
    [pump, sync],
  );

  const dismiss = useCallback(
    (id: string) => {
      if (active.current.has(id)) return;
      internal.current = internal.current.filter((item) => item.id !== id);
      sync(true);
    },
    [sync],
  );

  const clearFinished = useCallback(() => {
    internal.current = internal.current.filter(
      (item) =>
        item.status === 'queued' ||
        item.status === 'uploading' ||
        item.status === 'finalizing',
    );
    sync(true);
  }, [sync]);

  const cancelAll = useCallback(() => {
    internal.current.forEach((item) => {
      if (item.status === 'queued') {
        item.status = 'cancelled';
        item.error = 'Cancelled';
      }
    });
    controllers.current.forEach((controller) => controller.abort());
    sync(true);
  }, [sync]);

  const summary = useMemo(() => {
    const activeCount = items.filter(
      (item) =>
        item.status === 'uploading' ||
        item.status === 'finalizing' ||
        item.status === 'queued',
    ).length;
    const pendingBytes = items
      .filter((item) => item.status === 'uploading' || item.status === 'queued')
      .reduce((sum, item) => sum + (item.size - item.uploadedBytes), 0);
    return { activeCount, pendingBytes };
  }, [items]);

  const isUploading = summary.activeCount > 0;

  return {
    items,
    addFiles,
    cancel,
    retry,
    dismiss,
    clearFinished,
    cancelAll,
    isUploading,
    summary,
  };
}
