import { BoardTimestampSchema, ItemIdSchema, type ItemId } from "../../lib/board-rpc";
import { isRecord } from "../../lib/type-guards";
import { decodeHeicBitmap } from "../media/heic-decoder";
import { preflightImageFile, type ImagePreflight } from "../media/image-preflight";
import { MAX_ZOOM, MIN_ZOOM } from "./camera";
import type { Board, BoardItem, Camera } from "./types";

export { MAX_ZOOM, MIN_ZOOM } from "./camera";
export const MAX_EMBEDDED_IMAGE_CHARACTERS = 12 * 1024 * 1024;
export const DEFAULT_CUSTOM_COLOR = "#C85A3D";
export const DEFAULT_BOARD_BACKGROUND = "#EDEDED";

export const BOARD_BACKGROUNDS = [
  { color: DEFAULT_BOARD_BACKGROUND, label: "Soft gray" },
  { color: "#F3EFE5", label: "Warm paper" },
  { color: "#DDE3DC", label: "Sage fog" },
  { color: "#DDD6CD", label: "Stone" },
  { color: "#242728", label: "Charcoal" },
] as const;

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
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return channel(red) * 0.2126 + channel(green) * 0.7152 + channel(blue) * 0.0722;
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

const blendHex = (foreground: string, background: string, weight: number): string => {
  const foregroundRgb = hexToRgb(foreground);
  const backgroundRgb = hexToRgb(background);
  const channel = (index: 0 | 1 | 2) =>
    Math.round(foregroundRgb[index] * weight + backgroundRgb[index] * (1 - weight))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`.toUpperCase();
};

export function accessibleFieldColors(background: string): {
  readonly foreground: string;
  readonly muted: string;
  readonly selection: string;
} {
  const normalized = normalizeHexColor(background) ?? DEFAULT_BOARD_BACKGROUND;
  const dark = "#171717";
  const light = "#F8F7F3";
  let foreground =
    contrastRatio(normalized, dark) >= contrastRatio(normalized, light) ? dark : light;
  if (contrastRatio(normalized, foreground) < 4.5) {
    foreground =
      contrastRatio(normalized, "#000000") >= contrastRatio(normalized, "#FFFFFF")
        ? "#000000"
        : "#FFFFFF";
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

export const SWATCHES = [
  { color: "#c85a3d", label: "Burnt sienna" },
  { color: "#ecb85f", label: "Saffron" },
  { color: "#e4dccb", label: "Plaster" },
  { color: "#81907a", label: "Lichen" },
  { color: "#365b55", label: "Deep moss" },
  { color: "#253553", label: "Ink blue" },
  { color: "#8c3335", label: "Oxblood" },
  { color: "#c7b9b2", label: "Dust" },
];

const itemId = (value: string): ItemId => ItemIdSchema.make(value);

const demoItems: BoardItem[] = [
  {
    id: itemId("sample-alpine"),
    kind: "image",
    src: "https://picsum.photos/seed/alpine-form/1600/1050",
    x: -1140,
    y: -610,
    width: 760,
    height: 499,
    rotation: 0,
    order: 1,
  },
  {
    id: itemId("sample-figure"),
    kind: "image",
    src: "https://picsum.photos/seed/quiet-figure/900/1250",
    x: -310,
    y: -690,
    width: 440,
    height: 611,
    rotation: 0,
    order: 2,
  },
  {
    id: itemId("sample-architecture"),
    kind: "image",
    src: "https://picsum.photos/seed/soft-architecture/1500/980",
    x: 220,
    y: -560,
    width: 720,
    height: 470,
    rotation: 0,
    order: 3,
  },
  {
    id: itemId("sample-still-life"),
    kind: "image",
    src: "https://picsum.photos/seed/amber-still-life/1000/1350",
    x: -1240,
    y: 0,
    width: 510,
    height: 689,
    rotation: 0,
    order: 4,
  },
  {
    id: itemId("sample-swatch"),
    kind: "swatch",
    color: "#8c3335",
    label: "Oxblood / evening",
    x: -650,
    y: -15,
    width: 350,
    height: 450,
    rotation: 0,
    order: 5,
  },
  {
    id: itemId("sample-note"),
    kind: "note",
    text: "A room that feels collected, not decorated.",
    x: -195,
    y: 25,
    width: 520,
    height: 330,
    rotation: 0,
    order: 6,
  },
  {
    id: itemId("sample-water"),
    kind: "image",
    src: "https://picsum.photos/seed/water-memory/960/1280",
    x: 410,
    y: 20,
    width: 450,
    height: 600,
    rotation: 0,
    order: 7,
  },
  {
    id: itemId("sample-object"),
    kind: "image",
    src: "https://picsum.photos/seed/strange-object/1450/920",
    x: -890,
    y: 760,
    width: 700,
    height: 444,
    rotation: 0,
    order: 8,
  },
  {
    id: itemId("sample-paper"),
    kind: "image",
    src: "https://picsum.photos/seed/paper-study/1200/900",
    x: -80,
    y: 690,
    width: 620,
    height: 465,
    rotation: 0,
    order: 9,
  },
  {
    id: itemId("sample-blue"),
    kind: "swatch",
    color: "#253553",
    label: "Ink / after midnight",
    x: 650,
    y: 710,
    width: 360,
    height: 430,
    rotation: 0,
    order: 10,
  },
];

export function createDemoBoard(): Board {
  return {
    version: 1,
    title: "For the way a place can feel",
    items: demoItems.map((item) => ({ ...item })),
    updatedAt: BoardTimestampSchema.make(Date.now()),
  };
}

export function createEmptyBoard(): Board {
  return {
    version: 1,
    title: "Untitled mood",
    items: [],
    updatedAt: BoardTimestampSchema.make(Date.now()),
  };
}

export function createId(): ItemId {
  return ItemIdSchema.make(`${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`);
}

export function screenToWorld(point: { x: number; y: number }, camera: Camera) {
  return {
    x: point.x / camera.z - camera.x,
    y: point.y / camera.z - camera.y,
  };
}

export function zoomCamera(
  camera: Camera,
  point: { x: number; y: number },
  nextZoom: number,
): Camera {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const anchor = screenToWorld(point, camera);

  return {
    x: point.x / z - anchor.x,
    y: point.y / z - anchor.y,
    z,
  };
}

export function fitCamera(
  items: BoardItem[],
  viewport = { width: window.innerWidth, height: window.innerHeight },
): Camera {
  if (items.length === 0) {
    return { x: viewport.width / 2, y: viewport.height / 2, z: 1 };
  }

  const bounds = items.map((item) => {
    const radians = (item.rotation * Math.PI) / 180;
    const rotatedWidth =
      Math.abs(item.width * Math.cos(radians)) + Math.abs(item.height * Math.sin(radians));
    const rotatedHeight =
      Math.abs(item.width * Math.sin(radians)) + Math.abs(item.height * Math.cos(radians));
    const centerX = item.x + item.width / 2;
    const centerY = item.y + item.height / 2;
    return {
      minX: centerX - rotatedWidth / 2,
      minY: centerY - rotatedHeight / 2,
      maxX: centerX + rotatedWidth / 2,
      maxY: centerY + rotatedHeight / 2,
    };
  });
  const minX = Math.min(...bounds.map((item) => item.minX));
  const minY = Math.min(...bounds.map((item) => item.minY));
  const maxX = Math.max(...bounds.map((item) => item.maxX));
  const maxY = Math.max(...bounds.map((item) => item.maxY));
  const boardWidth = Math.max(1, maxX - minX);
  const boardHeight = Math.max(1, maxY - minY);
  const sidePadding = viewport.width < 640 ? 34 : 72;
  const topPadding = 48;
  const bottomPadding = viewport.width < 640 ? 118 : 126;
  const usableWidth = viewport.width - sidePadding * 2;
  const usableHeight = viewport.height - topPadding - bottomPadding;
  const z = Math.min(
    1,
    Math.max(MIN_ZOOM, Math.min(usableWidth / boardWidth, usableHeight / boardHeight)),
  );

  return {
    x: (sidePadding + usableWidth / 2) / z - (minX + boardWidth / 2),
    y: (topPadding + usableHeight / 2) / z - (minY + boardHeight / 2),
    z,
  };
}

const abortError = () => new DOMException("Image processing was cancelled.", "AbortError");

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortError();
};

export function blobToDataUrl(blob: Blob, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const reader = new FileReader();
    const abort = () => {
      reader.abort();
      reject(abortError());
    };
    signal?.addEventListener("abort", abort, { once: true });
    reader.onload = () => {
      signal?.removeEventListener("abort", abort);
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The image could not be read as a data URL."));
    };
    reader.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(reader.error ?? new Error("The image could not be read."));
    };
    reader.readAsDataURL(blob);
  });
}

function loadImageSource(src: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const image = new Image();
    const cleanup = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      image.src = "";
      reject(abortError());
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("That image took too long to load."));
    }, 12_000);
    signal?.addEventListener("abort", abort, { once: true });
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("That image could not be loaded."));
    };
    image.referrerPolicy = "no-referrer";
    image.src = src;
  });
}

export async function inspectImageUrl(src: string) {
  const image = await loadImageSource(src);
  return { width: image.naturalWidth, height: image.naturalHeight };
}

const metadataTime = (value: unknown): number | null => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readCaptureTime = async (file: File, signal?: AbortSignal): Promise<number> => {
  try {
    const { parse } = await import("exifr");
    throwIfAborted(signal);
    const metadata: unknown = await parse(file, {
      pick: ["DateTimeOriginal", "CreateDate"],
    });
    throwIfAborted(signal);
    if (isRecord(metadata)) {
      const captured = metadataTime(metadata.DateTimeOriginal) ?? metadataTime(metadata.CreateDate);
      if (captured !== null) return captured;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  return file.lastModified > 0 ? file.lastModified : 0;
};

const resizeOptions = (
  width: number,
  height: number,
  longestEdge: number,
): Pick<ImageBitmapOptions, "resizeWidth" | "resizeHeight"> => {
  if (Math.max(width, height) <= longestEdge) return {};
  return width >= height ? { resizeWidth: longestEdge } : { resizeHeight: longestEdge };
};

const createNativeBitmap = (
  file: File,
  metadata: ImagePreflight,
  longestEdge: number,
  signal?: AbortSignal,
): Promise<ImageBitmap> =>
  new Promise((resolve, reject) => {
    throwIfAborted(signal);
    if (typeof createImageBitmap !== "function") {
      reject(new Error("This browser does not provide native image decoding."));
      return;
    }
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    };
    const fail = (error: Error | DOMException) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const abort = () => fail(abortError());
    const timeout = window.setTimeout(() => {
      fail(new Error("That image took too long to decode."));
    }, 12_000);
    signal?.addEventListener("abort", abort, { once: true });
    void createImageBitmap(file, {
      imageOrientation: "from-image",
      resizeQuality: "high",
      ...resizeOptions(metadata.width, metadata.height, longestEdge),
    })
      .then((bitmap) => {
        if (settled) {
          bitmap.close();
          return;
        }
        settled = true;
        cleanup();
        resolve(bitmap);
      })
      .catch((error: unknown) => {
        fail(error instanceof Error ? error : new Error("That image could not be decoded."));
      });
  });

const encodeBitmap = async (
  bitmap: ImageBitmap,
  longestEdge: number,
  quality: number,
  signal?: AbortSignal,
): Promise<{ readonly blob: Blob; readonly width: number; readonly height: number }> => {
  const scale = Math.min(1, longestEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Your browser could not prepare that image.");
    context.drawImage(bitmap, 0, 0, width, height);
    throwIfAborted(signal);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error("The image could not be compressed.")),
        "image/webp",
        quality,
      );
    });
    throwIfAborted(signal);
    return { blob, width, height };
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
};

const heicPlaceholder = (metadata: ImagePreflight): string => {
  const landscape = metadata.width >= metadata.height;
  const width = landscape
    ? 320
    : Math.max(80, Math.round((320 * metadata.width) / metadata.height));
  const height = landscape
    ? Math.max(80, Math.round((320 * metadata.height) / metadata.width))
    : 320;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#d9d5cc"/><text x="50%" y="48%" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" fill="#34322f">HEIC</text><text x="50%" y="61%" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="#67635d">Preview after adding</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export async function inspectImageFile(
  file: File,
  signal?: AbortSignal,
): Promise<{
  width: number;
  height: number;
  captureTime: number;
  thumbnailSrc: string;
}> {
  const metadata = await preflightImageFile(file, signal);
  throwIfAborted(signal);
  const captureTime = await readCaptureTime(file, signal);
  if (metadata.format === "heic") {
    return {
      width: metadata.width,
      height: metadata.height,
      captureTime,
      thumbnailSrc: heicPlaceholder(metadata),
    };
  }
  const bitmap = await createNativeBitmap(file, metadata, 320, signal);
  try {
    const thumbnail = await encodeBitmap(bitmap, 320, 0.72, signal);
    return {
      width: metadata.width,
      height: metadata.height,
      captureTime,
      thumbnailSrc: await blobToDataUrl(thumbnail.blob, signal),
    };
  } finally {
    bitmap.close();
  }
}

export async function ingestImageFile(
  file: File,
  signal?: AbortSignal,
): Promise<{ blob: Blob; width: number; height: number }> {
  const metadata = await preflightImageFile(file, signal);
  throwIfAborted(signal);
  if (metadata.format === "gif") {
    if (file.size > 8 * 1024 * 1024) {
      throw new Error("That GIF is too large to save safely. Use one smaller than 8 MB.");
    }
    return { blob: file, width: metadata.width, height: metadata.height };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createNativeBitmap(file, metadata, 2200, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (metadata.format !== "heic") {
      throw new Error("That image could not be decoded by this browser.", { cause: error });
    }
    bitmap = await decodeHeicBitmap(file, metadata.width, metadata.height, 2200, signal);
  }
  try {
    const encoded = await encodeBitmap(bitmap, 2200, 0.88, signal);
    if (encoded.blob.size > 12 * 1024 * 1024) {
      throw new Error("That image is too detailed to upload safely. Try a smaller copy.");
    }
    return encoded;
  } finally {
    bitmap.close();
  }
}
