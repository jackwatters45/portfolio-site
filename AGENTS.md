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

