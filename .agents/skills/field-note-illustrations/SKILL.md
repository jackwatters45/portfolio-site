---
name: field-note-illustrations
description: >-
  Generate transparent, theme-matched website illustrations in 20 handmade styles.
  Use for travel logs, field-note artwork, photo-to-illustration work, or Queenstown-style variants.
  Includes painted, stamped, pencil, dry brush, carved, ink wash, stippled, screenprint,
  torn paper, wax crayon, etched, monotype, charcoal, sgraffito, stitched, contour study,
  brush pen, soft pastel, woodgrain, and tile mosaic.
  Make separate image assets, not posters, photo-and-art layouts, logos, or contact sheets.
compatibility: Image generation tool with image-reference support. Optional local preparation requires Python 3, Pillow, and NumPy.
---

# Field Note Illustrations

Create image-only artwork from a reference scene. This library contains all 20 Queenstown study styles.

For generation requests, produce actual image assets when tools are available. Do not stop at prompts.
For skill maintenance, edit the library without generating new artwork.

## Folder guide

```text
field-note-illustrations/
├── SKILL.md                         # Workflow and style index
├── styles/
│   ├── 01-painted/
│   │   ├── PROMPT.md                 # Reusable style prompt and checks
│   │   └── example.webp              # Transparent Queenstown example
│   ├── 02-stamped/
│   ├── …                            # Same two files in each style folder
│   └── 20-tile-mosaic/
├── references/
│   ├── prompts.md                   # Shared prompt, scene, and palette rules
│   ├── examples.md                  # Source credit and example limits
│   └── style-overview.webp          # Visual index; not a final illustration
└── scripts/
    └── prepare-illustration.py       # Background removal and palette mapping
```

Resolve all relative paths from this skill directory. No website checkout is needed to use the library.

## Choose a style

| No. | Style and prompt | Defining marks |
| --- | --- | --- |
| 01 | [Painted](styles/01-painted/PROMPT.md) | Opaque paint shapes, dry bristles, light pencil accents |
| 02 | [Stamped](styles/02-stamped/PROMPT.md) | Sparse rubber-stamp contours, worn gaps, two spot inks |
| 03 | [Pencil](styles/03-pencil/PROMPT.md) | Broken colored-pencil lines and loose hatching |
| 04 | [Dry brush](styles/04-dry-brush/PROMPT.md) | Broad scratchy strokes with large blank gaps |
| 05 | [Carved](styles/05-carved/PROMPT.md) | Bold ink masses with wide gouge-cut channels |
| 06 | [Ink wash](styles/06-ink-wash/PROMPT.md) | Transparent pigment blooms and pooled ink edges |
| 07 | [Stippled](styles/07-stippled/PROMPT.md) | Irregular hand-placed dots that describe tone |
| 08 | [Screenprint](styles/08-screenprint/PROMPT.md) | Flat spot-color layers, mesh grain, limited halftones |
| 09 | [Torn paper](styles/09-torn-paper/PROMPT.md) | Overlapping matte shapes with torn, fibrous edges |
| 10 | [Wax crayon](styles/10-wax-crayon/PROMPT.md) | Blunt wax strokes and grainy rubbings |
| 11 | [Etched](styles/11-etched/PROMPT.md) | Fine drypoint lines and selective crosshatching |
| 12 | [Monotype](styles/12-monotype/PROMPT.md) | Rolled ink, wiped passages, uneven print transfer |
| 13 | [Charcoal](styles/13-charcoal/PROMPT.md) | Powdery dark strokes, smudges, lifted highlights |
| 14 | [Sgraffito](styles/14-sgraffito/PROMPT.md) | Narrow scratches through dense oil-pastel shapes |
| 15 | [Stitched](styles/15-stitched/PROMPT.md) | Running stitches and small thread-filled patches |
| 16 | [Contour study](styles/16-contour-study/PROMPT.md) | Nested perspective lines following visible forms |
| 17 | [Brush pen](styles/17-brush-pen/PROMPT.md) | Tapered strokes with clear pressure changes |
| 18 | [Soft pastel](styles/18-soft-pastel/PROMPT.md) | Chalky rubbings, soft blending, powdery edges |
| 19 | [Woodgrain](styles/19-woodgrain/PROMPT.md) | Flowing grain lines within printed landforms |
| 20 | [Tile mosaic](styles/20-tile-mosaic/PROMPT.md) | Irregular matte tiles separated by open gaps |

- Use **Painted** when the user wants one image without a named style.
- For **all styles**, generate 20 separate assets.
- For a named style or number, open that folder's `PROMPT.md` and `example.webp`.
- Read only the selected style files. Use `references/style-overview.webp` when comparing the full set.
- For more variants, retain approved assets and choose distinct, unused styles when possible.
- Do not silently replace approved images or generate all 20 for a request for four.

## Output rules

- Deliver the illustration only. Do not include the source photograph.
- Deliver real transparency. The destination page supplies the paper color.
- Do not include background rectangles, paper texture fields, frames, shadows, titles, numbers, dates, or captions.
- Make one asset per style. Do not combine variants into a poster or contact sheet unless requested.
- Keep an open, irregular silhouette with space between forms. Avoid a filled rectangular landscape.
- Preserve recognizable forms and their relative positions. Remove incidental detail.
- Match the destination theme. Do not change the website palette to suit the image.
- Do not edit a website unless the user asks for integration.

