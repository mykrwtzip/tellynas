export type StoredChunk = {
  /** Position of the chunk in the file (0-based). */
  index: number;
  /** Telegram message id that holds the document (0 for the demo driver). */
  messageId: number;
  /** Telegram file_id, used for downloads. */
  fileId: string;
  size: number;
};

export type StoredFile = {
  id: string;
  name: string;
  size: number;
  mime: string;
  /** "" for the root folder, or a slash separated path such as "media/2024". */
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
    index: number;
    total: number;
  }): Promise<StoredChunk>;
  getChunkStream(fileId: string): Promise<ChunkStream>;
  deleteMessages(messageIds: number[]): Promise<void>;
  checkConnection(): Promise<{ ok: boolean; detail: string }>;
}
