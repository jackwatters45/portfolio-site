# 07 · Stippled

Hand-placed dots describe light, shade, and form.
Irregular spacing distinguishes this from Screenprint's limited halftone patterns.

Read the [shared prompt](../../references/prompts.md). Add the actual scene and palette, then this style block.

## Style prompt

```text
Draw the reference as a restrained pen-stipple illustration.
Use one muted primary ink and, if useful, a very small secondary accent.
Build the main forms from small hand-placed dots.

Vary dot size and spacing slightly.
Use denser clusters for a few dark areas and sparse dots for lighter slopes or edges.
Add only a few short, broken contour lines where needed for recognition.

Keep the main light areas and the gaps between forms empty.
Do not distribute dots evenly across the background.
Let the image dissolve into sparse marks at its outer edges.

Avoid a mechanical dot grid, smooth gradient shading, dense crosshatching, and continuous outlines around every object.
Use enough separation between dots that they remain distinct at the intended display size.
```

## Preparation and checks

- Start with cutoff `0.065`. Check whether it removes small intentional dots.
- Preserve isolated subject dots. Do not remove every small connected component as noise.
- Inspect the image at page size. Dot clusters must not become an undifferentiated gray field.
- Increase dot size or spacing during generation if the final image loses its stippled character.

## Example

[Transparent Queenstown example](example.webp) · 1209 × 547.
