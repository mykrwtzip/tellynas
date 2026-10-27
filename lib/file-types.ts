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

export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'doc' | 'sheet' | 'slides' | 'archive' | 'code' | 'text' | 'other';

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
  sh: 'code', yml: 'code', yaml: 'code', toml: 'code', sql: 'code',
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

/** Tailwind classes for the icon tile of each kind. */
export const KIND_STYLES: Record<FileKind, { tile: string; icon: string; label: string }> = {
  image: { tile: 'bg-sky-500/12 ring-sky-500/25', icon: 'text-sky-500', label: 'Image' },
  video: { tile: 'bg-violet-500/12 ring-violet-500/25', icon: 'text-violet-500', label: 'Video' },
  audio: { tile: 'bg-fuchsia-500/12 ring-fuchsia-500/25', icon: 'text-fuchsia-500', label: 'Audio' },
  pdf: { tile: 'bg-rose-500/12 ring-rose-500/25', icon: 'text-rose-500', label: 'PDF' },
  doc: { tile: 'bg-blue-500/12 ring-blue-500/25', icon: 'text-blue-500', label: 'Document' },
  sheet: { tile: 'bg-emerald-500/12 ring-emerald-500/25', icon: 'text-emerald-500', label: 'Spreadsheet' },
  slides: { tile: 'bg-amber-500/12 ring-amber-500/25', icon: 'text-amber-500', label: 'Slides' },
  archive: { tile: 'bg-orange-500/12 ring-orange-500/25', icon: 'text-orange-500', label: 'Archive' },
  code: { tile: 'bg-teal-500/12 ring-teal-500/25', icon: 'text-teal-500', label: 'Code' },
  text: { tile: 'bg-slate-500/12 ring-slate-500/25', icon: 'text-slate-500', label: 'Text' },
  other: { tile: 'bg-slate-500/12 ring-slate-500/25', icon: 'text-slate-500', label: 'File' },
};

export const PREVIEWABLE_TEXT = new Set(['text', 'code']);
export const PREVIEWABLE_IMAGE = new Set(['image']);
