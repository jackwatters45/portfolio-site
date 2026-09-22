# 18 · Soft pastel

Soft chalk-pastel rubbings with powdery edges and limited blending.
This is softer than Wax crayon and drier than Ink wash.

Read the [shared prompt](../../references/prompts.md). Add the actual scene and palette, then this style block.

## Style prompt

```text
Interpret the reference as a soft chalk-pastel field study.
Use two or three muted pigments from the supplied palette.
Preserve the main silhouette and the relationships between important forms.

Build broad forms with side-of-stick rubbings and crumbly pigment deposits.
Blend a few neighboring marks lightly, while keeping broken grain and powdery edges visible.
Use stronger pigment only in selected dark areas.

Keep the scene open and lightly worked.
Leave large light areas empty, without a pastel ground behind them.
Let some forms soften or break apart at their edges.

Avoid wet wash blooms, firm waxy outlines, shiny highlights, and smooth airbrush gradients.
Do not add chalk dust across the whole canvas, a paper texture field, or a rectangular background haze.
```

## Preparation and checks

- Start with cutoff `0.065` and inspect the background for faint noise.
- The bundled example used `0.12`. Use that only when a new generation needs similar cleanup.
- Map primary, sage, and accent pigments separately when present.
- Preserve partly transparent chalk edges. Do not make every mark fully opaque.
- If cleanup removes useful powdery marks, regenerate on cleaner white instead of raising the cutoff further.

## Example

[Transparent Queenstown example](example.webp) · 1233 × 678.
