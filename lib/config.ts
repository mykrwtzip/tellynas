/**
 * Central configuration. Every environment variable is read here (and only here)
 * so the rest of the code can stay declarative.
 */

const truthy = (value?: string) =>
  !!value && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** True on Vercel / other FaaS hosts: read-only disk, ~4.5 MB request bodies. */
const serverless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY,
);

/**
 * Vercel rejects request bodies above 4.5 MB before the handler runs, so the
 * chunk size is capped there unless the operator deliberately overrides it.
 */
const DEFAULT_CHUNK_MB = serverless ? 4 : 8;
const rawChunkMb = num(process.env.TELEGRAM_CHUNK_MB, DEFAULT_CHUNK_MB);
const maxChunkMb = serverless ? Math.min(rawChunkMb, 4) : Math.min(rawChunkMb, 19);

export const appConfig = {
  telegramToken: (process.env.TELEGRAM_BOT_TOKEN || '').trim(),
  telegramChatId: (process.env.TELEGRAM_CHAT_ID || '').trim(),
  appUsername: (process.env.APP_USERNAME || 'admin').trim(),
  appPassword: process.env.APP_PASSWORD || 'changeme',
  authSecret:
    process.env.AUTH_SECRET ||
    `${process.env.APP_PASSWORD || 'changeme'}::tellynas::session`,
  /** Enable the in-memory demo driver (simulated storage, no Telegram needed). */
  demoMode: truthy(process.env.DEMO_MODE),
  /** Max bytes sent to Telegram per chunk. getFile() only works up to 20 MB. */
  chunkSize: maxChunkMb * 1024 * 1024,
  /** Host without a writable, persistent filesystem. */
  serverless,
  /** Optional Upstash Redis REST credentials for the file index. */
  redisUrl: process.env.UPSTASH_REDIS_REST_URL || '',
  redisToken: process.env.UPSTASH_REDIS_REST_TOKEN || '',
};

export const isTelegramConfigured = () =>
  appConfig.telegramToken.length > 0 && appConfig.telegramChatId.length > 0;

/** Demo mode is explicit, or the automatic fallback when Telegram is missing. */
export const useDemoDriver = () =>
  appConfig.demoMode || !isTelegramConfigured();

export const missingEnvVars = () => {
  const missing: string[] = [];
  if (!appConfig.telegramToken) missing.push('TELEGRAM_BOT_TOKEN');
  if (!appConfig.telegramChatId) missing.push('TELEGRAM_CHAT_ID');
  return missing;
};

/** Public, safe-to-expose runtime info for the UI. */
export const publicRuntimeConfig = () => ({
  demo: useDemoDriver(),
  serverless,
  telegramConfigured: isTelegramConfigured(),
  missingEnv: missingEnvVars(),
  chunkSize: appConfig.chunkSize,
  // Never leak the real password — only whether the default is still in use.
  usingDefaultPassword: appConfig.appPassword === 'changeme',
  defaultUsername: appConfig.appUsername,
});
