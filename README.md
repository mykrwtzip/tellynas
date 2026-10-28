# Tellynas

Your files, stored on Telegram. Tellynas turns a private Telegram chat into an
unlimited personal drive with a modern web UI — using Telegram itself as the
single source of truth, with **no external database, no Redis, and no local index
cache**.

Built with **Next.js 15 (App Router)**, **React 19**, **TypeScript** and
**Tailwind CSS v4**.

![stack](https://img.shields.io/badge/Next.js-15-black) ![stack](https://img.shields.io/badge/React-19-149eca) ![stack](https://img.shields.io/badge/Tailwind-4-38bdf8) ![stack](https://img.shields.io/badge/TypeScript-5-3178c6)

---

## What the app does

- **Zero-database cloud storage** — files, folder structures, and sidecar metadata
  live directly in your Telegram chat. Sign in from a new device, redeploy on
  Vercel, or reinstall on a fresh server and your entire library appears
  automatically without re-uploading.
- **Large file uploads** — files are split into `TELEGRAM_CHUNK_MB` slices and
  streamed concurrently (2 at a time) with per-file progress, retry, and cancel.
- **Folders, search, sort, views** — nested folders, instant search, starred
  files, recent uploads, and grid/list layouts.
- **Preview lightbox** — images, video (with HTTP Range requests / seeking),
  audio, PDF, and text/code files, with keyboard navigation.
- **File actions** — rename, move, star, download, multi-select bulk actions,
  and delete.
- **Auth** — single-user login with an HMAC-signed, `httpOnly` session cookie,
  constant-time credential comparison, and a login attempt throttle.
- **Demo mode** — runs with seeded sample files when Telegram is not configured,
  so the interface is explorable out of the box.
- **Dark and light themes**, responsive down to mobile, reduced-motion aware.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, APP_PASSWORD
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | for real storage | Bot token from [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | for real storage | Private chat ID that stores the files (send `/start` to your bot first; if using a group/channel, grant the bot permission to pin and delete messages) |
| `APP_USERNAME` | no | Login user (default `admin`) |
| `APP_PASSWORD` | **yes** | Login password (default `changeme` — change it) |
| `AUTH_SECRET` | recommended | Random string used to sign session cookies |
| `TELEGRAM_CHUNK_MB` | no | Chunk size in MB, `1`–`19` (default `8`; clamped to `4` on serverless hosts) |
| `DEMO_MODE` | no | `true` forces the temporary demo driver |

No Redis, SQL database, or persistent local volume is needed on any host.

## Architecture

```
app/
  layout.tsx                       shell, theme bootstrap, providers
  page.tsx                         authenticated drive (server component)
  login/page.tsx                   sign-in screen
  api/
    auth/{login,logout,session}/   stateless HMAC session endpoints
    files/route.ts                 scan & list library (?all=1 = everything)
    files/upload/route.ts          upload one named slice with embedded caption metadata
    files/finalize/route.ts        write per-file sidecar metadata & register in storage
    files/[id]/route.ts            read / rename / move / star / delete via sidecar metadata
    files/[id]/download/route.ts   stream all chunks as one download
    files/[id]/preview/route.ts    inline stream with HTTP Range support
    folders/route.ts               create / rename / recursive delete folder sidecars
    stats/route.ts                 library counters
    system/route.ts                live storage connection check
    health/route.ts                public, network-free health probe
components/
  dashboard/*                      sidebar, file grid/list, preview, upload queue, dialogs
  ui.tsx, toast.tsx, theme.tsx
lib/
  metadata.ts                      meaningful naming, embedded captions & sidecar schemas
  driver.ts                        Telegram Bot API driver + simulated demo driver
  store.ts                         storage scanner, sidecar reconstructor & legacy migrator
  stream.ts                        chunk concatenation + HTTP Range parsing
  auth.ts, config.ts, api.ts, use-library.ts, use-uploads.ts, client-api.ts
```

## Storage, Metadata, and Recovery Mechanism

Tellynas uses the storage chat itself as the **single source of truth**. Nothing
is stored in an external database or cached on the application server.

### 1. Meaningful filenames and embedded chunk metadata

Every uploaded file (or slice of a multi-part file) is saved as a Telegram
document using a structured, human-meaningful filename:

- **Single-part file at root:** `Quarterly-Report.pdf`
- **Single-part file in a nested folder (`finance/2026`):** `finance__2026--Quarterly-Report.pdf`
- **Multi-part file (`videos/clip.mp4`, 3 slices):**
  `videos--clip.part001of003.mp4`, `videos--clip.part002of003.mp4`, `videos--clip.part003of003.mp4`

Each chunk message also carries structured `tellynas:chunk:v1` JSON metadata in
its caption (`name`, `folder`, `index`, `total`, `size`).

### 2. Per-file and per-folder sidecar metadata

When an upload finishes finalizing (or when a folder is created), Tellynas writes
a companion JSON sidecar document directly to the same Telegram chat:

- **File sidecar (`<folder>--<name>--<id>.tellynas.meta.json`):**
  Stores `schema: "tellynas.file.v1"`, `id`, `name`, `size`, `mime`, `folder`,
  `starred`, `createdAt`, `updatedAt`, and the ordered `chunks` array
  (`index`, `messageId`, `fileId`, `size`), plus compact `tellynas:file:v1`
  caption metadata.
- **Folder sidecar (`<folder>.tellynas.folder.json`):**
  Stores `schema: "tellynas.folder.v1"`, `path`, and `createdAt` so empty folders
  persist across devices and reinstalls.

Renaming, moving, or starring a file edits its `.tellynas.meta.json` sidecar
message in-place via `editMessageMedia`. Deleting a file or folder removes both
the data chunk messages and the corresponding sidecar message(s) via
`deleteMessage`.

### 3. Discovery, scanning, and cross-device recovery

Because the Telegram Bot API intentionally provides no `getChatHistory` or
wildcard document listing endpoint, Tellynas maintains a lightweight pinned
directory document (`_tellynas.directory.json`, `schema: "tellynas.directory.v1"`)
in the storage chat:

1. **Discovery (`getChat`):** Any Tellynas instance reads the chat's
   `pinned_message` via `getChat` to locate `_tellynas.directory.json` (which
   holds only the object pointers — `kind`, `id`/`path`, `messageId`, `fileId`,
   `fileName` — to the stored sidecar files). When updated, it is edited
   in-place via `editMessageMedia` so the chat stays clean with no repeated pin
   notifications.
2. **Reconstruction (sidecar scan):** Whenever the library index is needed,
   Tellynas scans the referenced `.tellynas.meta.json` and
   `.tellynas.folder.json` sidecars concurrently via `getFile`, reconstructs the
   file list and folder hierarchy on the fly, and derives any implicit ancestor
   folders from file paths. Single-file endpoints (`/api/files/[id]`,
   `/preview`, `/download`) resolve and read only that file's own sidecar.
3. **New devices & reinstalls:** Connecting a brand-new server, container, or
   Vercel deployment to the same `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
   immediately discovers the existing library — no manual export, backup file, or
   re-upload required.
4. **Legacy compatibility:** If an upgraded self-hosted instance detects a
   pre-existing `.data/index.json` file before any storage directory exists in
   Telegram, it automatically migrates every legacy file and folder record into
   Telegram sidecar metadata once and renames the old local file to
   `.data/index.json.migrated`.

### Access control

There is intentionally **no `middleware.ts`**. Every server entry point checks the
session itself on the Node.js runtime:

- `app/page.tsx` → `getSession()` + `redirect('/login')`
- every protected route handler → `requireSession()` → `401 { error }`
- `app/login/page.tsx` → redirects to `/` when a valid session already exists

### Health check

`GET /api/health` is public and returns runtime details without touching the
network:

```json
{
  "status": "ok",
  "app": "tellynas",
  "runtime": { "node": "v22.x", "environment": "production", "vercel": true },
  "storage": {
    "driver": "telegram",
    "telegramConfigured": true,
    "persistent": true,
    "serverless": true,
    "chunkSizeMb": 4
  },
  "config": { "usingDefaultPassword": false, "hasAuthSecret": true }
}
```

### Limits

- The Telegram Bot API downloads individual documents up to **20 MB**, so
  `TELEGRAM_CHUNK_MB` is clamped to `19` MB on standard servers (default `8` MB)
  and `4` MB on serverless platforms (where request bodies cap around ~4.5 MB).

## Deployment

**Vercel / Serverless**

1. Import the repository (`vercel.json` pins the framework preset to **Next.js**).
2. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `APP_USERNAME`, `APP_PASSWORD`,
   and `AUTH_SECRET`.
3. Deploy and sign in at `/login`.

**Self-hosted**

```bash
npm ci && npm run build && npm start   # serves on :3000
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | TypeScript checks |
| `npm run lint` | ESLint (if configured) |
