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

const API_BASE = (token: string) => `https://api.telegram.org/bot${token}`;

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
  parameters?: { retry_after?: number };
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

const TELEGRAM_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

async function fetchWithTimeout(url: string | URL, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new TelegramError(`Telegram request timed out after ${ms / 1000}s. Please retry.`, 504);
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}

async function telegramCall<T>(
  token: string,
  method: string,
  init?: {
    body?: BodyInit;
    query?: Record<string, string | number | boolean | undefined>;
    signal?: AbortSignal;
  },
  attempt = 0,
): Promise<T> {
  const url = new URL(`${API_BASE(token)}/${method}`);
  for (const [key, value] of Object.entries(init?.query || {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      method: init?.body ? 'POST' : 'GET',
      body: init?.body,
      cache: 'no-store',
      signal: init?.signal,
    }, method === 'sendDocument' || method === 'editMessageMedia' ? 90_000 : TELEGRAM_TIMEOUT_MS);
  } catch (error) {
    // Abort should propagate immediately
    if ((error as Error).name === 'AbortError' || (error as TelegramError).status === 499) throw error;
    if (attempt < (method === 'sendDocument' || method === 'editMessageMedia' ? 1 : MAX_RETRIES)) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      return telegramCall<T>(token, method, init, attempt + 1);
    }
    throw new TelegramError(
      `Could not reach Telegram: ${(error as Error).message}. Check the server's network access.`,
      error instanceof TelegramError ? error.status : 502,
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
    // Rate-limited: respect retry_after
    if (payload.error_code === 429) {
      const retryAfter = payload.parameters?.retry_after ?? 1;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, retryAfter * 1000 + 200));
        return telegramCall<T>(token, method, init, attempt + 1);
      }
    }
    // Transient 5xx from Telegram – retry
    if ((payload.error_code === 500 || payload.error_code === 502 || payload.error_code === 503) && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      return telegramCall<T>(token, method, init, attempt + 1);
    }
    if (payload.error_code === 401) {
      throw new TelegramError(
        'Telegram rejected the bot token. Check TELEGRAM_BOT_TOKEN(S).',
        401,
      );
    }
    if (payload.error_code === 400 && /chat not found/i.test(description)) {
      throw new TelegramError(
        'Chat not found. Open a chat with your bot, press Start, and check TELEGRAM_CHAT_ID.',
        400,
      );
    }
    if (payload.error_code === 400 && /not enough rights to pin/i.test(description)) {
      throw new TelegramError(
        'Bot lacks pin rights. Give the bot permission to pin messages in this chat (or make it admin), then retry.',
        403,
      );
    }
    throw new TelegramError(description, payload.error_code || 502);
  }

  return payload.result;
}

