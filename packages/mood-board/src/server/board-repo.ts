import { createHash } from "node:crypto";

import { Clock, Context, Effect, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";

import {
  BoardColorSchema,
  BoardCountSchema,
  BoardIdSchema,
  BoardItemCountSchema,
  BoardItemSchema,
  BoardRevisionSchema,
  BoardSnapshotSchema,
  BoardSummarySchema,
  BoardTimestampSchema,
  BoardTitleSchema,
  ClientIdSchema,
  DEFAULT_BOARD_ID,
  ItemIdSchema,
  MAX_BOARDS,
  MAX_REMOTE_BOARD_BYTES,
  MAX_REMOTE_ITEMS,
  type BoardChange,
  type BoardDeleted,
  type BoardId,
  type BoardSnapshot,
  type BoardSummary,
  type ClientId,
  type ItemId,
  type MutationId,
  type RemoteBoardItem,
} from "../lib/board-rpc";
import { MediaIdSchema, MediaKindSchema, type MediaId } from "../lib/media";
import { PositiveIntegerSchema, Sha256HexSchema } from "../lib/schema";
import { NullableSqliteBooleanSchema } from "./sqlite";

interface BoardRow {
  readonly id: unknown;
  readonly title: unknown;
  readonly background_color: unknown;
  readonly background_media_id: unknown;
  readonly revision: unknown;
  readonly updated_at: unknown;
}

interface BoardSummaryRow {
  readonly id: unknown;
  readonly title: unknown;
  readonly item_count: unknown;
  readonly updated_at: unknown;
}

interface CountRow {
  readonly count: unknown;
}

interface TombstoneRow {
  readonly revision: unknown;
  readonly deleted_at: unknown;
}

const BoardRowSchema = Schema.Struct({
  id: BoardIdSchema,
  title: BoardTitleSchema,
  background_color: Schema.NullOr(BoardColorSchema),
  background_media_id: Schema.NullOr(MediaIdSchema),
  revision: BoardRevisionSchema,
  updated_at: BoardTimestampSchema,
});
const CountRowSchema = Schema.Struct({ count: BoardCountSchema });
const TombstoneRowSchema = Schema.Struct({
  revision: BoardRevisionSchema,
  deleted_at: BoardTimestampSchema,
});
const boardNow = Clock.currentTimeMillis.pipe(
  Effect.map((millis) => BoardTimestampSchema.make(millis)),
);

interface ItemRow {
  readonly id: unknown;
  readonly kind: unknown;
  readonly x: unknown;
  readonly y: unknown;
  readonly width: unknown;
  readonly height: unknown;
  readonly rotation: unknown;
  readonly order_index: unknown;
  readonly src: unknown;
  readonly media_id: unknown;
  readonly href: unknown;
  readonly annotation_title: unknown;
  readonly annotation_description: unknown;
  readonly text: unknown;
  readonly color: unknown;
  readonly label: unknown;
  readonly website_url: unknown;
  readonly website_image_url: unknown;
  readonly website_title: unknown;
  readonly website_description: unknown;
  readonly website_site_label: unknown;
  readonly x_display: unknown;
  readonly x_theme: unknown;
  readonly x_hide_thread: unknown;
  readonly x_author_name: unknown;
  readonly x_author_handle: unknown;
  readonly x_post_text: unknown;
  readonly x_post_date: unknown;
}

interface MutationRow {
  readonly revision: unknown;
  readonly client_id: unknown;
  readonly request_hash: unknown;
  readonly created_at: unknown;
}

interface ItemSizeRow {
  readonly id: unknown;
  readonly bytes: unknown;
}

interface MediaValidationRow {
  readonly kind: unknown;
}

const MutationRequestHashSchema = Sha256HexSchema.pipe(Schema.brand("MutationRequestHash"));
const MutationRowSchema = Schema.Struct({
  revision: BoardRevisionSchema,
  client_id: ClientIdSchema,
  request_hash: MutationRequestHashSchema,
  created_at: BoardTimestampSchema,
});
const ItemSizeRowSchema = Schema.Struct({
  id: ItemIdSchema,
  bytes: PositiveIntegerSchema,
});
const MediaValidationRowSchema = Schema.Struct({ kind: MediaKindSchema });

export interface CommitInput {
  readonly boardId: BoardId;
  readonly clientId: ClientId;
  readonly mutationId: MutationId;
  readonly title?: string | undefined;
  readonly background?: string | null | undefined;
  readonly backgroundMediaId?: MediaId | null | undefined;
  readonly upserts: ReadonlyArray<RemoteBoardItem>;
  readonly deletes: ReadonlyArray<ItemId>;
}

export interface CommitResult {
  readonly applied: boolean;
  readonly change: BoardChange;
}

export type CommitRejected =
  | { readonly _tag: "InvalidMutation" }
  | { readonly _tag: "MutationConflict" }
  | { readonly _tag: "TooManyItems" }
  | { readonly _tag: "BoardTooLarge" }
  | { readonly _tag: "InvalidMedia" };

export type ManagementRejected =
  | { readonly _tag: "BoardLimit" }
  | { readonly _tag: "DeletedBoardId" }
  | { readonly _tag: "InvalidOperation" }
  | { readonly _tag: "LastBoard" };

const mutationHash = (input: CommitInput) => {
  const legacyPayload = [
    input.boardId,
    input.clientId,
    input.mutationId,
    input.title ?? null,
    input.upserts,
    input.deletes,
  ];
  const metadata =
    input.background === undefined
      ? input.backgroundMediaId === undefined
        ? undefined
        : { backgroundMediaId: input.backgroundMediaId }
      : input.backgroundMediaId === undefined
        ? { background: input.background }
        : { background: input.background, backgroundMediaId: input.backgroundMediaId };
  const payload = metadata === undefined ? legacyPayload : [...legacyPayload, metadata];
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return MutationRequestHashSchema.make(hash);
};

const itemBytes = (item: RemoteBoardItem) =>
  512 +
  Buffer.byteLength(item.src ?? "", "utf8") +
  Buffer.byteLength(item.mediaId ?? "", "utf8") +
  Buffer.byteLength(item.href ?? "", "utf8") +
  Buffer.byteLength(item.annotationTitle ?? "", "utf8") +
  Buffer.byteLength(item.annotationDescription ?? "", "utf8") +
  Buffer.byteLength(item.text ?? "", "utf8") +
  Buffer.byteLength(item.color ?? "", "utf8") +
  Buffer.byteLength(item.label ?? "", "utf8") +
  Buffer.byteLength(item.websiteUrl ?? "", "utf8") +
  Buffer.byteLength(item.websiteImageUrl ?? "", "utf8") +
  Buffer.byteLength(item.websiteTitle ?? "", "utf8") +
  Buffer.byteLength(item.websiteDescription ?? "", "utf8") +
  Buffer.byteLength(item.websiteSiteLabel ?? "", "utf8") +
  Buffer.byteLength(item.xAuthorName ?? "", "utf8") +
  Buffer.byteLength(item.xAuthorHandle ?? "", "utf8") +
  Buffer.byteLength(item.xPostText ?? "", "utf8") +
  Buffer.byteLength(item.xPostDate ?? "", "utf8");

const normalizeLegacyItemMetadata = Effect.fn("BoardRepo.normalizeLegacyItemMetadata")(function* (
  row: ItemRow,
) {
  const storedXHideThread =
    row.kind === "x"
      ? yield* Schema.decodeUnknownEffect(NullableSqliteBooleanSchema)(row.x_hide_thread).pipe(
          Effect.orDie,
        )
      : null;
  const hasSource =
    row.kind === "image" ||
    row.kind === "spotify" ||
    row.kind === "youtube" ||
    row.kind === "audio" ||
    row.kind === "x";
  const hasLabel =
    row.kind === "swatch" ||
    row.kind === "spotify" ||
    row.kind === "youtube" ||
    row.kind === "audio";

  return {
    ...(hasSource && row.src !== null ? { src: row.src } : {}),
    ...((row.kind === "image" || row.kind === "audio") && row.media_id !== null
      ? { mediaId: row.media_id }
      : {}),
    ...(row.kind === "image" && row.href !== null ? { href: row.href } : {}),
    ...(row.kind === "image" && row.annotation_title !== null
      ? { annotationTitle: row.annotation_title }
      : {}),
    ...(row.kind === "image" && row.annotation_description !== null
      ? { annotationDescription: row.annotation_description }
      : {}),
    ...(row.kind === "note" ? { text: row.text === null ? "" : row.text } : {}),
    ...(row.kind === "swatch" ? { color: row.color === null ? "#000000" : row.color } : {}),
    ...(hasLabel && row.label !== null ? { label: row.label } : {}),
    ...(row.kind === "website" && row.website_url !== null ? { websiteUrl: row.website_url } : {}),
    ...(row.kind === "website" && row.website_image_url !== null
      ? { websiteImageUrl: row.website_image_url }
      : {}),
    ...(row.kind === "website" && row.website_title !== null
      ? { websiteTitle: row.website_title }
      : {}),
    ...(row.kind === "website" && row.website_description !== null
      ? { websiteDescription: row.website_description }
      : {}),
    ...(row.kind === "website" && row.website_site_label !== null
      ? { websiteSiteLabel: row.website_site_label }
      : {}),
    ...(row.kind === "x" && row.x_display !== null ? { xDisplay: row.x_display } : {}),
    ...(row.kind === "x" && row.x_theme !== null ? { xTheme: row.x_theme } : {}),
    ...(storedXHideThread === null ? {} : { xHideThread: storedXHideThread === 1 }),
    ...(row.kind === "x" && row.x_author_name !== null ? { xAuthorName: row.x_author_name } : {}),
    ...(row.kind === "x" && row.x_author_handle !== null
      ? { xAuthorHandle: row.x_author_handle }
      : {}),
    ...(row.kind === "x" && row.x_post_text !== null ? { xPostText: row.x_post_text } : {}),
    ...(row.kind === "x" && row.x_post_date !== null ? { xPostDate: row.x_post_date } : {}),
  };
});

const decodeItemRow = Effect.fn("BoardRepo.decodeItemRow")(function* (row: ItemRow) {
  const metadata = yield* normalizeLegacyItemMetadata(row);
  return yield* Schema.decodeUnknownEffect(BoardItemSchema)({
    id: row.id,
    kind: row.kind,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    rotation: row.rotation,
    order: row.order_index,
    ...metadata,
  }).pipe(Effect.orDie);
});

const decodeSummary = Effect.fn("BoardRepo.decodeSummary")(function* (row: BoardSummaryRow) {
  return yield* Schema.decodeUnknownEffect(BoardSummarySchema)({
    id: row.id,
    title: row.title,
    itemCount: row.item_count,
    updatedAt: row.updated_at,
  }).pipe(Effect.orDie);
});

const decodeBoardRow = Effect.fn("BoardRepo.decodeBoardRow")(function* (row: BoardRow) {
  return yield* Schema.decodeUnknownEffect(BoardRowSchema)(row).pipe(Effect.orDie);
});

const decodeCount = Effect.fn("BoardRepo.decodeCount")(function* (row: CountRow | undefined) {
  if (row === undefined) return 0;
  return (yield* Schema.decodeUnknownEffect(CountRowSchema)(row).pipe(Effect.orDie)).count;
});

const decodeTombstone = Effect.fn("BoardRepo.decodeTombstone")(function* (row: TombstoneRow) {
  return yield* Schema.decodeUnknownEffect(TombstoneRowSchema)(row).pipe(Effect.orDie);
});

const decodeMutationRow = Effect.fn("BoardRepo.decodeMutationRow")(function* (row: MutationRow) {
  return yield* Schema.decodeUnknownEffect(MutationRowSchema)(row).pipe(Effect.orDie);
});

const decodeItemSizeRow = Effect.fn("BoardRepo.decodeItemSizeRow")(function* (row: ItemSizeRow) {
  return yield* Schema.decodeUnknownEffect(ItemSizeRowSchema)(row).pipe(Effect.orDie);
});

const decodeMediaValidationRow = Effect.fn("BoardRepo.decodeMediaValidationRow")(function* (
  row: MediaValidationRow,
) {
  return yield* Schema.decodeUnknownEffect(MediaValidationRowSchema)(row).pipe(Effect.orDie);
});

interface BoardRepoShape {
  readonly list: () => Effect.Effect<ReadonlyArray<BoardSummary>, SqlError>;
  readonly exists: (boardId: BoardId) => Effect.Effect<boolean, SqlError>;
  readonly getSnapshot: (boardId: BoardId) => Effect.Effect<BoardSnapshot | null, SqlError>;
  readonly create: (
    boardId: BoardId,
    title: string,
  ) => Effect.Effect<BoardSummary | ManagementRejected, SqlError>;
  readonly duplicate: (
    sourceBoardId: BoardId,
    boardId: BoardId,
    title: string,
  ) => Effect.Effect<BoardSummary | ManagementRejected | null, SqlError>;
  readonly delete: (boardId: BoardId) => Effect.Effect<BoardDeleted | ManagementRejected, SqlError>;
  readonly commit: (
    input: CommitInput,
  ) => Effect.Effect<CommitResult | CommitRejected | null, SqlError>;
}

export class BoardRepo extends Context.Service<BoardRepo, BoardRepoShape>()(
  "mood-board/BoardRepo",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`PRAGMA foreign_keys = ON`;

      const getSummary = Effect.fn("BoardRepo.getSummary")(function* (boardId: BoardId) {
        const rows = yield* sql<BoardSummaryRow>`
          SELECT b.id, b.title, b.updated_at, COUNT(i.id) AS item_count
          FROM boards b
          LEFT JOIN items i ON i.board_id = b.id
          WHERE b.id = ${boardId}
          GROUP BY b.id, b.title, b.updated_at
        `;
        const row = rows[0];
        return row === undefined ? null : yield* decodeSummary(row);
      });

      const list = Effect.fn("BoardRepo.list")(function* () {
        const rows = yield* sql<BoardSummaryRow>`
          SELECT b.id, b.title, b.updated_at, COUNT(i.id) AS item_count
          FROM boards b
          LEFT JOIN items i ON i.board_id = b.id
          GROUP BY b.id, b.title, b.updated_at
          ORDER BY b.updated_at DESC, b.id ASC
          LIMIT ${MAX_BOARDS}
        `;
        return yield* Effect.forEach(rows, decodeSummary);
      });

      const exists = Effect.fn("BoardRepo.exists")(function* (boardId: BoardId) {
        const rows = yield* sql<{ readonly found: unknown }>`
          SELECT 1 AS found
          FROM boards
          WHERE id = ${boardId}
          LIMIT 1
        `;
        return rows.length > 0;
      });

      const getSnapshot = Effect.fn("BoardRepo.getSnapshot")(function* (boardId: BoardId) {
        const boards = yield* sql<BoardRow>`
          SELECT id, title, background_color, background_media_id, revision, updated_at
          FROM boards
          WHERE id = ${boardId}
        `;
        const boardRow = boards[0];
        if (boardRow === undefined) return null;
        const board = yield* decodeBoardRow(boardRow);

        const rows = yield* sql<ItemRow>`
          SELECT id, kind, x, y, width, height, rotation, order_index,
            src, media_id, href, annotation_title, annotation_description, text, color, label,
            website_url, website_image_url, website_title, website_description, website_site_label,
            x_display, x_theme, x_hide_thread, x_author_name, x_author_handle, x_post_text, x_post_date
          FROM items
          WHERE board_id = ${boardId}
          ORDER BY order_index ASC, id ASC
        `;
        const items = yield* Effect.forEach(rows, decodeItemRow);

        return yield* Schema.decodeUnknownEffect(BoardSnapshotSchema)({
          _tag: "Snapshot",
          boardId,
          revision: board.revision,
          board: {
            version: 1,
            title: board.title,
            ...(board.background_color === null ? {} : { background: board.background_color }),
            ...(board.background_media_id === null
              ? {}
              : { backgroundMediaId: board.background_media_id }),
            items,
            updatedAt: board.updated_at,
          },
        }).pipe(Effect.orDie);
      });

      const create = Effect.fn("BoardRepo.create")(function* (boardId: BoardId, title: string) {
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const existing = yield* getSummary(boardId);
            if (existing !== null) return existing;
            const tombstones = yield* sql<TombstoneRow>`
              SELECT revision, deleted_at
              FROM board_tombstones
              WHERE board_id = ${boardId}
            `;
            if (tombstones.length > 0) {
              return { _tag: "DeletedBoardId" } satisfies ManagementRejected;
            }

            const counts = yield* sql<CountRow>`SELECT COUNT(*) AS count FROM boards`;
            const count = yield* decodeCount(counts[0]);
            const defaultExists =
              boardId === DEFAULT_BOARD_ID ? false : yield* exists(DEFAULT_BOARD_ID);
            const limit =
              defaultExists || boardId === DEFAULT_BOARD_ID ? MAX_BOARDS : MAX_BOARDS - 1;
            if (count >= limit) {
              return { _tag: "BoardLimit" } satisfies ManagementRejected;
            }

            const updatedAt = yield* boardNow;
            yield* sql`
              INSERT INTO boards (id, title, version, revision, updated_at)
              VALUES (${boardId}, ${title}, 1, 0, ${updatedAt})
            `;
            return {
              id: boardId,
              title,
              itemCount: BoardItemCountSchema.make(0),
              updatedAt,
            } satisfies BoardSummary;
          }),
        );
      });

      const duplicate = Effect.fn("BoardRepo.duplicate")(function* (
        sourceBoardId: BoardId,
        boardId: BoardId,
        title: string,
      ) {
        if (sourceBoardId === boardId) {
          return { _tag: "InvalidOperation" } satisfies ManagementRejected;
        }

        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const existing = yield* getSummary(boardId);
            if (existing !== null) return existing;
            const tombstones = yield* sql<TombstoneRow>`
              SELECT revision, deleted_at
              FROM board_tombstones
              WHERE board_id = ${boardId}
            `;
            if (tombstones.length > 0) {
              return { _tag: "DeletedBoardId" } satisfies ManagementRejected;
            }

            const source = yield* getSummary(sourceBoardId);
            if (source === null) return null;

            const counts = yield* sql<CountRow>`SELECT COUNT(*) AS count FROM boards`;
            const count = yield* decodeCount(counts[0]);
            const defaultExists = yield* exists(DEFAULT_BOARD_ID);
            const limit = defaultExists ? MAX_BOARDS : MAX_BOARDS - 1;
            if (count >= limit) {
              return { _tag: "BoardLimit" } satisfies ManagementRejected;
            }

            const updatedAt = yield* boardNow;
            yield* sql`
              INSERT INTO boards (
                id, title, background_color, background_media_id, version, revision, updated_at
              )
              SELECT
                ${boardId}, ${title}, background_color, background_media_id, 1, 0, ${updatedAt}
              FROM boards
              WHERE id = ${sourceBoardId}
            `;
            yield* sql`
              INSERT INTO items (
                board_id, id, kind, x, y, width, height, rotation, order_index,
                src, media_id, href, annotation_title, annotation_description, text, color, label,
                website_url, website_image_url, website_title, website_description, website_site_label,
                x_display, x_theme, x_hide_thread, x_author_name, x_author_handle, x_post_text, x_post_date
              )
              SELECT
                ${boardId}, id, kind, x, y, width, height, rotation, order_index,
                src, media_id, href, annotation_title, annotation_description, text, color, label,
                website_url, website_image_url, website_title, website_description, website_site_label,
                x_display, x_theme, x_hide_thread, x_author_name, x_author_handle, x_post_text, x_post_date
              FROM items
              WHERE board_id = ${sourceBoardId}
            `;

            return {
              id: boardId,
              title,
              itemCount: source.itemCount,
              updatedAt,
            } satisfies BoardSummary;
          }),
        );
      });

      const deleteBoard = Effect.fn("BoardRepo.delete")(function* (boardId: BoardId) {
        if (boardId === DEFAULT_BOARD_ID) {
          return { _tag: "InvalidOperation" } satisfies ManagementRejected;
        }
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const boards = yield* sql<BoardRow>`
              SELECT id, title, background_color, background_media_id, revision, updated_at
              FROM boards
              WHERE id = ${boardId}
            `;
            const boardRow = boards[0];
            if (boardRow === undefined) {
              const tombstones = yield* sql<TombstoneRow>`
                SELECT revision, deleted_at
                FROM board_tombstones
                WHERE board_id = ${boardId}
              `;
              const tombstoneRow = tombstones[0];
              if (tombstoneRow !== undefined) {
                const tombstone = yield* decodeTombstone(tombstoneRow);
                return {
                  _tag: "Deleted",
                  boardId,
                  revision: tombstone.revision,
                  updatedAt: tombstone.deleted_at,
                } satisfies BoardDeleted;
              }

              const revision = BoardRevisionSchema.make(0);
              const updatedAt = yield* boardNow;
              yield* sql`
                INSERT INTO board_tombstones (board_id, revision, deleted_at)
                VALUES (${boardId}, ${revision}, ${updatedAt})
              `;
              return {
                _tag: "Deleted",
                boardId,
                revision,
                updatedAt,
              } satisfies BoardDeleted;
            }
            const board = yield* decodeBoardRow(boardRow);

            const counts = yield* sql<CountRow>`SELECT COUNT(*) AS count FROM boards`;
            if ((yield* decodeCount(counts[0])) <= 1) {
              return { _tag: "LastBoard" } satisfies ManagementRejected;
            }

            const updatedAt = yield* boardNow;
            const revision = BoardRevisionSchema.make(board.revision + 1);
            yield* sql`
              INSERT INTO board_tombstones (board_id, revision, deleted_at)
              VALUES (${boardId}, ${revision}, ${updatedAt})
              ON CONFLICT (board_id) DO UPDATE SET
                revision = excluded.revision,
                deleted_at = excluded.deleted_at
            `;
            yield* sql`DELETE FROM boards WHERE id = ${boardId}`;
            return {
              _tag: "Deleted",
              boardId,
              revision,
              updatedAt,
            } satisfies BoardDeleted;
          }),
        );
      });

      const commit = Effect.fn("BoardRepo.commit")(function* (input: CommitInput) {
        const deletedIds = new Set(input.deletes);
        if (input.upserts.some((item) => deletedIds.has(item.id))) {
          return { _tag: "InvalidMutation" } satisfies CommitRejected;
        }
        const requestHash = mutationHash(input);

        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const existingMutations = yield* sql<MutationRow>`
              SELECT revision, client_id, request_hash, created_at
              FROM mutations
              WHERE board_id = ${input.boardId}
                AND mutation_id = ${input.mutationId}
            `;
            const existingMutationRow = existingMutations[0];
            if (existingMutationRow !== undefined) {
              const existingMutation = yield* decodeMutationRow(existingMutationRow);
              if (existingMutation.request_hash !== requestHash) {
                return { _tag: "MutationConflict" } satisfies CommitRejected;
              }
              return {
                applied: false,
                change: {
                  _tag: "Change",
                  boardId: input.boardId,
                  revision: existingMutation.revision,
                  clientId: existingMutation.client_id,
                  mutationId: input.mutationId,
                  ...(input.title === undefined ? {} : { title: input.title }),
                  ...(input.background === undefined ? {} : { background: input.background }),
                  ...(input.backgroundMediaId === undefined
                    ? {}
                    : { backgroundMediaId: input.backgroundMediaId }),
                  upserts: input.upserts,
                  deletes: input.deletes,
                  updatedAt: existingMutation.created_at,
                },
              } satisfies CommitResult;
            }

            const boards = yield* sql<BoardRow>`
              SELECT id, title, background_color, background_media_id, revision, updated_at
              FROM boards
              WHERE id = ${input.boardId}
            `;
            const boardRow = boards[0];
            if (boardRow === undefined) return null;
            const board = yield* decodeBoardRow(boardRow);

            if (input.backgroundMediaId !== undefined && input.backgroundMediaId !== null) {
              const mediaRows = yield* sql<MediaValidationRow>`
                SELECT kind FROM media_assets
                WHERE id = ${input.backgroundMediaId} AND ready_at IS NOT NULL
                LIMIT 1
              `;
              const mediaRow = mediaRows[0];
              const media =
                mediaRow === undefined ? null : yield* decodeMediaValidationRow(mediaRow);
              if (media?.kind !== "image") {
                return { _tag: "InvalidMedia" } satisfies CommitRejected;
              }
            }

            for (const item of input.upserts) {
              if (item.mediaId === undefined) continue;
              const expectedKind =
                item.kind === "image" || item.kind === "audio" ? item.kind : null;
              if (expectedKind === null) {
                return { _tag: "InvalidMedia" } satisfies CommitRejected;
              }
              const mediaRows = yield* sql<MediaValidationRow>`
                SELECT kind FROM media_assets
                WHERE id = ${item.mediaId} AND ready_at IS NOT NULL
                LIMIT 1
              `;
              const mediaRow = mediaRows[0];
              const media =
                mediaRow === undefined ? null : yield* decodeMediaValidationRow(mediaRow);
              if (media?.kind !== expectedKind) {
                return { _tag: "InvalidMedia" } satisfies CommitRejected;
              }
            }

            const existingItems = yield* sql<ItemSizeRow>`
              SELECT
                id,
                512 + COALESCE(LENGTH(CAST(src AS BLOB)), 0) +
                  COALESCE(LENGTH(CAST(media_id AS BLOB)), 0) +
                  COALESCE(LENGTH(CAST(href AS BLOB)), 0) +
                  COALESCE(LENGTH(CAST(annotation_title AS BLOB)), 0) +
                  COALESCE(LENGTH(CAST(annotation_description AS BLOB)), 0) +
                  COALESCE(LENGTH(CAST(text AS BLOB)), 0) +
                  COALESCE(LENGTH(CAST(color AS BLOB)), 0) +
                  COALESCE(LENGTH(CAST(label AS BLOB)), 0) +
                  COALESCE(LENGTH(CAST(website_url AS BLOB)), 0) +
                  COALESCE(LENGTH(CAST(website_image_url AS BLOB)), 0) +
                  COALESCE(LENGTH(CAST(website_title AS BLOB)), 0) +
                  COALESCE(LENGTH(CAST(website_description AS BLOB)), 0) +
                  COALESCE(LENGTH(CAST(website_site_label AS BLOB)), 0) +
                  COALESCE(LENGTH(CAST(x_author_name AS BLOB)), 0) +
                  COALESCE(LENGTH(CAST(x_author_handle AS BLOB)), 0) +
                  COALESCE(LENGTH(CAST(x_post_text AS BLOB)), 0) +
                  COALESCE(LENGTH(CAST(x_post_date AS BLOB)), 0) AS bytes
              FROM items
              WHERE board_id = ${input.boardId}
            `;
            const decodedItems = yield* Effect.forEach(existingItems, decodeItemSizeRow);
            const projectedItems = new Map(decodedItems.map((item) => [item.id, item.bytes]));
            for (const itemId of input.deletes) projectedItems.delete(itemId);
            for (const item of input.upserts) projectedItems.set(item.id, itemBytes(item));
            if (projectedItems.size > MAX_REMOTE_ITEMS) {
              return { _tag: "TooManyItems" } satisfies CommitRejected;
            }
            const projectedBytes = [...projectedItems.values()].reduce(
              (total, bytes) => total + bytes,
              0,
            );
            if (projectedBytes > MAX_REMOTE_BOARD_BYTES) {
              return { _tag: "BoardTooLarge" } satisfies CommitRejected;
            }

            for (const itemId of input.deletes) {
              yield* sql`
                DELETE FROM items
                WHERE board_id = ${input.boardId}
                  AND id = ${itemId}
              `;
            }

            for (const item of input.upserts) {
              yield* sql`
                INSERT INTO items (
                  board_id, id, kind, x, y, width, height, rotation, order_index,
                  src, media_id, href, annotation_title, annotation_description, text, color, label,
                  website_url, website_image_url, website_title, website_description, website_site_label,
                  x_display, x_theme, x_hide_thread, x_author_name, x_author_handle, x_post_text, x_post_date
                ) VALUES (
                  ${input.boardId}, ${item.id}, ${item.kind}, ${item.x}, ${item.y},
                  ${item.width}, ${item.height}, ${item.rotation}, ${item.order},
                  ${item.src ?? null}, ${item.mediaId ?? null}, ${item.href ?? null},
                  ${item.annotationTitle ?? null}, ${item.annotationDescription ?? null}, ${item.text ?? null},
                  ${item.color ?? null}, ${item.label ?? null}, ${item.websiteUrl ?? null},
                  ${item.websiteImageUrl ?? null}, ${item.websiteTitle ?? null},
                  ${item.websiteDescription ?? null}, ${item.websiteSiteLabel ?? null},
                  ${item.xDisplay ?? null}, ${item.xTheme ?? null}, ${item.xHideThread === undefined ? null : item.xHideThread ? 1 : 0},
                  ${item.xAuthorName ?? null}, ${item.xAuthorHandle ?? null}, ${item.xPostText ?? null},
                  ${item.xPostDate ?? null}
                )
                ON CONFLICT (board_id, id) DO UPDATE SET
                  kind = excluded.kind,
                  x = excluded.x,
                  y = excluded.y,
                  width = excluded.width,
                  height = excluded.height,
                  rotation = excluded.rotation,
                  order_index = excluded.order_index,
                  src = excluded.src,
                  media_id = excluded.media_id,
                  href = excluded.href,
                  annotation_title = excluded.annotation_title,
                  annotation_description = excluded.annotation_description,
                  text = excluded.text,
                  color = excluded.color,
                  label = excluded.label,
                  website_url = excluded.website_url,
                  website_image_url = excluded.website_image_url,
                  website_title = excluded.website_title,
                  website_description = excluded.website_description,
                  website_site_label = excluded.website_site_label,
                  x_display = excluded.x_display,
                  x_theme = excluded.x_theme,
                  x_hide_thread = excluded.x_hide_thread,
                  x_author_name = excluded.x_author_name,
                  x_author_handle = excluded.x_author_handle,
                  x_post_text = excluded.x_post_text,
                  x_post_date = excluded.x_post_date
              `;
            }

            const revision = BoardRevisionSchema.make(board.revision + 1);
            const updatedAt = yield* boardNow;
            const background =
              input.background === undefined ? board.background_color : input.background;
            const backgroundMediaId =
              input.backgroundMediaId === undefined
                ? board.background_media_id
                : input.backgroundMediaId;
            yield* sql`
              UPDATE boards
              SET title = ${input.title ?? board.title},
                  background_color = ${background},
                  background_media_id = ${backgroundMediaId},
                  revision = ${revision},
                  updated_at = ${updatedAt}
              WHERE id = ${input.boardId}
            `;
            yield* sql`
              INSERT INTO mutations (
                board_id, mutation_id, revision, client_id, request_hash, created_at
              ) VALUES (
                ${input.boardId}, ${input.mutationId}, ${revision}, ${input.clientId},
                ${requestHash}, ${updatedAt}
              )
            `;

            return {
              applied: true,
              change: {
                _tag: "Change",
                boardId: input.boardId,
                revision,
                clientId: input.clientId,
                mutationId: input.mutationId,
                ...(input.title === undefined ? {} : { title: input.title }),
                ...(input.background === undefined ? {} : { background: input.background }),
                ...(input.backgroundMediaId === undefined
                  ? {}
                  : { backgroundMediaId: input.backgroundMediaId }),
                upserts: input.upserts,
                deletes: input.deletes,
                updatedAt,
              },
            } satisfies CommitResult;
          }),
        );
      });

      return BoardRepo.of({
        list,
        exists,
        getSnapshot,
        create,
        duplicate,
        delete: deleteBoard,
        commit,
      });
    }),
  );
}
