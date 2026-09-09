# Moodboard

A local-first infinite canvas for images, notes, and color studies. The interaction and restraint are modeled after Devouring Details' mood page: a transformable canvas, frameless media, and one small bottom dock.

The app keeps an account-scoped IndexedDB backup and syncs through either a self-hosted Effect v4/Bun server or Cloudflare. Both targets use authenticated streaming HTTP RPC. Bun isolates each account in its own SQLite database and media directory; Cloudflare isolates each account in its own Durable Object.

## Development

This package was imported from https://github.com/jackwatters45/mood-board at commit `a70ceb7`. It uses the root Bun workspace, lockfile, and `alchemy.run.ts`. Effect and its adapters use `4.0.0-rc.112`, matching the root Alchemy `2.0.0-beta.76` setup.

From the repository root, install dependencies, copy the environment template, provide Cloudflare credentials, and start the local Alchemy stack:

```bash
bun install
cp .env.example .env
bun run dev
```

`bun run build` and `bun run typecheck` at the root include this package. Run the remaining package commands below from `packages/mood-board`.

Open `http://localhost:8787`. Both root and package dev commands start the root Alchemy stack, including the other sites. Alchemy runs Vite and the Cloudflare services locally, with state under the root `.alchemy` directory. The browser keeps its account-scoped IndexedDB backup. Both survive normal development restarts. Magic links are printed in the Alchemy log during local development.

Signed-out visitors can bypass account creation at `/demo`. The guest demo keeps one example board and locally added images entirely in IndexedDB, never starts private RPC, and cannot call owner media routes. Hosted audio, Spotify, YouTube, direct image URLs, basic website links, X references, notes, and colors remain available. Guest boards are specific to that browser and can disappear when site data is cleared; JSON export is the backup path. Signing in opens the separate server-backed private board library and does not silently claim guest data.

Type checking uses the TypeScript 7 native preview compiler (`tsgo`). Oxlint and Oxfmt are the only linting and formatting tools:

```bash
bun run typecheck
bun run lint
bun run format
bun run fix
```

## Optional self-hosted Bun target

The Cloudflare/Alchemy stack is the primary deployment. To run the alternative single-process Bun target, build the React app and start the server directly:

```bash
bun run build
NODE_ENV=production bun src/server/main.ts
```

The server serves `dist/`, stores Better Auth users, sessions, and public-route locators at `data/mood-board-auth.sqlite`, and creates one private workspace under `WORKSPACE_PATH/<sha256-user-id>/` per account. Each workspace contains `workspace.sqlite` plus its managed media. `DB_PATH` and `MEDIA_PATH` remain the explicit legacy-public workspace used only for pre-account publication migration.

Optional server runtime variables:

```bash
PORT=3000 HOST=0.0.0.0 \
  AUTH_DB_PATH=data/mood-board-auth.sqlite \
  WORKSPACE_PATH=data/mood-board.sqlite.workspaces \
  DB_PATH=data/mood-board.sqlite MEDIA_PATH=data/media \
  NODE_ENV=production bun src/server/main.ts
# Required in production: BETTER_AUTH_SECRET and the canonical BETTER_AUTH_URL.
# Optional Google OAuth: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
# Production magic links: RESEND_API_KEY and EMAIL_SENDER.
# Optional positive-integer guardrail overrides:
# MEDIA_UPLOADS_PER_HOUR=180 MEDIA_UPLOAD_BYTES_PER_DAY=268435456
# MEDIA_STORAGE_BYTES=1073741824 MEDIA_RESERVATION_TTL_MS=600000
```

Authenticated RPC is same-origin only. Back up `AUTH_DB_PATH`, the complete `WORKSPACE_PATH` tree, and any configured legacy `DB_PATH`/`MEDIA_PATH`, including SQLite WAL files. Managed-media metadata without its workspace media directory is incomplete. The current real-time design intentionally supports one Bun server process; horizontal replicas would require a distributed event bus and workspace lifecycle coordination.

