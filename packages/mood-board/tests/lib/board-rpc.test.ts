import { Effect, Exit, Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  BoardChangeSchema,
  BoardIdSchema,
  BoardItemSchema,
  BoardSchema,
} from "../../src/lib/board-rpc";

const validItem = {
  id: "note-1",
  kind: "note" as const,
  x: 0,
  y: 0,
  width: 300,
  height: 200,
  rotation: 0,
  order: 1,
  text: "hello",
};

const decodeItem = Schema.decodeUnknownEffect(BoardItemSchema);

describe("board RPC schemas", () => {
  it("accepts default and UUID board ids", () => {
    const decode = Schema.decodeUnknownEffect(BoardIdSchema);
    expect(Effect.runSync(decode("default"))).toBe("default");
    expect(Effect.runSync(decode("123e4567-e89b-42d3-a456-426614174000"))).toBe(
      "123e4567-e89b-42d3-a456-426614174000",
    );
  });

  it("rejects unsafe board ids", () => {
    const exit = Effect.runSyncExit(Schema.decodeUnknownEffect(BoardIdSchema)("../default"));
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("accepts a valid board item", () => {
    expect(Effect.runSync(decodeItem(validItem))).toEqual(validItem);
  });

  it("requires note text and swatch color", () => {
    expect(Exit.isFailure(Effect.runSyncExit(decodeItem({ ...validItem, text: undefined })))).toBe(
      true,
    );
    expect(
      Exit.isFailure(
        Effect.runSyncExit(
          decodeItem({
            ...validItem,
            id: "swatch-incomplete",
            kind: "swatch",
            text: undefined,
          }),
        ),
      ),
    ).toBe(true);
  });

  it("accepts custom six-digit hex colors and rejects invalid values", () => {
    const swatch = {
      id: "swatch-1",
      kind: "swatch" as const,
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      rotation: 0,
      order: 1,
      color: "#12ABEF",
      label: "Sea glass",
    };
    expect(Effect.runSync(decodeItem(swatch))).toEqual(swatch);
    expect(Exit.isFailure(Effect.runSyncExit(decodeItem({ ...swatch, color: "#12ABEZ" })))).toBe(
      true,
    );
  });

  it("allows normalized links only on image items", () => {
    const image = {
      ...validItem,
      id: "image-1",
      kind: "image" as const,
      src: "https://images.example/chair.jpg",
      text: undefined,
      href: "https://shop.example/chair",
      annotationTitle: "Waxed field jacket",
      annotationDescription: "Weathered cotton with a corduroy collar.",
    };
    expect(Effect.runSync(decodeItem(image))).toMatchObject({
      href: "https://shop.example/chair",
      annotationTitle: "Waxed field jacket",
      annotationDescription: "Weathered cotton with a corduroy collar.",
    });
    expect(
      Exit.isFailure(Effect.runSyncExit(decodeItem({ ...image, href: "https://shop.example" }))),
    ).toBe(true);
    expect(
      Exit.isFailure(Effect.runSyncExit(decodeItem({ ...image, href: "javascript:alert(1)" }))),
    ).toBe(true);
    expect(
      Exit.isFailure(
        Effect.runSyncExit(decodeItem({ ...validItem, href: "https://shop.example/chair" })),
      ),
    ).toBe(true);
    expect(
      Exit.isFailure(
        Effect.runSyncExit(decodeItem({ ...validItem, annotationTitle: "Smuggled details" })),
      ),
    ).toBe(true);
    expect(
      Exit.isFailure(
        Effect.runSyncExit(decodeItem({ ...image, annotationTitle: "  Padded title  " })),
      ),
    ).toBe(true);
  });

  it("validates canonical Spotify and hosted audio item sources", () => {
    const spotify = {
      ...validItem,
      id: "spotify-1",
      kind: "spotify" as const,
      width: 520,
      height: 300,
      text: undefined,
      src: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    };
    const youtube = {
      ...validItem,
      id: "youtube-1",
      kind: "youtube" as const,
      width: 520,
      height: 400,
      text: undefined,
      src: "https://www.youtube.com/watch?v=ryig6M3rZYU",
    };
    const audio = {
      ...validItem,
      id: "audio-1",
      kind: "audio" as const,
      width: 520,
      height: 220,
      text: undefined,
      src: "https://media.example/field-recording.mp3",
    };
    expect(Effect.runSync(decodeItem(spotify))).toEqual(spotify);
    expect(Effect.runSync(decodeItem(youtube))).toEqual(youtube);
    expect(Effect.runSync(decodeItem(audio))).toEqual(audio);
    for (const invalid of [
      { ...spotify, src: "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC" },
      { ...youtube, src: "https://youtu.be/ryig6M3rZYU" },
      { ...youtube, height: 179 },
      { ...youtube, mediaId: "0123456789abcdef0123456789abcdef" },
      { ...audio, src: "https://www.youtube.com/watch?v=ryig6M3rZYU" },
      { ...audio, src: "http://media.example/audio.mp3" },
      { ...audio, src: "data:audio/mpeg;base64,AAAA" },
      { ...audio, src: undefined },
      { ...spotify, height: 151 },
      { ...audio, height: 113 },
      { ...audio, width: 300 },
      { ...validItem, src: "data:audio/mpeg;base64,AAAA" },
      { ...validItem, kind: "swatch" as const, src: "blob:https://example.com/audio" },
      { ...validItem, kind: "image" as const, src: "data:audio/mpeg;base64,AAAA" },
    ])
      expect(Exit.isFailure(Effect.runSyncExit(decodeItem(invalid)))).toBe(true);
  });

  it("accepts managed image and audio ids with strict source exclusivity", () => {
    const mediaId = "0123456789abcdef0123456789abcdef";
    const image = {
      ...validItem,
      id: "managed-image",
      kind: "image" as const,
      text: undefined,
      mediaId,
    };
    const audio = {
      ...validItem,
      id: "managed-audio",
      kind: "audio" as const,
      width: 520,
      height: 220,
      text: undefined,
      mediaId,
    };
    expect(Effect.runSync(decodeItem(image))).toEqual(image);
    expect(Effect.runSync(decodeItem(audio))).toEqual(audio);
    for (const invalid of [
      { ...image, src: "https://images.example/image.jpg" },
      { ...image, mediaId: undefined },
      { ...audio, src: "https://media.example/audio.mp3" },
      { ...audio, mediaId: "ABCDEF0123456789ABCDEF0123456789" },
      { ...validItem, mediaId },
    ])
      expect(Exit.isFailure(Effect.runSyncExit(decodeItem(invalid)))).toBe(true);
  });

  it("validates complete website preview snapshots", () => {
    const website = {
      ...validItem,
      id: "website-1",
      kind: "website" as const,
      width: 540,
      height: 360,
      text: undefined,
      websiteUrl: "https://example.com/story",
      websiteImageUrl: "https://cdn.example.com/story.jpg",
      websiteTitle: "A collected room",
      websiteDescription: "Light, stone, and quiet objects.",
      websiteSiteLabel: "example.com",
    };
    expect(Effect.runSync(decodeItem(website))).toEqual(website);
    for (const invalid of [
      { ...website, websiteUrl: "http://example.com/story" },
      { ...website, websiteUrl: "https://127.0.0.1/story" },
      { ...website, websiteImageUrl: "data:image/png;base64,AAAA" },
      { ...website, websiteTitle: undefined },
      { ...website, width: 300 },
      { ...website, height: 279 },
      { ...website, href: "https://example.com/story" },
      { ...website, label: "Smuggled label" },
      { ...validItem, websiteTitle: "Smuggled metadata" },
    ])
      expect(Exit.isFailure(Effect.runSyncExit(decodeItem(invalid)))).toBe(true);
  });

  it("validates canonical X cards and bounded snapshots", () => {
    const x = {
      ...validItem,
      id: "x-1",
      kind: "x" as const,
      width: 550,
      height: 620,
      text: undefined,
      src: "https://x.com/sheherenow_/status/2082226100764369045",
      xDisplay: "post" as const,
      xTheme: "automatic" as const,
      xHideThread: true,
      xAuthorName: "Jem",
      xAuthorHandle: "sheherenow_",
      xPostText: "Cooking inspiration",
      xPostDate: "2026-07-28",
    };
    expect(Effect.runSync(decodeItem(x))).toEqual(x);
    for (const invalid of [
      { ...x, src: "https://twitter.com/sheherenow_/status/2082226100764369045" },
      { ...x, xDisplay: undefined },
      { ...x, xTheme: "sepia" },
      { ...x, xAuthorHandle: "bad handle" },
      { ...x, xPostText: "  padded snapshot  " },
      { ...x, xPostDate: "July 28, 2026" },
      { ...x, xPostDate: "2026-02-31" },
      { ...x, height: 239 },
      { ...validItem, xDisplay: "post" },
    ])
      expect(Exit.isFailure(Effect.runSyncExit(decodeItem(invalid)))).toBe(true);
  });

  it("rejects invalid geometry", () => {
    const exit = Effect.runSyncExit(decodeItem({ ...validItem, width: Number.POSITIVE_INFINITY }));
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("validates optional board backgrounds and explicit reset changes", () => {
    const decodeBoard = Schema.decodeUnknownEffect(BoardSchema);
    const base = {
      version: 1 as const,
      title: "Field study",
      items: [],
      updatedAt: 1,
    };
    expect(Effect.runSync(decodeBoard(base))).toEqual(base);
    expect(
      Effect.runSync(
        decodeBoard({
          ...base,
          background: "#242728",
          backgroundMediaId: "0123456789abcdef0123456789abcdef",
        }),
      ),
    ).toMatchObject({
      background: "#242728",
      backgroundMediaId: "0123456789abcdef0123456789abcdef",
    });
    expect(
      Exit.isFailure(Effect.runSyncExit(decodeBoard({ ...base, background: "charcoal" }))),
    ).toBe(true);
    expect(
      Exit.isFailure(Effect.runSyncExit(decodeBoard({ ...base, backgroundMediaId: "not-media" }))),
    ).toBe(true);

    const reset = Effect.runSync(
      Schema.decodeUnknownEffect(BoardChangeSchema)({
        _tag: "Change",
        boardId: "default",
        revision: 1,
        clientId: "client",
        mutationId: "mutation",
        background: null,
        backgroundMediaId: null,
        upserts: [],
        deletes: [],
        updatedAt: 2,
      }),
    );
    expect(reset.background).toBeNull();
    expect(reset.backgroundMediaId).toBeNull();
  });

  it("rejects boards with more than 500 items", () => {
    const exit = Effect.runSyncExit(
      Schema.decodeUnknownEffect(BoardSchema)({
        version: 1,
        title: "Too many",
        items: Array.from({ length: 501 }, (_, index) => ({
          ...validItem,
          id: `note-${index}`,
          order: index,
        })),
        updatedAt: 1,
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
