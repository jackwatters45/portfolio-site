import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node";
import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer, Option, Schema, Stream } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import {
  BoardIdSchema,
  BoardMutationPayloadSchema,
  ClientIdSchema,
  DEFAULT_BOARD_ID,
  ItemIdSchema,
  MutationIdSchema,
  type BoardChange,
  type BoardDeleted,
  type BoardSnapshot,
} from "../../src/lib/board-rpc";
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

const DatabaseTest = SqliteMigrator.layer({ loader: migrationLoader }).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })),
);

const TestLayer = BoardService.layer.pipe(Layer.provide(DatabaseTest));
const TestLayerWithSql = BoardService.layer.pipe(Layer.provideMerge(DatabaseTest));

const boardA = BoardIdSchema.make("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const boardB = BoardIdSchema.make("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");

const note = {
  id: ItemIdSchema.make("note-1"),
  kind: "note" as const,
  x: 10,
  y: 20,
  width: 300,
  height: 200,
  rotation: 0,
  order: 1,
  text: "hello",
};

const audioItems = [
  {
    id: ItemIdSchema.make("spotify-1"),
    kind: "spotify" as const,
    x: 0,
    y: 0,
    width: 520,
    height: 300,
    rotation: 0,
    order: 1,
    src: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    label: "Studio rotation",
  },
  {
    id: ItemIdSchema.make("youtube-1"),
    kind: "youtube" as const,
    x: 560,
    y: 0,
    width: 520,
    height: 400,
    rotation: 0,
    order: 2,
    src: "https://www.youtube.com/watch?v=ryig6M3rZYU",
    label: "Reference film",
  },
  {
    id: ItemIdSchema.make("audio-1"),
    kind: "audio" as const,
    x: 1120,
    y: 0,
    width: 520,
    height: 220,
    rotation: 0,
    order: 3,
    src: "https://media.example/field-recording.mp3",
    label: "Field recording",
  },
];

const websiteItem = {
  id: ItemIdSchema.make("website-1"),
  kind: "website" as const,
  x: 0,
  y: 0,
  width: 540,
  height: 360,
  rotation: 0,
  order: 1,
  websiteUrl: WebsiteUrlSchema.make("https://example.com/story"),
  websiteImageUrl: WebsiteImageUrlSchema.make("https://cdn.example.com/story.jpg"),
  websiteTitle: WebsiteTitleSchema.make("A collected room"),
  websiteDescription: WebsiteDescriptionSchema.make("Light, stone, and quiet objects."),
  websiteSiteLabel: WebsiteSiteLabelSchema.make("example.com"),
};

const xItem = {
  id: ItemIdSchema.make("x-1"),
  kind: "x" as const,
  x: 0,
  y: 0,
  width: 550,
  height: 620,
  rotation: 0,
  order: 1,
  src: "https://x.com/sheherenow_/status/2082226100764369045",
  xDisplay: "post" as const,
  xTheme: "automatic" as const,
  xHideThread: true,
  xAuthorName: XAuthorNameSchema.make("Jem"),
  xAuthorHandle: XAuthorHandleSchema.make("sheherenow_"),
  xPostText: XPostTextSchema.make("Cooking inspiration"),
  xPostDate: XPostDateSchema.make("2026-07-28"),
};

const linkedImage = {
  id: ItemIdSchema.make("image-1"),
  kind: "image" as const,
  x: 10,
  y: 20,
  width: 300,
  height: 200,
  rotation: 0,
  order: 1,
  src: "https://images.example/chair.jpg",
  href: "https://shop.example/chair",
};

describe("BoardService", () => {
  it.effect("persists changes and makes retries idempotent", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(DEFAULT_BOARD_ID, "Test");

      const input = {
        boardId: DEFAULT_BOARD_ID,
        clientId: ClientIdSchema.make("client-1"),
        mutationId: MutationIdSchema.make("mutation-1"),
        upserts: [note],
        deletes: [],
      };
      const first = yield* service.commit(input);
      const retry = yield* service.commit(input);
      const snapshot = yield* service.get(DEFAULT_BOARD_ID);

      expect(first.revision).toBe(1);
      expect(retry).toEqual(first);
      expect(snapshot?.revision).toBe(1);
      expect(snapshot?.board.items).toEqual([note]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("normalizes legacy stored item metadata before canonical decoding", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      const sql = yield* SqlClient.SqlClient;
      yield* service.create(boardA, "Legacy metadata");
      yield* sql`
        INSERT INTO items (
          board_id, id, kind, x, y, width, height, rotation, order_index,
          src, text, color, label, website_title
        ) VALUES
          (${boardA}, 'legacy-note', 'note', 0, 0, 300, 200, 0, 1,
            'https://invalid.example/note.png', NULL, '#ffffff', 'Drop me', 'Drop me'),
          (${boardA}, 'legacy-swatch', 'swatch', 320, 0, 300, 300, 0, 2,
            'https://invalid.example/swatch.png', 'Drop me', NULL, 'Palette', 'Drop me'),
          (${boardA}, 'legacy-image', 'image', 640, 0, 300, 200, 0, 3,
            'https://images.example/chair.jpg', 'Drop me', '#ffffff', 'Drop me', 'Drop me')
      `;

      expect((yield* service.get(boardA))?.board.items).toEqual([
        {
          id: ItemIdSchema.make("legacy-note"),
          kind: "note",
          x: 0,
          y: 0,
          width: 300,
          height: 200,
          rotation: 0,
          order: 1,
          text: "",
        },
        {
          id: ItemIdSchema.make("legacy-swatch"),
          kind: "swatch",
          x: 320,
          y: 0,
          width: 300,
          height: 300,
          rotation: 0,
          order: 2,
          color: "#000000",
          label: "Palette",
        },
        {
          id: ItemIdSchema.make("legacy-image"),
          kind: "image",
          x: 640,
          y: 0,
          width: 300,
          height: 200,
          rotation: 0,
          order: 3,
          src: "https://images.example/chair.jpg",
        },
      ]);
    }).pipe(Effect.provide(TestLayerWithSql)),
  );

  it.effect("persists, duplicates, and removes image links", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(boardA, "Shopping");
      const linked = yield* service.commit({
        boardId: boardA,
        clientId: ClientIdSchema.make("link-client"),
        mutationId: MutationIdSchema.make("link-add"),
        upserts: [{ ...linkedImage, href: "HTTP://SHOP.EXAMPLE/chair" }],
        deletes: [],
      });
      expect(linked.upserts[0]?.href).toBe("http://shop.example/chair");
      expect((yield* service.get(boardA))?.board.items[0]?.href).toBe("http://shop.example/chair");

      yield* service.duplicate(boardA, boardB, "Shopping copy");
      expect((yield* service.get(boardB))?.board.items[0]?.href).toBe("http://shop.example/chair");

      const unlinked = {
        id: linkedImage.id,
        kind: linkedImage.kind,
        x: linkedImage.x,
        y: linkedImage.y,
        width: linkedImage.width,
        height: linkedImage.height,
        rotation: linkedImage.rotation,
        order: linkedImage.order,
        src: linkedImage.src,
      };
      yield* service.commit({
        boardId: boardA,
        clientId: ClientIdSchema.make("link-client"),
        mutationId: MutationIdSchema.make("link-remove"),
        upserts: [unlinked],
        deletes: [],
      });
      expect((yield* service.get(boardA))?.board.items[0]?.href).toBeUndefined();
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("rejects invalid image links in direct service calls", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(boardA, "Shopping");
      const invalid = yield* service
        .commit({
          boardId: boardA,
          clientId: ClientIdSchema.make("link-client"),
          mutationId: MutationIdSchema.make("invalid-link"),
          upserts: [{ ...linkedImage, href: "javascript:alert(1)" }],
          deletes: [],
        })
        .pipe(Effect.flip);
      expect(invalid.code).toBe("Invalid");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("persists and duplicates Spotify, YouTube, and hosted audio cards", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(boardA, "Sound study");
      const change = yield* service.commit({
        boardId: boardA,
        clientId: ClientIdSchema.make("audio-client"),
        mutationId: MutationIdSchema.make("audio-add"),
        upserts: audioItems,
        deletes: [],
      });
      expect(change.upserts).toEqual(audioItems);
      expect((yield* service.get(boardA))?.board.items).toEqual(audioItems);
      yield* service.duplicate(boardA, boardB, "Sound study copy");
      expect((yield* service.get(boardB))?.board.items).toEqual(audioItems);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("canonicalizes YouTube sources in direct service calls", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(boardA, "Film study");
      const change = yield* service.commit({
        boardId: boardA,
        clientId: ClientIdSchema.make("youtube-client"),
        mutationId: MutationIdSchema.make("youtube-normalize"),
        upserts: [
          {
            ...audioItems[1],
            src: "https://youtu.be/ryig6M3rZYU?si=tracking",
          },
        ],
        deletes: [],
      });
      expect(change.upserts[0]?.src).toBe("https://www.youtube.com/watch?v=ryig6M3rZYU");
      expect((yield* service.get(boardA))?.board.items[0]?.src).toBe(
        "https://www.youtube.com/watch?v=ryig6M3rZYU",
      );
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("rejects unsafe audio sources in direct service calls", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(boardA, "Sound study");
      const error = yield* service
        .commit({
          boardId: boardA,
          clientId: ClientIdSchema.make("audio-client"),
          mutationId: MutationIdSchema.make("audio-invalid"),
          upserts: [{ ...audioItems[2], src: "data:audio/mpeg;base64,AAAA" }],
          deletes: [],
        })
        .pipe(Effect.flip);
      expect(error.code).toBe("Invalid");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("persists, duplicates, and validates website cards", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(boardA, "Reading list");
      const change = yield* service.commit({
        boardId: boardA,
        clientId: ClientIdSchema.make("website-client"),
        mutationId: MutationIdSchema.make("website-add"),
        upserts: [websiteItem],
        deletes: [],
      });
      expect(change.upserts).toEqual([websiteItem]);
      expect((yield* service.get(boardA))?.board.items).toEqual([websiteItem]);
      yield* service.duplicate(boardA, boardB, "Reading list copy");
      expect((yield* service.get(boardB))?.board.items).toEqual([websiteItem]);

      const invalid = Schema.decodeUnknownOption(BoardMutationPayloadSchema)({
        upserts: [{ ...websiteItem, websiteUrl: "https://127.0.0.1/admin" }],
        deletes: [],
      });
      expect(Option.isNone(invalid)).toBe(true);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("persists and duplicates X cards with safe snapshots", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(boardA, "X references");
      yield* service.commit({
        boardId: boardA,
        clientId: ClientIdSchema.make("x-client"),
        mutationId: MutationIdSchema.make("x-add"),
        upserts: [xItem],
        deletes: [],
      });
      expect((yield* service.get(boardA))?.board.items).toEqual([xItem]);
      yield* service.duplicate(boardA, boardB, "X references copy");
      expect((yield* service.get(boardB))?.board.items).toEqual([xItem]);

      const normalized = yield* service.commit({
        boardId: boardA,
        clientId: ClientIdSchema.make("x-client"),
        mutationId: MutationIdSchema.make("x-normalize"),
        upserts: [{ ...xItem, src: "https://twitter.com/sheherenow_/status/2082226100764369045" }],
        deletes: [],
      });
      expect(normalized.upserts[0]?.src).toBe(xItem.src);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("persists, duplicates, and resets board backgrounds", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(boardA, "Dark field");
      const input = {
        boardId: boardA,
        clientId: ClientIdSchema.make("background-client"),
        mutationId: MutationIdSchema.make("background-set"),
        background: "#dde3dc",
        upserts: [],
        deletes: [],
      } as const;

      const change = yield* service.commit(input);
      expect(yield* service.commit(input)).toEqual(change);
      expect(change.background).toBe("#DDE3DC");
      expect((yield* service.get(boardA))?.board.background).toBe("#DDE3DC");

      yield* service.commit({
        boardId: boardA,
        clientId: ClientIdSchema.make("background-client"),
        mutationId: MutationIdSchema.make("background-title"),
        title: "Renamed field",
        upserts: [],
        deletes: [],
      });
      expect((yield* service.get(boardA))?.board.background).toBe("#DDE3DC");

      yield* service.duplicate(boardA, boardB, "Dark field copy");
      expect((yield* service.get(boardB))?.board.background).toBe("#DDE3DC");

      const reset = yield* service.commit({
        boardId: boardA,
        clientId: ClientIdSchema.make("background-client"),
        mutationId: MutationIdSchema.make("background-reset"),
        background: null,
        upserts: [],
        deletes: [],
      });
      expect(reset.background).toBeNull();
      expect((yield* service.get(boardA))?.board.background).toBeUndefined();
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("distinguishes an omitted background from an explicit reset", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(DEFAULT_BOARD_ID, "Home");
      yield* service.commit({
        boardId: DEFAULT_BOARD_ID,
        clientId: ClientIdSchema.make("background-client"),
        mutationId: MutationIdSchema.make("background-hash"),
        upserts: [],
        deletes: [],
      });
      const error = yield* service
        .commit({
          boardId: DEFAULT_BOARD_ID,
          clientId: ClientIdSchema.make("background-client"),
          mutationId: MutationIdSchema.make("background-hash"),
          background: null,
          upserts: [],
          deletes: [],
        })
        .pipe(Effect.flip);
      expect(error.code).toBe("Conflict");

      yield* service.commit({
        boardId: DEFAULT_BOARD_ID,
        clientId: ClientIdSchema.make("background-client"),
        mutationId: MutationIdSchema.make("background-media-hash"),
        backgroundMediaId: null,
        upserts: [],
        deletes: [],
      });
      const mediaError = yield* service
        .commit({
          boardId: DEFAULT_BOARD_ID,
          clientId: ClientIdSchema.make("background-client"),
          mutationId: MutationIdSchema.make("background-media-hash"),
          backgroundMediaId: MediaIdSchema.make("0123456789abcdef0123456789abcdef"),
          upserts: [],
          deletes: [],
        })
        .pipe(Effect.flip);
      expect(mediaError.code).toBe("Conflict");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("lists, duplicates, and isolates boards", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(boardA, "Trip ideas");
      yield* service.commit({
        boardId: boardA,
        clientId: ClientIdSchema.make("client-a"),
        mutationId: MutationIdSchema.make("mutation-a"),
        upserts: [note],
        deletes: [],
      });

      const duplicate = yield* service.duplicate(boardA, boardB, "Trip ideas — copy");
      const retry = yield* service.duplicate(boardA, boardB, "Trip ideas — copy");
      const list = yield* service.list();
      const duplicateSnapshot = yield* service.get(boardB);

      expect(duplicate).toEqual(retry);
      expect(new Set(list.map((entry) => entry.id))).toEqual(new Set([boardA, boardB]));
      expect(duplicate.itemCount).toBe(1);
      expect(duplicateSnapshot?.revision).toBe(0);
      expect(duplicateSnapshot?.board.items).toEqual([note]);

      yield* service.commit({
        boardId: boardA,
        clientId: ClientIdSchema.make("client-a"),
        mutationId: MutationIdSchema.make("mutation-a-2"),
        upserts: [{ ...note, text: "changed source" }],
        deletes: [],
      });
      expect((yield* service.get(boardB))?.board.items[0]?.text).toBe("hello");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("rejects reuse of a mutation id with different content", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(DEFAULT_BOARD_ID, "Test");
      yield* service.commit({
        boardId: DEFAULT_BOARD_ID,
        clientId: ClientIdSchema.make("client-1"),
        mutationId: MutationIdSchema.make("mutation-reused"),
        upserts: [note],
        deletes: [],
      });

      const error = yield* service
        .commit({
          boardId: DEFAULT_BOARD_ID,
          clientId: ClientIdSchema.make("client-1"),
          mutationId: MutationIdSchema.make("mutation-reused"),
          title: "Different request",
          upserts: [],
          deletes: [],
        })
        .pipe(Effect.flip);

      expect(error.code).toBe("Conflict");
      expect(error.message).toContain("already used");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("rejects overlapping upserts and deletes without changing the snapshot", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(DEFAULT_BOARD_ID, "Test");

      const error = yield* service
        .commit({
          boardId: DEFAULT_BOARD_ID,
          clientId: ClientIdSchema.make("client-overlap"),
          mutationId: MutationIdSchema.make("mutation-overlap"),
          upserts: [note],
          deletes: [note.id],
        })
        .pipe(Effect.flip);

      expect(error.code).toBe("Invalid");
      const snapshot = yield* service.get(DEFAULT_BOARD_ID);
      expect(snapshot?.revision).toBe(0);
      expect(snapshot?.board.items).toEqual([]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("rejects a mutation that would exceed the board item limit", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(DEFAULT_BOARD_ID, "Test");

      const error = yield* service
        .commit({
          boardId: DEFAULT_BOARD_ID,
          clientId: ClientIdSchema.make("client-limit"),
          mutationId: MutationIdSchema.make("mutation-limit"),
          upserts: Array.from({ length: 501 }, (_, index) => ({
            ...note,
            id: ItemIdSchema.make(`note-${index}`),
            order: index,
          })),
          deletes: [],
        })
        .pipe(Effect.flip);

      expect(error.code).toBe("Limit");
      const snapshot = yield* service.get(DEFAULT_BOARD_ID);
      expect(snapshot?.board.items).toEqual([]);
      expect(snapshot?.revision).toBe(0);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("rejects a board that exceeds the aggregate payload budget", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(DEFAULT_BOARD_ID, "Test");
      const imageSource = `data:image/png;base64,${"a".repeat(11 * 1024 * 1024)}`;

      const error = yield* service
        .commit({
          boardId: DEFAULT_BOARD_ID,
          clientId: ClientIdSchema.make("client-size"),
          mutationId: MutationIdSchema.make("mutation-size"),
          upserts: Array.from({ length: 3 }, (_, index) => ({
            id: ItemIdSchema.make(`image-${index}`),
            kind: "image" as const,
            x: index * 100,
            y: 0,
            width: 300,
            height: 200,
            rotation: 0,
            order: index,
            src: imageSource,
          })),
          deletes: [],
        })
        .pipe(Effect.flip);

      expect(error.code).toBe("Limit");
      expect((yield* service.get(DEFAULT_BOARD_ID))?.revision).toBe(0);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("streams an initial snapshot followed by committed changes", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(DEFAULT_BOARD_ID, "Test");

      const snapshotSeen = yield* Deferred.make<BoardSnapshot>();
      const changeSeen = yield* Deferred.make<BoardChange>();
      const fiber = yield* service.subscribe(DEFAULT_BOARD_ID).pipe(
        Stream.runForEach((event) => {
          if (event._tag === "Snapshot") {
            return Deferred.succeed(snapshotSeen, event).pipe(Effect.asVoid);
          }
          if (event._tag === "Change") {
            return Deferred.succeed(changeSeen, event).pipe(Effect.asVoid);
          }
          return Effect.void;
        }),
        Effect.forkChild,
      );

      expect((yield* Deferred.await(snapshotSeen)).revision).toBe(0);
      yield* service.commit({
        boardId: DEFAULT_BOARD_ID,
        clientId: ClientIdSchema.make("client-2"),
        mutationId: MutationIdSchema.make("mutation-2"),
        upserts: [note],
        deletes: [],
      });

      const change = yield* Deferred.await(changeSeen);
      expect(change.revision).toBe(1);
      expect(change.upserts).toEqual([note]);
      yield* Fiber.interrupt(fiber);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("isolates realtime events by board", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(boardA, "Board A");
      yield* service.create(boardB, "Board B");
      const snapshotSeen = yield* Deferred.make<void>();
      const changeSeen = yield* Deferred.make<BoardChange>();
      const fiber = yield* service.subscribe(boardA).pipe(
        Stream.runForEach((event) =>
          event._tag === "Snapshot"
            ? Deferred.succeed(snapshotSeen, undefined).pipe(Effect.asVoid)
            : event._tag === "Change"
              ? Deferred.succeed(changeSeen, event).pipe(Effect.asVoid)
              : Effect.void,
        ),
        Effect.forkChild,
      );
      yield* Deferred.await(snapshotSeen);

      yield* service.commit({
        boardId: boardB,
        clientId: ClientIdSchema.make("client-b"),
        mutationId: MutationIdSchema.make("mutation-b"),
        upserts: [note],
        deletes: [],
      });
      yield* Effect.yieldNow;
      expect(yield* Deferred.isDone(changeSeen)).toBe(false);

      yield* service.commit({
        boardId: boardA,
        clientId: ClientIdSchema.make("client-a-isolation"),
        mutationId: MutationIdSchema.make("mutation-a-isolation"),
        upserts: [note],
        deletes: [],
      });
      yield* Effect.yieldNow;
      const changeDone = yield* Deferred.isDone(changeSeen);
      const change = changeDone ? yield* Deferred.await(changeSeen) : undefined;
      yield* Fiber.interrupt(fiber);
      expect(changeDone).toBe(true);
      expect(change?.boardId).toBe(boardA);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("publishes deletion to active subscribers and preserves another board", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(DEFAULT_BOARD_ID, "Home");
      yield* service.create(boardA, "Temporary");
      const snapshotSeen = yield* Deferred.make<void>();
      const deletedSeen = yield* Deferred.make<BoardDeleted>();
      const fiber = yield* service.subscribe(boardA).pipe(
        Stream.runForEach((event) =>
          event._tag === "Snapshot"
            ? Deferred.succeed(snapshotSeen, undefined).pipe(Effect.asVoid)
            : event._tag === "Deleted"
              ? Deferred.succeed(deletedSeen, event).pipe(Effect.asVoid)
              : Effect.void,
        ),
        Effect.forkChild,
      );
      yield* Deferred.await(snapshotSeen);

      const deleted = yield* service.delete(boardA);
      expect(yield* Deferred.await(deletedSeen)).toEqual(deleted);
      expect(yield* service.exists(boardA)).toBe(false);
      expect(yield* service.exists(DEFAULT_BOARD_ID)).toBe(true);
      expect((yield* service.list()).map((entry) => entry.id)).toEqual([DEFAULT_BOARD_ID]);
      yield* Fiber.interrupt(fiber);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("reserves catalog capacity for the default board", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      for (let index = 0; index < 99; index += 1) {
        yield* service.create(BoardIdSchema.make(crypto.randomUUID()), `Board ${index}`);
      }

      const error = yield* service
        .create(BoardIdSchema.make(crypto.randomUUID()), "One too many")
        .pipe(Effect.flip);
      expect(error.code).toBe("Limit");

      yield* service.create(DEFAULT_BOARD_ID, "Home");
      expect(yield* service.exists(DEFAULT_BOARD_ID)).toBe(true);
      expect((yield* service.list()).length).toBe(100);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("makes deletion retries stable and prevents id reuse", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(DEFAULT_BOARD_ID, "Home");
      yield* service.create(boardA, "Temporary");
      yield* service.commit({
        boardId: boardA,
        clientId: ClientIdSchema.make("lifecycle-client"),
        mutationId: MutationIdSchema.make("lifecycle-mutation"),
        upserts: [note],
        deletes: [],
      });

      const deleted = yield* service.delete(boardA);
      const retry = yield* service.delete(boardA);
      expect(retry).toEqual(deleted);
      expect(deleted.revision).toBe(2);

      const error = yield* service.create(boardA, "Reused").pipe(Effect.flip);
      expect(error.code).toBe("Conflict");

      const missingDelete = yield* service.delete(boardB);
      expect(yield* service.delete(boardB)).toEqual(missingDelete);
      const missingReuse = yield* service.create(boardB, "Reused missing id").pipe(Effect.flip);
      expect(missingReuse.code).toBe("Conflict");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("does not delete the default board", () =>
    Effect.gen(function* () {
      const service = yield* BoardService;
      yield* service.create(DEFAULT_BOARD_ID, "Home");
      const error = yield* service.delete(DEFAULT_BOARD_ID).pipe(Effect.flip);

      expect(error.code).toBe("Invalid");
      expect(yield* service.exists(DEFAULT_BOARD_ID)).toBe(true);
    }).pipe(Effect.provide(TestLayer)),
  );
});
