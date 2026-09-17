import { Clock, Context, Effect, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";

import { BoardTimestampSchema, type BoardId } from "../lib/board-rpc";
import {
  PublicBoardItemSchema,
  PublicBoardSchema,
  PublicBoardSummarySchema,
  PublicIdSchema,
  PublicOwnerSchema,
  PublicProfileSchema,
  type ProfileBio,
  type ProfileDisplayName,
  type ProfileHandle,
  type PublicBoard,
  type PublicId,
  type PublicOwner,
  type PublicProfile,
} from "../lib/public-api";
import { NullableSqliteBooleanSchema } from "./sqlite";

interface ProfileRow {
  readonly handle: unknown;
  readonly display_name: unknown;
  readonly bio: unknown;
}

interface SummaryRow {
  readonly public_id: unknown;
  readonly title: unknown;
  readonly item_count: unknown;
  readonly updated_at: unknown;
  readonly published_at: unknown;
  readonly background_color: unknown;
  readonly background_media_id: unknown;
}

interface PublicBoardRow extends ProfileRow {
  readonly public_id: unknown;
  readonly title: unknown;
  readonly updated_at: unknown;
  readonly published_at: unknown;
  readonly background_color: unknown;
  readonly background_media_id: unknown;
}

interface ItemRow {
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

interface PublicationRow {
  readonly public_id: unknown;
}

const decodeOwnerRow = Effect.fn("PublishingRepo.decodeOwnerRow")(function* (row: ProfileRow) {
  return yield* Schema.decodeUnknownEffect(PublicOwnerSchema)({
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
  }).pipe(Effect.orDie);
});

const decodeSummaryRow = Effect.fn("PublishingRepo.decodeSummaryRow")(function* (row: SummaryRow) {
  return yield* Schema.decodeUnknownEffect(PublicBoardSummarySchema)({
    publicId: row.public_id,
    title: row.title,
    itemCount: row.item_count,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    ...(row.background_color === null ? {} : { background: row.background_color }),
    ...(row.background_media_id === null ? {} : { backgroundMediaId: row.background_media_id }),
  }).pipe(Effect.orDie);
});

const decodeItemRow = Effect.fn("PublishingRepo.decodeItemRow")(function* (row: ItemRow) {
  const storedXHideThread = yield* Schema.decodeUnknownEffect(NullableSqliteBooleanSchema)(
    row.x_hide_thread,
  ).pipe(Effect.orDie);
  return yield* Schema.decodeUnknownEffect(PublicBoardItemSchema)({
    kind: row.kind,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    rotation: row.rotation,
    order: row.order_index,
    ...(row.src === null ? {} : { src: row.src }),
    ...(row.media_id === null ? {} : { mediaId: row.media_id }),
    ...(row.href === null ? {} : { href: row.href }),
    ...(row.annotation_title === null ? {} : { annotationTitle: row.annotation_title }),
    ...(row.annotation_description === null
      ? {}
      : { annotationDescription: row.annotation_description }),
    ...(row.text === null ? {} : { text: row.text }),
    ...(row.color === null ? {} : { color: row.color }),
    ...(row.label === null ? {} : { label: row.label }),
    ...(row.website_url === null ? {} : { websiteUrl: row.website_url }),
    ...(row.website_image_url === null ? {} : { websiteImageUrl: row.website_image_url }),
    ...(row.website_title === null ? {} : { websiteTitle: row.website_title }),
    ...(row.website_description === null ? {} : { websiteDescription: row.website_description }),
    ...(row.website_site_label === null ? {} : { websiteSiteLabel: row.website_site_label }),
    ...(row.x_display === null ? {} : { xDisplay: row.x_display }),
    ...(row.x_theme === null ? {} : { xTheme: row.x_theme }),
    ...(storedXHideThread === null ? {} : { xHideThread: storedXHideThread === 1 }),
    ...(row.x_author_name === null ? {} : { xAuthorName: row.x_author_name }),
    ...(row.x_author_handle === null ? {} : { xAuthorHandle: row.x_author_handle }),
    ...(row.x_post_text === null ? {} : { xPostText: row.x_post_text }),
    ...(row.x_post_date === null ? {} : { xPostDate: row.x_post_date }),
  }).pipe(Effect.orDie);
});

interface PublishingRepoShape {
  readonly upsertProfile: (
    handle: ProfileHandle,
    displayName: ProfileDisplayName,
    bio: ProfileBio,
  ) => Effect.Effect<PublicOwner, SqlError>;
  readonly publish: (
    boardId: BoardId,
    publicId: PublicId,
  ) => Effect.Effect<PublicId | null, SqlError>;
  readonly unpublish: (boardId: BoardId) => Effect.Effect<boolean, SqlError>;
  readonly getProfile: (handle: ProfileHandle) => Effect.Effect<PublicProfile | null, SqlError>;
  readonly getBoard: (publicId: PublicId) => Effect.Effect<PublicBoard | null, SqlError>;
}

export class PublishingRepo extends Context.Service<PublishingRepo, PublishingRepoShape>()(
  "mood-board/PublishingRepo",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`PRAGMA foreign_keys = ON`;

      const upsertProfile = Effect.fn("PublishingRepo.upsertProfile")(function* (
        handle: ProfileHandle,
        displayName: ProfileDisplayName,
        bio: ProfileBio,
      ) {
        const updatedAt = yield* Clock.currentTimeMillis;
        yield* sql`
          INSERT INTO publisher_profile (singleton, handle, display_name, bio, updated_at)
          VALUES (1, ${handle}, ${displayName}, ${bio}, ${updatedAt})
          ON CONFLICT(singleton) DO UPDATE SET
            handle = excluded.handle,
            display_name = excluded.display_name,
            bio = excluded.bio,
            updated_at = excluded.updated_at
        `;
        return { handle, displayName, bio } satisfies PublicOwner;
      });

      const publish = Effect.fn("PublishingRepo.publish")(function* (
        boardId: BoardId,
        publicId: PublicId,
      ) {
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const existing = yield* sql<PublicationRow>`
              SELECT public_id FROM board_publications WHERE board_id = ${boardId}
            `;
            if (existing[0] !== undefined) {
              return yield* Schema.decodeUnknownEffect(PublicIdSchema)(existing[0].public_id).pipe(
                Effect.orDie,
              );
            }
            const boards = yield* sql<{ readonly found: unknown }>`
              SELECT 1 AS found FROM boards WHERE id = ${boardId} LIMIT 1
            `;
            if (boards.length === 0) return null;
            const profiles = yield* sql<{ readonly found: unknown }>`
              SELECT 1 AS found FROM publisher_profile WHERE singleton = 1 LIMIT 1
            `;
            if (profiles.length === 0) return null;
            const publishedAt = BoardTimestampSchema.make(yield* Clock.currentTimeMillis);
            yield* sql`
              INSERT INTO board_publications (board_id, public_id, published_at)
              VALUES (${boardId}, ${publicId}, ${publishedAt})
            `;
            return publicId;
          }),
        );
      });

      const unpublish = Effect.fn("PublishingRepo.unpublish")(function* (boardId: BoardId) {
        const removed = yield* sql<PublicationRow>`
          DELETE FROM board_publications
          WHERE board_id = ${boardId}
          RETURNING public_id
        `;
        return removed.length > 0;
      });

      const getProfile = Effect.fn("PublishingRepo.getProfile")(function* (handle: ProfileHandle) {
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const profiles = yield* sql<ProfileRow>`
              SELECT handle, display_name, bio
              FROM publisher_profile
              WHERE singleton = 1 AND handle = ${handle} COLLATE NOCASE
            `;
            const profile = profiles[0];
            if (profile === undefined) return null;
            const boards = yield* sql<SummaryRow>`
              SELECT
                p.public_id,
                b.title,
                COUNT(i.id) AS item_count,
                b.updated_at,
                p.published_at,
                b.background_color,
                b.background_media_id
              FROM board_publications p
              INNER JOIN boards b ON b.id = p.board_id
              LEFT JOIN items i ON i.board_id = b.id
              GROUP BY p.public_id, b.id, b.title, b.updated_at, p.published_at,
                b.background_color, b.background_media_id
              ORDER BY p.published_at DESC, p.public_id ASC
              LIMIT 100
            `;
            const owner = yield* decodeOwnerRow(profile);
            const summaries = yield* Effect.forEach(boards, decodeSummaryRow);
            return yield* Schema.decodeUnknownEffect(PublicProfileSchema)({
              owner,
              boards: summaries,
            }).pipe(Effect.orDie);
          }),
        );
      });

      const getBoard = Effect.fn("PublishingRepo.getBoard")(function* (publicId: PublicId) {
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const boards = yield* sql<PublicBoardRow>`
              SELECT
                p.public_id,
                p.published_at,
                b.title,
                b.updated_at,
                b.background_color,
                b.background_media_id,
                profile.handle,
                profile.display_name,
                profile.bio
              FROM board_publications p
              INNER JOIN boards b ON b.id = p.board_id
              INNER JOIN publisher_profile profile ON profile.singleton = 1
              WHERE p.public_id = ${publicId}
            `;
            const board = boards[0];
            if (board === undefined) return null;
            const items = yield* sql<ItemRow>`
              SELECT kind, x, y, width, height, rotation, order_index,
                src, media_id, href, annotation_title, annotation_description, text, color, label,
                website_url, website_image_url, website_title, website_description, website_site_label,
                x_display, x_theme, x_hide_thread, x_author_name, x_author_handle, x_post_text, x_post_date
              FROM items
              WHERE board_id = (
                SELECT board_id FROM board_publications WHERE public_id = ${publicId}
              )
              ORDER BY order_index ASC, id ASC
            `;
            const owner = yield* decodeOwnerRow(board);
            const decodedItems = yield* Effect.forEach(items, decodeItemRow);
            return yield* Schema.decodeUnknownEffect(PublicBoardSchema)({
              publicId: board.public_id,
              owner,
              board: {
                version: 1,
                title: board.title,
                ...(board.background_color === null ? {} : { background: board.background_color }),
                ...(board.background_media_id === null
                  ? {}
                  : { backgroundMediaId: board.background_media_id }),
                items: decodedItems,
                updatedAt: board.updated_at,
              },
              publishedAt: board.published_at,
            }).pipe(Effect.orDie);
          }),
        );
      });

      return PublishingRepo.of({
        upsertProfile,
        publish,
        unpublish,
        getProfile,
        getBoard,
      });
    }),
  );
}
