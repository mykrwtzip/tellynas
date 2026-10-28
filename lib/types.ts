export type StoredChunk = {
  /** Position of the chunk in the file (0-based). */
  index: number;
  /** Telegram message id that holds the document (or simulated id in demo mode). */
  messageId: number;
  /** Storage file_id used to stream chunk bytes. */
  fileId: string;
  size: number;
};

export type StoredFile = {
  id: string;
  name: string;
  size: number;
  mime: string;
  /** "" for the root folder, or a slash-separated path such as "media/2024". */
  folder: string;
  chunks: StoredChunk[];
  createdAt: number;
  updatedAt: number;
  starred: boolean;
};

export type StoredFolder = {
  path: string;
  createdAt: number;
};

export type StorageIndex = {
  version: 1;
  files: StoredFile[];
  folders: StoredFolder[];
};

export type StorageStats = {
  fileCount: number;
  folderCount: number;
  totalBytes: number;
  chunkCount: number;
};

export type FileSidecarRecord = {
  schema: 'tellynas.file.v1';
  id: string;
  name: string;
  size: number;
  mime: string;
  folder: string;
  starred: boolean;
  createdAt: number;
  updatedAt: number;
  chunks: StoredChunk[];
};

export type FolderSidecarRecord = {
  schema: 'tellynas.folder.v1';
  path: string;
  createdAt: number;
};

export type SidecarRecord = FileSidecarRecord | FolderSidecarRecord;

export type StoredObjectRef = {
  messageId: number;
  fileId: string;
  fileName: string;
};

export type EmbeddedFileMeta = {
  name: string;
  size: number;
  mime: string;
  folder: string;
  starred: boolean;
  createdAt: number;
  updatedAt: number;
  chunks: StoredChunk[];
};

export type DirectoryEntry =
  | ({
      kind: 'file';
      id: string;
      meta?: EmbeddedFileMeta;
    } & StoredObjectRef)
  | ({
      kind: 'folder';
      path: string;
      createdAt?: number;
    } & StoredObjectRef);

export type StorageDirectory = {
  schema: 'tellynas.directory.v1';
  updatedAt: number;
  entries: DirectoryEntry[];
};

export type DriverMode = 'telegram' | 'demo';

export type ChunkStream = {
  stream: ReadableStream<Uint8Array>;
  size: number | null;
};

export interface StorageDriver {
  readonly mode: DriverMode;
  uploadChunk(input: {
    data: Uint8Array;
    name: string;
    folder: string;
    index: number;
    total: number;
  }): Promise<StoredChunk>;
  getChunkStream(fileId: string): Promise<ChunkStream>;
  writeSidecar(input: {
    fileName: string;
    caption: string;
    content: string;
    existingMessageId?: number;
  }): Promise<StoredObjectRef>;
  readSidecarText(fileId: string): Promise<string | null>;
  readDirectory(): Promise<{
    directory: StorageDirectory | null;
    messageId: number | null;
    standaloneSidecar?: SidecarRecord | null;
  }>;
  writeDirectory(
    directory: StorageDirectory,
    existingMessageId?: number | null,
  ): Promise<{ messageId: number; fileId: string }>;
  deleteMessages(messageIds: number[]): Promise<void>;
  checkConnection(): Promise<{ ok: boolean; detail: string }>;
}
