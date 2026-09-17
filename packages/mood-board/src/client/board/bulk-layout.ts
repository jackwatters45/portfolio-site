import type { BulkLayoutKind } from "./bulk-image-import";
import type { BoardItem } from "./types";

export type LayoutSource = {
  readonly id: string;
  readonly width: number;
  readonly height: number;
};

export type LayoutItem = LayoutSource & {
  readonly x: number;
  readonly y: number;
};

export type Bounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type LayoutResult = {
  readonly items: ReadonlyArray<LayoutItem>;
  readonly bounds: Bounds;
};

const GAP = 32;
const TARGET_HEIGHT = 280;
const MAX_ROW_WIDTH = 1_240;

const ratio = (item: LayoutSource) => {
  const value = item.width / item.height;
  if (!Number.isFinite(value) || value < 0.125 || value > 8) {
    throw new Error("Bulk layouts require image ratios between 1:8 and 8:1.");
  }
  return value;
};

const boundsFor = (items: ReadonlyArray<LayoutItem>): Bounds => {
  if (items.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...items.map((item) => item.x));
  const minY = Math.min(...items.map((item) => item.y));
  const maxX = Math.max(...items.map((item) => item.x + item.width));
  const maxY = Math.max(...items.map((item) => item.y + item.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const normalize = (items: ReadonlyArray<LayoutItem>): LayoutResult => {
  const bounds = boundsFor(items);
  const normalized = items.map((item) => ({
    ...item,
    x: item.x - bounds.x,
    y: item.y - bounds.y,
  }));
  const normalizedBounds = boundsFor(normalized);
  return { items: normalized, bounds: normalizedBounds };
};

const looseLayout = (sources: ReadonlyArray<LayoutSource>): LayoutResult => {
  const rows: LayoutSource[][] = [];
  let row: LayoutSource[] = [];
  let rowWidth = 0;
  for (const source of sources) {
    const width = TARGET_HEIGHT * ratio(source);
    const projected = rowWidth + (row.length > 0 ? GAP : 0) + width;
    if (row.length > 0 && projected > MAX_ROW_WIDTH) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }
    row.push(source);
    rowWidth += (row.length > 1 ? GAP : 0) + width;
  }
  if (row.length > 0) rows.push(row);

  const placed: LayoutItem[] = [];
  let y = 0;
  rows.forEach((sourcesInRow, rowIndex) => {
    const naturalWidth =
      sourcesInRow.reduce((sum, source) => sum + TARGET_HEIGHT * ratio(source), 0) +
      GAP * Math.max(0, sourcesInRow.length - 1);
    const available = Math.max(200, MAX_ROW_WIDTH - GAP * Math.max(0, sourcesInRow.length - 1));
    const height =
      rowIndex === rows.length - 1
        ? TARGET_HEIGHT
        : Math.min(
            TARGET_HEIGHT,
            available / sourcesInRow.reduce((sum, source) => sum + ratio(source), 0),
          );
    let x = Math.max(0, (MAX_ROW_WIDTH - Math.min(MAX_ROW_WIDTH, naturalWidth)) / 2);
    for (const source of sourcesInRow) {
      const width = height * ratio(source);
      placed.push({ ...source, x, y, width, height });
      x += width + GAP;
    }
    y += height + GAP;
  });
  return normalize(placed);
};

const contactLayout = (sources: ReadonlyArray<LayoutSource>): LayoutResult => {
  const columns = Math.max(1, Math.ceil(Math.sqrt(sources.length)));
  const cellWidth = 300;
  const cellHeight = 260;
  const placed = sources.map((source, index): LayoutItem => {
    const scale = Math.min(cellWidth / source.width, cellHeight / source.height);
    const width = source.width * scale;
    const height = source.height * scale;
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      ...source,
      width,
      height,
      x: column * (cellWidth + GAP) + (cellWidth - width) / 2,
      y: row * (cellHeight + GAP) + (cellHeight - height) / 2,
    };
  });
  return normalize(placed);
};

const masonryLayout = (sources: ReadonlyArray<LayoutSource>): LayoutResult => {
  const columns = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(sources.length))));
  const columnWidth = 300;
  const heights = Array.from({ length: columns }, () => 0);
  const placed = sources.map((source): LayoutItem => {
    let column = 0;
    for (let index = 1; index < columns; index += 1) {
      if ((heights[index] ?? 0) < (heights[column] ?? 0)) column = index;
    }
    const height = columnWidth / ratio(source);
    const y = heights[column] ?? 0;
    heights[column] = y + height + GAP;
    return {
      ...source,
      width: columnWidth,
      height,
      x: column * (columnWidth + GAP),
      y,
    };
  });
  return normalize(placed);
};

export function layoutBulkImages(
  sources: ReadonlyArray<LayoutSource>,
  kind: BulkLayoutKind,
): LayoutResult {
  if (sources.length === 0) return { items: [], bounds: { x: 0, y: 0, width: 0, height: 0 } };
  if (kind === "contact") return contactLayout(sources);
  if (kind === "masonry") return masonryLayout(sources);
  return looseLayout(sources);
}

export function rotatedItemBounds(
  item: Pick<BoardItem, "x" | "y" | "width" | "height" | "rotation">,
): Bounds {
  const radians = (item.rotation * Math.PI) / 180;
  const width =
    Math.abs(item.width * Math.cos(radians)) + Math.abs(item.height * Math.sin(radians));
  const height =
    Math.abs(item.width * Math.sin(radians)) + Math.abs(item.height * Math.cos(radians));
  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

export const boundsOverlap = (left: Bounds, right: Bounds, gap = 0): boolean =>
  left.x < right.x + right.width + gap &&
  left.x + left.width + gap > right.x &&
  left.y < right.y + right.height + gap &&
  left.y + left.height + gap > right.y;

function* squareSpiral(step: number): Generator<readonly [number, number]> {
  yield [0, 0];
  for (let ring = 1; ; ring += 1) {
    for (let x = -ring; x < ring; x += 1) yield [x * step, -ring * step];
    for (let y = -ring; y < ring; y += 1) yield [ring * step, y * step];
    for (let x = ring; x > -ring; x -= 1) yield [x * step, ring * step];
    for (let y = ring; y > -ring; y -= 1) yield [-ring * step, y * step];
  }
}

export function placeLayoutWithoutOverlap(
  layout: LayoutResult,
  anchor: { readonly x: number; readonly y: number },
  existing: ReadonlyArray<Pick<BoardItem, "x" | "y" | "width" | "height" | "rotation">>,
): LayoutResult {
  const baseX = anchor.x - layout.bounds.width / 2;
  const baseY = anchor.y - layout.bounds.height / 2;
  const obstacles = existing.map(rotatedItemBounds);
  let attempts = 0;
  for (const [offsetX, offsetY] of squareSpiral(180)) {
    const groupBounds = {
      x: baseX + offsetX,
      y: baseY + offsetY,
      width: layout.bounds.width,
      height: layout.bounds.height,
    };
    if (!obstacles.some((obstacle) => boundsOverlap(groupBounds, obstacle, GAP))) {
      return {
        bounds: groupBounds,
        items: layout.items.map((item) => ({
          ...item,
          x: item.x + groupBounds.x,
          y: item.y + groupBounds.y,
        })),
      };
    }
    attempts += 1;
    if (attempts >= 20_000) throw new Error("Could not find open canvas space for this import.");
  }
  throw new Error("Could not find open canvas space for this import.");
}
