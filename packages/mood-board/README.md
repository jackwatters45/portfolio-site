# Moodboard

A local-first infinite canvas for images, notes, and color studies. The interaction and restraint are modeled after Devouring Details' mood page: a transformable canvas, frameless media, and one small bottom dock.

The app keeps an account-scoped IndexedDB backup and syncs through authenticated streaming HTTP RPC to Cloudflare. Each account has its own SQLite-backed Durable Object and private R2 media prefix. Bun remains the workspace package manager and command runner, not an application server.

## Development

This package was imported from https://github.com/jackwatters45/mood-board at commit `a70ceb7`. It uses the root Bun workspace, lockfile, and `alchemy.run.ts`. Package resources live in `packages/mood-board/alchemy.run.ts`, which the root stack imports. It is not a separate stack. Effect and its adapters use `4.0.0-rc.117`, matching the root Alchemy `2.0.0-beta.79` setup.

From the repository root, install dependencies, copy the environment template, provide Cloudflare credentials, and start the local Alchemy stack:

```bash
bun install
cp .env.example .env
bun run dev
```

`bun run build` and `bun run typecheck` at the root include this package. Run the remaining package commands below from `packages/mood-board`.

Open `http://localhost:8787`. Both root and package dev commands start the root Alchemy stack, including the other sites. Alchemy runs Vite and the Cloudflare services locally, with state under the root `.alchemy` directory. The browser keeps its account-scoped IndexedDB backup. Both survive normal development restarts. Magic links are printed in the Alchemy log during local development.

Signed-out visitors can bypass account creation at `/demo`. The guest demo keeps one example board and locally added images entirely in IndexedDB, never starts private RPC, and cannot call owner media routes. Hosted audio, Spotify, YouTube, direct image URLs, basic website links, X references, notes, and colors remain available. Guest boards are specific to that browser and can disappear when site data is cleared; Archive export is the backup path. Signing in opens the separate server-backed private board library and does not silently claim guest data.

One package `tsconfig.json` checks the browser, Cloudflare worker, and tests. It inherits shared settings from the root config. Lint, format, and ignore rules also live at the root; the package has no separate tool configs.

Run these commands from the repository root:

```bash
bun run typecheck
bun run lint
bun run format:check
bun run format
```

The root lint config has mood-board-only exceptions for Effect service `use` methods and existing canvas markup. Formatting follows the unchanged root formatter config, including generated routes.

## Code layout

- `src/client/board/`: board creation, camera, colors, archives, local storage, and synchronization.
- `src/client/media/`: image processing, uploads, media URLs, playback, and embeds.
- `src/lib/`: definitions shared by browser and server code.
- `src/server/`: board, media, authentication, and publishing logic.
- `src/cloudflare/`: Cloudflare adapters and the Worker entry point.
- `src/components/` and `src/routes/`: React rendering and routes.

The editor uses two scoped Effect services:

- `board-document.ts` owns document state, camera state, history, local saves, synchronization, and the board catalog.
- `board-transfers.ts` owns cancellable image, background, audio, archive, and dropped-file operations.

`board-editor-state.ts` connects the document service to React through Effect atoms. `board-file-intake.ts` binds transfer atoms to file inputs, progress, and bulk placement. `board-editor.tsx` keeps canvas gestures, selection, panels, and rendering. Service scopes close when the account or board changes, not during valid-session revalidation.

These services reuse the existing storage, synchronization, archive, image-processing, and bulk-layout modules. Archive validation and file limits remain unchanged.

## Media cleanup

Uploaded files that never become board references, including interrupted imports, enter a 30-day grace period. An authenticated operator can reclaim at most 50 eligible or retry-pending objects per call:

```bash
curl -X POST \
  -H 'origin: https://board.example.com' \
  -H 'cookie: better-auth.session_token=<session-cookie>' \
  -H 'x-media-cleanup: confirm' \
  'https://board.example.com/api/owner/media/cleanup?olderThanDays=30'
```

