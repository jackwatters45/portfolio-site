# Restaurant pages

Tacos and Sangas use site-local Astro pages:

- `packages/tacos/src/pages/restaurants/*.astro`
- `packages/sangas/src/pages/restaurants/*.astro`

The filename sets the URL: `casa-nom-mexican.astro` becomes `/restaurants/casa-nom-mexican/`.
Each page exports `restaurant` metadata and uses `RestaurantLayout`.
The index and map read these exports automatically. There is no separate registry.

## Edit a review

Write paragraphs, headings, lists, links, and scores directly in the page's HTML.
Add, remove, or reorder sections as needed. No item or reviewer schema controls the page.

Use an existing page as a design reference:

- `visit-notes`: opening paragraphs.
- `section`: a section with an `h2` and a unique `aria-labelledby` target.
- `menu-line`: a dish heading, with an optional `menu-leader` and `meta menu-price`.
- `reviews`: two review columns; `data-person="meg"` and `data-person="jack"` retain their column positions.
- `reviews guest-reviews`: review columns with guests.
- `section solo-reviews`: a section with full-width reviews.
- `scores`: score text.

These classes control appearance, not content structure. They are optional when a section needs different HTML.
Keep shared styles in `src/styles/global.css`. Scope restaurant styles under `.restaurant-page`.
Keep site colors in each site's `theme.css`.

## Metadata

Import `Restaurant` from `@personal-sites/reviews/restaurants` for the exported metadata type.

- `name`, `suburb`, and `dishes` are required. `dishes` supplies the index summary, not the review sections.
- `address` and `mapsUrl` supply the heading's location link.
- `coordinates` uses `[latitude, longitude]` for the map pin. Omit it when the location is unknown.
- `visited` uses `YYYY-MM-DD`. The index sorts by newest visit, then name.
- Optional `scores: { meg: number | null, jack: number | null }` supplies overall scores only.
  The index averages both scores when present. The map shows each known score, including zero.
  Keep these scores consistent with the review HTML. Do not substitute dish scores for overall scores.

The layout supplies the heading, date, title, description, canonical URL, and site theme.
Deployment controls publication. Every restaurant page enters the index; there are no draft flags.

## Add Taco's Land after this refactor merges

The parent agent owns this step. This refactor does not include that restaurant or read its unfinished Markdown file.

1. Merge this refactor first. Keep the parent's current content edits.
2. Create `packages/tacos/src/pages/restaurants/tacos-land.astro` using an existing page's imports and layout.
3. Export the confirmed location and visit metadata. Include `Quesabirria taco` once in `dishes`.
4. Move the approved prose and scores into semantic HTML inside `RestaurantLayout`.
5. Use one `<article>` with `<h3>Quesabirria taco</h3>`. Describe avocado variations within that article's review paragraphs.
6. Keep any other approved dishes as separate articles. Do not invent text, prices, or scores.
7. Remove the superseded Markdown file in that later change. No Markdown reader remains.
8. Run workspace type checks, root `tsgo`, formatting, and lint. Review the page, index, and map before deployment.

The new page automatically receives `/restaurants/tacos-land/` and enters the sitemap.
No shared template or registry change is needed.
