'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './client-api';
import type { MediaCategory } from './file-types';
import type { StorageStats, StoredFile } from './types';

export type FolderEntry = { path: string; createdAt: number };

export type LibraryView = 'all' | 'recent' | 'starred' | 'archive' | MediaCategory;

export type LibraryState = {
  files: StoredFile[];
  folders: FolderEntry[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastSyncedAt: number | null;
};

export type LibrarySnapshot = {
  files: StoredFile[];
  folders: FolderEntry[];
};

const initialState: LibraryState = {
  files: [],
  folders: [],
  loading: true,
  refreshing: false,
  error: null,
  lastSyncedAt: null,
};

const STORAGE_SNAPSHOT_KEY = 'tellynas:snapshot:v1';

function ensureAncestors(folders: FolderEntry[], folderPath: string): FolderEntry[] {
  if (!folderPath) return folders;
  const existing = new Set(folders.map((entry) => entry.path));
  const additions: FolderEntry[] = [];
  const segments = folderPath.split('/').filter(Boolean);
  const now = Date.now();

  for (let i = 0; i < segments.length; i += 1) {
    const ancestor = segments.slice(0, i + 1).join('/');
    if (!existing.has(ancestor)) {
      existing.add(ancestor);
      additions.push({ path: ancestor, createdAt: now });
    }
  }
  return additions.length > 0 ? [...folders, ...additions] : folders;
}

export function useLibrary() {
  const [state, setState] = useState<LibraryState>(initialState);
  const stateRef = useRef<LibraryState>(initialState);
  const mounted = useRef(true);
  const inFlight = useRef<Promise<void> | null>(null);
  const retryTimer = useRef<number | null>(null);
  const retryCount = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    mounted.current = true;
    // Remove snapshots created by older versions; filenames are private too.
    try { localStorage.removeItem(STORAGE_SNAPSHOT_KEY); } catch {}
    return () => {
      mounted.current = false;
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
    };
  }, []);

  const load = useCallback(async (silent: boolean, attempt = 0) => {
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
        retryCount.current = 0;
        const nextFolders = data.folders.map((folder) => ({
          path: folder.path,
          createdAt: folder.createdAt,
        }));
        setState({
          files: data.files,
          folders: nextFolders,
          loading: false,
          refreshing: false,
          error: null,
          lastSyncedAt: Date.now(),
        });
      } catch (error) {
        if (!mounted.current) return;
        const message =
          error instanceof ApiError ? error.message : 'Could not load your library.';

        // Auto-retry with backoff on transient failures (502/504/0) – fixes Telegram hiccups that looked like “bots offline”.
        const isTransient = error instanceof ApiError && (error.status === 0 || error.status >= 500 || error.status === 429);
        if (isTransient && attempt < 3) {
          const backoff = 800 * Math.pow(2, attempt);
          retryTimer.current = window.setTimeout(() => {
            void load(true, attempt + 1);
          }, backoff) as unknown as number;
          setState((current) => ({
            ...current,
            refreshing: true,
            error: `Syncing… retry ${attempt + 1}/3`,
          }));
          return;
        }

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

  // Revalidate on window focus / visibility – cross-device uploads appear within seconds without manual refresh
  useEffect(() => {
    const onFocus = () => {
      if (!stateRef.current.loading && stateRef.current.lastSyncedAt && Date.now() - stateRef.current.lastSyncedAt > 15_000) {
        void load(true);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocus();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  // Periodic background sync (every 45s) while tab is visible – keeps second device's uploads fresh
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !stateRef.current.refreshing) {
        void load(true);
      }
    }, 45_000);
    return () => window.clearInterval(id);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  const snapshot = useCallback(
    (): LibrarySnapshot => ({
      files: stateRef.current.files,
      folders: stateRef.current.folders,
    }),
    [],
  );

  const restore = useCallback((previous: LibrarySnapshot) => {
    setState((current) => ({
      ...current,
      files: previous.files,
      folders: previous.folders,
    }));
  }, []);

  const upsertFile = useCallback((file: StoredFile) => {
    setState((current) => {
      const exists = current.files.some((entry) => entry.id === file.id);
      const files = exists
        ? current.files.map((entry) => (entry.id === file.id ? file : entry))
        : [file, ...current.files];
      const next = {
        ...current,
        files,
        folders: ensureAncestors(current.folders, file.folder),
        lastSyncedAt: Date.now(),
      };
      return next;
    });
  }, []);

  const patchFileLocal = useCallback((id: string, changes: Partial<StoredFile>) => {
    setState((current) => {
      const files = current.files.map((entry) =>
        entry.id === id ? { ...entry, ...changes, updatedAt: Date.now() } : entry,
      );
      const folders =
        typeof changes.folder === 'string'
          ? ensureAncestors(current.folders, changes.folder)
          : current.folders;
      return { ...current, files, folders };
    });
  }, []);

  const removeFilesLocal = useCallback((ids: Iterable<string>) => {
    const doomed = new Set(ids);
    setState((current) => ({
      ...current,
      files: current.files.filter((entry) => !doomed.has(entry.id)),
    }));
  }, []);

  const addFolderLocal = useCallback((path: string) => {
    setState((current) => ({
      ...current,
      folders: ensureAncestors(current.folders, path),
    }));
  }, []);

  const renameFolderLocal = useCallback((oldPath: string, newPath: string) => {
    const rewrite = (value: string) =>
      value === oldPath || value.startsWith(`${oldPath}/`)
        ? `${newPath}${value.slice(oldPath.length)}`
        : value;

    setState((current) => ({
      ...current,
      folders: ensureAncestors(
        current.folders.map((entry) => ({
          ...entry,
          path: rewrite(entry.path),
        })),
        newPath,
      ),
      files: current.files.map((file) =>
        file.folder === oldPath || file.folder.startsWith(`${oldPath}/`)
          ? { ...file, folder: rewrite(file.folder), updatedAt: Date.now() }
          : file,
      ),
    }));
  }, []);

  const removeFolderLocal = useCallback((path: string) => {
    setState((current) => ({
      ...current,
      folders: current.folders.filter(
        (entry) => entry.path !== path && !entry.path.startsWith(`${path}/`),
      ),
      files: current.files.filter(
        (file) => file.folder !== path && !file.folder.startsWith(`${path}/`),
      ),
    }));
  }, []);

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

  return {
    ...state,
    stats,
    refresh,
    reload: () => load(false),
    snapshot,
    restore,
    upsertFile,
    patchFileLocal,
    removeFilesLocal,
    addFolderLocal,
    renameFolderLocal,
    removeFolderLocal,
  };
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
      const direct = files.filter((file) => file.folder === path);
      const nested = files.filter((file) => file.folder.startsWith(`${path}/`));
      const totalBytes = [...direct, ...nested].reduce((sum, file) => sum + file.size, 0);
      return {
        path,
        name: segments[segments.length - 1],
        depth: segments.length - 1,
        parent: segments.slice(0, -1).join('/'),
        fileCount: direct.length,
        totalCount: direct.length + nested.length,
        totalBytes,
      };
    });
}

export type FolderNode = ReturnType<typeof folderTree>[number];
