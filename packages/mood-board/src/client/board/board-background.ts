import type { MediaId } from '../../lib/media';
import type { Board } from './types';

export const DEFAULT_CUSTOM_COLOR = '#C85A3D';

export const DEFAULT_BOARD_BACKGROUND = '#EDEDED';

export const BOARD_BACKGROUNDS = [
  { color: DEFAULT_BOARD_BACKGROUND, label: 'Soft gray' },
  { color: '#F3EFE5', label: 'Warm paper' },
  { color: '#DDE3DC', label: 'Sage fog' },
  { color: '#DDD6CD', label: 'Stone' },
  { color: '#242728', label: 'Charcoal' },
] as const;

export const SWATCHES = [
  { color: '#c85a3d', label: 'Burnt sienna' },
  { color: '#ecb85f', label: 'Saffron' },
  { color: '#e4dccb', label: 'Plaster' },
  { color: '#81907a', label: 'Lichen' },
  { color: '#365b55', label: 'Deep moss' },
  { color: '#253553', label: 'Ink blue' },
  { color: '#8c3335', label: 'Oxblood' },
  { color: '#c7b9b2', label: 'Dust' },
];

export function formatHexColorInput(value: string): string {
  return value.toUpperCase();
}

export function normalizeHexColor(value: string): string | null {
  const formatted = formatHexColorInput(value);

  return /^#[0-9A-F]{6}$/.test(formatted) ? formatted : null;
}

type RgbColor = readonly [red: number, green: number, blue: number];

const hexToRgb = (value: string): RgbColor => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
];

const relativeLuminance = ([red, green, blue]: RgbColor): number => {
  const channel = (value: number) => {
    const normalized = value / 255;

    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return (
    channel(red) * 0.2126 + channel(green) * 0.7152 + channel(blue) * 0.0722
  );
};

export function contrastRatio(left: string, right: string): number {
  const leftColor = normalizeHexColor(left);
  const rightColor = normalizeHexColor(right);

  if (leftColor === null || rightColor === null) return 1;
  const leftLuminance = relativeLuminance(hexToRgb(leftColor));
  const rightLuminance = relativeLuminance(hexToRgb(rightColor));
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

const blendHex = (
  foreground: string,
  background: string,
  weight: number,
): string => {
  const foregroundRgb = hexToRgb(foreground);
  const backgroundRgb = hexToRgb(background);

  const channel = (index: 0 | 1 | 2) =>
    Math.round(
      foregroundRgb[index] * weight + backgroundRgb[index] * (1 - weight),
    )
      .toString(16)
      .padStart(2, '0');

  return `#${channel(0)}${channel(1)}${channel(2)}`.toUpperCase();
};

interface FieldColors {
  readonly foreground: string;
  readonly muted: string;
  readonly selection: string;
}

export function accessibleFieldColors(background: string): FieldColors {
  const normalized = normalizeHexColor(background) ?? DEFAULT_BOARD_BACKGROUND;
  const dark = '#171717';
  const light = '#F8F7F3';

  let foreground =
    contrastRatio(normalized, dark) >= contrastRatio(normalized, light)
      ? dark
      : light;

  if (contrastRatio(normalized, foreground) < 4.5) {
    foreground =
      contrastRatio(normalized, '#000000') >=
      contrastRatio(normalized, '#FFFFFF')
        ? '#000000'
        : '#FFFFFF';
  }

  let muted = foreground;

  for (let weight = 0.55; weight <= 1; weight += 0.05) {
    const candidate = blendHex(foreground, normalized, weight);

    if (contrastRatio(normalized, candidate) >= 4.5) {
      muted = candidate;
      break;
    }
  }

  return { foreground, muted, selection: foreground };
}

export type BoardBackgroundDraft = {
  readonly hex: string;
  readonly lastValidHex: string;
  readonly mediaId?: MediaId | undefined;
};

export const backgroundDraftFromBoard = (
  board: Board,
): BoardBackgroundDraft => {
  const hex = board.background ?? DEFAULT_BOARD_BACKGROUND;

  return board.backgroundMediaId === undefined
    ? { hex, lastValidHex: hex }
    : { hex, lastValidHex: hex, mediaId: board.backgroundMediaId };
};

interface BackgroundReconciliation {
  readonly draft?: BoardBackgroundDraft;
  readonly conflict: boolean;
}

export const reconcileRemoteBackgroundDraft = (
  previous: Board,
  next: Board,
  locallyTouched: boolean,
  existingConflict = false,
): BackgroundReconciliation => {
  const changed =
    previous.background !== next.background ||
    previous.backgroundMediaId !== next.backgroundMediaId;

  return locallyTouched
    ? { conflict: existingConflict || changed }
    : { draft: backgroundDraftFromBoard(next), conflict: false };
};