The owner endpoint requires the caller's Better Auth session and only reaches that account's workspace. Each call is bounded to 50 candidates; deletion remains retryable if R2 is temporarily unavailable. Cloudflare's daily cron enumerates Better Auth users and invokes the private maintenance route for each account Durable Object, releasing expired reservations, pruning quota events, and processing bounded cleanup batches.

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

1. Securely copy the production values from the original mood-board project before removing its resources: `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_SENDER`, and any Google credentials. Use the original secret store or authorized local environment; GitHub Actions cannot reveal stored secret values. Do not put secrets in commits, logs, or PR comments. Never use the example development secret in production.
2. Decide whether to use Infisical before the cutover. If adopted, create a production environment, import the existing values, and configure scoped CI access. Update the workflow to retrieve them before deployment. Infisical is not configured by this PR; the current workflow reads GitHub secrets.
3. If keeping the current workflow, add those existing values to this repository's GitHub secrets. The Google callback remains `https://moodboard.jackwatters.dev/api/auth/callback/google`.
4. Verify the existing Cloudflare token can manage D1, R2, Workers, domains, and Secrets Store. Set `MOOD_BOARD_TRUSTED_ORIGINS` as a repository variable only if additional origins are needed.
5. After credentials are secured and deployment is ready, remove the disposable `MoodBoard/prod` stack through the old repository's Alchemy setup. This deletes its old data and releases the custom domain. Do not run this repository's root destroy command: that would delete all sites.

The workflow fails before deployment if required mood board secrets are absent. Stop deploying from the old repository after the switch. Builds and tests do not delete cloud resources or deploy the stack.

New local images and local audio are uploaded as managed media rather than embedded SQLite strings: Cloudflare stores account-prefixed bytes in private R2. Hosted URLs remain supported. The browser-only guest demo stores its local images as embedded image data. Upload metadata uses pending/ready states, and deletion keeps a retryable tombstone until object removal succeeds, so interrupted writes and deletes remain discoverable. Streaming HTTP still keeps the Durable Object active; hibernatable WebSockets can be considered after the protocol boundary is stable.

Use portable `.moodboard` archives to move boards and their media between deployments. Local Alchemy state remains separate from production.

## What works

- Trackpad/wheel pan and cursor-centered Cmd/Ctrl + wheel zoom
- Mouse/touch drag, pinch zoom, zoom buttons, and fit-to-board
- One-step single-image adds plus staged multi-file/folder intake, drag/drop, clipboard paste, image annotations, and one unified link flow for direct images, Instagram post/Reel covers, X post/video references, and website cards
- Local contact-sheet review with loose-grid, contact-sheet, or masonry placement as one undo step
- Notes, curated and custom hex color swatches, per-board color or managed-image backgrounds, Open Graph website cards, hosted or uploaded local audio cards, and automatically loaded Spotify and YouTube players
- Move, resize, duplicate, layer, delete, undo, and redo across every canvas card
- IndexedDB autosave and a durable pending-mutation outbox for offline edits
- SQLite persistence in account-specific Cloudflare Durable Objects
- Multiple route-addressable boards with create, switch, duplicate, and delete controls
- Automatic cross-tab updates through Effect RPC and board-scoped PubSub
- One portable `.moodboard` archive format for all boards, with deduplicated image and audio assets
- Minimal presentation mode with hover details and animated, full-image viewing
- Required Better Auth workspace access with Google or email magic-link sign-in
- Private-by-default publisher profile and explicitly published read-only boards

## Managed media and portable files

