# Project guidance

## Tests

Tests require an explicit request. Do not write or add to tests unless the user explicitly requests them. If a test is necessary, suggest it and wait for approval.

## Compatibility

Do not preserve legacy formats, APIs, or implementations. Replace them directly. Do not add compatibility layers, fallback readers, or dual-format support.

## Local checks

Use `bunx turbo run typecheck` for cached, parallel workspace type checks. Run `bunx tsgo --noEmit` for the root deployment configuration.

Run `bun run format:check` and `bun run lint` for formatting and lint checks. These are not registered as Turbo tasks yet. Do not run builds for formatting or lint changes.

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

