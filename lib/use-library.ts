'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './client-api';
import type { StorageStats, StoredFile } from './types';

export type FolderEntry = { path: string; createdAt: number };

export type LibraryView = 'all' | 'recent' | 'starred';

export type LibraryState = {
  files: StoredFile[];
  folders: FolderEntry[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastSyncedAt: number | null;
};

const initialState: LibraryState = {
  files: [],
  folders: [],
  loading: true,
  refreshing: false,
  error: null,
  lastSyncedAt: null,
};

export function useLibrary() {
  const [state, setState] = useState<LibraryState>(initialState);
  const mounted = useRef(true);
  const inFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (silent: boolean) => {
    if (inFlight.current) {
      await inFlight.current;
      if (!mounted.current) return;
    }

    setState((current) => ({
      ...current,
      loading: current.files.length === 0 && !silent,
      refreshing: silent || current.files.length > 0,
      error: null,
    }));

    const task = (async () => {
      try {
        const data = await api.listAll();
        if (!mounted.current) return;
        setState({
          files: data.files,
          folders: data.folders.map((folder) => ({
            path: folder.path,
            createdAt: folder.createdAt,
          })),
          loading: false,
          refreshing: false,
          error: null,
          lastSyncedAt: Date.now(),
        });
      } catch (error) {
        if (!mounted.current) return;
        const message =
          error instanceof ApiError ? error.message : 'Could not load your library.';
        setState((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error: message,
        }));
      }
    })();

    inFlight.current = task.finally(() => {
      inFlight.current = null;
    });
    await inFlight.current;
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  const stats = useMemo<StorageStats>(() => {
    const totalBytes = state.files.reduce((sum, file) => sum + file.size, 0);
    const chunkCount = state.files.reduce((sum, file) => sum + file.chunks.length, 0);
    return {
      fileCount: state.files.length,
      folderCount: state.folders.length,
      totalBytes,
      chunkCount,
    };
  }, [state.files, state.folders]);

  return { ...state, stats, refresh, reload: () => load(false) };
}

/** All folder paths including every ancestor, derived from files + explicit folders. */
export function folderTree(files: StoredFile[], folders: FolderEntry[]) {
  const paths = new Set<string>();
  const addAncestors = (value: string) => {
    const segments = value.split('/').filter(Boolean);
    for (let i = 0; i < segments.length; i += 1) {
      paths.add(segments.slice(0, i + 1).join('/'));
    }
  };

  folders.forEach((folder) => addAncestors(folder.path));
  files.forEach((file) => addAncestors(file.folder));

  return [...paths]
    .sort((a, b) => a.localeCompare(b))
    .map((path) => {
      const segments = path.split('/');
      const directFiles = files.filter((file) => file.folder === path).length;
      const nestedFiles = files.filter((file) => file.folder.startsWith(`${path}/`)).length;
      return {
        path,
        name: segments[segments.length - 1],
        depth: segments.length - 1,
        parent: segments.slice(0, -1).join('/'),
        fileCount: directFiles,
        totalCount: directFiles + nestedFiles,
      };
    });
}

export type FolderNode = ReturnType<typeof folderTree>[number];