Single-device images, board background images, and selected bulk images are header-checked before raster decoding, limited to 30 MiB, 10,000 pixels per axis, and 64 megapixels, then resized to at most a 2,200-pixel longest edge and encoded as WebP when appropriate. Signature-confirmed iPhone HEIC/HEIF/HIF photos use the browser's native decoder and have a tighter 50-megapixel ceiling, which admits Apple's typical 12, 24, and 48 MP photos without shipping a memory-heavy software HEVC decoder. Safari on current Apple devices provides the intended HEIC path; browsers without native HEIC support show a conversion message. Background images use viewport cover over the board's fallback color and remain fixed while the infinite canvas pans and zooms. Bulk staging uses a lightweight HEIC placeholder rather than decoding every unselected photo. Failed bulk entries stay visible and do not prevent successful selections from being placed in one board/undo operation. The server accepts only normalized image/audio MIME types, checks byte limits and file signatures, and serves private same-origin media with authenticated range support and no shared caching. Hosted image/audio URLs and guest-demo embedded images are supported; audio data/blob URLs are always rejected.

Every board downloads as a versioned binary `.moodboard` ZIP, including boards without uploaded media. Its manifest maps media references to deduplicated binary entries. Guest-demo embedded images become archive entries too. Import validates archive paths, duplicate/missing entries, counts, a 50 MB compressed/expanded envelope, MIME/signature agreement, per-file SHA-256 integrity, and references before uploading each asset once. IDs are remapped to the destination deployment, and the current board is replaced only after every upload succeeds. The guest demo restores archived images to browser-local data without uploading them. Archived background images and uploaded audio require sign-in. JSON board files and older board shapes are not supported. Keep untrusted archive limits in place rather than extracting these files with general-purpose paths.

## Public publishing scope

The public read routes and publishing logic remain, but the Cloudflare app does not yet expose owner controls to publish or unpublish boards. The removed standalone-server CLI did not operate on Cloudflare. New, duplicated, and imported boards remain private. Adding authenticated publishing controls is separate work.

Public URLs use a separate 128-bit random id. Deleting a published board revokes its board and publication-scoped media URLs.

The public routes are `/@handle` and `/share/:publicId`. They load only `/api/public/*`; they do not start owner RPC, enumerate the catalog, open IndexedDB/outboxes, or install editing, import, drop, or paste controls. Public responses come from an authoritative SQLite join, omit board/item ids, revisions, mutation/client data, and use `Cache-Control: no-store`. The old anonymous Cloudflare `/api/catalog` endpoint now returns 404.

Cloudflare uses the same per-account publication tables and verifies every public read in the selected account Durable Object. D1's public-route directory is only a locator; stale entries fail closed when the workspace no longer confirms a publication. There is no browser or unauthenticated publishing-administration endpoint. Account display names and public publisher profiles remain separate.

Opaque public ids are unguessable locators, not secret-link authorization: published boards are world-readable. External images and hosted audio can reveal viewer IP addresses to their respective hosts; managed R2/filesystem media stays same-origin. Adding an X card opts that board into loading X’s official widget automatically for viewers; X can receive viewer IP and browser information or set third-party state despite the widget’s DNT option. A stored same-origin snapshot remains visible while the widget loads or when it fails. Account uploads use managed media; guest-demo images stay browser-local. Open Graph board images are deferred rather than faked; honest social covers still require an image-rendering pipeline.

## Website card scope

Add any public HTTPS URL through **Add link**, or paste one directly. The same field accepts official X post embed snippets: it extracts only a strict X/Twitter status URL plus the recognized `data-media-max-width` media marker, then discards every pasted tag and script. Direct image URLs become image items. X status URLs become automatically loaded full-post references, while official embed code selects full-post or video/media format from its own markers. Automatic/light/dark themes are supported, full-post cards always hide the conversation thread, and oversized cards can visually scale the official widget up to 2× beyond X’s native width. The server makes a bounded, cached request to X’s public oEmbed endpoint when available and stores only sanitized author, handle, post text, and date fields for the unloaded/unavailable fallback; raw provider HTML and video bytes are never persisted, executed, downloaded, proxied, or rehosted. A failed metadata lookup still leaves a durable canonical X card with its normalized source retained in board data. Other links go through the owner RPC, which reads at most the bounded HTML head and returns a snapshot of the final URL, preview image URL, title, description, site label, and preferred layout. Public Instagram post and Reel URLs with usable Open Graph artwork become linked image references; no Instagram video is downloaded or embedded. Other pages become website cards. Editing a website or X card can refresh its snapshot; viewing a board never refetches snapshot metadata. Sites without usable metadata, sites that block preview clients, and non-HTML URLs fall back to a domain card.

