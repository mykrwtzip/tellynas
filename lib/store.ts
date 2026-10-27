/**
 * File index persistence.
 *
 * Telegram has no Bot API method to read chat history, so Tellynas keeps its own
 * index of what has been uploaded. Three interchangeable backends are supported:
 *
 *  - redis : Upstash REST (best for serverless / multi-instance deployments)
 *  - file  : a JSON file on disk (self-hosted, local development)
 *  - memory: process memory (demo mode)
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { appConfig, useDemoDriver } from './config';
import { demoChunkStore } from './driver';
import type { StorageIndex, StorageStats, StoredFile, StoredFolder } from './types';

const INDEX_KEY = 'tellynas:index';
const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'index.json');

type BackendKind = 'redis' | 'file' | 'memory';

type AnyGlobal = typeof globalThis & {
  __tellynasIndex?: StorageIndex;
  __tellynasSeeded?: boolean;
};

const globalState = () => globalThis as AnyGlobal;

export const backendKind: BackendKind = appConfig.redisUrl
  ? 'redis'
  : useDemoDriver()
    ? 'memory'
    : 'file';

const emptyIndex = (): StorageIndex => ({ version: 1, files: [], folders: [] });

function normalizeIndex(value: unknown): StorageIndex {
  if (!value || typeof value !== 'object') return emptyIndex();
  const candidate = value as Partial<StorageIndex>;
  return {
    version: 1,
    files: Array.isArray(candidate.files) ? candidate.files : [],
    folders: Array.isArray(candidate.folders) ? candidate.folders : [],
  };
}

async function redisCommand<T>(command: unknown[]): Promise<T | null> {
  const response = await fetch(appConfig.redisUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${appConfig.redisToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Index store request failed (HTTP ${response.status}).`);
  }
  const payload = (await response.json()) as { result?: T };
  return payload.result ?? null;
}

async function loadIndex(): Promise<StorageIndex> {
  try {
    if (backendKind === 'redis') {
      const raw = await redisCommand<string>(['GET', INDEX_KEY]);
      if (!raw) return emptyIndex();
      return normalizeIndex(typeof raw === 'string' ? JSON.parse(raw) : raw);
    }

    if (backendKind === 'file') {
      const raw = await fs.readFile(DATA_FILE, 'utf8');
      return normalizeIndex(JSON.parse(raw));
    }

    return globalState().__tellynasIndex ?? emptyIndex();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[tellynas] failed to load index', error);
    }
    return emptyIndex();
  }
}

async function persistIndex(index: StorageIndex): Promise<void> {
  if (backendKind === 'redis') {
    await redisCommand(['SET', INDEX_KEY, JSON.stringify(index)]);
    return;
  }

  if (backendKind === 'file') {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(index, null, 2), 'utf8');
    return;
  }

  globalState().__tellynasIndex = index;
}

/** Serialise read-modify-write cycles so concurrent requests cannot clobber data. */
let writeQueue: Promise<unknown> = Promise.resolve();

export function mutateIndex<T>(mutator: (index: StorageIndex) => T): Promise<T> {
  const run = async () => {
    const index = await ensureSeeded(await loadIndex());
    const result = mutator(index);
    await persistIndex(index);
    return result;
  };

  const next = writeQueue.then(run, run);
  writeQueue = next.catch(() => undefined);
  return next;
}

export async function getIndex(): Promise<StorageIndex> {
  await writeQueue.catch(() => undefined);
  return ensureSeeded(await loadIndex());
}

/* -------------------------------------------------------------------------- */
/*                              Demo seed data                                */
/* -------------------------------------------------------------------------- */

const DEMO_TEXT = `Welcome to Tellynas!

Tellynas turns a Telegram chat into personal cloud storage.

You are currently in DEMO MODE, which means:
  - files live in this server's memory (they vanish on restart)
  - uploads, folders, previews, renames and deletes all work
  - nothing is sent to Telegram

To connect real storage, set these environment variables and restart:

  TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
  TELEGRAM_CHAT_ID=your_private_chat_id
  APP_USERNAME=admin
  APP_PASSWORD=a-strong-password

Then send /start to your bot once, and upload away.
`;

const DEMO_ROADMAP = `# Tellynas roadmap

- [x] Chunked uploads to Telegram
- [x] Drag & drop upload queue
- [x] Folders, search, sorting, grid/list views
- [x] Image preview lightbox
- [x] Dark & light themes
- [ ] Share links with expiring tokens
- [ ] Multi-chat support
`;

const DEMO_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#38bdf8"/>
      <stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#0b1220"/>
  <path d="M128 336l-24-152 304-56-56 264-96-72-64 64-8-96z" fill="url(#g)"/>
</svg>
`;

const DEMO_SEEDS: Array<{
  name: string;
  mime: string;
  folder: string;
  content: string;
  starred?: boolean;
}> = [
  {
    name: 'Welcome to Tellynas.txt',
    mime: 'text/plain',
    folder: '',
    content: DEMO_TEXT,
    starred: true,
  },
  { name: 'roadmap.md', mime: 'text/markdown', folder: '', content: DEMO_ROADMAP },
  { name: 'logo.svg', mime: 'image/svg+xml', folder: 'assets', content: DEMO_LOGO },
];

async function ensureSeeded(index: StorageIndex): Promise<StorageIndex> {
  const global = globalState();
  if (global.__tellynasSeeded) return index;
  global.__tellynasSeeded = true;

  const shouldSeed =
    useDemoDriver() &&
    backendKind === 'memory' &&
    index.files.length === 0 &&
    index.folders.length === 0;
  if (!shouldSeed) return index;

  const chunks = demoChunkStore();
  const now = Date.now();

  for (const [position, seed] of DEMO_SEEDS.entries()) {
    const fileId = `demo-seed-${position}`;
    chunks.set(fileId, new TextEncoder().encode(seed.content));
    if (seed.folder && !index.folders.some((f) => f.path === seed.folder)) {
      index.folders.push({ path: seed.folder, createdAt: now });
    }
    index.files.push({
      id: `seed-${position}`,
      name: seed.name,
      mime: seed.mime,
      folder: seed.folder,
      size: seed.content.length,
      chunks: [
        // High ids keep demo seeds clear of the upload counter.
        { index: 0, messageId: 1000 + position, fileId, size: seed.content.length },
      ],
      createdAt: now - (position + 1) * 3_600_000,
      updatedAt: now - (position + 1) * 3_600_000,
      starred: Boolean(seed.starred),
    });
  }

  return index;
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

/** Immediate child folders of `folder`, with file counts. */
export function childFolders(
  index: StorageIndex,
  folder: string,
): Array<StoredFolder & { fileCount: number }> {
  const prefix = folder ? `${folder}/` : '';
  const seen = new Map<string, number>();

  const register = (path: string) => {
    if (!path.startsWith(prefix) || path === folder) return;
    const segment = path.slice(prefix.length).split('/')[0];
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
  return {
    fileCount: index.files.length,
    folderCount: index.folders.length,
    totalBytes: index.files.reduce((sum, file) => sum + file.size, 0),
    chunkCount: index.files.reduce((sum, file) => sum + file.chunks.length, 0),
  };
}

export function indexFingerprint(index: StorageIndex): string {
  return `${index.files.length}:${index.folders.length}:${index.files.reduce(
    (sum, file) => sum + file.updatedAt,
    0,
  )}`;
}
