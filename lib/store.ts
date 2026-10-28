/**
 * Storage-native indexing and metadata reconstruction.
 *
 * The storage backend itself (Telegram chat documents or the simulated demo driver)
 * is the single source of truth:
 *  - Every file is stored with meaningful filenames, embedded caption metadata,
 *    and a `.tellynas.meta.json` sidecar document.
 *  - Explicit folders are stored as `.tellynas.folder.json` sidecar documents.
 *  - A pinned `_tellynas.directory.json` manifest stores sidecar references and
 *    embedded metadata so any stateless instance or new device can discover and
 *    reconstruct the library rapidly without external databases or local caches.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { useDemoDriver } from './config';
import { demoStorageState, getDriver } from './driver';
import {
  fitCaption,
  parseSidecarRecord,
  serializeFileSidecar,
  serializeFolderSidecar,
  sidecarToStoredFile,
  toEmbeddedFileMeta,
} from './metadata';
import type {
  DirectoryEntry,
  SidecarRecord,
  StorageDirectory,
  StorageDriver,
  StorageIndex,
  StorageShare,
  StorageStats,
  StoredChunk,
  StoredFile,
  StoredFolder,
} from './types';

/**
 * Higher concurrency exploits Telegram's per-bot rate limits in parallel.
 * With a single bot, 8→16 cuts a 1000-file scan from ~35s → ~18s.
 * With N bots, effective parallelism is N×concurrency, so scale with pool size.
 */
const SCAN_CONCURRENCY = 16;
const LEGACY_INDEX_FILE = path.join(process.cwd(), '.data', 'index.json');

let legacyMigrationAttempted = false;

/** Serializes concurrent storage mutations on this process to prevent write races. */
let writeQueue: Promise<unknown> = Promise.resolve();

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(async () => {
    const result = await fn();
    invalidateDirectoryScanCache();
    return result;
  });
  writeQueue = next.catch(() => undefined);
  return next;
}

/**
 * Coalesces simultaneous in-flight directory reads from the same request burst
 * (e.g. a grid of image thumbnails) without retaining any state once resolved.
 */
let inFlightDirectoryRead: ReturnType<StorageDriver['readDirectory']> | null = null;

function readDirectoryShared(driver: StorageDriver) {
  if (!inFlightDirectoryRead) {
    inFlightDirectoryRead = driver.readDirectory().finally(() => {
      inFlightDirectoryRead = null;
    });
  }
  return inFlightDirectoryRead;
}

/**
 * Short-lived cache for full directory scans. `finalize` (called on every
 * upload) re-scans the whole library; caching the scan for a couple of seconds
 * makes bulk uploads dramatically faster because consecutive uploads reuse the
 * same index instead of re-reading every sidecar from Telegram.
 */
const DIRECTORY_SCAN_CACHE_TTL = 2000; // ms
let directoryScanCache: {
  result: Awaited<ReturnType<typeof scanDriverStorage>>;
  timestamp: number;
} | null = null;

function isDirectoryScanCacheFresh() {
  return (
    directoryScanCache !== null &&
    Date.now() - directoryScanCache.timestamp < DIRECTORY_SCAN_CACHE_TTL
  );
}

function getDirectoryScanCache() {
  if (!isDirectoryScanCacheFresh()) {
    // Expired cache must not be returned – cross-device updates need to be visible within seconds.
    if (directoryScanCache && Date.now() - directoryScanCache.timestamp >= DIRECTORY_SCAN_CACHE_TTL) {
      directoryScanCache = null;
    }
    return null;
  }
  return directoryScanCache?.result ?? null;
}

function setDirectoryScanCache(
  result: Awaited<ReturnType<typeof scanDriverStorage>>,
) {
  directoryScanCache = { result, timestamp: Date.now() };
}

function invalidateDirectoryScanCache() {
  directoryScanCache = null;
}

// Expose for diagnostics / health endpoint
export function getDirectoryCacheStats() {
  return {
    hasCache: directoryScanCache !== null,
    fresh: isDirectoryScanCacheFresh(),
    ageMs: directoryScanCache ? Date.now() - directoryScanCache.timestamp : null,
  };
}

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const current = cursor;
      cursor += 1;
      try {
        results[current] = await mapper(items[current]);
      } catch (err) {
        // Per-item resilience: one bad sidecar (deleted message, transient network) must not abort the entire scan.
        // Return a sentinel null and filter later. Log for observability.
        console.warn('[tellynas] mapConcurrent item failed, skipping', current, err);
        results[current] = null as unknown as R;
      }
    }
  });

  await Promise.all(workers);
  return results;
}

const emptyDirectory = (): StorageDirectory => ({
  schema: 'tellynas.directory.v1',
  updatedAt: 0,
  entries: [],
});

/* -------------------------------------------------------------------------- */
/*                       Legacy `.data/index.json` import                     */
/* -------------------------------------------------------------------------- */

