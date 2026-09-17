import { describe, expect, it } from "vitest";

import {
  boundsOverlap,
  layoutBulkImages,
  placeLayoutWithoutOverlap,
  rotatedItemBounds,
  type LayoutItem,
} from "../src/client/board/bulk-layout";

const sources = [
  { id: "wide", width: 1600, height: 900 },
  { id: "portrait", width: 800, height: 1200 },
  { id: "square", width: 1000, height: 1000 },
  { id: "wide-2", width: 1400, height: 800 },
  { id: "portrait-2", width: 700, height: 1100 },
];

const overlaps = (items: ReadonlyArray<LayoutItem>) => {
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      const a = items[left];
      const b = items[right];
      if (a && b && boundsOverlap(a, b)) return true;
    }
  }
  return false;
};

describe("bulk assisted layouts", () => {
  for (const kind of ["loose", "contact", "masonry"] as const) {
    it(`${kind} is deterministic, aspect preserving, normalized, and non-overlapping`, () => {
      const first = layoutBulkImages(sources, kind);
      const second = layoutBulkImages(sources, kind);
      expect(first).toEqual(second);
      expect(first.bounds.x).toBe(0);
      expect(first.bounds.y).toBe(0);
      expect(overlaps(first.items)).toBe(false);
      first.items.forEach((item) => {
        const source = sources.find((candidate) => candidate.id === item.id);
        expect(source).toBeDefined();
        expect(item.width / item.height).toBeCloseTo(
          (source?.width ?? 1) / (source?.height ?? 1),
          8,
        );
      });
    });
  }

  it("rejects extreme ratios instead of silently cropping them", () => {
    expect(() => layoutBulkImages([{ id: "too-wide", width: 900, height: 100 }], "loose")).toThrow(
      "between 1:8 and 8:1",
    );
    expect(() =>
      layoutBulkImages([{ id: "too-tall", width: 100, height: 900 }], "masonry"),
    ).toThrow("between 1:8 and 8:1");
  });

  it("masonry assigns work to the shortest deterministic column", () => {
    const result = layoutBulkImages(sources, "masonry");
    expect(result.items[0]?.x).toBe(0);
    expect(result.items[1]?.x).toBeGreaterThan(0);
    expect(new Set(result.items.map((item) => item.x)).size).toBeGreaterThan(1);
  });

  it("centers a free group and walks outward around rotated obstacles", () => {
    const layout = layoutBulkImages(sources.slice(0, 2), "contact");
    const centered = placeLayoutWithoutOverlap(layout, { x: 500, y: 400 }, []);
    expect(centered.bounds.x + centered.bounds.width / 2).toBeCloseTo(500);
    expect(centered.bounds.y + centered.bounds.height / 2).toBeCloseTo(400);

    const obstacle = { x: 120, y: 80, width: 760, height: 620, rotation: 24 };
    const moved = placeLayoutWithoutOverlap(layout, { x: 500, y: 400 }, [obstacle]);
    expect(moved.bounds).not.toEqual(centered.bounds);
    expect(boundsOverlap(moved.bounds, rotatedItemBounds(obstacle), 32)).toBe(false);
    expect(placeLayoutWithoutOverlap(layout, { x: 500, y: 400 }, [obstacle])).toEqual(moved);
  });

  it("avoids clustered existing items without overlapping the imported group", () => {
    const layout = layoutBulkImages(sources, "loose");
    const obstacles = [
      { x: -1000, y: -1000, width: 2000, height: 2000, rotation: 0 },
      { x: 1000, y: -1000, width: 900, height: 2000, rotation: -12 },
    ];
    const placed = placeLayoutWithoutOverlap(layout, { x: 0, y: 0 }, obstacles);
    expect(
      obstacles.some((item) => boundsOverlap(placed.bounds, rotatedItemBounds(item), 32)),
    ).toBe(false);
    expect(overlaps(placed.items)).toBe(false);
  });
});
