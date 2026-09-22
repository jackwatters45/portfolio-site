# 20 · Tile mosaic

Irregular matte tile shapes describe the scene, with transparent gaps between them.
This uses smaller, separate pieces than Torn paper.

Read the [shared prompt](../../references/prompts.md). Add the actual scene and palette, then this style block.

## Style prompt

```text
Rebuild the reference as a flat illustration made from small irregular mosaic tiles.
Use two or three restrained colors from the supplied palette.
Keep the distinctive silhouettes and the positions of the main forms.

Vary the tile sizes, angles, and shapes slightly.
Let their arrangement follow the direction of slopes, shores, or other important contours.
Use matte, slightly imperfect edges rather than a uniform square grid.

Leave narrow open gaps between tiles.
Keep the main light areas empty instead of filling them with white tiles.
Let the outer boundary end in separate irregular pieces, not a rectangular mosaic panel.

Avoid glossy ceramics, reflected highlights, beveled edges, raised grout, backing boards, and cast shadows.
Use enough space between pieces that the mosaic remains readable at the intended website size.
```

## Preparation and checks

- Start with cutoff `0.065`. The bundled example used `0.1` for cleaner background removal.
- Map each tile pigment separately when present.
- Keep the gaps transparent, not white grout.
- Remove any background rectangle. Check pale tile edges for white halos.
- If pieces merge at page size, regenerate with fewer tiles and wider gaps rather than adding dark outlines.

## Example

[Transparent Queenstown example](example.webp) · 1167 × 548.
