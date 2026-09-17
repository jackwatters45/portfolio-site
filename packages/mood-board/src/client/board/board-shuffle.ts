import { rotatedItemBounds } from "./bulk-layout";
import type { BoardItem } from "./types";

export type RandomSource = () => number;

export type ShuffleLimits = {
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly maxCoordinate?: number;
};

type ShuffleSource = {
  readonly item: BoardItem;
  readonly footprintWidth: number;
  readonly footprintHeight: number;
};

type PackedItem = ShuffleSource & {
  readonly footprintX: number;
  readonly footprintY: number;
};

const MIN_GAP = 48;
const VARIABLE_GAP = 64;
const MAX_ITEM_COORDINATE = 20_000;

const randomUnit = (random: RandomSource): number => {
  const value = random();
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(0.999_999, Math.max(0, value));
};

const shuffledCopy = <Value>(values: ReadonlyArray<Value>, random: RandomSource): Value[] => {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomUnit(random) * (index + 1));
    const current = shuffled[index];
    const replacement = shuffled[swapIndex];
    if (current === undefined || replacement === undefined) continue;
    shuffled[index] = replacement;
    shuffled[swapIndex] = current;
  }
  return shuffled;
};

const footprintFor = (item: BoardItem): ShuffleSource => {
  const bounds = rotatedItemBounds(item);
  return {
    item,
    footprintWidth: bounds.width,
    footprintHeight: bounds.height,
  };
};

const packRows = (
  sources: ReadonlyArray<ShuffleSource>,
  vertical: boolean,
  random: RandomSource,
): ReadonlyArray<PackedItem> => {
  const primarySize = (source: ShuffleSource) =>
    vertical ? source.footprintHeight : source.footprintWidth;
  const secondarySize = (source: ShuffleSource) =>
    vertical ? source.footprintWidth : source.footprintHeight;
  const totalArea = sources.reduce(
    (total, source) => total + source.footprintWidth * source.footprintHeight,
    0,
  );
  const longest = Math.max(...sources.map(primarySize));
  const targetSpan = Math.max(longest, Math.sqrt(totalArea) * (0.9 + randomUnit(random) * 0.65));

  const rows: ShuffleSource[][] = [];
  let row: ShuffleSource[] = [];
  let rowSpan = 0;
  for (const source of sources) {
    const gap = row.length === 0 ? 0 : MIN_GAP;
    if (row.length > 0 && rowSpan + gap + primarySize(source) > targetSpan) {
      rows.push(row);
      row = [];
      rowSpan = 0;
    }
    row.push(source);
    rowSpan += (row.length > 1 ? MIN_GAP : 0) + primarySize(source);
  }
  if (row.length > 0) rows.push(row);

  const packed: PackedItem[] = [];
  let secondaryCursor = 0;
  for (const sourcesInRow of rows) {
    const rowSecondarySpan = Math.max(...sourcesInRow.map(secondarySize));
    let primaryCursor = 0;
    for (const [index, source] of sourcesInRow.entries()) {
      if (index > 0) primaryCursor += MIN_GAP + randomUnit(random) * VARIABLE_GAP;
      const secondaryOffset = (rowSecondarySpan - secondarySize(source)) * randomUnit(random);
      const primary = primaryCursor;
      const secondary = secondaryCursor + secondaryOffset;
      packed.push({
        ...source,
        footprintX: vertical ? secondary : primary,
        footprintY: vertical ? primary : secondary,
      });
      primaryCursor += primarySize(source);
    }
    secondaryCursor += rowSecondarySpan + MIN_GAP + randomUnit(random) * VARIABLE_GAP;
  }
  return packed;
};

const shuffledBounds = (items: ReadonlyArray<BoardItem>) => {
  const bounds = items.map(rotatedItemBounds);
  const minX = Math.min(...bounds.map((item) => item.x));
  const minY = Math.min(...bounds.map((item) => item.y));
  const maxX = Math.max(...bounds.map((item) => item.x + item.width));
  const maxY = Math.max(...bounds.map((item) => item.y + item.height));
  return { width: maxX - minX, height: maxY - minY };
};

const withinLimits = (items: ReadonlyArray<BoardItem>, limits: ShuffleLimits): boolean => {
  const maxCoordinate = limits.maxCoordinate ?? MAX_ITEM_COORDINATE;
  if (items.some((item) => Math.abs(item.x) > maxCoordinate || Math.abs(item.y) > maxCoordinate))
    return false;
  const bounds = shuffledBounds(items);
  return (
    bounds.width <= (limits.maxWidth ?? maxCoordinate * 2) &&
    bounds.height <= (limits.maxHeight ?? maxCoordinate * 2)
  );
};

export function shuffleBoardItems(
  items: ReadonlyArray<BoardItem>,
  random: RandomSource = Math.random,
  limits: ShuffleLimits = {},
): BoardItem[] {
  if (items.length < 2) return items.map((item) => ({ ...item }));

  const sourceItems = items.map(footprintFor);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const sources = shuffledCopy(sourceItems, random);
    const packed = packRows(sources, randomUnit(random) < 0.5, random);
    const minX = Math.min(...packed.map((item) => item.footprintX));
    const minY = Math.min(...packed.map((item) => item.footprintY));
    const maxX = Math.max(...packed.map((item) => item.footprintX + item.footprintWidth));
    const maxY = Math.max(...packed.map((item) => item.footprintY + item.footprintHeight));
    const offsetX = -(minX + maxX) / 2;
    const offsetY = -(minY + maxY) / 2;
    const positions = new Map(
      packed.map((entry) => [
        entry.item.id,
        {
          x: entry.footprintX + offsetX + entry.footprintWidth / 2 - entry.item.width / 2,
          y: entry.footprintY + offsetY + entry.footprintHeight / 2 - entry.item.height / 2,
        },
      ]),
    );
    const shuffled = items.map((item) => {
      const position = positions.get(item.id);
      return position === undefined ? { ...item } : { ...item, ...position };
    });
    if (withinLimits(shuffled, limits)) return shuffled;
  }

  throw new Error("This board is too large to shuffle without clipping items.");
}
