import { appConfig, useDemoDriver } from './config';
import {
  DIRECTORY_FILENAME,
  formatChunkCaption,
  formatChunkFilename,
  parseDirectory,
  parseDirectoryCaption,
  parseSidecarRecord,
  serializeDirectory,
} from './metadata';
import type {
  ChunkStream,
  SidecarRecord,
  StorageDirectory,
  StorageDriver,
  StoredChunk,
  StoredObjectRef,
} from './types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/* -------------------------------------------------------------------------- */
/*                               Telegram driver                              */
/* -------------------------------------------------------------------------- */

const API_BASE = () => `https://api.telegram.org/bot${appConfig.telegramToken}`;

export class TelegramError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'TelegramError';
    this.status = status;
  }
}

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

type TelegramDocumentMessage = {
  message_id: number;
  caption?: string;
  document?: {
    file_id: string;
    file_size?: number;
    file_name?: string;
  };
};

type TelegramChatInfo = {
  id: number | string;
  pinned_message?: TelegramDocumentMessage;
};

async function telegramCall<T>(
  method: string,
  init?: {
    body?: BodyInit;
    query?: Record<string, string | number | boolean | undefined>;
  },
): Promise<T> {
  const url = new URL(`${API_BASE()}/${method}`);
  for (const [key, value] of Object.entries(init?.query || {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: init?.body ? 'POST' : 'GET',
      body: init?.body,
      cache: 'no-store',
    });
  } catch (error) {
    throw new TelegramError(
      `Could not reach Telegram: ${(error as Error).message}. Check the server's network access.`,
    );
  }

  let payload: TelegramResponse<T>;
  try {
    payload = (await response.json()) as TelegramResponse<T>;
  } catch {
    throw new TelegramError(
      `Telegram returned an invalid response (HTTP ${response.status}).`,
    );
  }

  if (!payload.ok || payload.result === undefined) {
    const description = payload.description || 'Unknown Telegram error';
    if (payload.error_code === 401) {
      throw new TelegramError(
        'Telegram rejected the bot token. Check TELEGRAM_BOT_TOKEN.',
        401,
      );
    }
    if (payload.error_code === 400 && /chat not found/i.test(description)) {
      throw new TelegramError(
        'Chat not found. Open a chat with your bot, press Start, and check TELEGRAM_CHAT_ID.',
        400,
      );
    }
    throw new TelegramError(description, payload.error_code || 502);
  }

  return payload.result;
}

async function sendTelegramDocument(input: {
  bytes: Uint8Array;
  fileName: string;
  caption: string;
  mimeType?: string;
}): Promise<StoredObjectRef> {
  const form = new FormData();
  form.append('chat_id', appConfig.telegramChatId);
  if (input.caption) {
    form.append('caption', input.caption);
  }
  form.append('disable_notification', 'true');
  form.append(
    'document',
    new Blob([input.bytes as BlobPart], {
      type: input.mimeType || 'application/octet-stream',
    }),
    input.fileName,
  );

  const message = await telegramCall<TelegramDocumentMessage>('sendDocument', {
    body: form,
  });

  if (!message.document?.file_id) {
    throw new TelegramError('Telegram did not return a file id for the upload.');
  }

  return {
    messageId: message.message_id,
    fileId: message.document.file_id,
    fileName: message.document.file_name || input.fileName,
  };
}

async function editTelegramDocument(input: {
  messageId: number;
  bytes: Uint8Array;
  fileName: string;
  caption: string;
  mimeType?: string;
}): Promise<StoredObjectRef> {
  const form = new FormData();
  form.append('chat_id', appConfig.telegramChatId);
  form.append('message_id', String(input.messageId));
  form.append(
    'media',
    JSON.stringify({
      type: 'document',
      media: 'attach://attachment',
      caption: input.caption,
    }),
  );
  form.append(
    'attachment',
    new Blob([input.bytes as BlobPart], {
      type: input.mimeType || 'application/octet-stream',
    }),
    input.fileName,
  );

  const message = await telegramCall<TelegramDocumentMessage>('editMessageMedia', {
    body: form,
  });

  if (!message.document?.file_id) {
    throw new TelegramError('Telegram did not return an updated file id.');
  }

  return {
    messageId: message.message_id,
    fileId: message.document.file_id,
    fileName: message.document.file_name || input.fileName,
  };
}

async function downloadTelegramText(fileId: string): Promise<string | null> {
  try {
    const file = await telegramCall<{ file_path?: string }>('getFile', {
      query: { file_id: fileId },
    });
    if (!file.file_path) return null;

    const response = await fetch(
      `https://api.telegram.org/file/bot${appConfig.telegramToken}/${file.file_path}`,
      { cache: 'no-store' },
    );
    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    if (error instanceof TelegramError && (error.status === 400 || error.status === 404)) {
      return null;
    }
    throw error;
  }
}

