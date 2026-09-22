#!/usr/bin/env python3
"""Extract known pigments from a plain background and write a transparent asset.

Requires Pillow and NumPy. This is palette-based matting, not general photo
segmentation. Use it for generated artwork on a plain light background.
"""

import argparse
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageColor


def color(value):
    try:
        return ImageColor.getrgb(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(str(error)) from error


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--background", type=color, default=(255, 255, 255))
    parser.add_argument("--source-ink", type=color, action="append", required=True)
    parser.add_argument("--ink", type=color, action="append", required=True)
    parser.add_argument("--cutoff", type=float, default=0.065,
                        help="Remove background noise below this pigment density (default: 0.065)")
    parser.add_argument("--padding", type=int, default=20)
    args = parser.parse_args()

    if len(args.source_ink) != len(args.ink):
        parser.error("Supply one target --ink for each --source-ink, in matching order.")
    if not 0 <= args.cutoff < 1:
        parser.error("--cutoff must be at least zero and less than one.")
    if args.padding < 0:
        parser.error("--padding must be zero or greater.")
    if args.output.suffix.lower() not in {".png", ".webp"}:
        parser.error("Use .png or .webp to preserve transparency.")
    if args.output.exists():
        parser.error("The output already exists. Use a new filename to preserve it.")
    if args.input.resolve() == args.output.resolve():
        parser.error("Keep the original generation separate from the output.")
    if any(len(c) != 3 for c in [args.background, *args.source_ink, *args.ink]):
        parser.error("Use RGB colors without an alpha component.")

    try:
        with Image.open(args.input) as source:
            source = np.asarray(source.convert("RGBA"), dtype=np.float32)
    except (OSError, ValueError) as error:
        parser.error(f"Cannot read input: {error}")

    paper = np.array(args.background, dtype=np.float32)
    pigments = np.array(args.source_ink, dtype=np.float32)
    targets = np.array(args.ink, dtype=np.uint8)
    vectors = paper - pigments
    lengths = np.sum(vectors * vectors, axis=1)
    if np.any(lengths < 1):
        parser.error("A source ink cannot be the same color as the background.")

    # Each pixel is approximated by a pigment mixed with the background.
    density = paper - source[..., :3]
    alpha = np.clip(np.einsum("hwc,kc->hwk", density, vectors) / lengths, 0, 1)
    predicted = alpha[..., None] * vectors
    errors = np.sum((density[:, :, None, :] - predicted) ** 2, axis=3)
    choice = errors.argmin(axis=2)
    strength = np.take_along_axis(alpha, choice[..., None], axis=2)[..., 0]
    strength = np.clip((strength - args.cutoff) / (1 - args.cutoff), 0, 1)
    strength *= source[..., 3] / 255
    alpha_bytes = np.rint(strength * 255).astype(np.uint8)

    ys, xs = np.where(alpha_bytes > 0)
    if not len(xs):
        parser.error("No pigment remains. Check source inks, background, and cutoff.")
    height, width = alpha_bytes.shape
    left, top, right, bottom = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    if left == 0 or top == 0 or right == width or bottom == height:
        print("Warning: artwork reaches an input edge. Inspect for clipped marks.", file=sys.stderr)

    rgba = np.dstack((targets[choice], alpha_bytes))
    artwork = Image.fromarray(rgba).crop((left, top, right, bottom))
    result = Image.new("RGBA", (artwork.width + 2 * args.padding,
                                artwork.height + 2 * args.padding))
    result.paste(artwork, (args.padding, args.padding))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    options = {"lossless": True} if args.output.suffix.lower() == ".webp" else {}
    result.save(args.output, **options)
    print(f"Saved {args.output} ({result.width} × {result.height}, transparent)")


if __name__ == "__main__":
    main()
