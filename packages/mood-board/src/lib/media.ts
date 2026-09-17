import { Option, Schema } from "effect";

import {
  LowercaseHex32Schema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  Sha256HexSchema,
} from "./schema";

export const MediaIdSchema = LowercaseHex32Schema.pipe(Schema.brand("MediaId"));
export type MediaId = typeof MediaIdSchema.Type;
export const MediaReservationIdSchema = LowercaseHex32Schema.pipe(
  Schema.brand("MediaReservationId"),
);
export type MediaReservationId = typeof MediaReservationIdSchema.Type;
export const MediaEtagSchema = Sha256HexSchema.pipe(Schema.brand("MediaEtag"));
export type MediaEtag = typeof MediaEtagSchema.Type;
export const MediaKindSchema = Schema.Literals(["image", "audio"]);
export type MediaKind = typeof MediaKindSchema.Type;
const decodeMediaKind = Schema.decodeUnknownOption(MediaKindSchema);
export const MediaMimeTypeSchema = Schema.Literals([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
]);
export type MediaMimeType = typeof MediaMimeTypeSchema.Type;
const decodeMediaMimeType = Schema.decodeUnknownOption(MediaMimeTypeSchema);
export const MediaByteLengthSchema = PositiveIntegerSchema.pipe(Schema.brand("MediaByteLength"));
export type MediaByteLength = typeof MediaByteLengthSchema.Type;
export const MediaByteCountSchema = NonNegativeIntegerSchema.pipe(Schema.brand("MediaByteCount"));
export type MediaByteCount = typeof MediaByteCountSchema.Type;
export const MAX_IMAGE_UPLOAD_BYTES: MediaByteLength = MediaByteLengthSchema.make(12 * 1024 * 1024);
export const MAX_AUDIO_UPLOAD_BYTES: MediaByteLength = MediaByteLengthSchema.make(25 * 1024 * 1024);
export const MAX_MEDIA_UPLOAD_BYTES = MAX_AUDIO_UPLOAD_BYTES;
export const MediaByteOffsetSchema = NonNegativeIntegerSchema.pipe(Schema.brand("MediaByteOffset"));
export type MediaByteOffset = typeof MediaByteOffsetSchema.Type;
export const MediaTimestampSchema = NonNegativeIntegerSchema.pipe(Schema.brand("MediaTimestamp"));
export type MediaTimestamp = typeof MediaTimestampSchema.Type;
export const RetryAfterSecondsSchema = PositiveIntegerSchema.pipe(
  Schema.brand("RetryAfterSeconds"),
);
export type RetryAfterSeconds = typeof RetryAfterSecondsSchema.Type;
export const MediaRequestLimitSchema = PositiveIntegerSchema.pipe(
  Schema.brand("MediaRequestLimit"),
);
export const MediaRequestCountSchema = NonNegativeIntegerSchema.pipe(
  Schema.brand("MediaRequestCount"),
);
export type MediaRequestCount = typeof MediaRequestCountSchema.Type;
export const MediaByteQuotaSchema = PositiveIntegerSchema.pipe(Schema.brand("MediaByteQuota"));
export const MediaDurationMillisSchema = PositiveIntegerSchema.pipe(
  Schema.brand("MediaDurationMillis"),
);
export type MediaDurationMillis = typeof MediaDurationMillisSchema.Type;
export const MediaCleanupBatchSizeSchema = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: 100 }),
).pipe(Schema.brand("MediaCleanupBatchSize"));
export type MediaCleanupBatchSize = typeof MediaCleanupBatchSizeSchema.Type;
export const MediaCleanupAgeDaysSchema = Schema.Int.check(
  Schema.isBetween({ minimum: 30, maximum: 3_650 }),
).pipe(Schema.brand("MediaCleanupAgeDays"));
export type MediaCleanupAgeDays = typeof MediaCleanupAgeDaysSchema.Type;
export const MediaQuotaLimitsSchema = Schema.Struct({
  requestsPerHour: MediaRequestLimitSchema,
  bytesPerDay: MediaByteQuotaSchema,
  managedBytes: MediaByteQuotaSchema,
  reservationTtlMs: MediaDurationMillisSchema,
});
export type MediaQuotaLimits = typeof MediaQuotaLimitsSchema.Type;

