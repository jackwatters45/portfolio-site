# Shared illustration prompt

Style prompts live in separate folders under `styles/`. Choose one through the [style index](../SKILL.md#choose-a-style).
Read only the selected style files unless comparing the whole library.

## Assemble a request

1. Inspect the source image and read the destination theme.
2. Select one supported background mode below.
3. Add the shared contract, observed scene, palette, and selected style block.
4. Attach the source photograph as an image reference through the generator's actual reference input.
5. Replace all example text and unresolved template labels before generation.

The photograph controls the scene. The style prompt controls the marks and level of simplification.
The bundled example helps compare styles. It must not replace the new subject's source photograph.
If the generator accepts multiple references, label their roles clearly. Do not let Queenstown geography enter a different scene.

## Background mode

Choose one. Do not ask the generator to choose between both.

### Native transparency

```text
Deliver the artwork on a truly transparent background with an alpha channel.
Do not draw a checkerboard or simulate transparency with a solid background color.
```

### Background for local removal

```text
Deliver the artwork on perfectly plain, solid white for later background removal.
Use no paper grain, warm tint, lighting gradient, or background texture.
Keep all intended marks away from every canvas edge.
```

## Shared contract

```text
Create one handmade illustration from the attached reference photograph.
Output only the artwork, not the photograph or a photo-and-art layout.

Keep the recognizable subject silhouette and the essential spatial relationships.
Reduce the scene to three to five important forms.
Remove crowds, vehicles, dense windows, repetitive buildings, fragmented vegetation, and irrelevant objects unless they define the subject.
Retain a foreground obstruction only when it matters to recognition.

Use an open, irregular silhouette with large spaces between forms.
Do not fill a rectangular landscape.
Keep the entire illustration inside the canvas with generous empty margins on every side.
Do not crop the intended marks.

Use only the supplied restrained palette.
Let empty areas describe the important light spaces and gaps between marks.
Keep physical texture within the pigment, thread, or pieces, not across a background sheet.

Do not add a frame, border, drop shadow, mockup, caption, logo, title, number, or date.
Avoid photorealism, plastic effects, synthetic gradients, smooth vector tracing, and decorative clutter.
```

Natural pigment spreading and local blending are allowed when they define the selected style.
The ban on synthetic gradients does not ban Ink wash blooms or Soft pastel blending.

## Scene description

Write a short, specific description based on the actual reference:

- The distinctive silhouette or landmark.
- Three to five important forms.
- Their relative positions, directions, and overlaps.
- Light areas that should remain empty.
- Incidental detail to omit.

For the bundled Queenstown examples only:

```text
Retain the jagged mountain ridge across the back of the scene.
Place the low hill on the left, with the lake extending between the landforms.
Keep two wooded peninsulas pointing to the right, at different depths.
Leave snow, sky, and most open water empty.
Omit dense town detail, individual windows, and repetitive trees.
```

Do not reuse this geography for another subject.

## Palette description

Specify exact theme colors and their roles. Do not make the final image copy every photographic color.
Most styles need one to three pigments. Painted can use up to four.
Charcoal can use graphite as its primary pigment. Sgraffito can use brown for larger forms.

Example for the original theme:

```text
Use forest green #355744 as the primary pigment.
Use sage #5a7561 only for softer forms when the selected style needs it.
Use brown #855b3a for a restrained accent.
Keep unpainted areas empty; the page will supply its own paper color.
```

Replace these choices when the destination theme differs.
The page color `#f5f0e2` is a viewing background, not an image fill.

## Iteration checks

| Problem | Correction |
| --- | --- |
| Too clean | Request the selected tool's marks: bristles, gouges, grain, scratches, stitches, or uneven tile edges. |
| Too dense | Reduce the number of forms and remove secondary detail. Do not merely shrink a full painting. |
| Too faint | Strengthen the main pigment or pressure without adding more marks. |
| Too heavy | Open the light areas and reduce ink masses. Do not lower the entire image opacity. |
| Wrong palette | Supply exact theme colors, then map the actual generated pigments during preparation. |
| Background box | Request native transparency or clean white. Do not match a rectangle to the page by eye. |
| Clipped marks | Regenerate with more empty margin. Do not stretch the image or invent missing edges. |
| Similar variants | Change the physical mark-making and visual weight, not only hue or random seed. |
| Lost small details | Use fewer, larger marks or gaps that survive at the intended display size. |

Keep approved assets during iteration. Save new candidates separately.