Existing pre-account data is never assigned to the first person who signs in. To make one known Better Auth user the explicit owner of the old Bun `DB_PATH`/`MEDIA_PATH` or Cloudflare `public-preview` Durable Object, set `LEGACY_WORKSPACE_OWNER_ID` to that immutable user id before starting/deploying. Back up first and keep the value stable; remove it only after deliberately copying that workspace into the normal per-account location.

Uploaded files that never become board references, including interrupted imports, enter a 30-day grace period. An authenticated operator can reclaim at most 50 eligible or retry-pending objects per call:

```bash
curl -X POST \
  -H 'origin: https://board.example.com' \
  -H 'cookie: better-auth.session_token=<session-cookie>' \
  -H 'x-media-cleanup: confirm' \
  'https://board.example.com/api/owner/media/cleanup?olderThanDays=30'
```

The owner endpoint requires the caller's Better Auth session and only reaches that account's workspace. Each call is bounded to 50 candidates; deletion remains retryable if R2 or the filesystem is temporarily unavailable. Bun runs scoped Effect maintenance for loaded workspaces. Cloudflare's daily cron enumerates Better Auth users and invokes the private maintenance route for each account Durable Object, releasing expired reservations, pruning quota events, and processing bounded cleanup batches.

## Cloudflare / Alchemy target

The Cloudflare target keeps each account's authority inside a separate `WorkspaceDurableObject` selected exclusively from the authenticated Better Auth user id:

- Per-account Durable Object SQLite is authoritative for that account's boards, items, revisions, publications, media metadata, and mutation deduplication.
- One long-lived Effect runtime owns board-scoped PubSub channels for each object instance.
- Browser clients use Effect RPC over HTTP with NDJSON framing, so snapshots and changes stream before the response closes.
- D1 stores Better Auth users, sessions, encrypted OAuth credentials, hashed verification tokens, globally unique public handles/ids, and account-scoped board-directory projections. Expired sessions/tokens are pruned daily, and Cloudflare's native rate limiter caps magic-link requests by trusted connecting IP and normalized recipient.
- Static Vite assets and SPA fallback are served through the Worker assets binding.
- Managed image and audio bytes live in the private `MEDIA` R2 bucket under a Durable-Object-specific prefix. Private reads use authenticated `/api/owner/media/:mediaId` URLs with `private, no-store`. Public reads use publication-scoped URLs and are allowed only while that media is referenced by the requested published board.

Alchemy owns local development, D1 migrations, bindings, builds, deployment, and teardown.

Copy the root `.env.example` to the root `.env` and provide:

- `CLOUDFLARE_ACCOUNT_ID`
- a `CLOUDFLARE_API_TOKEN` with Workers Scripts, D1, Workers R2 Storage, and Secrets Store edit permissions
- `BETTER_AUTH_SECRET`, a stable random value of at least 32 characters for production
- `RESEND_API_KEY` and `EMAIL_SENDER` for production magic-link delivery; Google credentials are optional

Production is fixed to `https://moodboard.jackwatters.dev`; local Alchemy development uses `http://localhost:8787`. Better Auth is the server-workspace authorization boundary: unauthenticated callers cannot reach board RPC, website previews, uploads, cleanup, or private media. The browser-only guest demo, public profiles, published boards, publication-scoped media, login, assets, and health remain anonymous.

Inspect and deploy all sites from the repository root:

```bash
bun alchemy plan --stage prod
bun run deploy --stage prod
```

### Repository deployment

CI deploys all sites through the root `portfolio-site` Alchemy stack after checks pass on `main`. The mood board gets fresh D1, R2, Worker, and Durable Object resources. No data or state is imported from the old `MoodBoard` stack. Production keeps `https://moodboard.jackwatters.dev`; workers.dev and version preview URLs stay disabled.

Before the first production deployment:

