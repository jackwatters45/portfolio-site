import { Clock, Context, Effect, Layer, Schema } from "effect";

import {
  hasValidMediaMagic,
  mediaByteLimit,
  MediaByteLengthSchema,
  MediaCleanupBatchSizeSchema,
  MediaDurationMillisSchema,
  MediaEtagSchema,
  MediaIdSchema,
  MediaQuotaLimitsSchema,
  MediaReservationIdSchema,
  MediaTimestampSchema,
  RetryAfterSecondsSchema,
  type MediaByteLength,
  type MediaCleanupBatchSize,
  type MediaDurationMillis,
  type MediaId,
  type MediaKind,
  type MediaMimeType,
  type MediaQuotaLimits,
  type MediaReservationId,
  type MediaTimestamp,
  type MediaUploadResponse,
} from "../lib/media";
import { OptionalErrorCauseSchema } from "../lib/schema";
import { SERVICE_DIRECT_MEDIA_CLIENT, type MediaQuotaClientId } from "./media-client-identity";
import { MediaObjectStore, type MediaObjectRange } from "./media-object-store";
import { type MediaAsset, MediaRepo, type PendingMediaAsset } from "./media-repo";

export const DEFAULT_MEDIA_QUOTA_LIMITS = Schema.decodeUnknownSync(MediaQuotaLimitsSchema)({
  requestsPerHour: 180,
  bytesPerDay: 256 * 1024 * 1024,
  managedBytes: 1024 * 1024 * 1024,
  reservationTtlMs: 10 * 60 * 1_000,
});

export const MEDIA_CLEANUP_AGE_MS: MediaDurationMillis = MediaDurationMillisSchema.make(
  30 * 24 * 60 * 60 * 1_000,
);
export const MEDIA_CLEANUP_LEASE_MS: MediaDurationMillis = MediaDurationMillisSchema.make(
  23 * 60 * 60 * 1_000,
);
export const MEDIA_CLEANUP_BATCH_SIZE: MediaCleanupBatchSize = MediaCleanupBatchSizeSchema.make(50);

export class MediaServiceError extends Schema.Error<MediaServiceError>("MediaServiceError")({
  _tag: Schema.tag("MediaServiceError"),
  reason: Schema.Literals([
    "Empty",
    "TooLarge",
    "InvalidContent",
    "RequestQuota",
    "ByteQuota",
    "StorageQuota",
    "Timeout",
    "Persistence",
  ]),
  retryAfter: Schema.optional(RetryAfterSecondsSchema),
  cause: OptionalErrorCauseSchema,
}) {}

export type ReadableMedia = {
  readonly asset: MediaAsset;
  readonly bytes: Uint8Array;
};

const randomHex = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
};

const randomMediaId = (): MediaId => MediaIdSchema.make(randomHex());
const mediaNow = Clock.currentTimeMillis.pipe(
  Effect.map((millis) => MediaTimestampSchema.make(millis)),
);

