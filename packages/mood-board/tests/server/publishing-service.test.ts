import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import {
  BoardIdSchema,
  ClientIdSchema,
  DEFAULT_BOARD_ID,
  ItemIdSchema,
  MutationIdSchema,
} from "../../src/lib/board-rpc";
import {
  ImageAnnotationDescriptionSchema,
  ImageAnnotationTitleSchema,
} from "../../src/lib/image-annotation";
import { MediaIdSchema } from "../../src/lib/media";
import {
  WebsiteDescriptionSchema,
  WebsiteImageUrlSchema,
  WebsiteSiteLabelSchema,
  WebsiteTitleSchema,
  WebsiteUrlSchema,
} from "../../src/lib/website-preview";
import {
  XAuthorHandleSchema,
  XAuthorNameSchema,
  XPostDateSchema,
  XPostTextSchema,
} from "../../src/lib/x-post";
import { BoardService } from "../../src/server/board-service";
import { migrationLoader } from "../../src/server/migrations";
import { PublishingService } from "../../src/server/publishing-service";

const DatabaseTest = SqliteMigrator.layer({ loader: migrationLoader }).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })),
);

const TestLayer = Layer.merge(BoardService.layer, PublishingService.layer).pipe(
  Layer.provideMerge(DatabaseTest),
);

