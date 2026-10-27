import { appConfig, useDemoDriver } from './config';
import type { ChunkStream, StorageDriver, StoredChunk } from './types';

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

async function telegramCall<T>(
  method: string,
  init?: { body?: BodyInit; query?: Record<string, string | number | undefined> },
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

type TelegramDocument = {
  message_id: number;
  document?: { file_id: string; file_size?: number; file_name?: string };
};

const telegramDriver: StorageDriver = {
  mode: 'telegram',

  async uploadChunk({ data, name, index, total }) {
    const form = new FormData();
    form.append('chat_id', appConfig.telegramChatId);
    // Captions are informational; the real index lives in our metadata store.
    const label = name.length > 180 ? `${name.slice(0, 177)}…` : name;
    form.append('caption', `Tellynas · ${label} (${index + 1}/${total})`);
    form.append('document', new Blob([data as BlobPart]), label);

    const message = await telegramCall<TelegramDocument>('sendDocument', {
      body: form,
    });

    if (!message.document?.file_id) {
      throw new TelegramError('Telegram did not return a file id for the upload.');
    }

    return {
      index,
      messageId: message.message_id,
      fileId: message.document.file_id,
      size: data.byteLength,
    };
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

  async deleteMessages(messageIds) {
    await Promise.all(
      messageIds
        .filter((id) => Number.isFinite(id) && id > 0)
        .map(async (id) => {
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

type AnyGlobal = typeof globalThis & {
  __tellynasDemo?: { chunks: Map<string, Uint8Array>; counter: number };
};

const demoState = () => {
  const global = globalThis as AnyGlobal;
  if (!global.__tellynasDemo) {
    global.__tellynasDemo = { chunks: new Map(), counter: 0 };
  }
  return global.__tellynasDemo;
};

export function demoChunkStore() {
  return demoState().chunks;
}

const demoDriver: StorageDriver = {
  mode: 'demo',

  async uploadChunk({ data, name, index }) {
    const state = demoState();
    state.counter += 1;
    const fileId = `demo-${Date.now().toString(36)}-${state.counter}`;
    state.chunks.set(fileId, data);
    return {
      index,
      messageId: state.counter,
      fileId,
      size: data.byteLength,
    } satisfies StoredChunk;
  },

  async getChunkStream(fileId) {
    const data = demoState().chunks.get(fileId);
    if (!data) return { stream: new Blob([new Uint8Array()]).stream(), size: 0 };
    return { stream: new Blob([data as BlobPart]).stream(), size: data.byteLength };
  },

  async deleteMessages() {
    // Nothing to do: demo messages only exist in memory.
  },

  async checkConnection() {
    return {
      ok: false,
      detail:
        'Demo mode — files are stored in memory. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to use real Telegram storage.',
    };
  },
};

export function getDriver(): StorageDriver {
  return useDemoDriver() ? demoDriver : telegramDriver;
}
