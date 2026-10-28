export type StoredChunk = {
  /** Position of the chunk in the file (0-based). */ index: number;
  /** Telegram message id that holds the document (or simulated id in demo mode). */ messageId: number;
  /** Storage file_id used to stream chunk bytes. */ fileId: string;
  size: number;
  /**
   * Index of the bot in the bot pool that stored this chunk. Downloads must
   * fetch the chunk through the same bot token because the Bot API only serves
   * a file to a bot that knows its file_id.
   */
  botIndex?: number;
};

export type StoredFile = {
  id: string;
  name: string;
  size: number;
  mime: string;
  /** "" for the root folder, or a slash-separated path such as "media/2024". */ folder: string;
  chunks: StoredChunk[];
  createdAt: number;
  updatedAt: number;
  starred: boolean;
  /** Soft-deleted files live in the Archive instead of being purged. */ archived: boolean;
  /** When the file was moved to the Archive (epoch ms). */ deletedAt?: number;
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

/** A public share link: a token that anyone can use to download a file. */
export type StorageShare = {
  /** Unguessable token embedded in the public share URL. */ token: string;
  /** Id of the shared file. */ targetId: string;
  /** When the share was created (epoch ms). */ createdAt: number;
  /** Optional expiry (epoch ms). After this the link stops working. */ expiresAt?: number;
  passwordHash?: string;
  targetType?: 'file' | 'folder';
  folderCreatedAt?: number;
};


export type FileSidecarRecord = {
  schema: 'tellynas.file.v1';
  id: string;
  name: string;
  size: number;
  mime: string;
  folder: string;
  starred: boolean;
  archived: boolean;
  deletedAt?: number;
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
  archived: boolean;
  deletedAt?: number;
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
    } & StoredObjectRef)
  | ({
      kind: 'share';
      /** Public share token. */ token: string;
      /** Id of the file the link points to. */ targetId: string;
      /** When the link was created (epoch ms). */ createdAt?: number;
      /** Optional expiry (epoch ms). */ expiresAt?: number;
      passwordHash?: string;
      targetType?: 'file' | 'folder';
      folderCreatedAt?: number;
    } & StoredObjectRef)

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
  getChunkStream(fileId: string, botIndex?: number): Promise<ChunkStream>;
  writeDirectory(
    directory: StorageDirectory,
    existingMessageId?: number | null,
  ): Promise<{ messageId: number; fileId: string }>;
  deleteMessages(messageIds: number[]): Promise<void>;
  checkConnection(): Promise<{ ok: boolean; detail: string }>;
}
