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
  chunkSize: Math.min(num(process.env.TELEGRAM_CHUNK_MB, 8), 19) * 1024 * 1024,
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
  telegramConfigured: isTelegramConfigured(),
  missingEnv: missingEnvVars(),
  chunkSize: appConfig.chunkSize,
  // Never leak the real password — only whether the default is still in use.
  usingDefaultPassword: appConfig.appPassword === 'changeme',
  defaultUsername: appConfig.appUsername,
});