Website cards are inert while editing and open in a protected new tab only during presentation or from a read-only public board. Remote preview images use `no-referrer` but still make a viewer-side request to the image host. The resolver accepts HTTPS only, bounds redirects/time/bytes, rejects credentials and custom ports, and blocks private, loopback, link-local, multicast, and reserved destinations. Cloudflare enforces the URL/redirect policy and enables the `global_fetch_strictly_public` compatibility flag so outbound fetches stay on public network paths.

Preview resolution is part of the authenticated owner RPC surface, not `/api/public/*`. Website cards do not add an anonymous metadata endpoint. Live iframes, JavaScript-rendered screenshots, archived pages, background refreshes, and R2 copies of preview images remain deferred.

## Audio scope

Audio cards accept a local MP3, M4A, WAV, Ogg, or WebM file up to 25 MiB, a direct hosted HTTPS audio URL, a supported Spotify track, album, playlist, episode, or show URL, or a common YouTube video URL. Local bytes are signature-checked and stored in private R2; cards persist only a `mediaId`. Adding a Spotify or YouTube card opts the board into loading the provider’s official player automatically for viewers. YouTube uses the privacy-enhanced `youtube-nocookie.com` player; neither provider path downloads or extracts audio, and nothing autoplays. Spotify uses its full 352-pixel player, while native audio cards keep a compact but readable control layout. Provider iframes and native controls are inert, bordered canvas objects while editing and become interactive in presentation/read-only mode. Cards do not add redundant external source links. Native, Spotify, and YouTube players coordinate within one browser tab so starting one pauses the others when the provider supports it, and leaving the board pauses playback.

YouTube remains a visible official player rather than an extracted audio stream; ads, login, Premium behavior, regional availability, and playback policy stay under YouTube’s control. Videos whose owners disable embedding retain the external-link fallback. Direct audio hosts can still expire URLs, reject cross-origin playback or range requests, and serve codecs the browser cannot play. Portable `.moodboard` archives include managed audio bytes, while hosted, Spotify, and YouTube cards keep their canonical source URLs. Audio data URLs, blob URLs, and browser-only object URLs never enter IndexedDB, the offline outbox, SQLite, Durable Object storage, or exports.

## Current collaboration model

Each account supports up to 100 boards, with server-ordered last-write-wins changes. Boards have direct `/boards/:id` routes, while the permanent default board remains the safe fallback for stale or deleted links. Item movement and resizing stay local during the gesture and write once on pointer-up. Incoming remote changes clear local undo history rather than risking a whole-board overwrite.

Better Auth is the authorization boundary. Cloudflare selects a per-account Durable Object after validating the session at the edge. A client cannot choose a workspace id. Private media, RPC, previews, imports, and cleanup remain inside that selected workspace. IndexedDB documents and durable offline outboxes are keyed by both immutable account id and board id. Pending mutations are rebased onto that account board's next server snapshot and replayed in order. Same-field conflicts remain server-ordered last-write-wins. Bulk intake stages at most 150 files locally, creates privacy-stripped thumbnails, prepares and uploads selected images three at a time, reads EXIF `DateTimeOriginal`/`CreateDate` for capture sorting, and falls back to file modification time. Content-based duplicate detection, EXIF grouping, smart curation, and AI-assisted selection remain follow-up work.

Run the checks with:

```bash
bun run typecheck
bun run test
bun run build
```
