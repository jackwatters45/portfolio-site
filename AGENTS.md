# Project guidance

## Tests

Add tests for meaningful behavior, not static presentation. Do not add tests that repeat review copy, ratings, markup, or simple layout rules. Use the existing build, type checks, and a browser check for content and styling changes.

Keep focused tests for complex behavior with real failure risks. The map tests are useful because they check links, coordinates, and data passed between pages. Add a regression test when it protects a non-trivial bug fix, not merely because a file changed.

## Styles

Keep taco site styles in `sites/tacos/src/styles/global.css`. Scope page-specific selectors so they do not affect other pages.
