import { Context, Effect, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";

import {
  MediaByteCountSchema,
  MediaByteLengthSchema,
  MediaDurationMillisSchema,
  MediaEtagSchema,
  MediaIdSchema,
  MediaKindSchema,
  MediaMimeTypeSchema,
  MediaRequestCountSchema,
  MediaTimestampSchema,
  normalizeMediaMimeType,
  RetryAfterSecondsSchema,
  type MediaByteLength,
  type MediaCleanupBatchSize,
  type MediaDurationMillis,
  type MediaEtag,
  type MediaId,
  type MediaKind,
  type MediaMimeType,
  type MediaQuotaLimits,
  type MediaReservationId,
  type MediaTimestamp,
  type RetryAfterSeconds,
} from "../lib/media";
import type { MediaQuotaClientId } from "./media-client-identity";

export type MediaAsset = {
  readonly id: MediaId;
  readonly kind: MediaKind;
  readonly mimeType: MediaMimeType;
  readonly byteLength: MediaByteLength;
  readonly etag: MediaEtag;
  readonly storageKey: MediaId;
  readonly createdAt: MediaTimestamp;
  readonly readyAt: MediaTimestamp;
};

export type PendingMediaAsset = Omit<MediaAsset, "readyAt">;

export type MediaCleanupAsset = PendingMediaAsset & {
  readonly readyAt: MediaTimestamp | null;
};

type MediaRow = {
  readonly id: unknown;
  readonly kind: unknown;
  readonly mime_type: unknown;
  readonly byte_length: unknown;
  readonly etag: unknown;
  readonly storage_key: unknown;
  readonly created_at: unknown;
  readonly ready_at: unknown;
  readonly unreferenced_at: unknown;
};

const MediaRowSchema = Schema.Struct({
  id: MediaIdSchema,
  kind: MediaKindSchema,
  mime_type: MediaMimeTypeSchema,
  byte_length: MediaByteLengthSchema,
  etag: MediaEtagSchema,
  storage_key: MediaIdSchema,
  created_at: MediaTimestampSchema,
  ready_at: Schema.NullOr(MediaTimestampSchema),
  unreferenced_at: Schema.NullOr(MediaTimestampSchema),
}).check(
  Schema.makeFilter((row) =>
    normalizeMediaMimeType(row.kind, row.mime_type) === row.mime_type
      ? undefined
      : { path: ["mime_type"], issue: "Media MIME type does not match its kind" },
  ),
);

type NumberRow = { readonly value: unknown };
type ReservationRow = { readonly byte_length: unknown };

const NumberRowSchema = Schema.Struct({ value: MediaByteCountSchema });
const ReservationRowSchema = Schema.Struct({
  byte_length: MediaByteLengthSchema,
});

type RequestQuotaRow = { readonly count: unknown; readonly oldest: unknown };
type UploadEventRow = { readonly byte_length: unknown; readonly created_at: unknown };
type QuotaStateRow = { readonly managed: unknown; readonly reserved: unknown };
type MediaIdRow = { readonly id: unknown };

const RequestQuotaRowSchema = Schema.Struct({
  count: MediaRequestCountSchema,
  oldest: Schema.NullOr(MediaTimestampSchema),
});
const UploadEventRowSchema = Schema.Struct({
  byte_length: MediaByteLengthSchema,
  created_at: MediaTimestampSchema,
});
const QuotaStateRowSchema = Schema.Struct({
  managed: MediaByteCountSchema,
  reserved: MediaByteCountSchema,
});
const ZERO_MEDIA_BYTE_COUNT = MediaByteCountSchema.make(0);
const ZERO_MEDIA_REQUEST_COUNT = MediaRequestCountSchema.make(0);
const MediaIdRowSchema = Schema.Struct({ id: MediaIdSchema });

const MEDIA_REQUEST_WINDOW_MS = MediaDurationMillisSchema.make(60 * 60 * 1_000);
const MEDIA_BYTE_WINDOW_MS = MediaDurationMillisSchema.make(24 * 60 * 60 * 1_000);
const MEDIA_EVENT_RETENTION_MS = MediaDurationMillisSchema.make(25 * 60 * 60 * 1_000);

export class MediaRepoInvariantError extends Schema.Error<MediaRepoInvariantError>(
  "MediaRepoInvariantError",
)({
  _tag: Schema.tag("MediaRepoInvariantError"),
  reason: Schema.Literals(["PendingAssetMissing", "ReservationMissing"]),
}) {}

export type ReservationResult =
  | { readonly _tag: "Reserved"; readonly id: MediaReservationId }
  | { readonly _tag: "RequestLimit"; readonly retryAfter: RetryAfterSeconds }
  | { readonly _tag: "ByteLimit"; readonly retryAfter: RetryAfterSeconds }
  | { readonly _tag: "StorageFull" };

const decodeCleanupAsset = Effect.fn("MediaRepo.decodeCleanupAsset")(function* (row: MediaRow) {
  const decoded = yield* Schema.decodeUnknownEffect(MediaRowSchema)(row).pipe(Effect.orDie);
  return {
    id: decoded.id,
    kind: decoded.kind,
    mimeType: decoded.mime_type,
    byteLength: decoded.byte_length,
    etag: decoded.etag,
    storageKey: decoded.storage_key,
    createdAt: decoded.created_at,
    readyAt: decoded.ready_at,
  } satisfies MediaCleanupAsset;
});

const decodeReadyAsset = Effect.fn("MediaRepo.decodeReadyAsset")(function* (row: MediaRow) {
  const asset = yield* decodeCleanupAsset(row);
  if (asset.readyAt === null) return null;
  return { ...asset, readyAt: asset.readyAt } satisfies MediaAsset;
});

const retryAfter = (
  oldest: MediaTimestamp,
  windowMs: MediaDurationMillis,
  now: MediaTimestamp,
): RetryAfterSeconds =>
  RetryAfterSecondsSchema.make(Math.max(1, Math.ceil((oldest + windowMs - now) / 1_000)));

interface MediaRepoShape {
  readonly getReady: (id: MediaId) => Effect.Effect<MediaAsset | null, SqlError>;
  readonly reserveUpload: (
    id: MediaReservationId,
    clientId: MediaQuotaClientId,
    byteLength: MediaByteLength,
    now: MediaTimestamp,
    limits: MediaQuotaLimits,
  ) => Effect.Effect<ReservationResult, SqlError>;
  readonly releaseReservation: (id: MediaReservationId) => Effect.Effect<void, SqlError>;
  readonly insertPending: (asset: PendingMediaAsset) => Effect.Effect<void, SqlError>;
  readonly markReady: (
    id: MediaId,
    readyAt: MediaTimestamp,
    reservationId: MediaReservationId,
    expectedByteLength: MediaByteLength,
  ) => Effect.Effect<void, SqlError | MediaRepoInvariantError>;
  readonly removePending: (id: MediaId) => Effect.Effect<void, SqlError>;
  readonly claimUnreferenced: (
    olderThan: MediaTimestamp,
    limit: MediaCleanupBatchSize,
    now: MediaTimestamp,
    leaseMs: MediaDurationMillis,
  ) => Effect.Effect<ReadonlyArray<MediaCleanupAsset>, SqlError>;
  readonly completeDelete: (id: MediaId) => Effect.Effect<void, SqlError>;
  readonly maintainQuota: (now: MediaTimestamp) => Effect.Effect<void, SqlError>;
}

export class MediaRepo extends Context.Service<MediaRepo, MediaRepoShape>()(
  "mood-board/MediaRepo",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`PRAGMA foreign_keys = ON`;

      const expireReservations = Effect.fn("MediaRepo.expireReservations")(function* (
        now: MediaTimestamp,
      ) {
        const expired = yield* sql<NumberRow>`
          SELECT COALESCE(SUM(byte_length), 0) AS value
          FROM media_upload_events
          WHERE status = 'reserved' AND expires_at <= ${now}
        `;
        const aggregate = expired[0];
        const bytes =
          aggregate === undefined
            ? ZERO_MEDIA_BYTE_COUNT
            : (yield* Schema.decodeUnknownEffect(NumberRowSchema)(aggregate).pipe(Effect.orDie))
                .value;
        if (bytes > 0) {
          yield* sql`
            UPDATE media_quota_state
            SET reserved_bytes = MAX(0, reserved_bytes - ${bytes})
            WHERE singleton = 1
          `;
          yield* sql`
            UPDATE media_upload_events SET status = 'expired'
            WHERE status = 'reserved' AND expires_at <= ${now}
          `;
        }
      });

      const getReady = Effect.fn("MediaRepo.getReady")(function* (id: MediaId) {
        const rows = yield* sql<MediaRow>`
          SELECT id, kind, mime_type, byte_length, etag, storage_key, created_at,
            ready_at, unreferenced_at
          FROM media_assets
          WHERE id = ${id} AND ready_at IS NOT NULL
          LIMIT 1
        `;
        const row = rows[0];
        return row === undefined ? null : yield* decodeReadyAsset(row);
      });

      const reserveUpload = Effect.fn("MediaRepo.reserveUpload")(function* (
        id: MediaReservationId,
        clientId: MediaQuotaClientId,
        byteLength: MediaByteLength,
        now: MediaTimestamp,
        limits: MediaQuotaLimits,
      ) {
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* expireReservations(now);
            const hourAgo = now - MEDIA_REQUEST_WINDOW_MS;
            const dayAgo = now - MEDIA_BYTE_WINDOW_MS;
            const requestRows = yield* sql<RequestQuotaRow>`
            SELECT COUNT(*) AS count, MIN(created_at) AS oldest
            FROM media_upload_events
            WHERE client_id = ${clientId} AND created_at > ${hourAgo}
          `;
            const requestRow = requestRows[0];
            const requests =
              requestRow === undefined
                ? undefined
                : yield* Schema.decodeUnknownEffect(RequestQuotaRowSchema)(requestRow).pipe(
                    Effect.orDie,
                  );
            if ((requests?.count ?? ZERO_MEDIA_REQUEST_COUNT) >= limits.requestsPerHour) {
              return {
                _tag: "RequestLimit",
                retryAfter: retryAfter(requests?.oldest ?? now, MEDIA_REQUEST_WINDOW_MS, now),
              } as const;
            }
            const byteRows = yield* sql<UploadEventRow>`
            SELECT byte_length, created_at
            FROM media_upload_events
            WHERE client_id = ${clientId}
              AND created_at > ${dayAgo}
              AND status IN ('reserved', 'succeeded')
            ORDER BY created_at ASC, id ASC
          `;
            const byteEvents = yield* Effect.forEach(byteRows, (row) =>
              Schema.decodeUnknownEffect(UploadEventRowSchema)(row).pipe(Effect.orDie),
            );
            const uploadedBytes = byteEvents.reduce((total, row) => total + row.byte_length, 0);
            const bytesToRelease = uploadedBytes + byteLength - limits.bytesPerDay;
            if (bytesToRelease > 0) {
              let released = 0;
              let retryAt = now + MEDIA_BYTE_WINDOW_MS;
              for (const row of byteEvents) {
                released += row.byte_length;
                retryAt = row.created_at + MEDIA_BYTE_WINDOW_MS;
                if (released >= bytesToRelease) break;
              }
              return {
                _tag: "ByteLimit",
                retryAfter: RetryAfterSecondsSchema.make(
                  Math.max(1, Math.ceil((retryAt - now) / 1_000)),
                ),
              } as const;
            }
            const quota = yield* sql<QuotaStateRow>`
            SELECT managed_bytes AS managed, reserved_bytes AS reserved
            FROM media_quota_state WHERE singleton = 1
          `;
            const quotaRow = quota[0];
            const state =
              quotaRow === undefined
                ? { managed: ZERO_MEDIA_BYTE_COUNT, reserved: ZERO_MEDIA_BYTE_COUNT }
                : yield* Schema.decodeUnknownEffect(QuotaStateRowSchema)(quotaRow).pipe(
                    Effect.orDie,
                  );
            if (state.managed + state.reserved + byteLength > limits.managedBytes) {
              return { _tag: "StorageFull" } as const;
            }
            yield* sql`
            INSERT INTO media_upload_events (
              id, client_id, byte_length, created_at, expires_at, status
            ) VALUES (
              ${id}, ${clientId}, ${byteLength}, ${now},
              ${now + limits.reservationTtlMs}, 'reserved'
            )
          `;
            yield* sql`
            UPDATE media_quota_state
            SET reserved_bytes = reserved_bytes + ${byteLength}
            WHERE singleton = 1
          `;
            return { _tag: "Reserved", id } as const;
          }),
        );
      });

      const releaseReservation = Effect.fn("MediaRepo.releaseReservation")(function* (
        id: MediaReservationId,
      ) {
        yield* sql.withTransaction(
          Effect.gen(function* () {
            const released = yield* sql<ReservationRow>`
            UPDATE media_upload_events SET status = 'failed'
            WHERE id = ${id} AND status = 'reserved'
            RETURNING byte_length
          `;
            const releasedRow = released[0];
            const bytes =
              releasedRow === undefined
                ? undefined
                : (yield* Schema.decodeUnknownEffect(ReservationRowSchema)(releasedRow).pipe(
                    Effect.orDie,
                  )).byte_length;
            if (bytes !== undefined) {
              yield* sql`
              UPDATE media_quota_state
              SET reserved_bytes = MAX(0, reserved_bytes - ${bytes})
              WHERE singleton = 1
            `;
            }
          }),
        );
      });

      const insertPending = Effect.fn("MediaRepo.insertPending")(function* (
        asset: PendingMediaAsset,
      ) {
        yield* sql`
          INSERT INTO media_assets (
            id, kind, mime_type, byte_length, etag, storage_key, created_at,
            ready_at, unreferenced_at
          ) VALUES (
            ${asset.id}, ${asset.kind}, ${asset.mimeType}, ${asset.byteLength},
            ${asset.etag}, ${asset.storageKey}, ${asset.createdAt}, NULL, ${asset.createdAt}
          )
        `;
      });

      const markReady = Effect.fn("MediaRepo.markReady")(function* (
        id: MediaId,
        readyAt: MediaTimestamp,
        reservationId: MediaReservationId,
        expectedByteLength: MediaByteLength,
      ) {
        yield* sql.withTransaction(
          Effect.gen(function* () {
            const completed = yield* sql<ReservationRow>`
            UPDATE media_upload_events SET status = 'succeeded'
            WHERE id = ${reservationId}
              AND status = 'reserved'
              AND byte_length = ${expectedByteLength}
            RETURNING byte_length
          `;
            const completedRow = completed[0];
            const bytes =
              completedRow === undefined
                ? undefined
                : (yield* Schema.decodeUnknownEffect(ReservationRowSchema)(completedRow).pipe(
                    Effect.orDie,
                  )).byte_length;
            if (bytes === undefined) {
              return yield* new MediaRepoInvariantError({
                reason: "ReservationMissing",
              });
            }
            const rows = yield* sql<MediaIdRow>`
            UPDATE media_assets SET ready_at = ${readyAt}, unreferenced_at = ${readyAt}
            WHERE id = ${id}
              AND ready_at IS NULL
              AND byte_length = ${expectedByteLength}
            RETURNING id
          `;
            if (rows.length !== 1) {
              return yield* new MediaRepoInvariantError({
                reason: "PendingAssetMissing",
              });
            }
            const updated = yield* Schema.decodeUnknownEffect(MediaIdRowSchema)(rows[0]).pipe(
              Effect.orDie,
            );
            if (updated.id !== id) {
              return yield* new MediaRepoInvariantError({
                reason: "PendingAssetMissing",
              });
            }
            yield* sql`
            UPDATE media_quota_state
            SET reserved_bytes = MAX(0, reserved_bytes - ${bytes})
            WHERE singleton = 1
          `;
          }),
        );
      });

      const removePending = Effect.fn("MediaRepo.removePending")(function* (id: MediaId) {
        yield* sql`
          DELETE FROM media_assets WHERE id = ${id} AND ready_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = ${id})
            AND NOT EXISTS (
              SELECT 1 FROM boards b WHERE b.background_media_id = ${id}
            )
        `;
      });

      const claimUnreferenced = Effect.fn("MediaRepo.claimUnreferenced")(function* (
        olderThan: MediaTimestamp,
        limit: MediaCleanupBatchSize,
        now: MediaTimestamp,
        leaseMs: MediaDurationMillis,
      ) {
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const candidates = yield* sql<MediaRow>`
            SELECT id, kind, mime_type, byte_length, etag, storage_key, created_at,
              ready_at, unreferenced_at
            FROM media_assets m
            WHERE m.unreferenced_at IS NOT NULL AND m.unreferenced_at < ${olderThan}
              AND (m.cleanup_lease_until IS NULL OR m.cleanup_lease_until <= ${now})
              AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = m.id)
              AND NOT EXISTS (
                SELECT 1 FROM boards b WHERE b.background_media_id = m.id
              )
            ORDER BY m.unreferenced_at ASC, m.id ASC
            LIMIT ${Math.max(1, Math.min(50, Math.trunc(limit)))}
          `;
            const claimed: MediaCleanupAsset[] = [];
            for (const row of candidates) {
              const candidate = yield* decodeCleanupAsset(row);
              const marked = yield* sql<MediaIdRow>`
              UPDATE media_assets
              SET ready_at = NULL, cleanup_lease_until = ${now + leaseMs},
                cleanup_attempts = cleanup_attempts + 1
              WHERE id = ${candidate.id}
                AND (cleanup_lease_until IS NULL OR cleanup_lease_until <= ${now})
                AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = ${candidate.id})
                AND NOT EXISTS (
                  SELECT 1 FROM boards b WHERE b.background_media_id = ${candidate.id}
                )
              RETURNING id
            `;
              const markedRow = marked[0];
              if (markedRow === undefined) continue;
              const markedId = yield* Schema.decodeUnknownEffect(MediaIdRowSchema)(markedRow).pipe(
                Effect.orDie,
              );
              if (markedId.id === candidate.id) claimed.push(candidate);
            }
            return claimed;
          }),
        );
      });

      const completeDelete = Effect.fn("MediaRepo.completeDelete")(function* (id: MediaId) {
        yield* sql`
          DELETE FROM media_assets WHERE id = ${id} AND ready_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = ${id})
            AND NOT EXISTS (
              SELECT 1 FROM boards b WHERE b.background_media_id = ${id}
            )
        `;
      });

      const maintainQuota = Effect.fn("MediaRepo.maintainQuota")(function* (now: MediaTimestamp) {
        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* expireReservations(now);
            yield* sql`DELETE FROM media_upload_events WHERE created_at <= ${now - MEDIA_EVENT_RETENTION_MS}`;
          }),
        );
      });

      return MediaRepo.of({
        getReady,
        reserveUpload,
        releaseReservation,
        insertPending,
        markReady,
        removePending,
        claimUnreferenced,
        completeDelete,
        maintainQuota,
      });
    }),
  );
}