/** Tries each token in pool until one succeeds (for read operations that must work even if primary is bad). */
async function tryEachBot<T>(pool: string[], fn: (token: string) => Promise<T>): Promise<T> {
  let lastError: unknown = null;
  for (const token of pool) {
    try {
      return await fn(token);
    } catch (e) {
      lastError = e;
      // Don't fallback on auth errors that indicate misconfiguration – surface immediately
      if (e instanceof TelegramError && e.status === 401) throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new TelegramError(String(lastError));
}

async function sendTelegramDocument(
  token: string,
  input: {
    bytes: Uint8Array;
    fileName: string;
    caption: string;
    mimeType?: string;
  },
): Promise<StoredObjectRef> {
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

  const message = await telegramCall<TelegramDocumentMessage>(token, 'sendDocument', {
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

async function editTelegramDocument(
  token: string,
  input: {
    messageId: number;
    bytes: Uint8Array;
    fileName: string;
    caption: string;
    mimeType?: string;
  },
): Promise<StoredObjectRef> {
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

  const message = await telegramCall<TelegramDocumentMessage>(token, 'editMessageMedia', {
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

async function downloadTelegramText(token: string, fileId: string): Promise<string | null> {
  try {
    const file = await telegramCall<{ file_path?: string }>(token, 'getFile', {
      query: { file_id: fileId },
    });
    if (!file.file_path) return null;

    const response = await fetchWithTimeout(
      `https://api.telegram.org/file/bot${token}/${file.file_path}`, { cache: 'no-store' }, TELEGRAM_TIMEOUT_MS,
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

/**
 * Builds a Telegram-backed storage driver over a pool of bots. Chunks are
 * uploaded round-robin across the pool so large files fan out across bots
 * instead of competing on a single bot's rate limits. Every chunk remembers
 * which bot stored it (`botIndex`) so downloads can fetch from the right bot.
 * Reads are resilient: if the primary bot is revoked, any other bot is tried.
 */
export function createTelegramDriver(botTokens: string[]): StorageDriver {
  const pool = botTokens.filter(Boolean);
  const primary = pool[0] ?? '';

  const telegramDriver: StorageDriver = {
    mode: 'telegram',

    async uploadChunk({ data, name, folder, index, total }) {
      const botIndex = index % pool.length;
      const token = pool[botIndex] ?? primary;

      const fileName = formatChunkFilename({ name, folder, index, total });
      const caption = formatChunkCaption({
        name,
        folder,
        index,
        total,
        size: data.byteLength,
      });

      const uploaded = await sendTelegramDocument(token, {
        bytes: data,
        fileName,
        caption,
      });

      return {
        index,
        messageId: uploaded.messageId,
        fileId: uploaded.fileId,
        size: data.byteLength,
        botIndex,
      } satisfies StoredChunk;
    },

    async getChunkStream(fileId: string, botIndex: number = 0) {
      // Prefer the bot that stored the chunk; fallback to any bot that can serve it.
      const tryOrder = [pool[botIndex] ?? primary, ...pool.filter((_, i) => i !== botIndex)].filter(Boolean);
      let lastError: unknown = null;
      for (const token of tryOrder) {
        try {
          const file = await telegramCall<{ file_path?: string; file_size?: number }>(token, 'getFile', {
            query: { file_id: fileId },
          });

          if (!file.file_path) {
            throw new TelegramError(
              'Telegram did not return a download path (files above the 20 MB Bot API limit cannot be downloaded).',
            );
          }

          const response = await fetchWithTimeout(
            `https://api.telegram.org/file/bot${token}/${file.file_path}`, { cache: 'no-store' }, TELEGRAM_TIMEOUT_MS,
          );

          if (!response.ok || !response.body) {
            throw new TelegramError(
              `Telegram download failed (HTTP ${response.status}).`,
            );
          }

          return { stream: response.body, size: file.file_size ?? null };
        } catch (e) {
          lastError = e;
          if (e instanceof TelegramError && e.status === 401) break;
        }
      }
      throw lastError instanceof Error ? lastError : new TelegramError('Chunk fetch failed on all bots');
    },

    async writeSidecar({ fileName, caption, content, existingMessageId }) {
      const bytes = encoder.encode(content);
      if (existingMessageId && existingMessageId > 0) {
        // Edit: try primary first, fallback to other bots (rarely needed but resilient)
        for (const token of pool) {
          try {
            return await editTelegramDocument(token, {
              messageId: existingMessageId,
              bytes,
              fileName,
              caption,
              mimeType: 'application/json',
            });
          } catch (error) {
            // If edit fails because message not owned by this bot, try sending a new document
            if (pool.length > 1 && pool.indexOf(token) < pool.length - 1) continue;
            console.warn(
              '[tellynas] could not edit sidecar message in-place, sending replacement',
              existingMessageId,
              error,
            );
          }
        }
      }

      // Fallback: send as new document via primary, if fails try others
      return tryEachBot(pool, (token) =>
        sendTelegramDocument(token, {
          bytes,
          fileName,
          caption,
          mimeType: 'application/json',
        }),
      );
    },

    async readSidecarText(fileId) {
      // Sidecars are written via primary but may be readable from any bot
      return tryEachBot(pool, (token) => downloadTelegramText(token, fileId)).catch(() => null);
    },

    async readDirectory(): Promise<{
      directory: StorageDirectory | null;
      messageId: number | null;
      standaloneSidecar?: SidecarRecord | null;
    }> {
      const chat = await tryEachBot(pool, (token) =>
        telegramCall<TelegramChatInfo>(token, 'getChat', {
          query: { chat_id: appConfig.telegramChatId },
        }),
      );

      const pinned = chat.pinned_message;
      if (!pinned?.document?.file_id) {
        return { directory: null, messageId: null };
      }

      const fromCaption = parseDirectoryCaption(pinned.caption);
      if (fromCaption) {
        return { directory: fromCaption, messageId: pinned.message_id };
      }

      // Pinned document content may be readable from any bot – try in order
      let text: string | null = null;
      for (const token of pool) {
        try {
          text = await downloadTelegramText(token, pinned.document.file_id);
          if (text) break;
        } catch {
          continue;
        }
      }
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
        for (const token of pool) {
          try {
            const edited = await editTelegramDocument(token, {
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
            break; // fallback to creating new
          }
        }
      }

      const created = await tryEachBot(pool, (token) =>
        sendTelegramDocument(token, {
          bytes,
          fileName: DIRECTORY_FILENAME,
          caption: serialized.caption,
          mimeType: 'application/json',
        }),
      );

      // Pin must be done by the bot that sent the message; find its token
      // tryEachBot returns unknown creator; instead try each token to pin until one succeeds
      let pinError: unknown = null;
      for (const token of pool) {
        try {
          await telegramCall<boolean>(token, 'pinChatMessage', {
            query: {
              chat_id: appConfig.telegramChatId,
              message_id: created.messageId,
              disable_notification: true,
            },
          });
          pinError = null;
          break;
        } catch (error) {
          pinError = error;
          // Pin may fail on wrong bot (400: not found) – try next
          if (error instanceof TelegramError && /chat not found|message to pin not found/i.test((error as Error).message)) {
            continue;
          }
          // For permissions error, surface immediately with guidance
          if (error instanceof TelegramError && error.status === 403) throw error;
        }
      }
      if (pinError) {
        // Non-fatal: directory is still written, just not pinned – library can still be discovered via fallback?
        // But we should surface a warning; don't throw if pin is the only failure for resilience.
        console.warn('[tellynas] pinChatMessage failed on all bots', pinError);
        // Re-throw with helpful message only if it's a permission issue
        if (pinError instanceof TelegramError && pinError.status === 403) throw pinError;
      }

      return { messageId: created.messageId, fileId: created.fileId };
    },

    async deleteMessages(messageIds) {
      const uniqueIds = [...new Set(messageIds.filter((id) => Number.isFinite(id) && id > 0))];
      await Promise.all(
        uniqueIds.map(async (id) => {
          // Try each bot until one can delete
          for (const token of pool) {
            try {
              await telegramCall(token, 'deleteMessage', {
                query: { chat_id: appConfig.telegramChatId, message_id: id },
              });
              return;
            } catch (error) {
              if (error instanceof TelegramError && /message to delete not found/i.test((error as Error).message)) return;
              // try next bot
            }
          }
          console.warn('[tellynas] deleteMessage failed on all bots', id);
        }),
      );
    },

    async checkConnection() {
      const meResults = await Promise.allSettled(
        pool.map((token) =>
          telegramCall<{ username?: string; first_name?: string }>(token, 'getMe').then(
            (me) => ({ ok: true, detail: `Connected as @${me.username || me.first_name || 'bot'}` }),
            (error) => ({ ok: false, detail: (error as Error).message }),
          ),
        ),
      );

      const okCount = meResults.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
      const meDetail = meResults
        .filter((r) => r.status === 'fulfilled')
        .map((r) => (r as PromiseFulfilledResult<{ ok: boolean; detail: string }>).value.detail)
        .join(' | ');

      // If no bots pass getMe, no need to check chat
      if (okCount === 0) {
        return {
          ok: false,
          detail: `0/${pool.length} bots online — ${meDetail || 'check tokens'}. Fix TELEGRAM_BOT_TOKEN(S) and redeploy.`,
        };
      }

      // Also verify chat access with the first healthy bot
      let chatOk = true;
      let chatDetail = '';
      try {
        const healthyToken = pool[meResults.findIndex((r) => r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ ok: boolean }>).value.ok)] ?? 0;
        const chat = await telegramCall<TelegramChatInfo>(healthyToken, 'getChat', {
          query: { chat_id: appConfig.telegramChatId },
        });
        if (chat.pinned_message) {
          chatDetail = 'chat reachable, pin present';
        } else {
          chatDetail = 'chat reachable (no pin yet — first upload will create it)';
        }
      } catch (e) {
        chatOk = false;
        chatDetail = `chat check failed: ${(e as Error).message}`;
      }

      const ok = okCount > 0 && chatOk;
      return {
        ok,
        detail: ok
          ? `${okCount}/${pool.length} bots online • ${chatDetail}`
          : `${okCount}/${pool.length} bots online but ${chatDetail}`,
      };
    },
  };

  return telegramDriver;
}

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
      botIndex: 0,
    } satisfies StoredChunk;
  },

  async getChunkStream(fileId, _botIndex = 0) {
    const data = demoStorageState().blobs.get(fileId);
    if (!data) return { stream: new Blob([new Uint8Array()]).stream(), size: 0 };
    return { stream: new Blob([data as BlobPart]).stream(), size: data.byteLength };
  },

  async writeSidecar({ fileName, caption, content, existingMessageId }) {
    return storeDemoDocument({
      bytes: encoder.encode(content),
      fileName,
      caption,
      existingMessageId: existingMessageId ?? undefined,
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
  return useDemoDriver() ? demoDriver : createTelegramDriver(appConfig.botTokens);
}