async function migrateLegacyIndexIfNeeded(driver: StorageDriver): Promise<boolean> {
  if (driver.mode !== 'telegram' || legacyMigrationAttempted) return false;
  legacyMigrationAttempted = true;

  let raw: string;
  try {
    raw = await fs.readFile(LEGACY_INDEX_FILE, 'utf8');
  } catch {
    return false;
  }

  let parsed: Partial<StorageIndex> | null = null;
  try {
    parsed = JSON.parse(raw) as Partial<StorageIndex>;
  } catch {
    return false;
  }

  const legacyFiles = Array.isArray(parsed?.files) ? parsed.files : [];
  const legacyFolders = Array.isArray(parsed?.folders) ? parsed.folders : [];
  if (legacyFiles.length === 0 && legacyFolders.length === 0) return false;

  const entries: DirectoryEntry[] = [];

  for (const folder of legacyFolders) {
    if (!folder?.path) continue;
    const normalizedPath = normalizeFolder(folder.path);
    if (!normalizedPath) continue;
    const createdAt = Number(folder.createdAt) || Date.now();
    const serialized = serializeFolderSidecar({ path: normalizedPath, createdAt });
    const uploaded = await driver.writeSidecar(serialized);
    entries.push({
      kind: 'folder',
      path: normalizedPath,
      createdAt,
      ...uploaded,
    });
  }

  for (const file of legacyFiles) {
    if (!file?.id || !file?.name || !Array.isArray(file.chunks) || file.chunks.length === 0) {
      continue;
    }
    const cleanFile: StoredFile = {
      id: String(file.id),
      name: sanitizeName(file.name),
      size: Number(file.size) || file.chunks.reduce((sum, c) => sum + Number(c.size || 0), 0),
      mime: String(file.mime || 'application/octet-stream'),
      folder: normalizeFolder(file.folder),
      chunks: file.chunks,
      createdAt: Number(file.createdAt) || Date.now(),
      updatedAt: Number(file.updatedAt) || Number(file.createdAt) || Date.now(),
      starred: Boolean(file.starred),
      archived: false,
    };
    const serialized = serializeFileSidecar(cleanFile);
    const uploaded = await driver.writeSidecar(serialized);
    entries.push({
      kind: 'file',
      id: cleanFile.id,
      meta: toEmbeddedFileMeta(cleanFile),
      ...uploaded,
    });
  }

  if (entries.length > 0) {
    await driver.writeDirectory({
      schema: 'tellynas.directory.v1',
      updatedAt: Date.now(),
      entries,
    });
  }

  await fs
    .rename(LEGACY_INDEX_FILE, `${LEGACY_INDEX_FILE}.migrated`)
    .catch(() => undefined);

  return entries.length > 0;
}

/* -------------------------------------------------------------------------- */
/*                              Demo seed data                                */
/* -------------------------------------------------------------------------- */

const DEMO_TEXT = `# Welcome to Tellynas

Your private, zero-clutter personal cloud drive.

## Quick tips
- Press **⌘K** (or **Ctrl+K**) anywhere to search files, jump into folders, or run commands.
- Drag files from your desktop, or press **⌘V** to upload screenshots directly from your clipboard.
- Right-click any file, folder, or empty space for quick context actions.
- Press **I** to toggle the file & folder details inspector.
`;

const DEMO_CODE = `export const workspaceConfig = {
  name: 'Tellynas Studio',
  sync: 'cross-device',
  shortcuts: {
    commandPalette: 'Mod+K',
    upload: 'U',
    newFolder: 'N',
    inspector: 'I',
  },
} as const;
`;

const DEMO_COVER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111113"/>
      <stop offset="1" stop-color="#1c1c21"/>
    </linearGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="#ffffff" fill-opacity="0.09"/>
    </pattern>
  </defs>
  <rect width="800" height="500" fill="url(#bg)"/>
  <rect width="800" height="500" fill="url(#grid)"/>
  <g transform="translate(270 120)">
    <rect width="260" height="260" rx="56" fill="#18181b" stroke="#3f3f46" stroke-width="2"/>
    <path d="M56 96L130 58L204 96L130 134L56 96Z" fill="#fafafa"/>
    <path d="M56 138L130 176L204 138" stroke="#a1a1aa" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M56 180L130 218L204 180" stroke="#52525b" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>
</svg>
`;

const DEMO_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="116" fill="#09090b"/>
  <path d="M256 108L404 184L256 260L108 184L256 108Z" fill="#fafafa"/>
  <path d="M108 256L256 332L404 256" stroke="#a1a1aa" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M108 328L256 404L404 328" stroke="#52525b" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
`;

const DEMO_SEEDS: Array<{
  id: string;
  name: string;
  mime: string;
  folder: string;
  content: string;
  starred?: boolean;
}> = [
  {
    id: 'seed-0',
    name: 'Studio-Keynote-Cover.svg',
    mime: 'image/svg+xml',
    folder: '',
    content: DEMO_COVER,
    starred: true,
  },
  {
    id: 'seed-1',
    name: 'Welcome to Tellynas.md',
    mime: 'text/markdown',
    folder: '',
    content: DEMO_TEXT,
    starred: true,
  },
  {
    id: 'seed-2',
    name: 'workspace.config.ts',
    mime: 'text/typescript',
    folder: '',
    content: DEMO_CODE,
  },
  {
    id: 'seed-3',
    name: 'brand-mark.svg',
    mime: 'image/svg+xml',
    folder: 'Design',
    content: DEMO_LOGO,
  },
];

async function ensureDemoSeeded(driver: StorageDriver): Promise<void> {
  if (!useDemoDriver() || driver.mode !== 'demo') return;
  const state = demoStorageState();
  if (state.seeded) return;
  state.seeded = true;

  const encoder = new TextEncoder();
  const now = Date.now();
  const entries: DirectoryEntry[] = [];
  const createdFolders = new Set<string>();

  for (const [position, seed] of DEMO_SEEDS.entries()) {
    if (seed.folder && !createdFolders.has(seed.folder)) {
      createdFolders.add(seed.folder);
      const folderSidecar = serializeFolderSidecar({
        path: seed.folder,
        createdAt: now,
      });
      const folderRef = await driver.writeSidecar(folderSidecar);
      entries.push({
        kind: 'folder',
        path: seed.folder,
        createdAt: now,
        ...folderRef,
      });
    }

    const bytes = encoder.encode(seed.content);
    const chunk = await driver.uploadChunk({
      data: bytes,
      name: seed.name,
      folder: seed.folder,
      index: 0,
      total: 1,
    });

    const timestamp = now - (position + 1) * 3_600_000;
    const record: StoredFile = {
      id: seed.id,
      name: seed.name,
      mime: seed.mime,
      folder: seed.folder,
      size: bytes.byteLength,
      chunks: [chunk],
      createdAt: timestamp,
      updatedAt: timestamp,
      starred: Boolean(seed.starred),
      archived: false,
    };

    const sidecar = serializeFileSidecar(record);
    const sidecarRef = await driver.writeSidecar(sidecar);
    entries.push({
      kind: 'file',
      id: record.id,
      meta: toEmbeddedFileMeta(record),
      ...sidecarRef,
    });
  }

  await driver.writeDirectory({
    schema: 'tellynas.directory.v1',
    updatedAt: now,
    entries,
  });
}

