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

Visitors can read threads, replies, and live updates without entering a name.
New comments request a name. Replies have an **Enter name to reply** control.
Name entry preserves the selected target and draft; it does not submit a comment.
Reactions also require a valid name.

After name entry, cursors stay active until **Live cursors** is turned off.
Closing the toolbar does not disconnect, including for anonymous readers. The top-right bubble opens page comments.
Markers show message counts.

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

- Display names are not authentication. Private use needs host access control.
- Authors can edit or delete their own comments and replies from the original browser. There are no moderation controls.
- The browser creates a private, random 256-bit key per endpoint. It stores the key locally. The server stores only its SHA-256 fingerprint and checks it for each edit or deletion. Names and public author IDs do not grant access.
- Private browsing works until its storage is cleared. Another device, a different browser, or cleared storage cannot recover ownership. There is no account or recovery flow.
- Historical comments have no ownership fingerprint and remain read-only. No name-based ownership migration is performed.
- Editing preserves the author and creation time. Concurrent edits must match the saved body; stale edits are rejected.
- Deleting a root leaves a deleted placeholder while replies remain. Deleting the final reply removes an otherwise empty thread. Deleted messages cannot receive likes or be edited.
- Mutations retain request records for safe retries. Deletion removes the live content, not the historical request payloads.
- Drafts stay local. Sending requires a live connection.
- 2,000 characters per message; 250 threads and 1,000 messages per room.
