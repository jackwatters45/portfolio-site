import { D1Client } from "@effect/sql-d1";
import { Context, Effect, Layer, Schema } from "effect";
import type { SqlError } from "effect/unstable/sql/SqlError";

import {
  BoardSummarySchema,
  MAX_BOARDS,
  type BoardDeleted,
  type BoardRevision,
  type BoardSummary,
} from "../lib/board-rpc";

export const DEFAULT_WORKSPACE_ID = "public-preview";

interface DirectoryRow {
  readonly board_id: unknown;
  readonly title: unknown;
  readonly item_count: unknown;
  readonly updated_at: unknown;
}

interface CatalogEntry {
  readonly summary: BoardSummary;
  readonly revision: BoardRevision;
}

interface CatalogProjectionShape {
  readonly upsert: (
    summary: BoardSummary,
    revision: BoardRevision,
  ) => Effect.Effect<void, SqlError>;
  readonly tombstone: (event: BoardDeleted) => Effect.Effect<void, SqlError>;
  readonly reconcile: (entries: ReadonlyArray<CatalogEntry>) => Effect.Effect<void, SqlError>;
  readonly list: () => Effect.Effect<ReadonlyArray<BoardSummary>, SqlError>;
}

export class CatalogProjection extends Context.Service<CatalogProjection, CatalogProjectionShape>()(
  "mood-board/cloudflare/CatalogProjection",
) {
  static layerFor(workspaceId: string) {
    return Layer.effect(
      this,
      D1Client.D1Client.use((sql) => {
        const upsert = Effect.fn("CatalogProjection.upsert")(function* (
          summary: BoardSummary,
          revision: BoardRevision,
        ) {
          yield* sql`
            INSERT INTO board_directory (
              workspace_id, board_id, title, item_count, revision, updated_at, deleted
            ) VALUES (
              ${workspaceId}, ${summary.id}, ${summary.title},
              ${summary.itemCount}, ${revision}, ${summary.updatedAt}, 0
            )
            ON CONFLICT (workspace_id, board_id) DO UPDATE SET
              title = excluded.title,
              item_count = excluded.item_count,
              revision = excluded.revision,
              updated_at = excluded.updated_at,
              deleted = 0
            WHERE excluded.revision >= board_directory.revision
          `;
        });

        const tombstone = Effect.fn("CatalogProjection.tombstone")(function* (event: BoardDeleted) {
          yield* sql`
            INSERT INTO board_directory (
              workspace_id, board_id, title, item_count, revision, updated_at, deleted
            ) VALUES (
              ${workspaceId}, ${event.boardId}, '', 0,
              ${event.revision}, ${event.updatedAt}, 1
            )
            ON CONFLICT (workspace_id, board_id) DO UPDATE SET
              revision = excluded.revision,
              updated_at = excluded.updated_at,
              deleted = 1
            WHERE excluded.revision >= board_directory.revision
          `;
        });

        const reconcile = Effect.fn("CatalogProjection.reconcile")(function* (
          entries: ReadonlyArray<CatalogEntry>,
        ) {
          yield* sql`
            UPDATE board_directory
            SET deleted = 1
            WHERE workspace_id = ${workspaceId}
          `;
          yield* Effect.forEach(entries, (entry) => upsert(entry.summary, entry.revision), {
            discard: true,
          });
        });

        const decodeSummary = Effect.fn("CatalogProjection.decodeSummary")(function* (
          row: DirectoryRow,
        ) {
          return yield* Schema.decodeUnknownEffect(BoardSummarySchema)({
            id: row.board_id,
            title: row.title,
            itemCount: row.item_count,
            updatedAt: row.updated_at,
          }).pipe(Effect.orDie);
        });

        const list = Effect.fn("CatalogProjection.list")(function* () {
          const rows = yield* sql<DirectoryRow>`
            SELECT board_id, title, item_count, updated_at
            FROM board_directory
            WHERE workspace_id = ${workspaceId}
              AND deleted = 0
            ORDER BY updated_at DESC, board_id ASC
            LIMIT ${MAX_BOARDS}
          `;
          return yield* Effect.forEach(rows, decodeSummary);
        });

        return Effect.succeed(
          CatalogProjection.of({
            upsert,
            tombstone,
            reconcile,
            list,
          }),
        );
      }),
    );
  }

  static readonly layer = this.layerFor(DEFAULT_WORKSPACE_ID);
}