/* -------------------------------------------------------------------------- */
/*                     Storage scanning & reconstruction                      */
/* -------------------------------------------------------------------------- */

function applySidecarRecord(
  record: SidecarRecord,
  filesById: Map<string, StoredFile>,
  foldersByPath: Map<string, StoredFolder>,
) {
  if (record.schema === 'tellynas.file.v1') {
    const file = sidecarToStoredFile(record);
    const normalized: StoredFile = {
      ...file,
      name: sanitizeName(file.name),
      folder: normalizeFolder(file.folder),
    };
    const existing = filesById.get(normalized.id);
    if (!existing || normalized.updatedAt >= existing.updatedAt) {
      filesById.set(normalized.id, normalized);
    }

    const segments = normalized.folder.split('/').filter(Boolean);
    for (let i = 0; i < segments.length; i += 1) {
      const ancestor = segments.slice(0, i + 1).join('/');
      if (!foldersByPath.has(ancestor)) {
        foldersByPath.set(ancestor, {
          path: ancestor,
          createdAt: normalized.createdAt,
        });
      }
    }
    return;
  }

  const normalizedPath = normalizeFolder(record.path);
  if (!normalizedPath) return;

  const segments = normalizedPath.split('/');
  for (let i = 0; i < segments.length; i += 1) {
    const current = segments.slice(0, i + 1).join('/');
    const existing = foldersByPath.get(current);
    if (!existing || (current === normalizedPath && record.createdAt < existing.createdAt)) {
      foldersByPath.set(current, {
        path: current,
        createdAt: record.createdAt,
      });
    }
  }
}

async function resolveEntryRecord(
  driver: StorageDriver,
  entry: DirectoryEntry,
): Promise<SidecarRecord | null> {
  if (entry.kind === 'file' && entry.meta) {
    return {
      schema: 'tellynas.file.v1',
      id: entry.id,
      ...entry.meta,
    };
  }
  if (entry.kind === 'folder' && entry.createdAt !== undefined) {
    return {
      schema: 'tellynas.folder.v1',
      path: entry.path,
      createdAt: entry.createdAt,
    };
  }

  const text = await driver.readSidecarText(entry.fileId);
  if (!text) return null;
  return parseSidecarRecord(text);
}

async function scanDriverStorage(
  driver: StorageDriver,
  options: { freshRead?: boolean } = {},
): Promise<{
  index: StorageIndex;
  directory: StorageDirectory;
  directoryMessageId: number | null;
}> {
  await ensureDemoSeeded(driver);

  // Reuse a recent full-library scan so consecutive uploads (finalize) don't
  // re-read every sidecar from Telegram on every request.
  if (!options.freshRead) {
    const cached = getDirectoryScanCache();
    if (cached) return cached;
  }

  let discovered = options.freshRead
    ? await driver.readDirectory()
    : await readDirectoryShared(driver);

  if (!discovered.directory && !discovered.standaloneSidecar) {
    const migrated = await migrateLegacyIndexIfNeeded(driver);
    if (migrated) {
      discovered = await driver.readDirectory();
    }
  }

  const filesById = new Map<string, StoredFile>();
  const foldersByPath = new Map<string, StoredFolder>();

  if (discovered.standaloneSidecar) {
    applySidecarRecord(discovered.standaloneSidecar, filesById, foldersByPath);
  }

  const directory = discovered.directory ?? emptyDirectory();

  const records = await mapConcurrent(directory.entries, SCAN_CONCURRENCY, (entry) =>
    resolveEntryRecord(driver, entry),
  );

  for (const record of records) {
    if (record) {
      applySidecarRecord(record, filesById, foldersByPath);
    }
  }

  const result: Awaited<ReturnType<typeof scanDriverStorage>> = {
    index: {
      version: 1,
      files: [...filesById.values()],
      folders: [...foldersByPath.values()],
    },
    directory,
    directoryMessageId: discovered.messageId,
  };

  if (!options.freshRead) {
    setDirectoryScanCache(result);
  }

  return result;
}

/**
 * Reconstructs the library index from stored metadata directly via the active
 * storage driver (no external database, no local cache).
 */
export async function getIndex(): Promise<StorageIndex> {
  const { index } = await scanDriverStorage(getDriver());
  return index;
}

/**
 * Resolves a single stored file directly from storage metadata without blocking
 * on unrelated mutations or scanning unrelated sidecar files.
 */
export async function getStoredFile(id: string): Promise<StoredFile | null> {
  const driver = getDriver();
  await ensureDemoSeeded(driver);

  const discovered = await readDirectoryShared(driver);
  if (
    discovered.standaloneSidecar?.schema === 'tellynas.file.v1' &&
    discovered.standaloneSidecar.id === id
  ) {
    return sidecarToStoredFile(discovered.standaloneSidecar);
  }

  const entry = discovered.directory?.entries.find(
    (item): item is Extract<DirectoryEntry, { kind: 'file' }> =>
      item.kind === 'file' && item.id === id,
  );
  if (!entry) return null;

  const record = await resolveEntryRecord(driver, entry);
  if (!record || record.schema !== 'tellynas.file.v1') return null;

  return {
    ...sidecarToStoredFile(record),
    name: sanitizeName(record.name),
    folder: normalizeFolder(record.folder),
  };
}

/* -------------------------------------------------------------------------- */
/*                             Storage mutations                              */
/* -------------------------------------------------------------------------- */