const decodePositiveInteger = Schema.decodeUnknownOption(PositiveIntegerSchema);
const decodeMediaByteOffset = Schema.decodeUnknownOption(MediaByteOffsetSchema);

export const MediaUploadResponseSchema = Schema.Struct({
  mediaId: MediaIdSchema,
  kind: MediaKindSchema,
  mimeType: MediaMimeTypeSchema,
  byteLength: MediaByteLengthSchema,
  url: Schema.String,
});
export type MediaUploadResponse = typeof MediaUploadResponseSchema.Type;

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
]);

export const normalizeMediaKind = (value: string | null | undefined): MediaKind | null =>
  Option.getOrNull(decodeMediaKind(value));

export const normalizeMediaMimeType = (
  kind: MediaKind,
  value: string | null | undefined,
): MediaMimeType | null => {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const allowed = kind === "image" ? IMAGE_MIME_TYPES : AUDIO_MIME_TYPES;
  return allowed.has(normalized) ? Option.getOrNull(decodeMediaMimeType(normalized)) : null;
};

export const mediaByteLimit = (kind: MediaKind): MediaByteLength =>
  kind === "image" ? MAX_IMAGE_UPLOAD_BYTES : MAX_AUDIO_UPLOAD_BYTES;

const startsWith = (bytes: Uint8Array, signature: ReadonlyArray<number>, offset = 0): boolean =>
  signature.every((value, index) => bytes[offset + index] === value);

const asciiAt = (bytes: Uint8Array, value: string, offset: number): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
};

export const hasValidMediaMagic = (
  kind: MediaKind,
  mimeType: MediaMimeType,
  bytes: Uint8Array,
): boolean => {
  if (bytes.length === 0) return false;
  if (kind === "image") {
    switch (mimeType) {
      case "image/jpeg":
        return startsWith(bytes, [0xff, 0xd8, 0xff]);
      case "image/png":
        return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      case "image/gif":
        return asciiAt(bytes, "GIF87a", 0) || asciiAt(bytes, "GIF89a", 0);
      case "image/webp":
        return asciiAt(bytes, "RIFF", 0) && asciiAt(bytes, "WEBP", 8);
    }
  }
  switch (mimeType) {
    case "audio/mpeg":
      return (
        asciiAt(bytes, "ID3", 0) ||
        (bytes[0] === 0xff && bytes[1] !== undefined && (bytes[1] & 0xe0) === 0xe0)
      );
    case "audio/mp4":
    case "audio/x-m4a":
      return asciiAt(bytes, "ftyp", 4);
    case "audio/wav":
    case "audio/x-wav":
      return asciiAt(bytes, "RIFF", 0) && asciiAt(bytes, "WAVE", 8);
    case "audio/ogg":
      return asciiAt(bytes, "OggS", 0);
    case "audio/webm":
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  }
  return false;
};

export type MediaRange = {
  readonly start: MediaByteOffset;
  readonly end: MediaByteOffset;
};

export const parseMediaRange = (
  value: string | undefined,
  size: MediaByteLength,
): MediaRange | null => {
  if (value === undefined) {
    return {
      start: MediaByteOffsetSchema.make(0),
      end: MediaByteOffsetSchema.make(size - 1),
    };
  }
  if (value.includes(",")) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (match === null) return null;
  const startText = match[1] ?? "";
  const endText = match[2] ?? "";
  if (startText === "" && endText === "") return null;
  if (startText === "") {
    const suffix = Option.getOrNull(decodePositiveInteger(Number(endText)));
    if (suffix === null) return null;
    return {
      start: MediaByteOffsetSchema.make(Math.max(0, size - suffix)),
      end: MediaByteOffsetSchema.make(size - 1),
    };
  }
  const start = Option.getOrNull(decodeMediaByteOffset(Number(startText)));
  const requestedEnd = Option.getOrNull(
    decodeMediaByteOffset(endText === "" ? size - 1 : Number(endText)),
  );
  if (start === null || requestedEnd === null || requestedEnd < start || start >= size) return null;
  return { start, end: MediaByteOffsetSchema.make(Math.min(requestedEnd, size - 1)) };
};