const sha256 = Effect.fn("MediaService.sha256")((bytes: Uint8Array) =>
  Effect.tryPromise({
    try: async () => {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
      const hash = [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      return MediaEtagSchema.make(hash);
    },
    catch: (cause) => new MediaServiceError({ reason: "Persistence", cause }),
  }),
);

interface MediaServiceShape {
  readonly reserveUpload: (
    clientId: MediaQuotaClientId,
    byteLength: MediaByteLength,
  ) => Effect.Effect<MediaReservationId, MediaServiceError>;
  readonly releaseReservation: (id: MediaReservationId) => Effect.Effect<void>;
  readonly upload: (
    kind: MediaKind,
    mimeType: MediaMimeType,
    bytes: Uint8Array,
    reservationId?: MediaReservationId,
  ) => Effect.Effect<MediaUploadResponse, MediaServiceError>;
  readonly describe: (id: MediaId) => Effect.Effect<MediaAsset | null, MediaServiceError>;
  readonly read: (
    id: MediaId,
    range?: MediaObjectRange,
  ) => Effect.Effect<ReadableMedia | null, MediaServiceError>;
  readonly cleanupUnreferenced: (
    olderThan: MediaTimestamp,
    limit?: MediaCleanupBatchSize,
  ) => Effect.Effect<number, MediaServiceError>;
  readonly maintain: (now?: MediaTimestamp) => Effect.Effect<number, MediaServiceError>;
}

const makeLayer = (tag: typeof MediaService, limits: MediaQuotaLimits) =>
  Layer.effect(
    tag,
    Effect.gen(function* () {
      const repo = yield* MediaRepo;
      const objects = yield* MediaObjectStore;
      const persistenceError = (cause: unknown) =>
        new MediaServiceError({ reason: "Persistence", cause });

      const reserveUpload = Effect.fn("MediaService.reserveUpload")(function* (
        clientId: MediaQuotaClientId,
        byteLength: MediaByteLength,
      ) {
        const result = yield* repo
          .reserveUpload(
            MediaReservationIdSchema.make(randomHex()),
            clientId,
            byteLength,
            yield* mediaNow,
            limits,
          )
          .pipe(Effect.mapError(persistenceError));
        switch (result._tag) {
          case "Reserved":
            return result.id;
          case "RequestLimit":
            return yield* new MediaServiceError({
              reason: "RequestQuota",
              retryAfter: result.retryAfter,
            });
          case "ByteLimit":
            return yield* new MediaServiceError({
              reason: "ByteQuota",
              retryAfter: result.retryAfter,
            });
          case "StorageFull":
            return yield* new MediaServiceError({ reason: "StorageQuota" });
        }
      });

      const releaseReservation = Effect.fn("MediaService.releaseReservation")(
        (id: MediaReservationId) =>
          repo.releaseReservation(id).pipe(
            Effect.tapError((error) =>
              Effect.logWarning("Media reservation release failed", error),
            ),
            Effect.ignore,
          ),
      );

      const uploadWithReservation = Effect.fn("MediaService.upload")(function* (
        kind: MediaKind,
        mimeType: MediaMimeType,
        bytes: Uint8Array,
        byteLength: MediaByteLength,
        reservationId: MediaReservationId,
      ) {
        if (byteLength > mediaByteLimit(kind)) {
          return yield* new MediaServiceError({ reason: "TooLarge" });
        }
        if (!hasValidMediaMagic(kind, mimeType, bytes)) {
          return yield* new MediaServiceError({ reason: "InvalidContent" });
        }

        const id = randomMediaId();
        const etag = yield* sha256(bytes);
        const now = yield* mediaNow;
        const asset: PendingMediaAsset = {
          id,
          kind,
          mimeType,
          byteLength,
          etag,
          storageKey: id,
          createdAt: now,
        };

        yield* repo.insertPending(asset).pipe(Effect.mapError(persistenceError));
        const rollback = Effect.fn("MediaService.rollbackUpload")((error: MediaServiceError) =>
          objects.delete(asset.storageKey).pipe(
            Effect.andThen(repo.removePending(asset.id)),
            Effect.tapError((cleanupError) =>
              Effect.logWarning("Media upload rollback failed", cleanupError),
            ),
            Effect.ignore,
            Effect.andThen(Effect.fail(error)),
          ),
        );
        yield* objects
          .put(asset.storageKey, bytes, mimeType, etag)
          .pipe(Effect.mapError(persistenceError), Effect.catch(rollback));
        yield* repo
          .markReady(asset.id, yield* mediaNow, reservationId, asset.byteLength)
          .pipe(Effect.mapError(persistenceError), Effect.catch(rollback));

        return {
          mediaId: id,
          kind,
          mimeType,
          byteLength,
          url: `/media/${id}`,
        } satisfies MediaUploadResponse;
      });

      const upload = Effect.fn("MediaService.uploadReserved")(function* (
        kind: MediaKind,
        mimeType: MediaMimeType,
        bytes: Uint8Array,
        suppliedReservation?: MediaReservationId,
      ) {
        if (bytes.length === 0) {
          return yield* new MediaServiceError({ reason: "Empty" });
        }
        const byteLength = MediaByteLengthSchema.make(bytes.length);
        const reservation =
          suppliedReservation ?? (yield* reserveUpload(SERVICE_DIRECT_MEDIA_CLIENT, byteLength));
        return yield* uploadWithReservation(kind, mimeType, bytes, byteLength, reservation).pipe(
          Effect.ensuring(releaseReservation(reservation)),
        );
      });

      const describe = Effect.fn("MediaService.describe")(function* (id: MediaId) {
        return yield* repo.getReady(id).pipe(Effect.mapError(persistenceError));
      });

      const read = Effect.fn("MediaService.read")(function* (
        id: MediaId,
        range?: MediaObjectRange,
      ) {
        const asset = yield* describe(id);
        if (asset === null) return null;
        const object = yield* objects
          .get(asset.storageKey, range)
          .pipe(Effect.mapError(persistenceError));
        const expectedLength = range?.length ?? asset.byteLength;
        if (object === null || object.bytes.byteLength !== expectedLength) return null;
        return { asset, bytes: object.bytes };
      });

      const cleanupBatch = Effect.fn("MediaService.cleanupBatch")(function* (
        olderThan: MediaTimestamp,
        limit = MEDIA_CLEANUP_BATCH_SIZE,
      ) {
        const now = yield* mediaNow;
        const assets = yield* repo
          .claimUnreferenced(olderThan, limit, now, MEDIA_CLEANUP_LEASE_MS)
          .pipe(Effect.mapError(persistenceError));
        const outcomes = yield* Effect.forEach(
          assets,
          (asset) =>
            objects.delete(asset.storageKey).pipe(
              Effect.andThen(repo.completeDelete(asset.id)),
              Effect.as(true),
              Effect.catch((error) =>
                Effect.logWarning("Media cleanup item failed", error).pipe(Effect.as(false)),
              ),
            ),
          { concurrency: 4 },
        );
        return {
          claimed: assets.length,
          removed: outcomes.filter(Boolean).length,
        };
      });

      const cleanupUnreferenced = Effect.fn("MediaService.cleanupUnreferenced")(function* (
        olderThan: MediaTimestamp,
        limit = MEDIA_CLEANUP_BATCH_SIZE,
      ) {
        return (yield* cleanupBatch(olderThan, limit)).removed;
      });

      const maintain = Effect.fn("MediaService.maintain")(function* (at?: MediaTimestamp) {
        const maintenanceAt = at ?? (yield* mediaNow);
        yield* repo.maintainQuota(maintenanceAt).pipe(Effect.mapError(persistenceError));
        let removed = 0;
        for (let batch = 0; batch < 10; batch += 1) {
          const result = yield* cleanupBatch(
            MediaTimestampSchema.make(maintenanceAt - MEDIA_CLEANUP_AGE_MS),
            MEDIA_CLEANUP_BATCH_SIZE,
          );
          removed += result.removed;
          if (result.claimed < MEDIA_CLEANUP_BATCH_SIZE) break;
        }
        return removed;
      });

      return MediaService.of({
        reserveUpload,
        releaseReservation,
        upload,
        describe,
        read,
        cleanupUnreferenced,
        maintain,
      });
    }),
  ).pipe(Layer.provide(MediaRepo.layer));

export class MediaService extends Context.Service<MediaService, MediaServiceShape>()(
  "mood-board/MediaService",
) {
  static readonly layer = makeLayer(this, DEFAULT_MEDIA_QUOTA_LIMITS);
  static readonly layerWith = (limits: MediaQuotaLimits) => makeLayer(this, limits);
}