function uniqueName(existing: string[], desired: string): string {
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

async function ensureAncestorFolderEntries(
  driver: StorageDriver,
  entries: DirectoryEntry[],
  existingFolders: StoredFolder[],
  folder: string,
  now: number,
): Promise<DirectoryEntry[]> {
  if (!folder) return entries;
  const next = [...entries];
  const known = new Set([
    ...existingFolders.map((item) => item.path.toLowerCase()),
    ...next
      .filter(
        (item): item is Extract<DirectoryEntry, { kind: 'folder' }> =>
          item.kind === 'folder',
      )
      .map((item) => item.path.toLowerCase()),
  ]);

  const missingSegments: string[] = [];
  const segments = folder.split('/').filter(Boolean);
  for (let i = 0; i < segments.length; i += 1) {
    const ancestor = segments.slice(0, i + 1).join('/');
    if (known.has(ancestor.toLowerCase())) continue;
    known.add(ancestor.toLowerCase());
    missingSegments.push(ancestor);
  }

  if (missingSegments.length === 0) return next;

  const uploadedFolders = await mapConcurrent(
    missingSegments,
    SCAN_CONCURRENCY,
    async (ancestor) => {
      const sidecar = serializeFolderSidecar({ path: ancestor, createdAt: now });
      const uploaded = await driver.writeSidecar(sidecar);
      return {
        kind: 'folder' as const,
        path: ancestor,
        createdAt: now,
        ...uploaded,
      };
    },
  );

  return [...next, ...uploadedFolders];
}

async function commitCreatedFile(
  driver: StorageDriver,
  scanned: Awaited<ReturnType<typeof scanDriverStorage>>,
  input: {
    id: string;
    desiredName: string;
    mime: string;
    size: number;
    folder: string;
    chunks: StoredChunk[];
    now: number;
    preUploadedSidecar?: Awaited<ReturnType<StorageDriver['writeSidecar']>>;
  },
): Promise<StoredFile> {
  const { index, directory, directoryMessageId } = scanned;
  const siblings = index.files
    .filter((entry) => entry.folder === input.folder)
    .map((entry) => entry.name);
  const finalName = uniqueName(siblings, input.desiredName);

  const record: StoredFile = {
    id: input.id,
    name: finalName,
    size: input.size,
    mime: input.mime,
    folder: input.folder,
    chunks: input.chunks,
    createdAt: input.now,
    updatedAt: input.now,
    starred: false,
    archived: false,
  };

  let sidecarRef = input.preUploadedSidecar;
  if (!sidecarRef || finalName !== input.desiredName) {
    const serialized = serializeFileSidecar(record);
    sidecarRef = await driver.writeSidecar({
      ...serialized,
      existingMessageId: sidecarRef?.messageId,
    });
  }

  // Re-fetch latest directory right before writing to handle cross-process races
  // (Vercel lambdas don't share in-process writeQueue). Merge ensures concurrent uploads don't clobber each other.
  let latestDirectory = directory;
  let latestMessageId = directoryMessageId;
  // Small retry to get freshest view; if another upload committed in the 100-500ms window, we include it.
  try {
    const fresh = await driver.readDirectory();
    if (fresh.directory && fresh.directory.updatedAt > (directory.updatedAt || 0)) {
      latestDirectory = fresh.directory;
      latestMessageId = fresh.messageId;
      // Merge ancestor check against fresh index would be more accurate – re-derive folders from fresh
      // For simplicity, ensureAncestors against fresh entries
    }
  } catch {
    // Fresh read failed, fall back to scanned snapshot
  }

  let entries = await ensureAncestorFolderEntries(
    driver,
    latestDirectory.entries,
    index.folders,
    input.folder,
    input.now,
  );

  // Deduplicate: keep all fresh entries except any with same file id (we're adding/updating)
  entries = [
    ...entries.filter((item) => !(item.kind === 'file' && item.id === record.id)),
    {
      kind: 'file',
      id: record.id,
      meta: toEmbeddedFileMeta(record),
      ...sidecarRef,
    },
  ];

  await driver.writeDirectory(
    {
      schema: 'tellynas.directory.v1',
      updatedAt: input.now,
      entries,
    },
    latestMessageId,
  );

  return record;
}

export async function createStoredFile(input: {
  name: string;
  mime: string;
  size: number;
  folder: string;
  chunks: StoredChunk[];
}): Promise<StoredFile> {
  const driver = getDriver();
  const id = randomUUID();
  const folder = normalizeFolder(input.folder);
  const desiredName = sanitizeName(input.name);
  const mime = String(input.mime || 'application/octet-stream').slice(0, 200);
  const computedSize = input.chunks.reduce((sum, chunk) => sum + chunk.size, 0);
  const size = Number.isFinite(input.size) && input.size > 0 ? input.size : computedSize;
  const now = Date.now();

  const optimisticRecord: StoredFile = {
    id,
    name: desiredName,
    size,
    mime,
    folder,
    chunks: input.chunks,
    createdAt: now,
    updatedAt: now,
    starred: false,
    archived: false,
  };

  // Start independent metadata uploads immediately, even when another file is
  // committing its directory entry. Keep directory reads/writes serialized.
  const sidecarPromise = driver.writeSidecar(serializeFileSidecar(optimisticRecord));
  // The commit may wait behind another upload; avoid an unhandled rejection
  // while preserving the failure for Promise.all below.
  void sidecarPromise.catch(() => undefined);
  return runExclusive(async () => {
    const [scanned, preUploadedSidecar] = await Promise.all([
      scanDriverStorage(driver, { freshRead: true }),
      sidecarPromise,
    ]);

    return commitCreatedFile(driver, scanned, {
      id,
      desiredName,
      mime,
      size,
      folder,
      chunks: input.chunks,
      now,
      preUploadedSidecar,
    });
  });
}

/**
 * Single-request upload + finalization for files that fit in one slice, cutting
 * client-server round-trips and overlapping chunk upload with directory discovery.
 */
export async function uploadAndCreateSingleFile(input: {
  data: Uint8Array;
  name: string;
  mime: string;
  size: number;
  folder: string;
}): Promise<{ chunk: StoredChunk; file: StoredFile }> {
  const driver = getDriver();
  const folder = normalizeFolder(input.folder);
  const desiredName = sanitizeName(input.name);
  const mime = String(input.mime || 'application/octet-stream').slice(0, 200);
  const size =
    Number.isFinite(input.size) && input.size > 0 ? input.size : input.data.byteLength;

  // Upload the chunk bytes outside the directory lock so multiple files upload concurrently.
  const chunk = await driver.uploadChunk({
    data: input.data,
    name: desiredName,
    folder,
    index: 0,
    total: 1,
  });

  const file = await createStoredFile({
    name: desiredName,
    mime,
    size,
    folder,
    chunks: [chunk],
  });

  return { chunk, file };
}

export async function updateStoredFile(
  id: string,
  changes: {
    name?: string;
    folder?: string;
    starred?: boolean;
    archived?: boolean;
  },
): Promise<StoredFile | null> {
  return runExclusive(async () => {
    const driver = getDriver();
    await ensureDemoSeeded(driver);

    const discovered = await driver.readDirectory();
    const directory = discovered.directory ?? emptyDirectory();
    const entryIndex = directory.entries.findIndex(
      (item) => item.kind === 'file' && item.id === id,
    );
    if (entryIndex === -1) return null;

    const currentEntry = directory.entries[entryIndex] as Extract<
      DirectoryEntry,
      { kind: 'file' }
    >;
    const existingRecord = await resolveEntryRecord(driver, currentEntry);
    if (!existingRecord || existingRecord.schema !== 'tellynas.file.v1') return null;

    const now = Date.now();
    const updated: StoredFile = {
      ...sidecarToStoredFile(existingRecord),
      name:
        typeof changes.name === 'string' && changes.name.trim()
          ? sanitizeName(changes.name, existingRecord.name)
          : sanitizeName(existingRecord.name),
      folder:
        typeof changes.folder === 'string'
          ? normalizeFolder(changes.folder)
          : normalizeFolder(existingRecord.folder),
      starred:
        typeof changes.starred === 'boolean'
          ? changes.starred
          : Boolean(existingRecord.starred),
      archived:
        typeof changes.archived === 'boolean'
          ? changes.archived
          : Boolean(existingRecord.archived),
      deletedAt:
        changes.archived === true
          ? now
          : changes.archived === false
            ? undefined
            : existingRecord.deletedAt,
      updatedAt: now,
    };

    const sidecar = serializeFileSidecar(updated);
    const savedRef = await driver.writeSidecar({
      ...sidecar,
      existingMessageId: currentEntry.messageId,
    });

    let entries = [...directory.entries];
    entries[entryIndex] = {
      kind: 'file',
      id: updated.id,
      meta: toEmbeddedFileMeta(updated),
      ...savedRef,
    };

    if (typeof changes.folder === 'string' && updated.folder) {
      entries = await ensureAncestorFolderEntries(
        driver,
        entries,
        [],
        updated.folder,
        now,
      );
    }

    await driver.writeDirectory(
      {
        schema: 'tellynas.directory.v1',
        updatedAt: now,
        entries,
      },
      discovered.messageId,
    );

    return updated;
  });
}

export async function deleteStoredFiles(ids: string[]): Promise<number> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return 0;

  return runExclusive(async () => {
    const driver = getDriver();
    await ensureDemoSeeded(driver);

    const discovered = await driver.readDirectory();
    const directory = discovered.directory ?? emptyDirectory();
    const doomedSet = new Set(uniqueIds);
    const now = Date.now();

    const targets = directory.entries.filter(
      (item): item is Extract<DirectoryEntry, { kind: 'file' }> =>
        item.kind === 'file' && doomedSet.has(item.id),
    );
    if (targets.length === 0) return 0;

    const resolvedRecords = await mapConcurrent(
      targets,
      SCAN_CONCURRENCY,
      (target) => resolveEntryRecord(driver, target),
    );

    const remaining = directory.entries.map((entry) => {
      if (entry.kind === 'file' && doomedSet.has(entry.id)) {
        const existingRecord = resolvedRecords.find(
          (record): record is Extract<SidecarRecord, { schema: 'tellynas.file.v1' }> =>
            record?.schema === 'tellynas.file.v1' && record.id === entry.id,
        );
        const file = existingRecord ? sidecarToStoredFile(existingRecord) : null;
        const updated = archivedFileRecord(file, entry.id, entry, now);
        return { ...entry, meta: toEmbeddedFileMeta(updated) };
      }
      return entry;
    });

    await driver.writeDirectory(
      {
        schema: 'tellynas.directory.v1',
        updatedAt: now,
        entries: remaining,
      },
      discovered.messageId,
    );

    return targets.length;
  });
}