## 1. Establish the reference and theme

Inspect the source photograph. If asked to find one, check its license and record its source, author, and license.
Use a real reference for a real location. Ask for a subject when none is supplied.
Use text-to-image generation only when the user permits an imagined scene.

Describe the distinctive silhouette, three to five essential forms, their relative positions, and the important empty spaces.
List details to omit. Use the new subject, not the Queenstown example's geography.

The examples retain a jagged ridge, a low left hill, a lake, and two wooded peninsulas pointing right.
They omit dense town detail. See [example provenance](references/examples.md) before reusing the examples.

Read actual theme colors when working in a website. Use this fallback palette only when no other palette exists:

| Role | Color |
| --- | --- |
| Primary forest ink | `#355744` |
| Small brown accent | `#855b3a` |
| Softer sage pigment | `#5a7561` |
| Optional graphite | `#343b32` |

The example page uses `#f5f0e2`. Never bake that color into the image background.
Use the selected style's pigment limits. Most styles need one to three colors, not the whole palette.

## 2. Generate the artwork

Read [the shared prompt](references/prompts.md) and the selected style's `PROMPT.md`.
Combine them with the observed scene, actual palette, and one supported background mode.
Remove template labels before generation.

Use an image generator that accepts the source photograph as a real image reference.
Read its current instructions first. Do not provide only a photo URL as text when image references are supported.
The source photo controls the scene. The style example controls marks, not geography.
Do not claim reference fidelity if the generator did not receive the source image.

Prefer native transparency. Otherwise request plain solid white without paper texture, then remove the background locally.

### Paper workflow

1. Read Paper's general guide and image-generation guide.
2. Use a dedicated file or page. Do not alter unrelated designs.
3. Add the source as an image node. Local images require an absolute `paper-asset://` path.
4. Generate each style into its own image node. Pass the source node through `reference_nodes`.
5. Google Nano Banana 2 produced these examples. It is a default, not a requirement.
6. Reference-based output follows the reference aspect ratio. Do not rely on `aspect_ratio` to override it.
7. Poll until ready. Download the original generated image, not a screenshot.
8. Inspect and prepare each asset locally.
9. Complete Paper's review checks and release working indicators.

Verify stored node IDs and URLs before reuse. If generation fails, state the limit.
A prompt or hand-coded SVG is not a generated image test.

## 3. Prepare transparent assets

Keep the raw generation separate. Use PNG or lossless WebP for final assets; JPEG cannot retain transparency.

The helper uses palette-based matting, not general scene segmentation.
It removes a plain light background, maps pigments, preserves partial transparency, and adds transparent padding.
Use it for white-background artwork. Do not matte native-transparent artwork again without a specific need.

Requires Python 3, Pillow, and NumPy. Reuse an available environment or use a temporary virtual environment.
Do not add these dependencies to the website.

From this skill directory:

```bash
python3 scripts/prepare-illustration.py raw.png illustration.webp \
  --source-ink '#355744' --ink '#355744' \
  --source-ink '#855b3a' --ink '#855b3a'
```

Source inks describe generated pigments. Target inks describe the theme. Keep each source/target pair in matching order.
Sample pigment interiors when generated colors differ from the prompt. Add sage or graphite only when present.

- `--background`: sampled background color; default white.
- `--cutoff`: background-noise threshold; default `0.065`.
- `--padding`: transparent edge padding; default `20` pixels.
- The helper refuses to overwrite an existing output. Use a new filename.

Style files give preparation guidance. Cutoffs are starting points, not universal recipes.
Lower cutoffs can preserve thin marks but retain background noise. Higher cutoffs can remove soft pigment.
Regenerate heavily textured backgrounds rather than removing useful artwork with an excessive cutoff.

Do not replace transparency with CSS blending or a sampled paper-color rectangle.

## 4. Inspect at display size

Check the final image on the actual destination background.

- No background box, halo, shadow, or paper texture patch.
- All intended marks fit inside the canvas.
- Empty snow, water, sky, and pigment gaps show the page background.
- Essential forms and their relationships remain recognizable.
- Each style has its own physical-looking marks, not only a different color.
- Fine lines, dots, thread gaps, and tile gaps remain visible at display size.
- Dense styles do not become solid blocks. Soft styles do not become background haze.
- Palette, dimensions, and alpha channel are correct.

Simplify or regenerate dense artwork. Do not blur it, distort the scene, or lower the entire image opacity.

## 5. Deliver or integrate

Deliver files through the available attachment or artifact tool. Attach local files for Telegram requests.
Use descriptive filenames such as `queenstown-painted.webp` and `queenstown-brush-pen.webp`.

When integration is requested:

- Preserve the site's layout and theme.
- Set intrinsic dimensions, useful alt text, and lazy loading for below-fold images.
- Do not add cards, backgrounds, headings, or helper copy by default.
- Keep labels only when needed for a requested comparison.
- Check desktop and mobile in a browser. Run existing build and type checks.
- Follow project test guidance. Do not add tests for static illustration presentation.

Keep the separate photo-editorial and rubber-stamp poster skills unchanged. This is the image-only library.
