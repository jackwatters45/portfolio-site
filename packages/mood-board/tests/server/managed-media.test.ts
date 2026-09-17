import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { TestClock } from "effect/testing";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import {
  BoardIdSchema,
  ClientIdSchema,
  DEFAULT_BOARD_ID,
  ItemIdSchema,
  MutationIdSchema,
} from "../../src/lib/board-rpc";
import {
  MediaByteLengthSchema,
  MediaIdSchema,
  MediaQuotaLimitsSchema,
  MediaTimestampSchema,
  type MediaId,
} from "../../src/lib/media";
import { BoardService } from "../../src/server/board-service";
import { MediaQuotaClientIdSchema } from "../../src/server/media-client-identity";
import { MediaObjectStore, MediaStorageError } from "../../src/server/media-object-store";
import { DEFAULT_MEDIA_QUOTA_LIMITS, MediaService } from "../../src/server/media-service";
import { migrationLoader } from "../../src/server/migrations";

const DatabaseTest = SqliteMigrator.layer({ loader: migrationLoader }).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })),
);

const mediaByteLength = (value: number) => MediaByteLengthSchema.make(value);
const mediaQuotaClientId = (value: string) => MediaQuotaClientIdSchema.make(value);
const mediaTimestamp = (value: number) => MediaTimestampSchema.make(value);
const mediaQuotaLimits = Schema.decodeUnknownSync(MediaQuotaLimitsSchema);

const memoryStore = () => {
  const objects = new Map<string, Uint8Array>();
  return Layer.succeed(
    MediaObjectStore,
    MediaObjectStore.of({
      put: (key, bytes) =>
        Effect.sync(() => {
          objects.set(key, bytes.slice());
        }),
      get: (key, range) =>
        Effect.sync(() => {
          const bytes = objects.get(key);
          if (bytes === undefined) return null;
          return {
            bytes:
              range === undefined
                ? bytes.slice()
                : bytes.slice(range.offset, range.offset + range.length),
          };
        }),
      delete: (key) =>
        Effect.sync(() => {
          objects.delete(key);
        }),
    }),
  );
};

const controlledStore = () => {
  const objects = new Map<string, Uint8Array>();
  let deleteFails = true;
  return {
    objects,
    allowDeletes: () => {
      deleteFails = false;
    },
    layer: Layer.succeed(
      MediaObjectStore,
      MediaObjectStore.of({
        put: (key, bytes) =>
          Effect.sync(() => {
            objects.set(key, bytes.slice());
          }),
        get: (key, range) =>
          Effect.sync(() => {
            const bytes = objects.get(key);
            if (bytes === undefined) return null;
            const selected =
              range === undefined ? bytes : bytes.slice(range.offset, range.offset + range.length);
            return { bytes: selected };
          }),
        delete: (key) =>
          deleteFails
            ? Effect.fail(new MediaStorageError({ operation: "delete" }))
            : Effect.sync(() => {
                objects.delete(key);
              }),
      }),
    ),
  };
};

const TestLayer = Layer.merge(BoardService.layer, MediaService.layer).pipe(
  Layer.provide(memoryStore()),
  Layer.provideMerge(DatabaseTest),
);

const managedImage = (mediaId: MediaId, id = ItemIdSchema.make("managed-image")) => ({
  id,
  kind: "image" as const,
  x: 0,
  y: 0,
  width: 320,
  height: 240,
  rotation: 0,
  order: 1,
  mediaId,
});