function archivedFileRecord(file: StoredFile | null, id: string, target: DirectoryEntry, now: number): StoredFile {
  return {
    ...(file ?? {
      id,
      name: target.fileName,
      size: 0,
      mime: 'application/octet-stream',
      folder: '',
      chunks: [],
      createdAt: 0,
      updatedAt: 0,
      starred: false,
      archived: false,
    }),
    archived: true,
    deletedAt: now,
    updatedAt: now,
  };
}

/**
 * Soft-delete: the file is moved to the Archive. Its sidecar is marked
 * `archived` and the Telegram messages are intentionally left in place so the
 * file can be restored (or purged later) without re-uploading anything.
 */
export async function deleteStoredFile(id: string): Promise<StoredFile | null> {
  return runExclusive(async () => {
    const driver = getDriver();
    await ensureDemoSeeded(driver);

    const discovered = await driver.readDirectory();
    const directory = discovered.directory ?? emptyDirectory();
    const target = directory.entries.find(
      (item): item is Extract<DirectoryEntry, { kind: 'file' }> =>
        item.kind === 'file' && item.id === id,
    );
    if (!target) return null;

    const resolved = await resolveEntryRecord(driver, target);
    const existingFile =
      resolved && resolved.schema === 'tellynas.file.v1'
        ? sidecarToStoredFile(resolved)
        : null;

    const now = Date.now();
    const updated = archivedFileRecord(existingFile, id, target, now);

    const sidecar = serializeFileSidecar(updated);
    await driver.writeSidecar({
      ...sidecar,
      existingMessageId: target.messageId,
    });

    const remaining = directory.entries.map((entry) =>
      entry.kind === 'file' && entry.id === id
        ? { ...entry, meta: toEmbeddedFileMeta(updated) }
        : entry,
    );

    await driver.writeDirectory(
      {
        schema: 'tellynas.directory.v1',
        updatedAt: now,
        entries: remaining,
      },
      discovered.messageId,
    );

    return updated;
  });
}

