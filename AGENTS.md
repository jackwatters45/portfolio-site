# Project guidance

## Tests

Tests require an explicit request. Do not write or add to tests unless the user explicitly requests them. If a test is necessary, suggest it and wait for approval.

## Compatibility

Do not preserve legacy formats, APIs, or implementations. Replace them directly. Do not add compatibility layers, fallback readers, or dual-format support.

## Local checks

Use `bunx turbo run typecheck` for cached, parallel workspace type checks. Run `bunx tsgo --noEmit` for the root deployment configuration.

Run `bun run format:check` and `bun run lint` for formatting and lint checks. These are not registered as Turbo tasks yet. Do not run builds for formatting or lint changes.

For Markdown-only documentation changes, skip validation commands and separate diff reviews unless the user requests them. `.oxfmtrc.json` excludes `**/*.md` and `**/*.mdx`. This exception does not cover executable MDX or changes to source code or configuration.

## Vendored lint rules

`tools/oxlint/anti-slop/` contains anti-slop source, not an npm package. Its `UPSTREAM.md` records the exact commit and update procedure. Preserve both upstream licenses and the nested provenance record.

The root `.oxlintrc.json` enables all generic and Effect rules at error severity. Keep `oxlint` and `@oxlint/plugins` pinned together at `1.85.0`. Existing lint commands and Git hooks use this configuration.

Stage updates separately and merge against the recorded source commit. Preserve local changes. Keep vendored source and installed agent assets excluded from lint and formatting. Report existing owned-source findings; change them only when migration is requested. The Effect service-import rule does not check package or path aliases.

## Styles

Keep shared review-site styles in `packages/reviews/src/styles/global.css`. Put site colors in each site's `theme.css`. Scope page-specific selectors so they do not affect other pages.

## Effect first

Use Effect wherever it fits. This is the most important implementation rule.

- Check for an Effect package before writing infrastructure or I/O code. Use it when available. This includes browser storage, sockets, HTTP, SQL, configuration, retries, timers, and resource cleanup.
- Keep business logic in Effect services and layers. Use Schema for validation and tagged errors for expected failures. Run Effects only at framework boundaries.
- Prefer Effect atoms and `@effect/atom-react` for reactive client state. Do not rebuild a connection, storage, or synchronization system with React hooks and native promises.
- Avoid `useEffect` and `useState` when an Effect primitive or an existing library owns the lifecycle or state. Keep React effects for necessary DOM integration, not service orchestration.
- Use a form library, such as TanStack Form, for form state, validation, submission, and errors. Do not assemble forms from many state hooks.
- Read the installed Effect source for version-specific APIs. Consult `effect-solutions` for patterns. Do not copy APIs from a different Effect version.
- Run the `effect-review` skill after substantial implementation work. Fix its findings before opening the PR.

