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
  indexBackend: string;
  runtime: {
    demo: boolean;
    telegramConfigured: boolean;
    missingEnv: string[];
    chunkSize: number;
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
  indexBackend: string;
  demo: boolean;
  connection: { ok: boolean; detail: string };
  chunkSizeMb: number;
  missingEnv: string[];
  usingDefaultPassword: boolean;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(init?.body && !(init.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...init?.headers,
      },
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
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

export type UploadResult = { chunk: StoredFile['chunks'][number] };

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

  patchFile: (id: string, changes: { name?: string; folder?: string; starred?: boolean }) =>
    request<{ success: boolean; file: StoredFile }>(`/api/files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    }),

  deleteFile: (id: string) =>
    request<{ success: boolean }>(`/api/files/${id}`, { method: 'DELETE' }),

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
