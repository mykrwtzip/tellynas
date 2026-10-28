'use client';

import type { StorageStats, StoredFile, StoredFolder } from './types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type SessionInfo = {
  authenticated: boolean;
  username: string | null;
  runtime: {
    demo: boolean;
    serverless: boolean;
    telegramConfigured: boolean;
    missingEnv: string[];
    chunkSize: number;
    botCount: number;
    usingDefaultPassword: boolean;
    defaultUsername: string;
  };
};

export type ListResponse = {
  folder: string;
  files: StoredFile[];
  folders: Array<StoredFolder & { fileCount: number }>;
  stats: StorageStats;
  searching?: boolean;
};

export type SystemInfo = {
  driver: 'telegram' | 'demo';
  persistent: boolean;
  serverless: boolean;
  demo: boolean;
  connection: { ok: boolean; detail: string };
  chunkSizeMb: number;
  missingEnv: string[];
  usingDefaultPassword: boolean;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  // Merge external signal if provided
  const signal = init?.signal ?? controller.signal;
  // If caller passed a signal, wire abort forwarding
  if (init?.signal) {
    controller.signal.addEventListener('abort', () => controller.abort());
  }
  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init?.body && !(init.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...init?.headers,
      },
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Request timed out. The server may be busy — retrying.', 504);
    }
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : null) || `Request failed (HTTP ${response.status}).`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export type UploadResult = {
  chunk: StoredFile['chunks'][number];
  file?: StoredFile;
};

export const api = {
  session: () => request<SessionInfo>('/api/auth/session'),

  login: (username: string, password: string) =>
    request<{ success: boolean; username: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () => request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),

  list: (folder: string, query?: string) => {
    const params = new URLSearchParams();
    if (folder) params.set('folder', folder);
    if (query) params.set('q', query);
    const suffix = params.toString() ? `?${params}` : '';
    return request<ListResponse>(`/api/files${suffix}`);
  },

  listAll: () => request<ListResponse>('/api/files?all=1'),

  finalize: (payload: {
    name: string;
    mime: string;
    size: number;
    folder: string;
    chunks: Array<{ index: number; messageId: number; fileId: string; size: number }>;
  }) =>
    request<{ success: boolean; file: StoredFile }>('/api/files/finalize', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  patchFile: (id: string, changes: { name?: string; folder?: string; starred?: boolean; archived?: boolean }) =>
    request<{ success: boolean; file: StoredFile }>(`/api/files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    }),

  deleteFile: (id: string, { purge = false } = {}) =>
    request<{ success: boolean; archived?: boolean; purged?: boolean }>(
      `/api/files/${id}${purge ? '?purge=1' : ''}`,
      { method: 'DELETE' },
    ),

  deleteFiles: (ids: string[], { purge = false } = {}) =>
    request<{ success: boolean; deletedCount: number; archived?: boolean; purged?: boolean }>(
      `/api/files?purge=${purge}`,
      { method: 'DELETE', body: JSON.stringify({ ids }) },
    ),

  listArchived: () => request<ListResponse>('/api/files?archived=1'),

  createShare: (id: string, body?: { expiresAt?: number; password?: string }) =>
    request<{ success: boolean; token: string; url: string }>(
      `/api/files/${id}/share`,
      { method: 'POST', body: JSON.stringify(body ?? {}) },
    ),

  createFolderShare: (path: string, body?: { expiresAt?: number; password?: string }) =>
    request<{ success: boolean; token: string; url: string }>('/api/folders/share', { method: 'POST', body: JSON.stringify({ path, ...body }) }),

  shares: () =>
    request<{
      share: { token: string; createdAt: number; expiresAt?: number; passwordProtected?: boolean; targetType?: 'file' | 'folder' };
      file: { id: string; name: string; size: number; mime: string };
      downloadUrl: string;
    }[]>('/api/shares'),

  revokeShare: (token: string) =>
    request<{ success: boolean }>(`/api/share/${token}`, { method: 'DELETE' }),

  shareUrl: (token: string) => `/api/share/${token}/download`,

  downloadUrl: (id: string) => `/api/files/${id}/download`,
  previewUrl: (id: string) => `/api/files/${id}/preview`,

  createFolder: (parent: string, name: string) =>
    request<{ success: boolean; path: string }>('/api/folders', {
      method: 'POST',
      body: JSON.stringify({ parent, name }),
    }),

  renameFolder: (path: string, name: string) =>
    request<{ success: boolean; path: string }>('/api/folders', {
      method: 'PATCH',
      body: JSON.stringify({ path, name }),
    }),

  deleteFolder: (path: string) =>
    request<{ success: boolean; removedFiles: number }>(
      `/api/folders?path=${encodeURIComponent(path)}`,
      { method: 'DELETE' },
    ),

  stats: () =>
    request<StorageStats & { byKind: Record<string, number>; recent: StoredFile[]; starred: number }>(
      '/api/stats',
    ),

  system: () => request<SystemInfo>('/api/system'),
};

/** Uploads one chunk with real progress reporting (fetch cannot report upload progress). */
export function uploadChunk(
  form: FormData,
  options: {
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number) => void;
  } = {},
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload');
    xhr.responseType = 'text';
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded, event.total);
    };

    xhr.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload) {
        resolve(payload as UploadResult);
        return;
      }
      const message =
        (payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : null) || `Upload failed (HTTP ${xhr.status}).`;
      reject(new ApiError(message, xhr.status));
    };

    xhr.onerror = () => reject(new ApiError('Network error while uploading.', 0));
    xhr.onabort = () => reject(new ApiError('Upload cancelled.', 0));

    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
