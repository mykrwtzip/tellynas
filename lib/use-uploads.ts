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

type InternalItem = UploadItem & { file: File };

type Options = {
  chunkSize: number;
  onUploaded: (file: StoredFile) => void;
  onError: (message: string) => void;
  /** How many files upload at the same time. */
  maxConcurrent?: number;
  /** How many slices of one file upload in parallel. */
  chunkConcurrency?: number;
};

const DEFAULT_MAX_CONCURRENT = 6;
const DEFAULT_CHUNK_CONCURRENCY = 8;
const MAX_RETRIES = 2;

let itemCounter = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
        internal.current.map(({ file: _file, ...rest }) => ({ ...rest })),
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
      const chunks: StoredChunk[] = [];
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

      try {
        // Fast single-request path when the file fits in one slice.
        if (totalChunks === 1) {
          const form = new FormData();
          form.append('chunk', item.file, item.name);
          form.append('name', item.name);
          form.append('folder', item.folder);
          form.append('mime', item.mime || 'application/octet-stream');
          form.append('size', String(item.size));
          form.append('index', '0');
          form.append('total', '1');
          form.append('finalize', '1');

          let attempt = 0;
          let singleResult: Awaited<ReturnType<typeof uploadChunk>> | null = null;
          // eslint-disable-next-line no-constant-condition
          while (true) {
            try {
              singleResult = await uploadChunk(form, {
                signal: controller.signal,
                onProgress: (loaded) => {
                  loadedPerChunk[0] = Math.min(item.size, loaded);
                  updateProgress();
                },
              });
              break;
            } catch (error) {
              if (controller.signal.aborted) throw error;
              attempt += 1;
              if (attempt > MAX_RETRIES) throw error;
              await sleep(500 * attempt);
            }
          }

          if (singleResult?.file) {
            item.status = 'done';
            item.progress = 100;
            item.uploadedBytes = item.size;
            sync(true);
            callbacks.current.onUploaded(singleResult.file);
            return;
          }
          if (singleResult?.chunk) {
            chunks.push(singleResult.chunk);
          }
        } else {
          // Parallel slice upload for multi-part files.
          let nextIndex = 0;
          const uploadWorker = async () => {
            while (nextIndex < totalChunks) {
              const index = nextIndex;
              nextIndex += 1;

              const start = index * chunkBytes;
              const end = Math.min(start + chunkBytes, item.size);
              const blob = item.file.slice(start, end);

              const form = new FormData();
              form.append('chunk', blob, item.name);
              form.append('name', item.name);
              form.append('folder', item.folder);
              form.append('index', String(index));
              form.append('total', String(totalChunks));

              let attempt = 0;
              // eslint-disable-next-line no-constant-condition
              while (true) {
                try {
                  const result = await uploadChunk(form, {
                    signal: controller.signal,
                    onProgress: (loaded) => {
                      loadedPerChunk[index] = Math.min(blob.size, loaded);
                      updateProgress();
                    },
                  });
                  loadedPerChunk[index] = blob.size;
                  chunks.push(result.chunk);
                  updateProgress();
                  break;
                } catch (error) {
                  if (controller.signal.aborted) throw error;
                  loadedPerChunk[index] = 0;
                  attempt += 1;
                  if (attempt > MAX_RETRIES) throw error;
                  await sleep(500 * attempt);
                }
              }
            }
          };

          await Promise.all(
            Array.from(
              { length: Math.min(maxChunkConcurrent, totalChunks) },
              () => uploadWorker(),
            ),
          );
          chunks.sort((a, b) => a.index - b.index);
        }

        item.status = 'finalizing';
        sync(true);

        const { file } = await api.finalize({
          name: item.name,
          mime: item.mime || 'application/octet-stream',
          size: item.size,
          folder: item.folder,
          chunks: chunks.map(({ index, messageId, fileId, size }) => ({
            index,
            messageId,
            fileId,
            size,
          })),
        });

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
    [chunkBytes, sync],
  );

  const pump = useCallback(() => {
    while (active.current.size < maxFilesConcurrent) {
      const next = internal.current.find((item) => item.status === 'queued');
      if (!next) return;
      active.current.add(next.id);
      void run(next).finally(() => {
        active.current.delete(next.id);
        sync(true);
        pump();
      });
    }
  }, [run, sync]);

  const addFiles = useCallback(
    (files: File[], folder: string) => {
      const accepted = files.filter((file) => file.size > 0);
      if (accepted.length === 0) return;

      accepted.forEach((file) => {
        itemCounter += 1;
        internal.current.push({
          id: `upload-${Date.now().toString(36)}-${itemCounter}`,
          name: file.name,
          size: file.size,
          mime: file.type || 'application/octet-stream',
          folder,
          status: 'queued',
          progress: 0,
          uploadedBytes: 0,
          file,
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