1. Remove the disposable `MoodBoard/prod` stack through the old repository's Alchemy setup. This deletes its old data and releases the custom domain. Do not run this repository's root destroy command: that would delete all sites.
2. Add `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, and `EMAIL_SENDER` to this repository's GitHub secrets. Use a random auth secret with at least 32 characters.
3. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` if Google sign-in is required. The callback remains `https://moodboard.jackwatters.dev/api/auth/callback/google`.
4. Verify the existing Cloudflare token can manage D1, R2, Workers, domains, and Secrets Store. Set `MOOD_BOARD_TRUSTED_ORIGINS` as a repository variable only if additional origins are needed.

The workflow fails before deployment if required mood board secrets are absent. Stop deploying from the old repository after the switch. Builds and tests do not delete cloud resources or deploy the stack.

New local images and local audio are uploaded as managed media rather than embedded SQLite strings: Cloudflare stores account-prefixed bytes in private R2, while Bun stores them inside the selected account directory below `WORKSPACE_PATH`. Existing hosted URLs and legacy `data:image/*` boards remain readable. Upload metadata uses pending/ready states, and deletion keeps a retryable tombstone until object removal succeeds, so interrupted writes and deletes remain discoverable. Streaming HTTP still keeps the Durable Object active; hibernatable WebSockets can be considered after the protocol boundary is stable.

The Bun SQLite/filesystem deployment and Cloudflare Durable Object/R2 deployment are separate authorities. Building for Cloudflare does not automatically migrate either authority; use the portable `.moodboard` archive flow for boards with managed media.

## What works

- Trackpad/wheel pan and cursor-centered Cmd/Ctrl + wheel zoom
- Mouse/touch drag, pinch zoom, zoom buttons, and fit-to-board
- One-step single-image adds plus staged multi-file/folder intake, drag/drop, clipboard paste, image annotations, and one unified link flow for direct images, Instagram post/Reel covers, X post/video references, and website cards
- Local contact-sheet review with loose-grid, contact-sheet, or masonry placement as one undo step
- Notes, curated and custom hex color swatches, per-board color or managed-image backgrounds, Open Graph website cards, hosted or uploaded local audio cards, and automatically loaded Spotify and YouTube players
- Move, resize, duplicate, layer, delete, undo, and redo across every canvas card
- IndexedDB autosave and a durable pending-mutation outbox for offline edits
- SQLite persistence through a self-hosted Effect v4 server
- Multiple route-addressable boards with create, switch, duplicate, and delete controls
- Automatic cross-tab updates through Effect RPC and board-scoped PubSub
- Portable binary `.moodboard` archives with deduplicated managed media, plus legacy `.moodboard.json` import/export for boards without managed media
- Minimal presentation mode with hover details and animated, full-image viewing
- Required Better Auth workspace access with Google or email magic-link sign-in
- Private-by-default publisher profile and explicitly published read-only boards

## Managed media and portable files

Single-device images, board background images, and selected bulk images are header-checked before raster decoding, limited to 30 MiB, 10,000 pixels per axis, and 64 megapixels, then resized to at most a 2,200-pixel longest edge and encoded as WebP when appropriate. Signature-confirmed iPhone HEIC/HEIF/HIF photos use the browser's native decoder and have a tighter 50-megapixel ceiling, which admits Apple's typical 12, 24, and 48 MP photos without shipping a memory-heavy software HEVC decoder. Safari on current Apple devices provides the intended HEIC path; browsers without native HEIC support show a conversion message. Background images use viewport cover over the board's fallback color and remain fixed while the infinite canvas pans and zooms. Bulk staging uses a lightweight HEIC placeholder rather than decoding every unselected photo. Failed bulk entries stay visible and do not prevent successful selections from being placed in one board/undo operation. The server accepts only normalized image/audio MIME types, checks byte limits and file signatures, and serves private same-origin media with authenticated range support and no shared caching. Hosted image/audio URLs and older embedded `data:image/*` items remain compatible; audio data/blob URLs are always rejected.

