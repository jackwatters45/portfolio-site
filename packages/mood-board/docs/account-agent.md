# Account access for agent tools

The same CLI and stdio MCP server support local files and authenticated account boards. Local tools remain offline.

An account save creates a **new private board**. It does not publish the board or change the local archive.

## Server requirement

Deploy the server changes with the CLI changes. Alchemy applies `0004_agent_device_auth.sql` to D1. The server must include Better Auth device authorization and the new RPC revision checks. Older deployments do not support this connection flow.

For local account development, use the existing Alchemy server at http://localhost:8787. The production origin is https://moodboard.jackwatters.dev. A local MCP process can connect to either origin. It does not start another website or require Cloudflare deployment credentials.

## Configure the connection

Create a private directory outside your approved asset and output folders:

```bash
mkdir -p "$HOME/.config/moodboard-agent"
chmod 700 "$HOME/.config/moodboard-agent"
```

The directory must have an absolute, non-symlink path. Use a separate directory for each server origin or account.

Add these flags to the [local MCP configuration](local-agent.md#mcp-configuration):

```text
--account-origin https://moodboard.jackwatters.dev
--account-session-dir /Users/your-name/.config/moodboard-agent
```

Use your actual absolute directory. The existing `--root` and `--output-dir` flags remain required. Both folders must exist.

The account origin must be canonical, without a trailing slash. HTTPS is required except for HTTP on localhost, `127.0.0.1`, or `[::1]`. Requests never follow redirects. Tool parameters cannot select another server.

Account board writes are disabled by default. Add `--allow-account-write` only when you authorize uploads and account edits. Every write also requires `confirm:true` and the exact account reference. The local overwrite and deletion flags do not enable account writes.

## Connect

1. Call `connect_account` with `{}`.
2. Open the returned `verificationUrl` yourself.
3. Sign in through the normal website login.
4. Check the account email and eight-character code.
5. Approve only if the code matches your own agent client.
6. Call `complete_account_connection` with the returned `userCode`.
7. If it returns `pending`, wait at least `retryAfterSeconds` before calling again.
8. Call `account_status` to confirm the account and write permission.

The agent must not approve the browser prompt on your behalf. If the wrong account appears, deny the request. Complete the denied request to clear it, then start a new connection.

Approval expires after ten minutes. Polling waits at least fifteen seconds. The private pending state survives CLI calls and MCP restarts. If a pending request expires, start another connection.

The flow creates a separate, normal Better Auth session. **It has full account access, not restricted OAuth scopes.** The tool permission flags limit this process; they do not limit a stolen session token. Only use a trusted MCP server and protect its session directory.

## Save a local board

1. Build and inspect a local revision using the local tools.
2. Preview the revision and obtain the user's upload approval.
3. Call `account_status` and use its `origin` and account `id`.
4. Generate a fresh UUID v4 for the destination `boardId`.
5. Call `save_board_to_account` with these fields:

| Field | Value |
| --- | --- |
| `account` | `{ "origin": "https://moodboard.jackwatters.dev", "id": "the-account-id" }` |
| `board` | The exact `{ file, sha256 }` reference from the local action. |
| `boardId` | A fresh UUID v4, never `default`. |
| `confirm` | `true`, after the user approves the upload. |

The action verifies the local digest and archive before uploading. It creates the destination only if that ID is unused. It uploads embedded images, audio, and image backgrounds through the existing owner media endpoint. Normal authentication, validation, and account quotas still apply.

It remaps media IDs and commits the board at revision zero. A concurrent edit causes a conflict instead of replacement. The result includes the private website URL, source reference, revision, and `published:false`.

The account API does not store camera position. The local archive retains its camera. Remote URLs remain URLs; the website may contact those providers when displaying the board.

### Partial saves

The save is not a distributed transaction across board storage and media storage. A failed or cancelled action can leave an empty board, a completed board with a lost response, or uploaded media.

Keep the chosen `boardId`. Inspect it with `get_account_board` after any uncertain result. `PartialSave` errors also include its URL. Do not assume that an error means nothing changed.

The tool does not retry writes or delete remote data automatically. Existing media maintenance handles unused uploads under its normal policy. Inspect and remove unwanted boards through the website. To start a separate save, use a new board ID. The local archive remains unchanged.

## Account actions

| Action | Purpose |
| --- | --- |
| `connect_account` | Start or reuse pending browser approval. |
| `complete_account_connection` | Exchange an approved code and store the session privately. |
| `account_status` | Verify account identity and startup write permission. |
| `disconnect_account` | Revoke the agent session and remove its local credential. |
| `list_account_boards` | List account board IDs and titles. |
| `get_account_board` | Read a current snapshot and revision. |
| `edit_account_board` | Apply a confirmed, revision-checked account mutation. |
| `save_board_to_account` | Copy a local revision into a new private account board. |

Local actions keep their existing names. `list_boards` lists local files; `list_account_boards` lists server boards. Local file references and account references are not interchangeable.

### Edit an account board

Use `get_account_board` first. Send its revision as `expectedRevision`, plus a fresh `mutationId`, in `edit_account_board`. Specify `upserts` and `deletes`, even when empty. Optional title and background fields use the normal board mutation schema.

Upserts replace complete items. Copy all fields you want to preserve. Use only existing account media IDs; this action does not upload files. The server checks the revision inside the SQL transaction.

If the reply is lost, retry the identical mutation ID and payload. The existing server deduplication prevents a second application. Otherwise, read the board again before changing the mutation.

Account edits change live content. Existing public views can reflect those changes. Editing does not change publication settings. Separate publish and unpublish tools require explicit approval, `confirm:true`, and current board, profile, and publication versions.

Account writes run one at a time per MCP process. Local operations and account reads can run separately. Revision checks protect account edits across processes.

## Credentials and revocation

The server stores sessions in the existing Better Auth session table. The plugin owns device codes in D1. Daily maintenance removes expired codes. Cloudflare limits device requests by route and connecting IP.

The client stores `session.json` with mode `0600` in the owner-only directory. It contains sensitive credentials in plaintext. Do not copy, commit, upload, or paste it. Secrets use Effect `Redacted` values in memory. Tool results return no session token or device secret. Authentication response bodies never appear in tool errors. Account requests disable HTTP trace spans. Authorization and token headers also use redaction.

Credential updates use a synced temporary file and atomic rename. A file lock prevents concurrent login, completion, and logout changes. A force-killed process can leave `session.lock`. Stop all processes that use this directory before moving that lock to Trash. Private temporary files can also remain after a forced stop.

Use `disconnect_account` with the account reference and `confirm:true` to revoke this session. It does not sign out the browser or delete boards. If revocation fails, the credential stays so you can retry. An expired stored session is revoked before a new connection replaces it.

These permissions do not protect against another program running as your OS user. Do not modify the private directory during an action. A network failure during token exchange can leave an approved server session until it expires.

Your MCP client can send returned images and board content to its model provider. Review that client's data policy before using private account content.

## Implementation

- `src/mcp/account-contracts.ts`: account action contracts and safe errors.
- `src/mcp/account-connection.ts`: device flow, private credentials, pinned HTTP origin, and revocation.
- `src/mcp/account-diagnostics.ts`: safe request diagnostics without credentials or response bodies.
- `src/mcp/account-boards.ts`: authenticated RPC and local-to-account media transfer.
- `src/mcp/account-actions.ts`: shared CLI/MCP account handlers.
- `src/server/agent-connection.ts`: browser consent through the existing login.
- `src/server/auth.ts`: Better Auth device authorization and bearer-session plugins.
- `src/server/board-repo.ts`: atomic create-only and expected-revision checks.

No account upload, deployment, or end-to-end authentication check is part of a static code check.