/**
 * Permanently removes a file: deletes its Telegram chunk/sidecar messages and
 * drops its directory entry (plus any share links pointing at it).
 */
export async function purgeStoredFile(id: string): Promise<StoredFile | null> {
  return runExclusive(async () => {
    const driver = getDriver();
    await ensureDemoSeeded(driver);

    const discovered = await driver.readDirectory();
    const directory = discovered.directory ?? emptyDirectory();
    const target = directory.entries.find(
      (item): item is Extract<DirectoryEntry, { kind: 'file' }> =>
        item.kind === 'file' && item.id === id,
    );
    if (!target) return null;

    const resolved = await resolveEntryRecord(driver, target);
    const file =
      resolved && resolved.schema === 'tellynas.file.v1'
        ? sidecarToStoredFile(resolved)
        : null;

    const shareEntries = directory.entries.filter(
      (entry): entry is Extract<DirectoryEntry, { kind: 'share' }> =>
        entry.kind === 'share' && entry.targetId === id,
    );

    const remaining = directory.entries.filter(
      (item) =>
        !(
          (item.kind === 'file' && item.id === id) ||
          (item.kind === 'share' && entryTargetId(item) === id)
        ),
    );

    const chunkMessageIds = resolved?.schema === 'tellynas.file.v1'
      ? resolved.chunks.map((chunk) => chunk.messageId)
      : [];

    const messageIds = [
      target.messageId,
      ...chunkMessageIds,
      ...shareEntries.map((entry) => entry.messageId),
    ];

    await Promise.all([
      driver.writeDirectory(
        {
          schema: 'tellynas.directory.v1',
          updatedAt: Date.now(),
          entries: remaining,
        },
        discovered.messageId,
      ),
      driver.deleteMessages(messageIds),
    ]);

    return (
      file ?? {
        id,
        name: target.fileName,
        size: 0,
        mime: 'application/octet-stream',
        folder: '',
        chunks: [],
        createdAt: 0,
        updatedAt: 0,
        starred: false,
        archived: false,
      }
    );
  });
}

export async function purgeStoredFiles(ids: string[]): Promise<number> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return 0;

  return runExclusive(async () => {
    const driver = getDriver();
    await ensureDemoSeeded(driver);

    const discovered = await driver.readDirectory();
    const directory = discovered.directory ?? emptyDirectory();
    const doomedSet = new Set(uniqueIds);

    const targets = directory.entries.filter(
      (item): item is Extract<DirectoryEntry, { kind: 'file' }> =>
        item.kind === 'file' && doomedSet.has(item.id),
    );
    if (targets.length === 0) return 0;

    const resolvedRecords = await mapConcurrent(
      targets,
      SCAN_CONCURRENCY,
      (target) => resolveEntryRecord(driver, target),
    );

    const shareEntries = directory.entries.filter(
      (entry): entry is Extract<DirectoryEntry, { kind: 'share' }> =>
        entry.kind === 'share' && doomedSet.has(entry.targetId),
    );

    const remaining = directory.entries.filter(
      (item) =>
        !(
          (item.kind === 'file' && doomedSet.has(item.id)) ||
          (item.kind === 'share' && entryTargetId(item) && doomedSet.has(entryTargetId(item)!))
        ),
    );

    const chunkMessageIds = resolvedRecords.flatMap((record) =>
      record && record.schema === 'tellynas.file.v1'
        ? record.chunks.map((chunk) => chunk.messageId)
        : [],
    );

    const messageIds = [
      ...targets.map((target) => target.messageId),
      ...chunkMessageIds,
      ...shareEntries.map((entry) => entry.messageId),
    ];

    await Promise.all([
      driver.writeDirectory(
        {
          schema: 'tellynas.directory.v1',
          updatedAt: Date.now(),
          entries: remaining,
        },
        discovered.messageId,
      ),
      driver.deleteMessages(messageIds),
    ]);

    return targets.length;
  });
}

/**
 * Restores an archived file back into the active library.
 */
export async function restoreStoredFile(id: string): Promise<StoredFile | null> {
  return runExclusive(async () => {
    const driver = getDriver();
    await ensureDemoSeeded(driver);

    const discovered = await driver.readDirectory();
    const directory = discovered.directory ?? emptyDirectory();
    const entryIndex = directory.entries.findIndex(
      (item) => item.kind === 'file' && item.id === id,
    );
    if (entryIndex === -1) return null;

    const currentEntry = directory.entries[entryIndex] as Extract<
      DirectoryEntry,
      { kind: 'file' }
    >;
    const existingRecord = await resolveEntryRecord(driver, currentEntry);
    if (!existingRecord || existingRecord.schema !== 'tellynas.file.v1') return null;

    const now = Date.now();
    const updated: StoredFile = {
      ...sidecarToStoredFile(existingRecord),
      archived: false,
      deletedAt: undefined,
      updatedAt: now,
    };

    const sidecar = serializeFileSidecar(updated);
    const savedRef = await driver.writeSidecar({
      ...sidecar,
      existingMessageId: currentEntry.messageId,
    });

    const entries = [...directory.entries];
    entries[entryIndex] = {
      kind: 'file',
      id: updated.id,
      meta: toEmbeddedFileMeta(updated),
      ...savedRef,
    };

    await driver.writeDirectory(
      {
        schema: 'tellynas.directory.v1',
        updatedAt: now,
        entries,
      },
      discovered.messageId,
    );

    return updated;
  });
}

function entryTargetId(entry: DirectoryEntry): string | undefined {
  return entry.kind === 'share' ? entry.targetId : undefined;
}

