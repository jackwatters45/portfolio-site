import { imageDimensionsFromData, type ImageType } from 'image-dimensions';

import { isRecord } from '../../lib/type-guards';
import { decodeHeicBitmap } from './heic-decoder';

export const MAX_SOURCE_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_SOURCE_IMAGE_AXIS = 10_000;
export const MAX_SOURCE_IMAGE_PIXELS = 64_000_000;
export const MAX_HEIC_SOURCE_IMAGE_PIXELS = 50_000_000;
export const IMAGE_FILE_ACCEPT =
  'image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.hif';
const MAX_IMAGE_HEADER_BYTES = 1024 * 1024;

export type SupportedImageFormat = 'jpeg' | 'png' | 'gif' | 'webp' | 'heic';

export type ImagePreflight = {
  readonly format: SupportedImageFormat;
  readonly width: number;
  readonly height: number;
};

const isSupportedFormat = (type: ImageType): type is SupportedImageFormat =>
  type === 'jpeg' ||
  type === 'png' ||
  type === 'gif' ||
  type === 'webp' ||
  type === 'heic';

export function validateImageLimits(
  metadata: {
    readonly type: ImageType;
    readonly width: number;
    readonly height: number;
  },
  byteLength: number,
): ImagePreflight {
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) {
    throw new Error('That image file is empty or malformed.');
  }
  if (byteLength > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error('That image is larger than 30 MB.');
  }
  if (!isSupportedFormat(metadata.type)) {
    throw new Error('Use a JPEG, PNG, GIF, WebP, HEIC, HEIF, or HIF image.');
  }
  const { width, height } = metadata;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new Error('That image has invalid dimensions.');
  }
  if (width > MAX_SOURCE_IMAGE_AXIS || height > MAX_SOURCE_IMAGE_AXIS) {
    throw new Error(
      'That image is over 10,000 pixels on one side. Use a smaller copy.',
    );
  }
  const pixels = width * height;
  if (pixels > MAX_SOURCE_IMAGE_PIXELS) {
    throw new Error(
      'That image contains more than 64 megapixels. Use a smaller copy.',
    );
  }
  if (metadata.type === 'heic' && pixels > MAX_HEIC_SOURCE_IMAGE_PIXELS) {
    throw new Error(
      'That HEIC photo contains more than 50 megapixels. Use a smaller copy.',
    );
  }
  const ratio = width / height;
  if (ratio < 0.125 || ratio > 8) {
    throw new Error('That image is too extremely wide or tall for the board.');
  }
  return { format: metadata.type, width, height };
}

export function preflightImageBytes(
  bytes: Uint8Array,
  byteLength = bytes.byteLength,
): ImagePreflight {
  const metadata = imageDimensionsFromData(bytes);
  if (metadata === undefined) {
    throw new Error('That file is not a supported or valid image.');
  }
  return validateImageLimits(metadata, byteLength);
}

const abortError = () =>
  new DOMException('Image processing was cancelled.', 'AbortError');

export async function preflightImageFile(
  file: File,
  signal?: AbortSignal,
): Promise<ImagePreflight> {
  if (signal?.aborted) throw abortError();
  if (file.size === 0) throw new Error(`${file.name} is empty.`);
  if (file.size > MAX_SOURCE_IMAGE_BYTES)
    throw new Error(`${file.name} is larger than 30 MB.`);
  if (file.type.startsWith('audio/')) {
    throw new Error(
      `${file.name} is audio. Add local audio from the sound panel instead.`,
    );
  }
  const header = new Uint8Array(
    await file
      .slice(0, Math.min(file.size, MAX_IMAGE_HEADER_BYTES))
      .arrayBuffer(),
  );
  if (signal?.aborted) throw abortError();
  try {
    return preflightImageBytes(header, file.size);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('That image'))
      throw error;
    if (error instanceof Error && error.message.startsWith('Use a '))
      throw error;
    throw new Error(`${file.name} is not a supported or valid image.`, {
      cause: error,
    });
  }
}

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortError();
};

