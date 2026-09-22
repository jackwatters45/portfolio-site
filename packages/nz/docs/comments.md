# NZ comments

The trip page remains static Astro HTML. Only `Comments` hydrates, with `client:idle`.
The other sites do not load it. The separate Worker handles `/api/comments` and
leaves static asset delivery to Cloudflare. No database or Astro SSR adapter is used.

## GitHub authentication

Token lookup runs with Effect in `server/github-auth.ts`. It uses Alchemy's
`GitHubCredentials` service and the configured GitHub CLI login. No browser
code imports this module or receives the token.

The local Alchemy profile is configured to use `gh-cli`. On another machine,
sign in with `gh auth login`, then use `bun alchemy login` to configure GitHub
with the **GitHub CLI** method. Do not sign in again if the existing login works.

Run the local site normally; there is no token to copy:

```sh
bun run dev --filter=@personal-sites/nz
```

The Vite server uses the same GitHub credential resolver as deployment.
An optional `NZ_FEEDBACK_GITHUB_TOKEN` in the root `.env` overrides local auth.
Effect's `Config.redacted` reads that value on the server. Restart the dev server
after changing authentication. Local comments use the real repository.
`astro preview` serves static files only; use `astro dev` for the local API.

### Deployment and CI

- Alchemy passes the resolved token to Cloudflare as a Worker secret.
- The Worker reads its secret through Effect's `Config.redacted`.
- Alchemy's `GitHub.Secret` manages the `NZ_FEEDBACK_GITHUB_TOKEN` repository secret
  during production deployment. The initial CI secret has already been configured.
- CI exposes that persistent secret as `GITHUB_ACCESS_TOKEN` for the GitHub provider.
  Never substitute the job's temporary `GITHUB_TOKEN`; it expires after the job.
- Redeploy locally after changing the GitHub login to update both stored secrets.

This uses the login's existing GitHub permissions, not a narrower Issues-only token.
The token stays redacted until a server-side binding or GitHub request needs it.
Never use a `PUBLIC_` variable for credentials.

The repository's `nz-feedback` label is already configured. Each feedback issue
must keep that label so the API can identify it.

## Use comments

- Open **Comments** and choose **Inline comment** or **General comment**.
- Enter a name once. Effect's `KeyValueStore.layerStorage` saves it in localStorage.
- For inline feedback, choose a marked plan. General comments need no page selection.
- Post your comment. Later posts and replies reuse your saved name.
- Click a comment marker or a thread in the panel to read and reply.
- Use **Change name** to change the name for future posts.

Names are self-reported, not verified. If storage is blocked, the name still works
for that visit. Draft comments stay in memory while the island is mounted.

## Read and manage feedback

https://github.com/jackwatters45/portfolio-site/issues?q=label%3Anz-feedback

Each thread is an issue. Replies are issue comments. All site submissions use the
token owner's account and include **From: Name**. Visitor text uses code blocks
so GitHub does not interpret mentions, HTML, or issue commands.

Reply directly in GitHub to answer. Close the issue to resolve the thread.
Reopen it to restore its marker. Lock it to prevent site replies. The panel
refreshes every 45 seconds while open, and has a manual refresh button.

Keep the first metadata line and label on feedback issues. They attach each
thread to the page and prevent the API from exposing unrelated repository issues.
Text replies written directly in GitHub appear as plain text with the GitHub username.

## Anchors and limits

`data-comment-anchor` values in `src/pages/index.astro` are stable identifiers.
Keep them when moving or rewriting content. Add a unique value to new commentable
blocks. Only activity choices, flexible days, and outstanding decisions have inline anchors.
Fixed trip facts, bookings, travel days, budget, and illustrations do not.
Removed blocks leave their existing threads accessible in the comment panel.
Avoid nested anchors. Threads never depend on pixel coordinates or CSS positions.

General comments use the reserved `general` anchor with no page marker.
Each new general comment starts a separate thread. Replies use the same API and GitHub format.

The repository is public, so names and feedback are public too. The first-name
form states this. An unlisted URL is not access control. Do not post private data.

The API restricts writes to same-origin JSON requests. It caps names at 60
characters, comments at 2,000 characters, and request bodies at 16 KiB. Cloudflare
limits each IP to six writes and 60 reads per minute. These are basic abuse limits,
not authentication. Rotate or remove the token if the endpoint is abused.

No automated tests were added. Check changes with:

```sh
bun run --cwd packages/nz typecheck
bunx tsc --noEmit
bun run --cwd packages/nz build
```

Then check the name, marker, post, reply, and error flows in the browser.
