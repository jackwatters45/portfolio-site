import { describe, expect, it } from "vitest";

import { shuffleBoardItems } from "../src/client/board/board-shuffle";
import { boundsOverlap, rotatedItemBounds } from "../src/client/board/bulk-layout";
import type { BoardItem } from "../src/client/board/types";
import { ItemIdSchema } from "../src/lib/board-rpc";

const items: BoardItem[] = [
  {
    id: ItemIdSchema.make("landscape"),
    kind: "image",
    src: "landscape.jpg",
    x: -600,
    y: -300,
    width: 640,
    height: 420,
    rotation: -3,
    order: 1,
  },
  {
    id: ItemIdSchema.make("portrait"),
    kind: "image",
    src: "portrait.jpg",
    x: 80,
    y: -420,
    width: 360,
    height: 560,
    rotation: 2,
    order: 2,
  },
  {
    id: ItemIdSchema.make("note"),
    kind: "note",
    text: "Collected, not decorated.",
    x: -260,
    y: 180,
    width: 520,
    height: 320,
    rotation: 0,
    order: 3,
  },
  {
    id: ItemIdSchema.make("color"),
    kind: "swatch",
    color: "#8c3335",
    x: 340,
    y: 230,
    width: 340,
    height: 420,
    rotation: 4,
    order: 4,
  },
];

const seededRandom = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
};

const centerOf = (entries: ReadonlyArray<BoardItem>) => {
  const bounds = entries.map(rotatedItemBounds);
  const minX = Math.min(...bounds.map((item) => item.x));
  const minY = Math.min(...bounds.map((item) => item.y));
  const maxX = Math.max(...bounds.map((item) => item.x + item.width));
  const maxY = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
};

describe("shuffleBoardItems", () => {
  it("rearranges items without changing their content, size, rotation, or layer order", () => {
    const shuffled = shuffleBoardItems(items, seededRandom(12));

    expect(shuffled.map(({ x: _x, y: _y, ...item }) => item)).toEqual(
      items.map(({ x: _x, y: _y, ...item }) => item),
    );
    expect(shuffled.map(({ x, y }) => ({ x, y }))).not.toEqual(items.map(({ x, y }) => ({ x, y })));
  });

  it("packs rotated item bounds without overlap and centers the new composition", () => {
    const shuffled = shuffleBoardItems(items, seededRandom(84));
    const bounds = shuffled.map(rotatedItemBounds);

    for (const [index, itemBounds] of bounds.entries()) {
      for (const otherBounds of bounds.slice(index + 1)) {
        expect(boundsOverlap(itemBounds, otherBounds)).toBe(false);
      }
    }
    expect(centerOf(shuffled).x).toBeCloseTo(0);
    expect(centerOf(shuffled).y).toBeCloseTo(0);
  });

  it("produces different arrangements from different random sequences", () => {
    const first = shuffleBoardItems(items, seededRandom(2));
    const second = shuffleBoardItems(items, seededRandom(3));

    expect(first.map(({ x, y }) => ({ x, y }))).not.toEqual(second.map(({ x, y }) => ({ x, y })));
  });

  it("brings edge-positioned items back inside reload-safe coordinate bounds", () => {
    const largeItems = items.slice(0, 2).map((item, index) => ({
      ...item,
      x: 20_000,
      y: 20_000,
      width: 5_000,
      height: 5_000,
      rotation: 0,
      id: ItemIdSchema.make(`large-${index}`),
    }));

    const shuffled = shuffleBoardItems(largeItems, seededRandom(9));

    expect(shuffled.every((item) => Math.abs(item.x) <= 20_000)).toBe(true);
    expect(shuffled.every((item) => Math.abs(item.y) <= 20_000)).toBe(true);
  });

  it("rejects arrangements that cannot fit the available viewport", () => {
    expect(() =>
      shuffleBoardItems(items, seededRandom(7), { maxWidth: 400, maxHeight: 400 }),
    ).toThrow("too large to shuffle without clipping");
  });

  it("leaves a one-item board in place", () => {
    const shuffled = shuffleBoardItems(items.slice(0, 1), seededRandom(5));

    expect(shuffled).toEqual(items.slice(0, 1));
    expect(shuffled[0]).not.toBe(items[0]);
  });
});
