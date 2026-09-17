import type { R2Bucket } from "@cloudflare/workers-types";
import { Effect, Layer } from "effect";

import type { MediaEtag, MediaId, MediaMimeType } from "../lib/media";
import {
  MediaObjectStore,
  MediaStorageError,
  type MediaObjectRange,
} from "../server/media-object-store";

const storageError = (operation: "read" | "write" | "delete", cause: unknown) =>
  new MediaStorageError({ operation, cause });

const r2Promise = <A>(operation: MediaStorageError["operation"], evaluate: () => Promise<A>) =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => storageError(operation, cause),
  });

export const makeR2MediaObjectStore = (
  bucket: R2Bucket,
  workspacePrefix = "legacy",
  allowLegacyFallback = false,
) => {
  const storageKey = (key: MediaId) => `${workspacePrefix}/${key}`;

  const putObject = Effect.fn("R2MediaObjectStore.put")(function* (
    key: MediaId,
    bytes: Uint8Array,
    mimeType: MediaMimeType,
    etag: MediaEtag,
  ) {
    yield* r2Promise("write", () =>
      bucket.put(storageKey(key), bytes, {
        httpMetadata: { contentType: mimeType },
        customMetadata: { etag },
      }),
    );
  });

  const getObject = Effect.fn("R2MediaObjectStore.get")(function* (
    key: MediaId,
    range?: MediaObjectRange,
  ) {
    const options = range === undefined ? undefined : { range };
    const primary = yield* r2Promise("read", () => bucket.get(storageKey(key), options));
    const object =
      primary ??
      (allowLegacyFallback ? yield* r2Promise("read", () => bucket.get(key, options)) : null);
    if (object === null) return null;
    const buffer = yield* r2Promise("read", () => object.arrayBuffer());
    return { bytes: new Uint8Array(buffer) };
  });

  const deleteObject = Effect.fn("R2MediaObjectStore.delete")(function* (key: MediaId) {
    yield* r2Promise("delete", () => bucket.delete(storageKey(key)));
    if (allowLegacyFallback) yield* r2Promise("delete", () => bucket.delete(key));
  });

  return Layer.succeed(
    MediaObjectStore,
    MediaObjectStore.of({
      put: (key, bytes, mimeType, etag) => putObject(key, bytes, mimeType, etag),
      get: (key, range) => getObject(key, range),
      delete: (key) => deleteObject(key),
    }),
  );
};