const telegramDriver: StorageDriver = {
  mode: 'telegram',

  async uploadChunk({ data, name, folder, index, total }) {
    const fileName = formatChunkFilename({ name, folder, index, total });
    const caption = formatChunkCaption({
      name,
      folder,
      index,
      total,
      size: data.byteLength,
    });

    const uploaded = await sendTelegramDocument({
      bytes: data,
      fileName,
      caption,
    });

    return {
      index,
      messageId: uploaded.messageId,
      fileId: uploaded.fileId,
      size: data.byteLength,
    } satisfies StoredChunk;
  },

  async getChunkStream(fileId): Promise<ChunkStream> {
    const file = await telegramCall<{ file_path?: string; file_size?: number }>(
      'getFile',
      { query: { file_id: fileId } },
    );

    if (!file.file_path) {
      throw new TelegramError(
        'Telegram did not return a download path (files above the 20 MB Bot API limit cannot be downloaded).',
      );
    }

    const response = await fetch(
      `https://api.telegram.org/file/bot${appConfig.telegramToken}/${file.file_path}`,
      { cache: 'no-store' },
    );

    if (!response.ok || !response.body) {
      throw new TelegramError(
        `Telegram download failed (HTTP ${response.status}).`,
      );
    }

    return { stream: response.body, size: file.file_size ?? null };
  },

  async writeSidecar({ fileName, caption, content, existingMessageId }) {
    const bytes = encoder.encode(content);
    if (existingMessageId && existingMessageId > 0) {
      try {
        return await editTelegramDocument({
          messageId: existingMessageId,
          bytes,
          fileName,
          caption,
          mimeType: 'application/json',
        });
      } catch (error) {
        console.warn(
          '[tellynas] could not edit sidecar message in-place, sending replacement',
          existingMessageId,
          error,
        );
      }
    }

    return sendTelegramDocument({
      bytes,
      fileName,
      caption,
      mimeType: 'application/json',
    });
  },

  async readSidecarText(fileId) {
    return downloadTelegramText(fileId);
  },

  async readDirectory(): Promise<{
    directory: StorageDirectory | null;
    messageId: number | null;
    standaloneSidecar?: SidecarRecord | null;
  }> {
    const chat = await telegramCall<TelegramChatInfo>('getChat', {
      query: { chat_id: appConfig.telegramChatId },
    });

    const pinned = chat.pinned_message;
    if (!pinned?.document?.file_id) {
      return { directory: null, messageId: null };
    }

    const fromCaption = parseDirectoryCaption(pinned.caption);
    if (fromCaption) {
      return { directory: fromCaption, messageId: pinned.message_id };
    }

    const text = await downloadTelegramText(pinned.document.file_id);
    const directory = parseDirectory(text);
    if (directory) {
      return { directory, messageId: pinned.message_id };
    }

    const standaloneSidecar = parseSidecarRecord(text, pinned.caption);
    if (standaloneSidecar) {
      return { directory: null, messageId: null, standaloneSidecar };
    }

    return { directory: null, messageId: null };
  },

  async writeDirectory(directory, existingMessageId) {
    const serialized = serializeDirectory(directory.entries);
    const bytes = encoder.encode(serialized.content);

    if (existingMessageId && existingMessageId > 0) {
      try {
        const edited = await editTelegramDocument({
          messageId: existingMessageId,
          bytes,
          fileName: DIRECTORY_FILENAME,
          caption: serialized.caption,
          mimeType: 'application/json',
        });
        return { messageId: edited.messageId, fileId: edited.fileId };
      } catch (error) {
        console.warn(
          '[tellynas] could not update pinned directory in-place, creating a new one',
          existingMessageId,
          error,
        );
      }
    }

    const created = await sendTelegramDocument({
      bytes,
      fileName: DIRECTORY_FILENAME,
      caption: serialized.caption,
      mimeType: 'application/json',
    });

    try {
      await telegramCall<boolean>('pinChatMessage', {
        query: {
          chat_id: appConfig.telegramChatId,
          message_id: created.messageId,
          disable_notification: true,
        },
      });
    } catch (error) {
      throw new TelegramError(
        `Could not pin the storage directory message in Telegram: ${(error as Error).message}. Ensure the bot has permission to pin messages in this chat.`,
      );
    }

    return { messageId: created.messageId, fileId: created.fileId };
  },

  async deleteMessages(messageIds) {
    const uniqueIds = [...new Set(messageIds.filter((id) => Number.isFinite(id) && id > 0))];
    await Promise.all(
      uniqueIds.map(async (id) => {
        try {
          await telegramCall('deleteMessage', {
            query: { chat_id: appConfig.telegramChatId, message_id: id },
          });
        } catch (error) {
          // A missing message should not block deleting the rest.
          console.warn('[tellynas] deleteMessage failed', id, error);
        }
      }),
    );
  },

  async checkConnection() {
    try {
      const me = await telegramCall<{ username?: string; first_name?: string }>(
        'getMe',
      );
      return {
        ok: true,
        detail: `Connected as @${me.username || me.first_name || 'bot'}`,
      };
    } catch (error) {
      return { ok: false, detail: (error as Error).message };
    }
  },
};