export function blobToDataUrl(
  blob: Blob,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const reader = new FileReader();
    const abort = () => {
      reader.abort();
      reject(abortError());
    };
    signal?.addEventListener('abort', abort, { once: true });
    reader.onload = () => {
      signal?.removeEventListener('abort', abort);
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('The image could not be read as a data URL.'));
    };
    reader.onerror = () => {
      signal?.removeEventListener('abort', abort);
      reject(reader.error ?? new Error('The image could not be read.'));
    };
    reader.readAsDataURL(blob);
  });
}

function loadImageSource(
  src: string,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const image = new Image();
    const cleanup = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      image.src = '';
      reject(abortError());
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('That image took too long to load.'));
    }, 12_000);
    signal?.addEventListener('abort', abort, { once: true });
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('That image could not be loaded.'));
    };
    image.referrerPolicy = 'no-referrer';
    image.src = src;
  });
}

export async function inspectImageUrl(src: string) {
  const image = await loadImageSource(src);
  return { width: image.naturalWidth, height: image.naturalHeight };
}

const metadataTime = (value: unknown): number | null => {
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readCaptureTime = async (
  file: File,
  signal?: AbortSignal,
): Promise<number> => {
  try {
    const { parse } = await import('exifr');
    throwIfAborted(signal);
    const metadata: unknown = await parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate'],
    });
    throwIfAborted(signal);
    if (isRecord(metadata)) {
      const captured =
        metadataTime(metadata.DateTimeOriginal) ??
        metadataTime(metadata.CreateDate);
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
): Pick<ImageBitmapOptions, 'resizeWidth' | 'resizeHeight'> => {
  if (Math.max(width, height) <= longestEdge) return {};
  return width >= height
    ? { resizeWidth: longestEdge }
    : { resizeHeight: longestEdge };
};

const createNativeBitmap = (
  file: File,
  metadata: ImagePreflight,
  longestEdge: number,
  signal?: AbortSignal,
): Promise<ImageBitmap> =>
  new Promise((resolve, reject) => {
    throwIfAborted(signal);
    if (typeof createImageBitmap !== 'function') {
      reject(new Error('This browser does not provide native image decoding.'));
      return;
    }
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    };
    const fail = (error: Error | DOMException) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const abort = () => fail(abortError());
    const timeout = window.setTimeout(() => {
      fail(new Error('That image took too long to decode.'));
    }, 12_000);
    signal?.addEventListener('abort', abort, { once: true });
    void createImageBitmap(file, {
      imageOrientation: 'from-image',
      resizeQuality: 'high',
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
        fail(
          error instanceof Error
            ? error
            : new Error('That image could not be decoded.'),
        );
      });
  });

const encodeBitmap = async (
  bitmap: ImageBitmap,
  longestEdge: number,
  quality: number,
  signal?: AbortSignal,
): Promise<{
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
}> => {
  const scale = Math.min(
    1,
    longestEdge / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Your browser could not prepare that image.');
    context.drawImage(bitmap, 0, 0, width, height);
    throwIfAborted(signal);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error('The image could not be compressed.')),
        'image/webp',
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
  if (metadata.format === 'heic') {
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
  if (metadata.format === 'gif') {
    if (file.size > 8 * 1024 * 1024) {
      throw new Error(
        'That GIF is too large to save safely. Use one smaller than 8 MB.',
      );
    }
    return { blob: file, width: metadata.width, height: metadata.height };
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createNativeBitmap(file, metadata, 2200, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (metadata.format !== 'heic') {
      throw new Error('That image could not be decoded by this browser.', {
        cause: error,
      });
    }
    bitmap = await decodeHeicBitmap(
      file,
      metadata.width,
      metadata.height,
      2200,
      signal,
    );
  }
  try {
    const encoded = await encodeBitmap(bitmap, 2200, 0.88, signal);
    if (encoded.blob.size > 12 * 1024 * 1024) {
      throw new Error(
        'That image is too detailed to upload safely. Try a smaller copy.',
      );
    }
    return encoded;
  } finally {
    bitmap.close();
  }
}
