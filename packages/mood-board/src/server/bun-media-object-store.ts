import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Clock, Effect, Layer, Option, Schema } from "effect";

import {
  MediaDurationMillisSchema,
  MediaIdSchema,
  MediaTimestampSchema,
  type MediaDurationMillis,
  type MediaId,
} from "../lib/media";
import { MediaObjectStore, MediaStorageError, type MediaObjectRange } from "./media-object-store";

const decodeMediaId = Schema.decodeUnknownOption(MediaIdSchema);
const safeKey = (key: string) => Option.getOrNull(decodeMediaId(key));

const TEMP_PATTERN = /^\.[0-9a-f]{32}\.[0-9a-f-]{36}\.tmp$/;
const STALE_TEMP_AGE_MS: MediaDurationMillis = MediaDurationMillisSchema.make(24 * 60 * 60 * 1_000);

const storageError = (operation: "read" | "write" | "delete", cause: unknown) =>
  new MediaStorageError({ operation, cause });

const isNotFound = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const fsPromise = <A>(evaluate: () => Promise<A>) =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => cause,
  });

const cleanupTemporary = Effect.fn("BunMediaObjectStore.cleanupTemporary")((path: string) =>
  fsPromise(() => unlink(path)).pipe(
    Effect.catch((cause) =>
      isNotFound(cause) ? Effect.void : Effect.logWarning("Temporary media cleanup failed", cause),
    ),
  ),
);

const cleanupStaleTemps = Effect.fn("BunMediaObjectStore.cleanupStaleTemps")(function* (
  root: string,
) {
  yield* fsPromise(() => mkdir(root, { recursive: true }));
  const names = yield* fsPromise(() => readdir(root));
  const now = yield* Clock.currentTimeMillis;
  const cutoff = MediaTimestampSchema.make(Math.max(0, now - STALE_TEMP_AGE_MS));
  yield* Effect.forEach(
    names.filter((name) => TEMP_PATTERN.test(name)),
    (name) => {
      const path = join(root, name);
      return Effect.gen(function* () {
        const metadata = yield* fsPromise(() => stat(path));
        if (metadata.mtimeMs < cutoff) yield* fsPromise(() => unlink(path));
      }).pipe(Effect.catch((cause) => (isNotFound(cause) ? Effect.void : Effect.fail(cause))));
    },
    { concurrency: "unbounded", discard: true },
  );
});

const writeObject = Effect.fn("BunMediaObjectStore.put")(function* (
  root: string,
  key: MediaId,
  bytes: Uint8Array,
) {
  const filename = safeKey(key);
  if (filename === null) {
    return yield* storageError("write", new Error("Invalid media storage key"));
  }
  const destination = join(root, filename);
  const temporary = join(root, `.${filename}.${crypto.randomUUID()}.tmp`);
  return yield* Effect.gen(function* () {
    yield* fsPromise(() => mkdir(root, { recursive: true }));
    yield* fsPromise(() => writeFile(temporary, bytes, { flag: "wx" }));
    yield* fsPromise(() => rename(temporary, destination));
  }).pipe(
    Effect.tapError(() => cleanupTemporary(temporary)),
    Effect.mapError((cause) => storageError("write", cause)),
  );
});

const deleteObject = Effect.fn("BunMediaObjectStore.delete")(function* (
  root: string,
  key: MediaId,
) {
  const filename = safeKey(key);
  if (filename === null) {
    return yield* storageError("delete", new Error("Invalid media storage key"));
  }
  return yield* fsPromise(() => unlink(join(root, filename))).pipe(
    Effect.catch((cause) =>
      isNotFound(cause) ? Effect.void : Effect.fail(storageError("delete", cause)),
    ),
  );
});

const readObject = Effect.fn("BunMediaObjectStore.get")(function* (
  root: string,
  key: MediaId,
  range?: MediaObjectRange,
) {
  const filename = safeKey(key);
  if (filename === null) return null;
  const path = join(root, filename);
  const read =
    range === undefined
      ? fsPromise(() => readFile(path)).pipe(
          Effect.map((bytes) => ({ bytes: new Uint8Array(bytes) })),
        )
      : Effect.acquireUseRelease(
          fsPromise(() => open(path, "r")),
          (handle) =>
            fsPromise(async () => {
              const bytes = new Uint8Array(range.length);
              const result = await handle.read(bytes, 0, range.length, range.offset);
              return { bytes: bytes.subarray(0, result.bytesRead) };
            }),
          (handle) => fsPromise(() => handle.close()),
        );
  return yield* read.pipe(
    Effect.catch((cause) =>
      isNotFound(cause) ? Effect.succeed(null) : Effect.fail(storageError("read", cause)),
    ),
  );
});

export const makeBunMediaObjectStore = (root: string) =>
  Layer.effect(
    MediaObjectStore,
    cleanupStaleTemps(root).pipe(
      Effect.mapError((cause) => storageError("delete", cause)),
      Effect.map(() =>
        MediaObjectStore.of({
          put: (key, bytes) => writeObject(root, key, bytes),
          get: (key, range) => readObject(root, key, range),
          delete: (key) => deleteObject(root, key),
        }),
      ),
    ),
  );