A board with managed media downloads as a versioned binary `.moodboard` ZIP. Its manifest maps logical media references to deduplicated binary entries instead of treating deployment-specific IDs as portable; legacy embedded images on a mixed board are converted into deduplicated archive entries too. Import validates archive paths, duplicate/missing entries, counts, a 50 MB compressed/expanded envelope, MIME/signature agreement, per-file SHA-256 integrity, and references before uploading each asset once. IDs are remapped to the destination deployment, and the current board is replaced only after every upload succeeds. A board without managed media continues to use human-readable `.moodboard.json`, including legacy embedded images. Keep untrusted archive limits in place rather than extracting these files with general-purpose paths.

## Public publishing scope

Publishing remains an explicit operator action, but it now targets a specific Better Auth account workspace. No board is public unless an operator publishes it through the trusted Bun CLI. New, duplicated, and imported boards have no publication row and remain private. Public URLs use a separate 128-bit random id; unpublishing or deleting the board immediately revokes both the board and publication-scoped media URLs.

Configure a profile and publish a self-hosted account board using the immutable Better Auth user id:

```bash
export AUTH_DB_PATH=data/mood-board-auth.sqlite
export WORKSPACE_PATH=data/mood-board.sqlite.workspaces
bun scripts/bootstrap-publisher.ts profile --account-id <user-id> \
  --handle studio-notes --name "Studio Notes" --bio "Materials and rooms"

bun scripts/bootstrap-publisher.ts publish default --account-id <user-id>
bun scripts/bootstrap-publisher.ts unpublish default --account-id <user-id>
```

The public routes are `/@handle` and `/share/:publicId`. They load only `/api/public/*`; they do not start owner RPC, enumerate the catalog, open IndexedDB/outboxes, or install editing, import, drop, or paste controls. Public responses come from an authoritative SQLite join, omit board/item ids, revisions, mutation/client data, and use `Cache-Control: no-store`. The old anonymous Cloudflare `/api/catalog` endpoint now returns 404.

Cloudflare uses the same per-account publication tables and verifies every public read in the selected account Durable Object. D1's public-route directory is only a locator; stale entries fail closed when the workspace no longer confirms a publication. There is no browser or unauthenticated publishing-administration endpoint. Account display names and public publisher profiles remain separate.

Opaque public ids are unguessable locators, not secret-link authorization: published boards are world-readable. External images and hosted audio can reveal viewer IP addresses to their respective hosts; managed R2/filesystem media stays same-origin. Adding an X card opts that board into loading X’s official widget automatically for viewers; X can receive viewer IP and browser information or set third-party state despite the widget’s DNT option. A stored same-origin snapshot remains visible while the widget loads or when it fails. Legacy embedded-image boards remain supported, though new uploads use managed media. Open Graph board images are deferred rather than faked; honest social covers still require an image-rendering pipeline.

## Website card scope

Add any public HTTPS URL through **Add link**, or paste one directly. The same field accepts official X post embed snippets: it extracts only a strict X/Twitter status URL plus the recognized `data-media-max-width` media marker, then discards every pasted tag and script. Direct image URLs become image items. X status URLs become automatically loaded full-post references, while official embed code selects full-post or video/media format from its own markers. Automatic/light/dark themes are supported, full-post cards always hide the conversation thread, and oversized cards can visually scale the official widget up to 2× beyond X’s native width. The server makes a bounded, cached request to X’s public oEmbed endpoint when available and stores only sanitized author, handle, post text, and date fields for the unloaded/unavailable fallback; raw provider HTML and video bytes are never persisted, executed, downloaded, proxied, or rehosted. A failed metadata lookup still leaves a durable canonical X card with its normalized source retained in board data. Other links go through the owner RPC, which reads at most the bounded HTML head and returns a snapshot of the final URL, preview image URL, title, description, site label, and preferred layout. Public Instagram post and Reel URLs with usable Open Graph artwork become linked image references; no Instagram video is downloaded or embedded. Other pages become website cards. Editing a website or X card can refresh its snapshot; viewing a board never refetches snapshot metadata. Sites without usable metadata, sites that block preview clients, and non-HTML URLs fall back to a domain card.

