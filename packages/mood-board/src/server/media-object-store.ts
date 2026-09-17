import type { Effect } from "effect";
import { Context, Schema } from "effect";

import type {
  MediaByteLength,
  MediaByteOffset,
  MediaEtag,
  MediaId,
  MediaMimeType,
} from "../lib/media";
import { OptionalErrorCauseSchema } from "../lib/schema";

export class MediaStorageError extends Schema.Error<MediaStorageError>("MediaStorageError")({
  _tag: Schema.tag("MediaStorageError"),
  operation: Schema.Literals(["read", "write", "delete"]),
  cause: OptionalErrorCauseSchema,
}) {}

export interface StoredMediaObject {
  readonly bytes: Uint8Array;
}

export interface MediaObjectRange {
  readonly offset: MediaByteOffset;
  readonly length: MediaByteLength;
}

interface MediaObjectStoreShape {
  readonly put: (
    key: MediaId,
    bytes: Uint8Array,
    mimeType: MediaMimeType,
    etag: MediaEtag,
  ) => Effect.Effect<void, MediaStorageError>;
  readonly get: (
    key: MediaId,
    range?: MediaObjectRange,
  ) => Effect.Effect<StoredMediaObject | null, MediaStorageError>;
  readonly delete: (key: MediaId) => Effect.Effect<void, MediaStorageError>;
}

export class MediaObjectStore extends Context.Service<MediaObjectStore, MediaObjectStoreShape>()(
  "mood-board/MediaObjectStore",
) {}
