# Tellynas

Your files, stored on Telegram. Tellynas turns a private Telegram chat into an
unlimited personal drive with a modern web UI.

Rebuilt from scratch with **Next.js 15 (App Router)**, **React 19**, **TypeScript**
and **Tailwind CSS v4** — replacing the previous static HTML/CSS/JS frontend and the
Vercel-only API handlers.

![stack](https://img.shields.io/badge/Next.js-15-black) ![stack](https://img.shields.io/badge/React-19-149eca) ![stack](https://img.shields.io/badge/Tailwind-4-38bdf8) ![stack](https://img.shields.io/badge/TypeScript-5-3178c6)

---

## What the app does

- **Chunked uploads** — files are split into `TELEGRAM_CHUNK_MB` slices and each slice
  is saved as a document in your chat, so there is no 50 MB cap.
- **Drag & drop queue** — concurrent uploads (2 at a time) with per-file progress,
  retry, cancel and clear.
- **Folders, search, sort, views** — nested folders, instant client-side search,
  starred files, recent uploads, grid/list layouts.
- **Preview lightbox** — images, video (with range requests / seeking), audio, PDF,
  and text/code files, with keyboard navigation.
- **File actions** — rename, move, star, download, multi-select bulk actions, delete.
- **Settings panel** — live Telegram connection status, chunk size, index backend,
  theme switch, signed-out flow.
- **Auth** — single-user login with an HMAC-signed, httpOnly session cookie,
  constant-time credential comparison and a login attempt throttle.
- **Demo mode** — runs with seeded sample files when Telegram is not configured, so
  the interface is fully explorable out of the box.
- **Dark and light themes**, responsive down to mobile, reduced-motion aware.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your values
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | for real storage | Bot token from [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | for real storage | Private chat id that stores the files (send `/start` to your bot first) |
| `APP_USERNAME` | no | Login user (default `admin`) |
| `APP_PASSWORD` | **yes** | Login password (default `changeme` — change it) |
| `AUTH_SECRET` | recommended | Random string used to sign session cookies |
| `TELEGRAM_CHUNK_MB` | no | Chunk size in MB, `1`–`19` (default `8`) |
| `DEMO_MODE` | no | `true` forces the in-memory demo driver |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | no | Redis-backed file index for serverless hosts |
| `INDEX_FILE_PATH`-style file backend | — | Without Redis a JSON index is written to `.data/index.json` |

## Architecture

```
app/
  layout.tsx                 shell, theme bootstrap, providers
  page.tsx                   authenticated drive (server component)
  login/page.tsx             sign-in screen
  api/
    auth/{login,logout,session}/route.ts
    files/route.ts           list library (?all=1 = everything)
    files/upload/route.ts    receive one chunk → Telegram
    files/finalize/route.ts  commit chunk list into a file record
    files/[id]/route.ts      read / rename / move / star / delete
    files/[id]/download/route.ts   stream all chunks as one download
    files/[id]/preview/route.ts    inline stream with HTTP Range support
    folders/route.ts         create / rename / recursive delete
    stats/route.ts           library counters
    system/route.ts          live driver health check
components/
  dashboard/*                sidebar, file grid/list, preview, upload queue, dialogs
  ui.tsx, toast.tsx, theme.tsx
lib/
  driver.ts                  Telegram Bot API driver + in-memory demo driver
  store.ts                   file index (Redis / JSON file / memory)
  stream.ts                  chunk concatenation + Range parsing
  auth.ts, config.ts, api.ts, use-library.ts, use-uploads.ts, client-api.ts
```

### How access control works

There is intentionally **no `middleware.ts`**. Every server entry point checks the
session itself:

- `app/page.tsx` → `getSession()` + `redirect('/login')`
- every protected route handler → `requireSession()` → `401 { error }`
- `app/login/page.tsx` → redirects to `/` when a valid session already exists

Route handlers run on the Node.js runtime, which avoids Edge-runtime middlewares
entirely. (An Edge middleware that even *imports* a shared module touching
`atob`/`btoa`/`Buffer` can fail to boot and turn the whole deployment into
`500 MIDDLEWARE_INVOCATION_FAILED` — this is what happened in the first
deployment of the rewrite.)

### Health check

`GET /api/health` is public and returns runtime details without touching the
network — handy for uptime monitors and for confirming a fresh Vercel deploy:

```json
{
  "status": "ok",
  "runtime": { "node": "v22.x", "environment": "production", "vercel": true },
  "storage": {
    "driver": "telegram",
    "telegramConfigured": true,
    "indexBackend": "redis",
    "indexPersistent": true,
    "serverless": true,
    "chunkSizeMb": 4
  },
  "config": { "usingDefaultPassword": false, "hasAuthSecret": true }
}
```

### Why a separate index?

The Telegram Bot API cannot read chat history, so the previous `getChatHistory`
call could never work. Tellynas keeps its own index of uploaded chunks
(message id + `file_id` per slice) and uses `getFile` on those `file_id`s for
downloads. Choose the index backend for your host:

- **Self-hosted / Docker** → JSON file at `.data/index.json` (default)
- **Vercel / serverless** → Upstash Redis REST (set both `UPSTASH_REDIS_REST_*` vars)
- **Demo, or a read-only host** → in-memory

The backend is resolved at runtime: serverless hosts (detected via `VERCEL`,
`AWS_LAMBDA_FUNCTION_NAME` or `NETLIFY`) — and any host where writing `.data/`
fails (`EROFS`, `EACCES`, …) — automatically degrade to an in-memory index
instead of throwing on every upload. The UI shows a **Not persistent** warning
whenever that happens, because the list then resets when the instance restarts
(the files themselves stay in Telegram).

### Chunk size

`TELEGRAM_CHUNK_MB` is clamped automatically: **4 MB** on serverless hosts
(Vercel rejects bodies above ~4.5 MB before the handler runs) and **19 MB**
elsewhere (the Bot API `getFile` ceiling).

### Notes and limits

- The Bot API can only download files up to **20 MB** per chunk, which is why the
  default chunk size is 8 MB.
- Vercel caps request bodies at ~4.5 MB; keep `TELEGRAM_CHUNK_MB` at `4` or lower
  there, or self-host.
- Deleting a file removes the Telegram messages holding its chunks.

## Deployment

**Vercel**

1. Import the repository — `vercel.json` pins the framework preset to **Next.js**.
2. Add the environment variables above (including Upstash Redis for persistence).
3. Deploy, then sign in at `/login`.

The serverless filesystem is read-only, so with no Redis configured the index
falls back to in-memory storage and resets when the instance restarts. Set
`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` on Vercel to keep it.
Chunk size is clamped to 4 MB there automatically (Vercel caps bodies at ~4.5 MB).

**Self-hosted**

```bash
npm ci && npm run build && npm start   # serves on :3000
```

Mount a volume for `.data/` if you use the JSON index backend.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | TypeScript checks |
| `npm run lint` | ESLint (if configured) |
