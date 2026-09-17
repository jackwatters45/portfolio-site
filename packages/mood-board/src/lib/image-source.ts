import { Schema } from "effect";

const EMBEDDED_IMAGE_PATTERN = /^data:image\/(?:png|jpe?g|webp|gif);base64,/i;
const REMOTE_IMAGE_PATTERN = /^https?:\/\/[^/\\]/i;

export function isSupportedImageSource(value: string): boolean {
  return EMBEDDED_IMAGE_PATTERN.test(value) || REMOTE_IMAGE_PATTERN.test(value);
}

export const SupportedImageSourceSchema = Schema.String.check(
  Schema.makeFilter((value) =>
    isSupportedImageSource(value)
      ? undefined
      : { path: [], issue: "Image sources must be embedded images or absolute HTTP(S) URLs" },
  ),
);
