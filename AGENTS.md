# Project guidance

## Tests

Add tests for meaningful behavior, not static presentation. Do not add tests that repeat review copy, ratings, markup, or simple layout rules. Use the existing build, type checks, and a browser check for content and styling changes.

Keep focused tests for complex behavior with real failure risks. The map tests are useful because they check links, coordinates, and data passed between pages. Add a regression test when it protects a non-trivial bug fix, not merely because a file changed.

## Styles

Keep shared review-site styles in `packages/reviews/src/styles/global.css`. Put site colors in each site's `theme.css`. Scope page-specific selectors so they do not affect other pages.

Keep map tests manual. Do not add tests to the CI/CD pipeline.
