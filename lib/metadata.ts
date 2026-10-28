import type {
  DirectoryEntry,
  EmbeddedFileMeta,
  FileSidecarRecord,
  FolderSidecarRecord,
  SidecarRecord,
  StorageDirectory,
  StoredChunk,
  StoredFile,
  StoredFolder,
} from './types';

export const DIRECTORY_FILENAME = '_tellynas.directory.json';
export const FILE_SIDECAR_SUFFIX = '.tellynas.meta.json';
export const FOLDER_SIDECAR_SUFFIX = '.tellynas.folder.json';

const CAPTION_LIMIT = 1024;
const DIRECTORY_CAPTION_PREFIX = 'tellynas:directory:v1 ';

function safeSlug(value: string, maxLength = 80): string {
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return (cleaned || 'item').slice(0, maxLength);
}

export function folderSlug(folder: string): string {
  const segments = folder
    .split('/')
    .map((segment) => safeSlug(segment.trim(), 36))
    .filter(Boolean);
  return segments.join('__').slice(0, 96);
}

/**
 * Produces a meaningful, self-describing filename for each stored file or slice,
 * e.g. "photos__2026--sunset.jpg" or "videos--clip.part001of004.mp4".
 */
export function formatChunkFilename(input: {
  name: string;
  folder: string;
  index: number;
  total: number;
}): string {
  const prefix = input.folder ? `${folderSlug(input.folder)}--` : '';
  const dot = input.name.lastIndexOf('.');
  const rawStem = dot > 0 ? input.name.slice(0, dot) : input.name;
  const rawExt = dot > 0 ? input.name.slice(dot + 1) : '';

  const stem = safeSlug(rawStem, 72);
  const ext = rawExt ? `.${safeSlug(rawExt, 16)}` : '';

  if (input.total <= 1) {
    return `${prefix}${stem}${ext}`;
  }

  const width = Math.max(3, String(input.total).length);
  const part = String(input.index + 1).padStart(width, '0');
  const ofTotal = String(input.total).padStart(width, '0');
  return `${prefix}${stem}.part${part}of${ofTotal}${ext}`;
}

export function formatFileSidecarFilename(input: {
  id: string;
  name: string;
  folder: string;
}): string {
  const prefix = input.folder ? `${folderSlug(input.folder)}--` : '';
  const safeName = safeSlug(input.name, 56);
  const safeId = safeSlug(input.id, 40);
  return `${prefix}${safeName}--${safeId}${FILE_SIDECAR_SUFFIX}`;
}

export function formatFolderSidecarFilename(path: string): string {
  return `${folderSlug(path) || 'root'}${FOLDER_SIDECAR_SUFFIX}`;
}

function fitCaption(prefix: string, meta: Record<string, unknown>, fallback: string): string {
  const candidate = `${prefix} ${JSON.stringify(meta)}`;
  if (candidate.length <= CAPTION_LIMIT) return candidate;
  return fallback.slice(0, CAPTION_LIMIT);
}

export function formatChunkCaption(input: {
  name: string;
  folder: string;
  index: number;
  total: number;
  size: number;
}): string {
  const meta = {
    v: 1,
    kind: 'chunk',
    name: input.name.slice(0, 160),
    folder: input.folder.slice(0, 160),
    index: input.index,
    total: input.total,
    size: input.size,
  };
  return fitCaption(
    'tellynas:chunk:v1',
    meta,
    `tellynas:chunk:v1 ${input.name} (${input.index + 1}/${input.total})`,
  );
}

export function toEmbeddedFileMeta(file: StoredFile): EmbeddedFileMeta {
  return {
    name: file.name,
    size: file.size,
    mime: file.mime,
    folder: file.folder,
    starred: file.starred,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    chunks: file.chunks.map((chunk) => ({
      index: chunk.index,
      messageId: chunk.messageId,
      fileId: chunk.fileId,
      size: chunk.size,
    })),
  };
}

export function serializeFileSidecar(file: StoredFile): {
  fileName: string;
  caption: string;
  content: string;
} {
  const record: FileSidecarRecord = {
    schema: 'tellynas.file.v1',
    id: file.id,
    ...toEmbeddedFileMeta(file),
  };

  const captionMeta = {
    v: 1,
    kind: 'file',
    id: file.id,
    name: file.name.slice(0, 140),
    folder: file.folder.slice(0, 140),
    size: file.size,
    mime: file.mime.slice(0, 80),
    starred: file.starred,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    chunks: file.chunks.length,
  };

  return {
    fileName: formatFileSidecarFilename(file),
    caption: fitCaption(
      'tellynas:file:v1',
      captionMeta,
      `tellynas:file:v1 ${file.id} ${file.name}`,
    ),
    content: JSON.stringify(record, null, 2),
  };
}

export function serializeFolderSidecar(folder: StoredFolder): {
  fileName: string;
  caption: string;
  content: string;
} {
  const record: FolderSidecarRecord = {
    schema: 'tellynas.folder.v1',
    path: folder.path,
    createdAt: folder.createdAt,
  };

  return {
    fileName: formatFolderSidecarFilename(folder.path),
    caption: fitCaption(
      'tellynas:folder:v1',
      { v: 1, kind: 'folder', path: folder.path, createdAt: folder.createdAt },
      `tellynas:folder:v1 ${folder.path}`,
    ),
    content: JSON.stringify(record, null, 2),
  };
}