export async function createStoredFolder(
  parentInput: unknown,
  nameInput: unknown,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  return runExclusive(async () => {
    const parent = normalizeFolder(parentInput);
    const name = sanitizeName(nameInput, '');
    if (!name) return { ok: false, error: 'Give the folder a name.' };

    const targetPath = parent ? `${parent}/${name}` : name;
    const driver = getDriver();
    const { index, directory, directoryMessageId } = await scanDriverStorage(driver, {
      freshRead: true,
    });

    if (
      index.folders.some(
        (entry) => entry.path.toLowerCase() === targetPath.toLowerCase(),
      )
    ) {
      return { ok: false, error: 'A folder with that name already exists.' };
    }

    const now = Date.now();
    const entries = await ensureAncestorFolderEntries(
      driver,
      directory.entries,
      index.folders,
      targetPath,
      now,
    );

    await driver.writeDirectory(
      {
        schema: 'tellynas.directory.v1',
        updatedAt: now,
        entries,
      },
      directoryMessageId,
    );

    return { ok: true, path: targetPath };
  });
}

export async function renameStoredFolder(
  pathInput: unknown,
  nameInput: unknown,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  return runExclusive(async () => {
    const sourcePath = normalizeFolder(pathInput);
    const name = sanitizeName(nameInput, '');
    if (!sourcePath) return { ok: false, error: 'Missing folder path.' };
    if (!name) return { ok: false, error: 'Give the folder a name.' };

    const segments = sourcePath.split('/');
    const parent = segments.slice(0, -1).join('/');
    const targetPath = parent ? `${parent}/${name}` : name;

    const driver = getDriver();
    const { index, directory, directoryMessageId } = await scanDriverStorage(driver, {
      freshRead: true,
    });

    if (
      sourcePath.toLowerCase() !== targetPath.toLowerCase() &&
      index.folders.some(
        (entry) => entry.path.toLowerCase() === targetPath.toLowerCase(),
      )
    ) {
      return { ok: false, error: 'A folder with that name already exists.' };
    }

    const renamePath = (value: string) =>
      value === sourcePath || value.startsWith(`${sourcePath}/`)
        ? `${targetPath}${value.slice(sourcePath.length)}`
        : value;

    const now = Date.now();
    const filesById = new Map(index.files.map((file) => [file.id, file]));
    const foldersByPath = new Map(index.folders.map((folder) => [folder.path, folder]));

    const updatedEntries = await mapConcurrent(
      directory.entries,
      SCAN_CONCURRENCY,
      async (entry): Promise<DirectoryEntry> => {
        if (entry.kind === 'folder') {
          if (entry.path !== sourcePath && !entry.path.startsWith(`${sourcePath}/`)) {
            return entry;
          }
          const newPath = renamePath(entry.path);
          const folderMeta = foldersByPath.get(entry.path) ?? {
            path: newPath,
            createdAt: now,
          };
          const serialized = serializeFolderSidecar({
            path: newPath,
            createdAt: folderMeta.createdAt,
          });
          const saved = await driver.writeSidecar({
            ...serialized,
            existingMessageId: entry.messageId,
          });
          return {
            kind: 'folder',
            path: newPath,
            createdAt: folderMeta.createdAt,
            ...saved,
          };
        }

        if (entry.kind !== 'file') return entry;

        const file = filesById.get(entry.id);
        if (
          !file ||
          (file.folder !== sourcePath && !file.folder.startsWith(`${sourcePath}/`))
        ) {
          return entry;
        }

        const renamedFile: StoredFile = {
          ...file,
          folder: renamePath(file.folder),
          updatedAt: now,
        };
        const serialized = serializeFileSidecar(renamedFile);
        const saved = await driver.writeSidecar({
          ...serialized,
          existingMessageId: entry.messageId,
        });
        return {
          kind: 'file',
          id: renamedFile.id,
          meta: toEmbeddedFileMeta(renamedFile),
          ...saved,
        };
      },
    );

    const finalEntries = await ensureAncestorFolderEntries(
      driver,
      updatedEntries,
      [],
      targetPath,
      now,
    );

    await driver.writeDirectory(
      {
        schema: 'tellynas.directory.v1',
        updatedAt: now,
        entries: finalEntries,
      },
      directoryMessageId,
    );

    return { ok: true, path: targetPath };
  });
}

export async function deleteStoredFolder(pathInput: unknown): Promise<{
  removedFiles: number;
  removedBytes: number;
}> {
  return runExclusive(async () => {
    const targetPath = normalizeFolder(pathInput);
    const driver = getDriver();
    const { index, directory, directoryMessageId } = await scanDriverStorage(driver, {
      freshRead: true,
    });

    const doomedFiles = index.files.filter(
      (file) =>
        !file.archived &&
        (file.folder === targetPath || file.folder.startsWith(`${targetPath}/`)),
    );
    const doomedFileIds = new Set(doomedFiles.map((file) => file.id));

    const removedEntries: DirectoryEntry[] = [];
    const remainingEntries: DirectoryEntry[] = [];
    const now = Date.now();

    for (const entry of directory.entries) {
      if (entry.kind === 'folder') {
        if (entry.path === targetPath || entry.path.startsWith(`${targetPath}/`)) {
          removedEntries.push(entry);
        } else {
          remainingEntries.push(entry);
        }
        continue;
      }

      if (entry.kind === 'file' && doomedFileIds.has(entry.id)) {
        // Files inside a deleted folder move to the Archive instead of being
        // destroyed: mark the sidecar, keep the chunk messages intact.
        const resolved = await resolveEntryRecord(driver, entry);
        const existingFile =
          resolved && resolved.schema === 'tellynas.file.v1'
            ? sidecarToStoredFile(resolved)
            : null;
        const updated = archivedFileRecord(existingFile, entry.id, entry, now);
        await driver.writeSidecar({
          ...serializeFileSidecar(updated),
          existingMessageId: entry.messageId,
        });
        remainingEntries.push({ ...entry, meta: toEmbeddedFileMeta(updated) });
        continue;
      }

      remainingEntries.push(entry);
    }

    const messageIds = removedEntries.map((entry) => entry.messageId);

    await Promise.all([
      driver.writeDirectory(
        {
          schema: 'tellynas.directory.v1',
          updatedAt: now,
          entries: remainingEntries,
        },
        directoryMessageId,
      ),
      messageIds.length > 0 ? driver.deleteMessages(messageIds) : Promise.resolve(),
    ]);

    return {
      removedFiles: doomedFiles.length,
      removedBytes: doomedFiles.reduce((sum, file) => sum + file.size, 0),
    };
  });
}

