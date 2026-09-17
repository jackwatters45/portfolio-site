import { Effect, Exit, Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  normalizeProfileHandle,
  PublicBoardSchema,
  PublicIdSchema,
  PublicProfileSchema,
} from "../../src/lib/public-api";

const publicId = "0123456789abcdef0123456789abcdef";

const owner = {
  handle: "studio-notes",
  displayName: "Studio Notes",
  bio: "Materials, rooms, and sounds.",
};

const board = {
  publicId,
  owner,
  board: {
    version: 1,
    title: "Quiet rooms",
    background: "#EDEDED",
    backgroundMediaId: "0123456789abcdef0123456789abcdef",
    items: [
      {
        kind: "image",
        x: 0,
        y: 0,
        width: 320,
        height: 240,
        rotation: 0,
        order: 1,
        src: "https://images.example/room.jpg",
        href: "https://source.example/room",
        annotationTitle: "Waxed field jacket",
        annotationDescription: "Weathered cotton with a corduroy collar.",
      },
      {
        kind: "website",
        x: 360,
        y: 0,
        width: 540,
        height: 360,
        rotation: 0,
        order: 2,
        websiteUrl: "https://example.com/story",
        websiteImageUrl: "https://cdn.example.com/story.jpg",
        websiteTitle: "A collected room",
        websiteDescription: "Light, stone, and quiet objects.",
        websiteSiteLabel: "example.com",
      },
      {
        kind: "youtube",
        x: 0,
        y: 300,
        width: 520,
        height: 400,
        rotation: 0,
        order: 3,
        src: "https://www.youtube.com/watch?v=ryig6M3rZYU",
        label: "Reference film",
      },
      {
        kind: "audio",
        x: 560,
        y: 300,
        width: 520,
        height: 220,
        rotation: 0,
        order: 4,
        mediaId: "fedcba9876543210fedcba9876543210",
        label: "Room tone",
      },
      {
        kind: "x",
        x: 0,
        y: 560,
        width: 550,
        height: 620,
        rotation: 0,
        order: 5,
        src: "https://x.com/sheherenow_/status/2082226100764369045",
        xDisplay: "post",
        xTheme: "automatic",
        xHideThread: true,
        xAuthorName: "Jem",
        xAuthorHandle: "sheherenow_",
        xPostText: "Cooking inspiration",
        xPostDate: "2026-07-28",
      },
    ],
    updatedAt: 10,
  },
  publishedAt: 11,
};

describe("public API contracts", () => {
  it("accepts opaque 128-bit public ids and normalized handles", () => {
    expect(Effect.runSync(Schema.decodeUnknownEffect(PublicIdSchema)(publicId))).toBe(publicId);
    expect(normalizeProfileHandle(" Studio-Notes ")).toBe("studio-notes");
  });

  it("decodes read-only board and profile DTOs without owner board ids", () => {
    const decodedBoard = Effect.runSync(
      Schema.decodeUnknownEffect(PublicBoardSchema)({
        ...board,
        boardId: "default",
        revision: 99,
        clientId: "private-client",
      }),
    );
    const decodedProfile = Effect.runSync(
      Schema.decodeUnknownEffect(PublicProfileSchema)({
        owner,
        boards: [
          {
            publicId,
            title: "Quiet rooms",
            itemCount: 1,
            updatedAt: 10,
            publishedAt: 11,
            backgroundMediaId: "0123456789abcdef0123456789abcdef",
          },
        ],
      }),
    );

    expect("boardId" in decodedBoard).toBe(false);
    expect("revision" in decodedBoard).toBe(false);
    expect("clientId" in decodedBoard).toBe(false);
    expect(decodedProfile.boards[0]).toMatchObject({
      publicId,
      backgroundMediaId: "0123456789abcdef0123456789abcdef",
    });
    expect(decodedBoard.board.backgroundMediaId).toBe("0123456789abcdef0123456789abcdef");
    expect(decodedBoard.board.items[0]).toMatchObject({
      annotationTitle: "Waxed field jacket",
      annotationDescription: "Weathered cotton with a corduroy collar.",
    });
    expect(decodedBoard.board.items[1]).toMatchObject({
      kind: "website",
      websiteTitle: "A collected room",
    });
    expect(decodedBoard.board.items[2]).toMatchObject({
      kind: "youtube",
      src: "https://www.youtube.com/watch?v=ryig6M3rZYU",
    });
    expect(decodedBoard.board.items[4]).toMatchObject({
      kind: "x",
      xAuthorHandle: "sheherenow_",
      xPostText: "Cooking inspiration",
    });
    expect(decodedBoard.board.items[3]).toMatchObject({
      kind: "audio",
      mediaId: "fedcba9876543210fedcba9876543210",
    });
  });

  it("rejects board ids, unsafe links, malformed handles, and malformed public ids", () => {
    const invalidId = Effect.runSyncExit(Schema.decodeUnknownEffect(PublicIdSchema)("default"));
    const invalidHandle = normalizeProfileHandle("../owner");
    const unsafeBoard = Effect.runSyncExit(
      Schema.decodeUnknownEffect(PublicBoardSchema)({
        ...board,
        board: {
          ...board.board,
          items: [{ ...board.board.items[0], href: "javascript:alert(1)" }],
        },
      }),
    );

    expect(Exit.isFailure(invalidId)).toBe(true);
    expect(invalidHandle).toBeNull();
    const privateWebsite = Effect.runSyncExit(
      Schema.decodeUnknownEffect(PublicBoardSchema)({
        ...board,
        board: {
          ...board.board,
          items: [{ ...board.board.items[1], websiteUrl: "https://127.0.0.1/admin" }],
        },
      }),
    );

    expect(Exit.isFailure(unsafeBoard)).toBe(true);
    expect(Exit.isFailure(privateWebsite)).toBe(true);
  });
});