/* -------------------------------------------------------------------------- */
/*                                 Demo driver                                */
/* -------------------------------------------------------------------------- */

type DemoStoredMessage = {
  messageId: number;
  fileId: string;
  fileName: string;
  caption: string;
  data: Uint8Array;
};

type DemoStoreState = {
  messages: Map<number, DemoStoredMessage>;
  blobs: Map<string, Uint8Array>;
  pinnedMessageId: number | null;
  counter: number;
  seeded: boolean;
};

type AnyGlobal = typeof globalThis & {
  __tellynasDemoStorage?: DemoStoreState;
};

export function demoStorageState(): DemoStoreState {
  const global = globalThis as AnyGlobal;
  if (!global.__tellynasDemoStorage) {
    global.__tellynasDemoStorage = {
      messages: new Map(),
      blobs: new Map(),
      pinnedMessageId: null,
      counter: 0,
      seeded: false,
    };
  }
  return global.__tellynasDemoStorage;
}

function storeDemoDocument(input: {
  bytes: Uint8Array;
  fileName: string;
  caption: string;
  existingMessageId?: number | null;
}): StoredObjectRef {
  const state = demoStorageState();
  state.counter += 1;
  const fileId = `demo-${Date.now().toString(36)}-${state.counter}`;
  const copy = new Uint8Array(input.bytes);
  state.blobs.set(fileId, copy);

  if (input.existingMessageId && state.messages.has(input.existingMessageId)) {
    const previous = state.messages.get(input.existingMessageId)!;
    state.blobs.delete(previous.fileId);
    const updated: DemoStoredMessage = {
      messageId: input.existingMessageId,
      fileId,
      fileName: input.fileName,
      caption: input.caption,
      data: copy,
    };
    state.messages.set(input.existingMessageId, updated);
    return {
      messageId: updated.messageId,
      fileId: updated.fileId,
      fileName: updated.fileName,
    };
  }

  const messageId = state.counter;
  const created: DemoStoredMessage = {
    messageId,
    fileId,
    fileName: input.fileName,
    caption: input.caption,
    data: copy,
  };
  state.messages.set(messageId, created);
  return { messageId, fileId, fileName: input.fileName };
}

const demoDriver: StorageDriver = {
  mode: 'demo',

  async uploadChunk({ data, name, folder, index, total }) {
    const fileName = formatChunkFilename({ name, folder, index, total });
    const caption = formatChunkCaption({
      name,
      folder,
      index,
      total,
      size: data.byteLength,
    });
    const uploaded = storeDemoDocument({ bytes: data, fileName, caption });
    return {
      index,
      messageId: uploaded.messageId,
      fileId: uploaded.fileId,
      size: data.byteLength,
    } satisfies StoredChunk;
  },

  async getChunkStream(fileId) {
    const data = demoStorageState().blobs.get(fileId);
    if (!data) return { stream: new Blob([new Uint8Array()]).stream(), size: 0 };
    return { stream: new Blob([data as BlobPart]).stream(), size: data.byteLength };
  },

  async writeSidecar({ fileName, caption, content, existingMessageId }) {
    return storeDemoDocument({
      bytes: encoder.encode(content),
      fileName,
      caption,
      existingMessageId,
    });
  },

  async readSidecarText(fileId) {
    const data = demoStorageState().blobs.get(fileId);
    if (!data) return null;
    return decoder.decode(data);
  },

  async readDirectory() {
    const state = demoStorageState();
    if (!state.pinnedMessageId) {
      return { directory: null, messageId: null };
    }
    const pinned = state.messages.get(state.pinnedMessageId);
    if (!pinned) {
      return { directory: null, messageId: null };
    }
    const text = decoder.decode(pinned.data);
    const directory = parseDirectory(text);
    if (directory) {
      return { directory, messageId: pinned.messageId };
    }
    const standaloneSidecar = parseSidecarRecord(text, pinned.caption);
    return { directory: null, messageId: null, standaloneSidecar };
  },

  async writeDirectory(directory, existingMessageId) {
    const state = demoStorageState();
    const serialized = serializeDirectory(directory.entries);
    const stored = storeDemoDocument({
      bytes: encoder.encode(serialized.content),
      fileName: DIRECTORY_FILENAME,
      caption: serialized.caption,
      existingMessageId: existingMessageId ?? state.pinnedMessageId,
    });
    state.pinnedMessageId = stored.messageId;
    return { messageId: stored.messageId, fileId: stored.fileId };
  },

  async deleteMessages(messageIds) {
    const state = demoStorageState();
    for (const id of messageIds) {
      const existing = state.messages.get(id);
      if (existing) {
        state.blobs.delete(existing.fileId);
        state.messages.delete(id);
      }
      if (state.pinnedMessageId === id) {
        state.pinnedMessageId = null;
      }
    }
  },

  async checkConnection() {
    return {
      ok: false,
      detail:
        'Demo mode is active. Configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to connect persistent cloud storage.',
    };
  },
};

export function getDriver(): StorageDriver {
  return useDemoDriver() ? demoDriver : telegramDriver;
}