Website cards are inert while editing and open in a protected new tab only during presentation or from a read-only public board. Remote preview images use `no-referrer` but still make a viewer-side request to the image host. The resolver accepts HTTPS only, bounds redirects/time/bytes, rejects credentials and custom ports, and blocks private, loopback, link-local, multicast, and reserved destinations. Bun pins a validated DNS result for each request; Cloudflare applies the same URL/redirect policy and enables the `global_fetch_strictly_public` compatibility flag so outbound fetches stay on public network paths.

Preview resolution is part of the authenticated owner RPC surface, not `/api/public/*`. Website cards do not add an anonymous metadata endpoint. Live iframes, JavaScript-rendered screenshots, archived pages, background refreshes, and R2 copies of preview images remain deferred.

## Audio scope

Audio cards accept a local MP3, M4A, WAV, Ogg, or WebM file up to 25 MiB, a direct hosted HTTPS audio URL, a supported Spotify track, album, playlist, episode, or show URL, or a common YouTube video URL. Local bytes are signature-checked and stored in Bun filesystem storage or private R2; cards persist only a `mediaId`. Adding a Spotify or YouTube card opts the board into loading the provider’s official player automatically for viewers. YouTube uses the privacy-enhanced `youtube-nocookie.com` player; neither provider path downloads or extracts audio, and nothing autoplays. Spotify uses its full 352-pixel player, while native audio cards keep a compact but readable control layout. Provider iframes and native controls are inert, bordered canvas objects while editing and become interactive in presentation/read-only mode. Cards do not add redundant external source links. Native, Spotify, and YouTube players coordinate within one browser tab so starting one pauses the others when the provider supports it, and leaving the board pauses playback.

YouTube remains a visible official player rather than an extracted audio stream; ads, login, Premium behavior, regional availability, and playback policy stay under YouTube’s control. Videos whose owners disable embedding retain the external-link fallback. Direct audio hosts can still expire URLs, reject cross-origin playback or range requests, and serve codecs the browser cannot play. Portable `.moodboard` archives include managed audio bytes, while hosted, Spotify, and YouTube cards keep their canonical source URLs. Audio data URLs, blob URLs, and browser-only object URLs never enter IndexedDB, the offline outbox, SQLite, Durable Object storage, or exports.

## Current collaboration model

The server is deliberately small: up to 100 boards, one process, and server-ordered last-write-wins changes. Boards have direct `/boards/:id` routes, while the permanent default board remains the safe fallback for stale or deleted links. Item movement and resizing stay local during the gesture and write once on pointer-up. Incoming remote changes clear local undo history rather than risking a whole-board overwrite.

Better Auth is the authorization boundary. Bun selects a hashed per-account filesystem workspace after validating the session; Cloudflare selects a per-account Durable Object after validating the session at the edge. A client cannot choose a workspace id. Private media, RPC, previews, imports, and cleanup remain inside that selected workspace. IndexedDB documents and durable offline outboxes are keyed by both immutable account id and board id, and legacy anonymous browser data is not silently assigned to the first account. Pending mutations are rebased onto that account board's next server snapshot and replayed in order. Same-field conflicts remain server-ordered last-write-wins. Bulk intake stages at most 150 files locally, creates privacy-stripped thumbnails, prepares and uploads selected images three at a time, reads EXIF `DateTimeOriginal`/`CreateDate` for capture sorting, and falls back to file modification time. Content-based duplicate detection, EXIF grouping, smart curation, and AI-assisted selection remain follow-up work.

Run the checks with:

```bash
bun run typecheck
bun run test
bun run test:e2e
bun run lint
bun run build
```
