import { Schema } from "effect";

export const MAX_IMAGE_LINK_CHARACTERS = 4_096;

export function normalizeImageLink(value: string): string | null {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_IMAGE_LINK_CHARACTERS ||
    !/^https?:\/\/[^/\\]/i.test(trimmed)
  )
    return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username !== "" || url.password !== "") return null;
    return url.href.length <= MAX_IMAGE_LINK_CHARACTERS ? url.href : null;
  } catch {
    return null;
  }
}

export const ImageLinkSchema = Schema.String.check(
  Schema.isMaxLength(MAX_IMAGE_LINK_CHARACTERS),
).check(
  Schema.makeFilter((value) =>
    normalizeImageLink(value) === value
      ? undefined
      : { path: [], issue: "Image links must be normalized absolute HTTP(S) URLs" },
  ),
);
