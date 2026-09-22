# 12 · Monotype

Rolled ink masses with wiped passages and uneven transfer.
This has fewer cut lines than Carved and less layering than Screenprint.

Read the [shared prompt](../../references/prompts.md). Add the actual scene and palette, then this style block.

## Style prompt

```text
Make a loose, single-impression monotype of the reference.
Use one dark primary ink, with a softer related tone and a small accent only when needed.
Reduce the scene to a few broad ink masses.

Show the marks of a roller and uneven transfer from an inked plate.
Use broken coverage, soft dragged edges, small smears, and areas wiped clean before printing.
Let some ink masses fade or break apart near their edges.

Preserve the main forms and their relative positions.
Use wiped-out passages to describe the important light areas and separate the forms.
Keep the outer silhouette open and irregular.

Do not add a plate rectangle, full background stain, carved hatch patterns, or precise outlines around every object.
Avoid evenly distressed texture across the whole canvas.
```

## Preparation and checks

- Start with cutoff `0.065` and inspect the empty background carefully.
- The bundled example needed `0.14` to remove background noise. Do not apply that value without checking new artwork.
- Retain uneven transfer inside the ink forms. Remove plate-like haze outside them.
- If a high cutoff removes useful marks, regenerate on cleaner white rather than flattening the entire print.

## Example

[Transparent Queenstown example](example.webp) · 1210 × 560.