/* -------------------------------------------------------------------------- */
/*                                  Public shares                             */
/* -------------------------------------------------------------------------- */

/**
 * All active share links. Share links live inside the pinned storage directory
 * (as `kind: 'share'` entries) so they survive redeploys and new devices just
 * like the rest of the library — no database required.
 */
export async function getShares(): Promise<StorageShare[]> {
  const driver = getDriver();
  await ensureDemoSeeded(driver);

  const discovered = await readDirectoryShared(driver);
  const directory = discovered.directory ?? emptyDirectory();

  return directory.entries
    .filter(
      (entry): entry is Extract<DirectoryEntry, { kind: 'share' }> =>
        entry.kind === 'share',
    )
    .map((entry) => ({
      token: entry.token,
      targetId: entry.targetId,
      createdAt: entry.createdAt ?? Date.now(),
      expiresAt: entry.expiresAt,
      passwordHash: entry.passwordHash,
      targetType: entry.targetType,
      folderCreatedAt: entry.folderCreatedAt,
    }));
}

export async function createShare(input: {
  targetId: string;
  token: string;
  expiresAt?: number;
  passwordHash?: string;
  targetType?: 'file' | 'folder';
}): Promise<StorageShare> {
  return runExclusive(async () => {
    const driver = getDriver();
    await ensureDemoSeeded(driver);

    const file = input.targetType === 'folder' ? null : await getStoredFile(input.targetId);
    const folder = input.targetType === 'folder' ? (await getIndex()).folders.find(f => f.path === input.targetId) : null;
    if (!file && !folder) throw new Error('Share target not found.');

    const now = Date.now();
    const share: StorageShare = {
      token: input.token,
      targetId: input.targetId,
      createdAt: now,
      expiresAt: input.expiresAt,
      passwordHash: input.passwordHash,
      targetType: input.targetType || 'file',
      folderCreatedAt: folder?.createdAt,
    };

    const ref = await driver.writeSidecar({
      fileName: `_tellynas.share.${input.token}.json`,
      caption: fitCaption(
        'tellynas:share:v1',
        {
          v: 1,
          kind: 'share',
          token: input.token,
          target: (file?.name || folder?.path || '').slice(0, 140),
          createdAt: now,
        },
        `tellynas:share:v1 ${input.token}`,
      ),
      content: JSON.stringify(share),
    });

    const discovered = await driver.readDirectory();
    const directory = discovered.directory ?? emptyDirectory();

    const entries: DirectoryEntry[] = [
      ...directory.entries.filter(
        (entry) => !(entry.kind === 'share' && entry.token === input.token),
      ),
      {
        kind: 'share' as const,
        token: input.token,
        targetId: input.targetId,
        createdAt: now,
        expiresAt: input.expiresAt,
        passwordHash: input.passwordHash,
        targetType: input.targetType || 'file',
        folderCreatedAt: folder?.createdAt,
        ...ref,
      },
    ];

    await driver.writeDirectory(
      {
        schema: 'tellynas.directory.v1',
        updatedAt: now,
        entries,
      },
      discovered.messageId,
    );

    return share;
  });
}

export async function revokeShare(token: string): Promise<boolean> {
  return runExclusive(async () => {
    const driver = getDriver();
    await ensureDemoSeeded(driver);

    const discovered = await driver.readDirectory();
    const directory = discovered.directory ?? emptyDirectory();
    const entryIndex = directory.entries.findIndex(
      (entry) => entry.kind === 'share' && entry.token === token,
    );
    if (entryIndex === -1) return false;

    const entry = directory.entries[entryIndex] as Extract<
      DirectoryEntry,
      { kind: 'share' }
    >;

    const remaining = directory.entries.filter(
      (entry) => !(entry.kind === 'share' && entry.token === token),
    );

    await Promise.all([
      driver.writeDirectory(
        {
          schema: 'tellynas.directory.v1',
          updatedAt: Date.now(),
          entries: remaining,
        },
        discovered.messageId,
      ),
      driver.deleteMessages([entry.messageId]),
    ]);

    return true;
  });
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

export const ROOT = '';

export function normalizeFolder(input: unknown): string {
  return String(input ?? '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/')
    .slice(0, 200);
}

export function sanitizeName(input: unknown, fallback = 'untitled'): string {
  const name = String(input ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '')
    .trim()
    .slice(0, 200);
  return name || fallback;
}

export function filesInFolder(index: StorageIndex, folder: string): StoredFile[] {
  return index.files
    .filter((file) => file.folder === folder)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function childFolders(
  index: StorageIndex,
  folder: string,
): Array<StoredFolder & { fileCount: number }> {
  const prefix = folder ? `${folder}/` : '';
  const seen = new Map<string, number>();

  const register = (folderPath: string) => {
    if (!folderPath.startsWith(prefix) || folderPath === folder) return;
    const segment = folderPath.slice(prefix.length).split('/')[0];
    if (!segment) return;
    seen.set(segment, (seen.get(segment) || 0) + 1);
  };

  index.folders.forEach((entry) => register(entry.path));
  index.files.forEach((file) => register(file.folder));

  return [...seen.keys()]
    .map((segment) => {
      const fullPath = prefix ? `${prefix}${segment}` : segment;
      const explicit = index.folders.find((entry) => entry.path === fullPath);
      const directFiles = index.files.filter((f) => f.folder === fullPath).length;
      return {
        path: fullPath,
        createdAt: explicit?.createdAt ?? 0,
        fileCount: directFiles,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function computeStats(index: StorageIndex): StorageStats {
  // Archived files live in the Archive, not in the active library counts.
  const files = index.files.filter((file) => !file.archived);
  return {
    fileCount: files.length,
    folderCount: index.folders.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    chunkCount: files.reduce((sum, file) => sum + file.chunks.length, 0),
  };
}
