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
};

const MAX_CONCURRENT = 2;
const MAX_RETRIES = 2;

let itemCounter = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useUploadQueue({ chunkSize, onUploaded, onError }: Options) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const internal = useRef<InternalItem[]>([]);
  const active = useRef(new Set<string>());
  const controllers = useRef(new Map<string, AbortController>());
  const syncScheduled = useRef(false);

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
    window.setTimeout(flush, 80);
  }, []);

  const chunkBytes = Math.max(1, chunkSize);

  const run = useCallback(
    async (item: InternalItem) => {
      const controller = new AbortController();
      controllers.current.set(item.id, controller);

      const totalChunks = Math.max(1, Math.ceil(item.size / chunkBytes) || 1);
      const chunks: StoredChunk[] = [];

      item.status = 'uploading';
      item.progress = 0;
      sync();

      try {
        for (let index = 0; index < totalChunks; index += 1) {
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
                  const base = (index / totalChunks) * 100;
                  const scale = (loaded / blob.size) * (100 / totalChunks);
                  item.progress = Math.min(99, base + scale);
                  item.uploadedBytes = start + loaded;
                  sync();
                },
              });
              chunks.push(result.chunk);
              break;
            } catch (error) {
              if (controller.signal.aborted) throw error;
              attempt += 1;
              if (attempt > MAX_RETRIES) throw error;
              await sleep(700 * attempt);
            }
          }

          item.progress = Math.min(99, ((index + 1) / totalChunks) * 100);
          item.uploadedBytes = end;
          sync();
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
    while (active.current.size < MAX_CONCURRENT) {
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
      (item) => item.status === 'uploading' || item.status === 'finalizing' || item.status === 'queued',
    ).length;
    const pendingBytes = items
      .filter((item) => item.status === 'uploading' || item.status === 'queued')
      .reduce((sum, item) => sum + (item.size - item.uploadedBytes), 0);
    return { activeCount, pendingBytes };
  }, [items]);

  const isUploading = summary.activeCount > 0;

  return { items, addFiles, cancel, retry, dismiss, clearFinished, cancelAll, isUploading, summary };
}