const boardId = BoardIdSchema.make("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const duplicateId = BoardIdSchema.make("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
const backgroundMediaId = MediaIdSchema.make("0123456789abcdef0123456789abcdef");

const prepare = Effect.gen(function* () {
  const boards = yield* BoardService;
  const publishing = yield* PublishingService;
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    INSERT INTO media_assets (
      id, kind, mime_type, byte_length, etag, storage_key, created_at,
      ready_at, unreferenced_at
    ) VALUES (
      ${backgroundMediaId}, 'image', 'image/png', 8, 'etag', 'background', 1, 1, 1
    )
  `;
  yield* boards.create(DEFAULT_BOARD_ID, "Home");
  yield* boards.create(boardId, "Published study");
  yield* boards.commit({
    boardId,
    clientId: ClientIdSchema.make("publisher-test"),
    mutationId: MutationIdSchema.make("add-public-items"),
    background: "#DDE3DC",
    backgroundMediaId,
    upserts: [
      {
        id: ItemIdSchema.make("public-note"),
        kind: "note",
        x: 12,
        y: 34,
        width: 320,
        height: 220,
        rotation: -2,
        order: 1,
        text: "Only the public DTO should leave SQLite.",
      },
      {
        id: ItemIdSchema.make("public-image"),
        kind: "image",
        x: 400,
        y: 0,
        width: 320,
        height: 240,
        rotation: 0,
        order: 2,
        src: "https://images.example/chair.jpg",
        href: "https://shop.example/chair",
        annotationTitle: ImageAnnotationTitleSchema.make("Waxed field jacket"),
        annotationDescription: ImageAnnotationDescriptionSchema.make(
          "Weathered cotton with a corduroy collar.",
        ),
      },
      {
        id: ItemIdSchema.make("public-website"),
        kind: "website",
        x: 760,
        y: 0,
        width: 540,
        height: 360,
        rotation: 0,
        order: 3,
        websiteUrl: WebsiteUrlSchema.make("https://example.com/story"),
        websiteImageUrl: WebsiteImageUrlSchema.make("https://cdn.example.com/story.jpg"),
        websiteTitle: WebsiteTitleSchema.make("A collected room"),
        websiteDescription: WebsiteDescriptionSchema.make("Light, stone, and quiet objects."),
        websiteSiteLabel: WebsiteSiteLabelSchema.make("example.com"),
      },
      {
        id: ItemIdSchema.make("public-x"),
        kind: "x",
        x: 0,
        y: 420,
        width: 550,
        height: 620,
        rotation: 0,
        order: 4,
        src: "https://x.com/sheherenow_/status/2082226100764369045",
        xDisplay: "post",
        xTheme: "automatic",
        xHideThread: true,
        xAuthorName: XAuthorNameSchema.make("Jem"),
        xAuthorHandle: XAuthorHandleSchema.make("sheherenow_"),
        xPostText: XPostTextSchema.make("Cooking inspiration"),
        xPostDate: XPostDateSchema.make("2026-07-28"),
      },
    ],
    deletes: [],
  });
  return { boards, publishing };
});

describe("PublishingService", () => {
  it.effect("denies private and unknown boards before any public happy path", () =>
    Effect.gen(function* () {
      const { publishing } = yield* prepare;
      expect(yield* publishing.getBoard("0123456789abcdef0123456789abcdef")).toBeNull();
      expect(yield* publishing.getBoard("default")).toBeNull();
      expect(yield* publishing.getProfile("studio-notes")).toBeNull();
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("publishes explicitly, preserves the public id, and omits internal ids", () =>
    Effect.gen(function* () {
      const { publishing } = yield* prepare;
      yield* publishing.configureProfile({
        handle: "Studio-Notes",
        displayName: "Studio Notes",
        bio: "Rooms and references",
      });
      const firstId = yield* publishing.publish(boardId);
      const retryId = yield* publishing.publish(boardId);
      const profile = yield* publishing.getProfile("studio-notes");
      const board = yield* publishing.getBoard(firstId);

      expect(firstId).toMatch(/^[0-9a-f]{32}$/);
      expect(retryId).toBe(firstId);
      expect(profile?.boards).toHaveLength(1);
      expect(profile?.boards[0]).toMatchObject({
        publicId: firstId,
        background: "#DDE3DC",
        backgroundMediaId,
      });
      expect(board?.board).toMatchObject({
        background: "#DDE3DC",
        backgroundMediaId,
      });
      expect(board?.board.items[0]?.text).toContain("public DTO");
      expect(board?.board.items[1]).toMatchObject({
        href: "https://shop.example/chair",
        annotationTitle: "Waxed field jacket",
        annotationDescription: "Weathered cotton with a corduroy collar.",
      });
      expect(board?.board.items[2]).toMatchObject({
        kind: "website",
        websiteUrl: "https://example.com/story",
        websiteTitle: "A collected room",
      });
      expect(board?.board.items[3]).toMatchObject({
        kind: "x",
        xAuthorHandle: "sheherenow_",
        xPostText: "Cooking inspiration",
      });
      expect("id" in (board?.board.items[0] ?? {})).toBe(false);
      expect("revision" in (board ?? {})).toBe(false);
      expect("boardId" in (board ?? {})).toBe(false);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("keeps duplicates private and revokes reads on unpublish", () =>
    Effect.gen(function* () {
      const { boards, publishing } = yield* prepare;
      yield* publishing.configureProfile({ handle: "studio", displayName: "Studio", bio: "" });
      const publicId = yield* publishing.publish(boardId);
      yield* boards.duplicate(boardId, duplicateId, "Private copy");

      const profileBefore = yield* publishing.getProfile("studio");
      expect(profileBefore?.boards).toHaveLength(1);
      expect(yield* publishing.unpublish(duplicateId)).toBe(false);
      expect(yield* publishing.unpublish(boardId)).toBe(true);
      expect(yield* publishing.getBoard(publicId)).toBeNull();
      expect((yield* publishing.getProfile("studio"))?.boards).toEqual([]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("cascades publication deletion with the authoritative board", () =>
    Effect.gen(function* () {
      const { boards, publishing } = yield* prepare;
      yield* publishing.configureProfile({ handle: "studio", displayName: "Studio", bio: "" });
      const publicId = yield* publishing.publish(boardId);
      yield* boards.delete(boardId);

      expect(yield* publishing.getBoard(publicId)).toBeNull();
      expect((yield* publishing.getProfile("studio"))?.boards).toEqual([]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("rejects invalid profile fields and publishing without a profile", () =>
    Effect.gen(function* () {
      const { publishing } = yield* prepare;
      const invalid = yield* publishing
        .configureProfile({
          handle: "../owner",
          displayName: "Owner",
          bio: "",
        })
        .pipe(Effect.exit);
      const missingProfile = yield* publishing.publish(boardId).pipe(Effect.exit);

      expect(Exit.isFailure(invalid)).toBe(true);
      expect(Exit.isFailure(missingProfile)).toBe(true);
    }).pipe(Effect.provide(TestLayer)),
  );
});
