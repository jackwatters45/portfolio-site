# Page comments

React comments with live replies, cursors, typing, and local drafts.

## Usage

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

Keep the widget outside `rootSelector`. Use a distinct room and endpoint for each page.
Use element IDs or `data-comment-anchor` for stable comment locations.
Set the `--comments-*` colors in the site's `theme.css` to match the page.

## Infrastructure

Define the Worker, Durable Object, rooms, origins, limits, and bindings in root `alchemy.run.ts`.
The site's API route uses the `COMMENTS` binding in production and `COMMENTS_DEV_URL` during development.

## Development

From the repository root:

```sh
bun run dev --stage your-worktree
```

NZ runs at http://localhost:4325/. The comments Worker uses port 4340.

## Limits

- Guest names are not authenticated. Private use needs host access control.
- No edit, delete, resolve, or moderation controls.
- Drafts stay local. Sending requires a live connection.
- 2,000 characters per message; 250 threads and 1,000 messages per room.
