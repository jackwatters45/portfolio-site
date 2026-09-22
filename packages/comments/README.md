# Page comments

A React comment interface with shared comments, cursors, and typing indicators.

## Use in a site

```astro
---
import Comments from '@personal-sites/comments';
import '@personal-sites/comments/styles.css';
---

<Comments
  client:only="react"
  rootSelector=".page"
  room="nz-trip"
  endpoint="/api/comments/nz-trip"
/>
```

`rootSelector` limits selection and cursor sharing to the page content. Keep the
widget outside that element. An element's `id` or `data-comment-anchor` provides a
stable location. Other elements use a CSS path and a position within the element.
Structural page edits can detach these locations. There is no automatic re-anchoring.

The `room` prop namespaces local drafts. The endpoint selects the server room.
Use a distinct room for each page that needs a separate conversation.

## Ownership

- **This package:** React interface, target selection, protocol, connection lifecycle,
  validation, durable storage, and WebSocket delivery.
- **New Zealand:** Astro page, CSS import, API route, and service-binding types.
- **Root `alchemy.run.ts`:** Workers, Durable Objects, rate limits, and bindings.

The Astro route forwards requests through the `COMMENTS` service binding. The
comments Worker has no public domain or `workers.dev` endpoint. It accepts only
configured rooms and origins. No GitHub API or GitHub token is used at runtime.

## Development

Run from the repository root:

```sh
bun install
bun run dev --stage your-worktree
```

Alchemy starts the comments Worker on port 4340 and the Astro sites. New Zealand
normally uses port 4325. Alchemy supplies `COMMENTS_DEV_URL` to its dev process.
The Astro route forwards local upgrades to that address; production uses the private
service binding. Astro 7 owns the upgrade, so there is no competing Vite proxy.
Free conflicting site ports before starting the stack. Local allowlisted origins are in `alchemy.run.ts`. Set `ALCHEMY_STAGE=dev_your_worktree`
in an ignored `.env` file to make plain `bun run dev` use that stage.

Use `?agentation` on the NZ page to inspect the original Agentation toolbar during
development. It stays hidden otherwise, so the two selection tools do not compete.

## Interaction

- Open the bottom-left launcher. Enter a name before joining the room.
- The compact toolbar expands to the right. Each tool has a tooltip.
- Hover over an element to preview its bounds. Click to write below it.
- Use the keyboard button to choose an element without a mouse.
- Wide screens show the selected thread beside its target. Narrow screens place it nearby.
- The comment list, settings, name prompt, and page composer open above the toolbar.
- Escape closes the current form or settings, then the toolbar.
- Control/Command + Enter submits a comment.
- Settings control the name, cursor color, appearance, and markers. The cursor tool toggles sharing.
- Appearance follows the host page by default. The NZ `theme.css` binds the `--comments-*` color tokens.

Names are guest labels, **not authenticated identities**. Anyone with page access
can read and add comments. Names and presence are shared while the toolbar is open.
Cursor sharing stays within the configured page root. Closing the toolbar leaves
the room. This experiment has no edit, delete, resolve, or moderation interface.
Use an access-controlled host before using it for private review material.

## Storage and delivery

Each room has one SQLite-backed Cloudflare Durable Object. Comments and replies
are durable. Presence stays in hibernatable WebSocket attachments, not SQL.

The `RoomStore` service uses `@effect/sql-sqlite-do` for SQL and storage transactions.
`RoomClient` uses Effect Socket, SubscriptionRef, Deferred, schedules, and scopes for
connections, acknowledgements, retries, heartbeats, and cleanup.

`@effect/atom-react` subscribes the UI to those services. Effect KeyValueStore,
BrowserKeyValueStore, and schema-backed atoms own drafts and preferences. Effect
Crypto and Clipboard services handle browser capabilities. Effect Schema validates
network and stored data. TanStack Form owns form state and submission. Floating UI
positions panels and handles focus and dismissal.

React effects remain only for DOM integration: focus, scrolling, positioning, and
pre-paint attributes. Browser event streams and Effect scopes own event resources.
Capture handlers cancel page navigation synchronously; queuing those events in a
stream would be too late. There is no second HTTP/query cache.

On connection, the server sends a complete snapshot. Each committed write then
broadcasts the updated thread. A concurrency gate orders snapshots, writes, and
broadcasts. SQL transactions and the Durable Object output gate prevent an
acknowledgement from preceding its durable write.

Each submission has a persistent request ID. Retrying the same request returns the
same thread. Reusing an ID with changed content fails. The browser keeps the exact
request with the draft until acknowledgement. Reconnection resends pending writes
and replaces cached threads with the authoritative snapshot.

Drafts remain editable offline. Sending requires a live connection. Drafts and
preferences use local storage, with an explicit warning if storage is unavailable.
This is not an offline mutation queue or a general-purpose sync engine.

## Bounds

- 2,000 characters per message; 40 per name.
- 16 KiB per incoming frame; 30 frames per second per connection.
- 30 connection attempts per minute per IP through Cloudflare's rate limiter.
- 30 new writes per minute per IP per room. Duplicate retries do not spend this budget.
- 50 connections per room, at most 10 from one IP.
- 250 threads and 1,000 messages per room. A full room rejects further writes.
- Cursor updates are throttled to 80 ms. Cursor leases expire after 10 seconds;
  typing leases expire after 6 seconds. Heartbeats check stale connections.

Replies are plain text. SQL uses parameters. User text is never rendered as HTML.
The server stores a hash of the client IP in rate-budget rows. The next write removes
expired budget rows.

## Deployment

The root Alchemy stack deploys the comment Worker and binds it to the NZ Worker.
The retired GitHub token binding and secret resource are removed in the same plan.
The GitHub **infrastructure provider** and CI credential remain available so Alchemy
can delete that pre-existing state row. They are not comment storage or a fallback.
After that state deletion, those two cleanup declarations can be removed.

Check changes with:

```sh
bunx turbo run typecheck
bunx tsgo --noEmit
bun run format:check
bun run lint
bun run build --filter=@personal-sites/nz
bun alchemy plan --stage prod --no-input
```

A plan does not deploy. Local comment data and production comment data are separate.
