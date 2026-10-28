import {
  Archive,
  Code2,
  File as FileIcon,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
  type LucideIcon,
} from 'lucide-react';
import { extensionOf } from './format';

export type FileKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'doc'
  | 'sheet'
  | 'slides'
  | 'archive'
  | 'code'
  | 'text'
  | 'other';

export type MediaCategory =
  | 'images'
  | 'videos'
  | 'audio'
  | 'documents'
  | 'code'
  | 'archives';

const EXTENSION_MAP: Record<string, FileKind> = {
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', svg: 'image',
  avif: 'image', bmp: 'image', heic: 'image', ico: 'image',
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video', m4v: 'video',
  mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', ogg: 'audio', m4a: 'audio',
  pdf: 'pdf',
  doc: 'doc', docx: 'doc', odt: 'doc', rtf: 'doc', pages: 'doc',
  xls: 'sheet', xlsx: 'sheet', csv: 'sheet', ods: 'sheet', numbers: 'sheet',
  ppt: 'slides', pptx: 'slides', odp: 'slides', key: 'slides',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
  bz2: 'archive', xz: 'archive', dmg: 'archive', iso: 'archive',
  js: 'code', jsx: 'code', ts: 'code', tsx: 'code', json: 'code', html: 'code',
  css: 'code', py: 'code', rb: 'code', go: 'code', rs: 'code', java: 'code',
  sh: 'code', yml: 'code', yaml: 'code', toml: 'code', sql: 'code', c: 'code',
  cpp: 'code', h: 'code', swift: 'code', kt: 'code', vue: 'code', svelte: 'code',
  txt: 'text', md: 'text', markdown: 'text', log: 'text', env: 'text',
};

export function kindFromName(name: string, mime?: string): FileKind {
  const fromExtension = EXTENSION_MAP[extensionOf(name)];
  if (fromExtension) return fromExtension;

  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('video/')) return 'video';
  if (mime?.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (mime?.startsWith('text/')) return 'text';
  return 'other';
}

export function matchesCategory(kind: FileKind, category: MediaCategory): boolean {
  switch (category) {
    case 'images':
      return kind === 'image';
    case 'videos':
      return kind === 'video';
    case 'audio':
      return kind === 'audio';
    case 'documents':
      return kind === 'pdf' || kind === 'doc' || kind === 'sheet' || kind === 'slides' || kind === 'text';
    case 'code':
      return kind === 'code';
    case 'archives':
      return kind === 'archive';
    default:
      return false;
  }
}

const KIND_ICONS: Record<FileKind, LucideIcon> = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileText,
  doc: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  archive: Archive,
  code: Code2,
  text: FileText,
  other: FileIcon,
};

export function iconForKind(kind: FileKind): LucideIcon {
  return KIND_ICONS[kind];
}

/** Refined tactile accents for file icons and badges. */
export const KIND_STYLES: Record<
  FileKind,
  { tile: string; icon: string; badge: string; label: string; dot: string }
> = {
  image: {
    tile: 'bg-sky-500/10 ring-sky-500/20',
    icon: 'text-sky-500 dark:text-sky-400',
    badge: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20',
    label: 'Image',
    dot: 'bg-sky-400',
  },
  video: {
    tile: 'bg-indigo-500/10 ring-indigo-500/20',
    icon: 'text-indigo-500 dark:text-indigo-400',
    badge: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    label: 'Video',
    dot: 'bg-indigo-400',
  },
  audio: {
    tile: 'bg-pink-500/10 ring-pink-500/20',
    icon: 'text-pink-500 dark:text-pink-400',
    badge: 'text-pink-600 dark:text-pink-400 bg-pink-500/10 border-pink-500/20',
    label: 'Audio',
    dot: 'bg-pink-400',
  },
  pdf: {
    tile: 'bg-rose-500/10 ring-rose-500/20',
    icon: 'text-rose-500 dark:text-rose-400',
    badge: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20',
    label: 'PDF',
    dot: 'bg-rose-400',
  },
  doc: {
    tile: 'bg-blue-500/10 ring-blue-500/20',
    icon: 'text-blue-500 dark:text-blue-400',
    badge: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
    label: 'Document',
    dot: 'bg-blue-400',
  },
  sheet: {
    tile: 'bg-emerald-500/10 ring-emerald-500/20',
    icon: 'text-emerald-500 dark:text-emerald-400',
    badge: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    label: 'Spreadsheet',
    dot: 'bg-emerald-400',
  },
  slides: {
    tile: 'bg-amber-500/10 ring-amber-500/20',
    icon: 'text-amber-500 dark:text-amber-400',
    badge: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
    label: 'Presentation',
    dot: 'bg-amber-400',
  },
  archive: {
    tile: 'bg-orange-500/10 ring-orange-500/20',
    icon: 'text-orange-500 dark:text-orange-400',
    badge: 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20',
    label: 'Archive',
    dot: 'bg-orange-400',
  },
  code: {
    tile: 'bg-teal-500/10 ring-teal-500/20',
    icon: 'text-teal-600 dark:text-teal-400',
    badge: 'text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/20',
    label: 'Code',
    dot: 'bg-teal-400',
  },
  text: {
    tile: 'bg-zinc-500/10 ring-zinc-500/20',
    icon: 'text-zinc-600 dark:text-zinc-300',
    badge: 'text-zinc-600 dark:text-zinc-300 bg-zinc-500/10 border-zinc-500/20',
    label: 'Text',
    dot: 'bg-zinc-400',
  },
  other: {
    tile: 'bg-zinc-500/10 ring-zinc-500/20',
    icon: 'text-zinc-500 dark:text-zinc-400',
    badge: 'text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
    label: 'File',
    dot: 'bg-zinc-500',
  },
};

export const PREVIEWABLE_TEXT = new Set(['text', 'code']);
export const PREVIEWABLE_IMAGE = new Set(['image']);
