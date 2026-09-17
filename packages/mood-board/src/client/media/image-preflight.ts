import { imageDimensionsFromData, type ImageType } from "image-dimensions";

export const MAX_SOURCE_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_SOURCE_IMAGE_AXIS = 10_000;
export const MAX_SOURCE_IMAGE_PIXELS = 64_000_000;
export const MAX_HEIC_SOURCE_IMAGE_PIXELS = 50_000_000;
export const IMAGE_FILE_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.hif";
const MAX_IMAGE_HEADER_BYTES = 1024 * 1024;

export type SupportedImageFormat = "jpeg" | "png" | "gif" | "webp" | "heic";

export type ImagePreflight = {
  readonly format: SupportedImageFormat;
  readonly width: number;
  readonly height: number;
};

const isSupportedFormat = (type: ImageType): type is SupportedImageFormat =>
  type === "jpeg" || type === "png" || type === "gif" || type === "webp" || type === "heic";

export function validateImageLimits(
  metadata: { readonly type: ImageType; readonly width: number; readonly height: number },
  byteLength: number,
): ImagePreflight {
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) {
    throw new Error("That image file is empty or malformed.");
  }
  if (byteLength > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("That image is larger than 30 MB.");
  }
  if (!isSupportedFormat(metadata.type)) {
    throw new Error("Use a JPEG, PNG, GIF, WebP, HEIC, HEIF, or HIF image.");
  }
  const { width, height } = metadata;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error("That image has invalid dimensions.");
  }
  if (width > MAX_SOURCE_IMAGE_AXIS || height > MAX_SOURCE_IMAGE_AXIS) {
    throw new Error("That image is over 10,000 pixels on one side. Use a smaller copy.");
  }
  const pixels = width * height;
  if (pixels > MAX_SOURCE_IMAGE_PIXELS) {
    throw new Error("That image contains more than 64 megapixels. Use a smaller copy.");
  }
  if (metadata.type === "heic" && pixels > MAX_HEIC_SOURCE_IMAGE_PIXELS) {
    throw new Error("That HEIC photo contains more than 50 megapixels. Use a smaller copy.");
  }
  const ratio = width / height;
  if (ratio < 0.125 || ratio > 8) {
    throw new Error("That image is too extremely wide or tall for the board.");
  }
  return { format: metadata.type, width, height };
}

export function preflightImageBytes(
  bytes: Uint8Array,
  byteLength = bytes.byteLength,
): ImagePreflight {
  const metadata = imageDimensionsFromData(bytes);
  if (metadata === undefined) {
    throw new Error("That file is not a supported or valid image.");
  }
  return validateImageLimits(metadata, byteLength);
}

const abortError = () => new DOMException("Image processing was cancelled.", "AbortError");

export async function preflightImageFile(
  file: File,
  signal?: AbortSignal,
): Promise<ImagePreflight> {
  if (signal?.aborted) throw abortError();
  if (file.size === 0) throw new Error(`${file.name} is empty.`);
  if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error(`${file.name} is larger than 30 MB.`);
  if (file.type.startsWith("audio/")) {
    throw new Error(`${file.name} is audio. Add local audio from the sound panel instead.`);
  }
  const header = new Uint8Array(
    await file.slice(0, Math.min(file.size, MAX_IMAGE_HEADER_BYTES)).arrayBuffer(),
  );
  if (signal?.aborted) throw abortError();
  try {
    return preflightImageBytes(header, file.size);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("That image")) throw error;
    if (error instanceof Error && error.message.startsWith("Use a ")) throw error;
    throw new Error(`${file.name} is not a supported or valid image.`, { cause: error });
  }
}