describe("managed media persistence", () => {
  it.effect("validates references, duplicates them, and claims only unreferenced assets", () =>
    Effect.gen(function* () {
      const boards = yield* BoardService;
      const media = yield* MediaService;
      yield* boards.create(DEFAULT_BOARD_ID, "Media");

      const uploaded = yield* media.upload(
        "image",
        "image/png",
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      yield* boards.commit({
        boardId: DEFAULT_BOARD_ID,
        clientId: ClientIdSchema.make("media-client"),
        mutationId: MutationIdSchema.make("media-add"),
        backgroundMediaId: uploaded.mediaId,
        upserts: [managedImage(uploaded.mediaId)],
        deletes: [],
      });
      expect((yield* boards.get(DEFAULT_BOARD_ID))?.board).toMatchObject({
        backgroundMediaId: uploaded.mediaId,
        items: [{ mediaId: uploaded.mediaId }],
      });

      const copyId = BoardIdSchema.make("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
      yield* boards.duplicate(DEFAULT_BOARD_ID, copyId, "Media copy");
      expect((yield* boards.get(copyId))?.board).toMatchObject({
        backgroundMediaId: uploaded.mediaId,
        items: [{ mediaId: uploaded.mediaId }],
      });
      expect(yield* media.cleanupUnreferenced(mediaTimestamp(Date.now() + 1))).toBe(0);

      yield* boards.commit({
        boardId: DEFAULT_BOARD_ID,
        clientId: ClientIdSchema.make("media-client"),
        mutationId: MutationIdSchema.make("media-remove-original"),
        upserts: [],
        deletes: [ItemIdSchema.make("managed-image")],
      });
      yield* boards.commit({
        boardId: copyId,
        clientId: ClientIdSchema.make("media-client"),
        mutationId: MutationIdSchema.make("media-remove-copy"),
        upserts: [],
        deletes: [ItemIdSchema.make("managed-image")],
      });
      expect(yield* media.cleanupUnreferenced(mediaTimestamp(Date.now() + 1))).toBe(0);
      yield* boards.commit({
        boardId: DEFAULT_BOARD_ID,
        clientId: ClientIdSchema.make("media-client"),
        mutationId: MutationIdSchema.make("background-clear-original"),
        backgroundMediaId: null,
        upserts: [],
        deletes: [],
      });
      expect(yield* media.cleanupUnreferenced(mediaTimestamp(Date.now() + 1))).toBe(0);
      yield* boards.delete(copyId);
      expect(
        yield* media.cleanupUnreferenced(mediaTimestamp(Date.now() - 30 * 24 * 60 * 60 * 1_000)),
      ).toBe(0);
      expect(yield* media.cleanupUnreferenced(mediaTimestamp(Date.now() + 1))).toBe(1);
      expect(yield* media.read(uploaded.mediaId)).toBeNull();
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("starts the cleanup grace period when the last reference is removed", () =>
    Effect.gen(function* () {
      const boards = yield* BoardService;
      const media = yield* MediaService;
      const sql = yield* SqlClient.SqlClient;
      yield* boards.create(DEFAULT_BOARD_ID, "Media");
      const uploaded = yield* media.upload(
        "image",
        "image/png",
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      yield* boards.commit({
        boardId: DEFAULT_BOARD_ID,
        clientId: ClientIdSchema.make("grace-client"),
        mutationId: MutationIdSchema.make("grace-add"),
        upserts: [managedImage(uploaded.mediaId)],
        deletes: [],
      });
      yield* sql`
        UPDATE media_assets
        SET created_at = 1, ready_at = 1
        WHERE id = ${uploaded.mediaId}
      `;
      yield* boards.commit({
        boardId: DEFAULT_BOARD_ID,
        clientId: ClientIdSchema.make("grace-client"),
        mutationId: MutationIdSchema.make("grace-remove"),
        upserts: [],
        deletes: [ItemIdSchema.make("managed-image")],
      });
      expect(
        yield* media.cleanupUnreferenced(mediaTimestamp(Date.now() - 30 * 24 * 60 * 60 * 1_000)),
      ).toBe(0);
      expect(yield* media.read(uploaded.mediaId)).not.toBeNull();
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("keeps failed upload objects discoverable until cleanup can retry", () => {
    const store = controlledStore();
    const layer = Layer.merge(BoardService.layer, MediaService.layer).pipe(
      Layer.provide(store.layer),
      Layer.provideMerge(DatabaseTest),
    );
    return Effect.gen(function* () {
      const media = yield* MediaService;
      const sql = yield* SqlClient.SqlClient;
      yield* sql`
        CREATE TRIGGER fail_media_ready
        BEFORE UPDATE OF ready_at ON media_assets
        WHEN NEW.ready_at IS NOT NULL
        BEGIN
          SELECT RAISE(ABORT, 'ready failure');
        END
      `;
      const failed = yield* media
        .upload(
          "image",
          "image/png",
          new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        )
        .pipe(Effect.flip);
      expect(failed.reason).toBe("Persistence");
      expect(store.objects.size).toBe(1);
      const pending = yield* sql<{ readonly count: number }>`
        SELECT COUNT(*) AS count FROM media_assets WHERE ready_at IS NULL
      `;
      expect(pending[0]?.count).toBe(1);

      store.allowDeletes();
      yield* sql`DROP TRIGGER fail_media_ready`;
      expect(yield* media.cleanupUnreferenced(mediaTimestamp(Date.now() + 1))).toBe(1);
      expect(store.objects.size).toBe(0);
      const remaining = yield* sql<{ readonly count: number }>`
        SELECT COUNT(*) AS count FROM media_assets
      `;
      expect(remaining[0]?.count).toBe(0);
    }).pipe(Effect.provide(layer));
  });

  it.effect("leases failed cleanup attempts before retrying deletion", () => {
    const store = controlledStore();
    const layer = MediaService.layer.pipe(
      Layer.provide(store.layer),
      Layer.provideMerge(DatabaseTest),
    );
    return Effect.gen(function* () {
      const media = yield* MediaService;
      const sql = yield* SqlClient.SqlClient;
      const now = Date.now();
      yield* TestClock.setTime(now);
      const uploaded = yield* media.upload(
        "image",
        "image/png",
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      expect(yield* media.cleanupUnreferenced(mediaTimestamp(now + 1))).toBe(0);
      expect(yield* media.cleanupUnreferenced(mediaTimestamp(now + 1))).toBe(0);
      const attempts = yield* sql<{
        readonly attempts: number;
        readonly lease: number | null;
      }>`
        SELECT cleanup_attempts AS attempts, cleanup_lease_until AS lease
        FROM media_assets WHERE id = ${uploaded.mediaId}
      `;
      expect(attempts[0]?.attempts).toBe(1);
      expect(attempts[0]?.lease).toBeGreaterThan(now + 22 * 60 * 60 * 1_000);
      store.allowDeletes();
      yield* sql`
        UPDATE media_assets SET cleanup_lease_until = 0 WHERE id = ${uploaded.mediaId}
      `;
      expect(yield* media.cleanupUnreferenced(mediaTimestamp(now + 1))).toBe(1);
    }).pipe(Effect.provide(layer));
  });

  it.effect("keeps reservations atomic and reports distinct quota failures", () => {
    const quotaLayer = MediaService.layerWith(
      mediaQuotaLimits({
        requestsPerHour: 10,
        bytesPerDay: 12,
        managedBytes: 10,
        reservationTtlMs: 60_000,
      }),
    ).pipe(Layer.provide(memoryStore()), Layer.provideMerge(DatabaseTest));
    return Effect.gen(function* () {
      const media = yield* MediaService;
      const sql = yield* SqlClient.SqlClient;
      const first = yield* media.reserveUpload(
        mediaQuotaClientId("atomic-client"),
        mediaByteLength(6),
      );
      yield* media.releaseReservation(first);
      const concurrent = yield* Effect.all(
        [
          Effect.result(
            media.reserveUpload(mediaQuotaClientId("other-client"), mediaByteLength(6)),
          ),
          Effect.result(
            media.reserveUpload(mediaQuotaClientId("other-client"), mediaByteLength(6)),
          ),
        ],
        { concurrency: "unbounded" },
      );
      expect(concurrent.filter((result) => result._tag === "Success")).toHaveLength(1);
      expect(
        concurrent.filter(
          (result) => result._tag === "Failure" && result.failure.reason === "StorageQuota",
        ),
      ).toHaveLength(1);
      for (const result of concurrent) {
        if (result._tag === "Success") yield* media.releaseReservation(result.success);
      }
      const quota = yield* sql<{ readonly reserved: number }>`
        SELECT reserved_bytes AS reserved FROM media_quota_state WHERE singleton = 1
      `;
      expect(quota[0]?.reserved).toBe(0);

      const uploadReservation = yield* media.reserveUpload(
        mediaQuotaClientId("byte-client"),
        mediaByteLength(8),
      );
      yield* media.upload(
        "image",
        "image/png",
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        uploadReservation,
      );
      const byteFailure = yield* media
        .reserveUpload(mediaQuotaClientId("byte-client"), mediaByteLength(5))
        .pipe(Effect.flip);
      expect(byteFailure.reason).toBe("ByteQuota");
      const storageFailure = yield* media
        .reserveUpload(mediaQuotaClientId("storage-client"), mediaByteLength(3))
        .pipe(Effect.flip);
      expect(storageFailure.reason).toBe("StorageQuota");
    }).pipe(Effect.provide(quotaLayer));
  });

  it.effect("rolls back objects and pending metadata when a reservation is invalid", () => {
    const store = controlledStore();
    store.allowDeletes();
    const layer = MediaService.layerWith(
      mediaQuotaLimits({
        requestsPerHour: 10,
        bytesPerDay: 1_000,
        managedBytes: 1_000,
        reservationTtlMs: 60_000,
      }),
    ).pipe(Layer.provide(store.layer), Layer.provideMerge(DatabaseTest));
    return Effect.gen(function* () {
      const media = yield* MediaService;
      const sql = yield* SqlClient.SqlClient;
      const reservation = yield* media.reserveUpload(
        mediaQuotaClientId("expiry-client"),
        mediaByteLength(8),
      );
      yield* sql`
        UPDATE media_upload_events SET status = 'expired' WHERE id = ${reservation}
      `;
      yield* sql`
        UPDATE media_quota_state SET reserved_bytes = 0 WHERE singleton = 1
      `;
      const failed = yield* media
        .upload(
          "image",
          "image/png",
          new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          reservation,
        )
        .pipe(Effect.flip);
      expect(failed.reason).toBe("Persistence");
      expect(store.objects.size).toBe(0);
      const assets = yield* sql<{ readonly count: number }>`
        SELECT COUNT(*) AS count FROM media_assets
      `;
      expect(assets[0]?.count).toBe(0);

      const wrongSize = yield* media.reserveUpload(
        mediaQuotaClientId("size-client"),
        mediaByteLength(1),
      );
      const sizeFailure = yield* media
        .upload(
          "image",
          "image/png",
          new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          wrongSize,
        )
        .pipe(Effect.flip);
      expect(sizeFailure.reason).toBe("Persistence");
      expect(store.objects.size).toBe(0);
    }).pipe(Effect.provide(layer));
  });

  it.effect("reports when enough rolling byte events, rather than only the oldest, expire", () => {
    const layer = MediaService.layerWith(
      mediaQuotaLimits({
        requestsPerHour: 10,
        bytesPerDay: 10,
        managedBytes: 1_000,
        reservationTtlMs: 60_000,
      }),
    ).pipe(Layer.provide(memoryStore()), Layer.provideMerge(DatabaseTest));
    return Effect.gen(function* () {
      const media = yield* MediaService;
      const sql = yield* SqlClient.SqlClient;
      const now = Date.now();
      yield* TestClock.setTime(now);
      yield* sql`
        INSERT INTO media_upload_events (
          id, client_id, byte_length, created_at, expires_at, status
        ) VALUES
          ('11111111111111111111111111111111', 'retry-client', 2,
            ${now - 23 * 60 * 60 * 1_000}, ${now}, 'succeeded'),
          ('22222222222222222222222222222222', 'retry-client', 7,
            ${now - 22 * 60 * 60 * 1_000}, ${now}, 'succeeded')
      `;
      const failure = yield* media
        .reserveUpload(mediaQuotaClientId("retry-client"), mediaByteLength(8))
        .pipe(Effect.flip);
      expect(failure.reason).toBe("ByteQuota");
      expect(failure.retryAfter).toBeGreaterThan(60 * 60);
      expect(failure.retryAfter).toBeLessThanOrEqual(2 * 60 * 60 + 2);
    }).pipe(Effect.provide(layer));
  });

  it.effect("allows the default 150-file bulk workflow and enforces request rate state", () => {
    const layer = MediaService.layerWith(DEFAULT_MEDIA_QUOTA_LIMITS).pipe(
      Layer.provide(memoryStore()),
      Layer.provideMerge(DatabaseTest),
    );
    return Effect.gen(function* () {
      const media = yield* MediaService;
      for (let index = 0; index < 180; index += 1) {
        const reservation = yield* media.reserveUpload(
          mediaQuotaClientId("bulk-client"),
          mediaByteLength(1),
        );
        yield* media.releaseReservation(reservation);
      }
      const failure = yield* media
        .reserveUpload(mediaQuotaClientId("bulk-client"), mediaByteLength(1))
        .pipe(Effect.flip);
      expect(failure.reason).toBe("RequestQuota");
      expect(failure.retryAfter).toBeGreaterThan(0);
    }).pipe(Effect.provide(layer));
  });

  it.effect("rejects missing and wrong-kind managed references", () =>
    Effect.gen(function* () {
      const boards = yield* BoardService;
      const media = yield* MediaService;
      yield* boards.create(DEFAULT_BOARD_ID, "Media");
      const audio = yield* media.upload(
        "audio",
        "audio/mpeg",
        new TextEncoder().encode("ID3\u0004\u0000"),
      );

      const wrongBackground = yield* boards
        .commit({
          boardId: DEFAULT_BOARD_ID,
          clientId: ClientIdSchema.make("media-client"),
          mutationId: MutationIdSchema.make("wrong-background-kind"),
          backgroundMediaId: audio.mediaId,
          upserts: [],
          deletes: [],
        })
        .pipe(Effect.flip);
      expect(wrongBackground.code).toBe("Invalid");

      const wrongKind = yield* boards
        .commit({
          boardId: DEFAULT_BOARD_ID,
          clientId: ClientIdSchema.make("media-client"),
          mutationId: MutationIdSchema.make("wrong-kind"),
          upserts: [managedImage(audio.mediaId)],
          deletes: [],
        })
        .pipe(Effect.flip);
      expect(wrongKind.code).toBe("Invalid");

      const missing = yield* boards
        .commit({
          boardId: DEFAULT_BOARD_ID,
          clientId: ClientIdSchema.make("media-client"),
          mutationId: MutationIdSchema.make("missing"),
          upserts: [
            managedImage(
              MediaIdSchema.make("0123456789abcdef0123456789abcdef"),
              ItemIdSchema.make("missing-image"),
            ),
          ],
          deletes: [],
        })
        .pipe(Effect.flip);
      expect(missing.code).toBe("Invalid");
    }).pipe(Effect.provide(TestLayer)),
  );
});