export function serializeDirectory(entries: DirectoryEntry[]): {
  directory: StorageDirectory;
  caption: string;
  content: string;
} {
  const directory: StorageDirectory = {
    schema: 'tellynas.directory.v1',
    updatedAt: Date.now(),
    entries,
  };

  const compactInline = `${DIRECTORY_CAPTION_PREFIX}${JSON.stringify(directory)}`;
  const caption =
    compactInline.length <= CAPTION_LIMIT
      ? compactInline
      : `${DIRECTORY_CAPTION_PREFIX}${JSON.stringify({
          v: 1,
          entries: entries.length,
          updatedAt: directory.updatedAt,
        })}`;

  return {
    directory,
    caption,
    content: JSON.stringify(directory),
  };
}

export function parseDirectoryCaption(caption: string | null | undefined): StorageDirectory | null {
  if (!caption || !caption.startsWith(DIRECTORY_CAPTION_PREFIX)) return null;
  return parseDirectory(caption.slice(DIRECTORY_CAPTION_PREFIX.length));
}

function normalizeChunks(raw: unknown): StoredChunk[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const candidate = entry as Partial<StoredChunk>;
      if (!candidate.fileId || typeof candidate.fileId !== 'string') return null;
      return {
        index: Number(candidate.index ?? 0),
        messageId: Number(candidate.messageId ?? 0),
        fileId: candidate.fileId,
        size: Math.max(0, Number(candidate.size ?? 0)),
      } satisfies StoredChunk;
    })
    .filter((entry): entry is StoredChunk => entry !== null)
    .sort((a, b) => a.index - b.index);
}

function parseEmbeddedFileMeta(raw: unknown): EmbeddedFileMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const chunks = normalizeChunks(record.chunks);
  if (!name || chunks.length === 0) return undefined;

  const computedSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
  const rawSize = Number(record.size);
  const createdAt = Number(record.createdAt) || Date.now();
  const updatedAt = Number(record.updatedAt) || createdAt;

  return {
    name,
    size: Number.isFinite(rawSize) && rawSize >= 0 ? rawSize : computedSize,
    mime:
      typeof record.mime === 'string' && record.mime.trim()
        ? record.mime.trim()
        : 'application/octet-stream',
    folder: typeof record.folder === 'string' ? record.folder : '',
    starred: Boolean(record.starred),
    createdAt,
    updatedAt,
    chunks,
  };
}

export function parseSidecarRecord(
  raw: string | null | undefined,
  captionFallback?: string | null,
): SidecarRecord | null {
  const tryParseJson = (text: string): unknown => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  let parsed = raw ? tryParseJson(raw) : null;

  if (!parsed && captionFallback) {
    const jsonStart = captionFallback.indexOf('{');
    if (jsonStart >= 0) {
      parsed = tryParseJson(captionFallback.slice(jsonStart));
    }
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;

  if (record.schema === 'tellynas.file.v1' || record.kind === 'file') {
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const meta = parseEmbeddedFileMeta(record);
    if (!id || !meta) return null;

    return {
      schema: 'tellynas.file.v1',
      id,
      ...meta,
    };
  }

  if (record.schema === 'tellynas.folder.v1' || record.kind === 'folder') {
    const path = typeof record.path === 'string' ? record.path.trim() : '';
    if (!path) return null;
    return {
      schema: 'tellynas.folder.v1',
      path,
      createdAt: Number(record.createdAt) || Date.now(),
    };
  }

  return null;
}

export function parseDirectory(raw: string | null | undefined): StorageDirectory | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const candidate = parsed as Partial<StorageDirectory>;
  if (candidate.schema !== 'tellynas.directory.v1' || !Array.isArray(candidate.entries)) {
    return null;
  }

  const entries: DirectoryEntry[] = [];
  for (const item of candidate.entries) {
    if (!item || typeof item !== 'object') continue;
    const rawEntry = item as Record<string, unknown>;
    const messageId = Number(rawEntry.messageId ?? 0);
    const fileId = typeof rawEntry.fileId === 'string' ? rawEntry.fileId : '';
    const fileName = typeof rawEntry.fileName === 'string' ? rawEntry.fileName : '';
    if (!fileId) continue;

    if (rawEntry.kind === 'file' && typeof rawEntry.id === 'string' && rawEntry.id) {
      entries.push({
        kind: 'file',
        id: rawEntry.id,
        messageId,
        fileId,
        fileName,
        meta: parseEmbeddedFileMeta(rawEntry.meta),
      });
    } else if (
      rawEntry.kind === 'folder' &&
      typeof rawEntry.path === 'string' &&
      rawEntry.path
    ) {
      entries.push({
        kind: 'folder',
        path: rawEntry.path,
        messageId,
        fileId,
        fileName,
        createdAt: Number(rawEntry.createdAt) || undefined,
      });
    }
  }

  return {
    schema: 'tellynas.directory.v1',
    updatedAt: Number(candidate.updatedAt) || 0,
    entries,
  };
}

export function sidecarToStoredFile(record: FileSidecarRecord): StoredFile {
  return {
    id: record.id,
    name: record.name,
    size: record.size,
    mime: record.mime,
    folder: record.folder,
    chunks: record.chunks,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    starred: record.starred,
  };
}
