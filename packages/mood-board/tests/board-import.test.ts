import { describe, expect, it } from "vitest";

import { normalizeImportedBoard } from "../src/client/board/board-import";

const makeBoard = (color: unknown) => ({
  version: 1,
  title: "Palette",
  updatedAt: 1,
  items: [
    {
      id: "swatch-1",
      kind: "swatch",
      x: 0,
      y: 0,
      width: 300,
      height: 300,
      rotation: 0,
      order: 1,
      color,
    },
  ],
});

const imageBoard = (href: unknown) => ({
  version: 1,
  title: "Shopping",
  updatedAt: 1,
  items: [
    {
      id: "image-1",
      kind: "image",
      x: 0,
      y: 0,
      width: 300,
      height: 300,
      rotation: 0,
      order: 1,
      src: "https://images.example/chair.jpg",
      href,
    },
  ],
});

const websiteBoard = (websiteUrl: unknown) => ({
  version: 1,
  title: "Reading list",
  updatedAt: 1,
  items: [
    {
      id: "website-1",
      kind: "website",
      x: 0,
      y: 0,
      width: 540,
      height: 360,
      rotation: 0,
      order: 1,
      websiteUrl,
      websiteImageUrl: "https://cdn.example.com/story.jpg",
      websiteTitle: "A collected room",
      websiteDescription: "Light, stone, and quiet objects.",
      websiteSiteLabel: "example.com",
    },
  ],
});

const audioBoard = (kind: "spotify" | "youtube" | "audio", src: unknown) => ({
  version: 1,
  title: "Sound study",
  updatedAt: 1,
  items: [
    {
      id: `${kind}-1`,
      kind,
      x: 0,
      y: 0,
      width: 520,
      height: kind === "youtube" ? 400 : kind === "spotify" ? 300 : 220,
      rotation: 0,
      order: 1,
      src,
      label: "Night train",
    },
  ],
});

describe("X card import validation", () => {
  const xBoard = (src: unknown) => ({
    version: 1,
    title: "Cooking",
    updatedAt: 1,
    items: [
      {
        id: "x-1",
        kind: "x",
        x: 0,
        y: 0,
        width: 550,
        height: 620,
        rotation: 0,
        order: 1,
        src,
        xDisplay: "post",
        xTheme: "automatic",
        xHideThread: true,
        xAuthorName: "  Jem  ",
        xAuthorHandle: "sheherenow_",
        xPostText: "  Cooking   inspiration  ",
        xPostDate: "2026-07-28",
      },
    ],
  });

  it("canonicalizes legacy sources and sanitizes snapshot text", () => {
    const item = normalizeImportedBoard(
      xBoard("https://twitter.com/sheherenow_/status/2082226100764369045?ref=x"),
    ).board.items[0];
    expect(item).toMatchObject({
      kind: "x",
      src: "https://x.com/sheherenow_/status/2082226100764369045",
      xAuthorName: "Jem",
      xPostText: "Cooking inspiration",
    });
  });

  it("drops legacy generic text and labels from X cards", () => {
    const imported = normalizeImportedBoard({
      ...xBoard("https://x.com/sheherenow_/status/2082226100764369045"),
      items: [
        {
          ...xBoard("https://x.com/sheherenow_/status/2082226100764369045").items[0],
          text: "Legacy text",
          label: "Legacy label",
        },
      ],
    });
    expect(imported.board.items[0]?.text).toBeUndefined();
    expect(imported.board.items[0]?.label).toBeUndefined();
  });

  it("rejects invalid settings and metadata on other item kinds", () => {
    expect(() => normalizeImportedBoard(xBoard("https://example.com/status/123"))).toThrow();
    expect(() =>
      normalizeImportedBoard({
        ...makeBoard("#12ABEF"),
        items: [{ ...makeBoard("#12ABEF").items[0], xDisplay: "post" }],
      }),
    ).toThrow(/Only X cards/);
  });
});

describe("swatch import validation", () => {
  it("normalizes a lowercase six-digit color", () => {
    const imported = normalizeImportedBoard(makeBoard("#12abef"));
    expect(imported.board.items[0]?.color).toBe("#12ABEF");
  });

  it("keeps generic text and labels only on their owning item kinds", () => {
    const imported = normalizeImportedBoard({
      version: 1,
      title: "Legacy metadata",
      updatedAt: 1,
      items: [
        {
          ...imageBoard(undefined).items[0],
          text: "Legacy image text",
          label: "Legacy image label",
        },
        {
          ...makeBoard("#12ABEF").items[0],
          order: 2,
          text: "Legacy swatch text",
          label: "Palette",
        },
        {
          id: "note-1",
          kind: "note",
          x: 0,
          y: 0,
          width: 300,
          height: 200,
          rotation: 0,
          order: 3,
          text: "Keep this note",
          label: "Legacy note label",
        },
      ],
    });
    expect(imported.board.items[0]).toMatchObject({ kind: "image" });
    expect(imported.board.items[0]?.text).toBeUndefined();
    expect(imported.board.items[0]?.label).toBeUndefined();
    expect(imported.board.items[1]).toMatchObject({ kind: "swatch", label: "Palette" });
    expect(imported.board.items[1]?.text).toBeUndefined();
    expect(imported.board.items[2]).toMatchObject({ kind: "note", text: "Keep this note" });
    expect(imported.board.items[2]?.label).toBeUndefined();
  });

  it("normalizes an optional board background", () => {
    const imported = normalizeImportedBoard({
      ...makeBoard("#12ABEF"),
      background: "#dde3dc",
    });
    expect(imported.board.background).toBe("#DDE3DC");
    expect(normalizeImportedBoard(makeBoard("#12ABEF")).board.background).toBeUndefined();
  });

  it("rejects an invalid board background", () => {
    expect(() =>
      normalizeImportedBoard({
        ...makeBoard("#12ABEF"),
        background: "charcoal",
      }),
    ).toThrow("background must use six-digit #RRGGBB format");
  });

  it("normalizes image links and preserves older unlinked images", () => {
    expect(
      normalizeImportedBoard(imageBoard(" HTTP://SHOP.EXAMPLE/chair ")).board.items[0]?.href,
    ).toBe("http://shop.example/chair");
    const withoutLink = imageBoard(undefined);
    delete withoutLink.items[0]?.href;
    expect(normalizeImportedBoard(withoutLink).board.items[0]?.href).toBeUndefined();
  });

  it("normalizes image annotations and rejects them on other item kinds", () => {
    const imported = normalizeImportedBoard({
      ...imageBoard("https://shop.example/chair"),
      items: [
        {
          ...imageBoard("https://shop.example/chair").items[0],
          annotationTitle: "  Waxed field jacket  ",
          annotationDescription: "  Weathered cotton.  ",
        },
      ],
    });
    expect(imported.board.items[0]).toMatchObject({
      annotationTitle: "Waxed field jacket",
      annotationDescription: "Weathered cotton.",
    });
    expect(() =>
      normalizeImportedBoard({
        ...makeBoard("#12ABEF"),
        items: [{ ...makeBoard("#12ABEF").items[0], annotationTitle: "Smuggled" }],
      }),
    ).toThrow("Only image items may have annotations");
  });

  it("rejects unsafe links and links on non-image items", () => {
    expect(() => normalizeImportedBoard(imageBoard("javascript:alert(1)"))).toThrow(
      "invalid external link",
    );
    expect(() =>
      normalizeImportedBoard({
        ...makeBoard("#12ABEF"),
        items: [{ ...makeBoard("#12ABEF").items[0], href: "https://shop.example/chair" }],
      }),
    ).toThrow("Only image items may have an external link");
  });

  it("normalizes Spotify and hosted audio sources", () => {
    expect(
      normalizeImportedBoard(
        audioBoard("spotify", "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC?si=x"),
      ).board.items[0]?.src,
    ).toBe("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
    expect(
      normalizeImportedBoard(audioBoard("youtube", "https://youtu.be/ryig6M3rZYU?si=tracking"))
        .board.items[0]?.src,
    ).toBe("https://www.youtube.com/watch?v=ryig6M3rZYU");
    expect(
      normalizeImportedBoard(audioBoard("audio", "https://media.example/night-train.mp3")).board
        .items[0]?.kind,
    ).toBe("audio");
  });

  it("only accepts managed IDs through the portable archive path", () => {
    const managedImage = imageBoard(undefined);
    delete (managedImage.items[0] as { src?: string } | undefined)?.src;
    const value = {
      ...managedImage,
      items: [
        {
          ...managedImage.items[0],
          mediaId: "0123456789abcdef0123456789abcdef",
        },
      ],
    };
    expect(() => normalizeImportedBoard(value)).toThrow(/portable \.moodboard archive/i);
    expect(() =>
      normalizeImportedBoard({
        ...makeBoard("#12ABEF"),
        backgroundMediaId: "0123456789abcdef0123456789abcdef",
      }),
    ).toThrow(/managed background media.*portable \.moodboard archive/i);
    expect(
      normalizeImportedBoard(
        {
          ...value,
          backgroundMediaId: "0123456789abcdef0123456789abcdef",
        },
        { allowManagedMedia: true },
      ).board,
    ).toMatchObject({
      backgroundMediaId: "0123456789abcdef0123456789abcdef",
      items: [{ mediaId: "0123456789abcdef0123456789abcdef", src: undefined }],
    });
    expect(() =>
      normalizeImportedBoard(
        {
          ...value,
          items: [{ ...value.items[0], src: "https://images.example/chair.jpg" }],
        },
        { allowManagedMedia: true },
      ),
    ).toThrow(/exactly one source/i);
  });

  it("rejects browser-local and malformed audio sources", () => {
    expect(() =>
      normalizeImportedBoard(audioBoard("audio", "data:audio/mpeg;base64,AAAA")),
    ).toThrow("hosted HTTPS source");
    expect(() =>
      normalizeImportedBoard(audioBoard("audio", "blob:https://example.com/id")),
    ).toThrow("hosted HTTPS source");
    expect(() =>
      normalizeImportedBoard(audioBoard("spotify", "https://evil.example/track/id")),
    ).toThrow("invalid source");
    expect(() =>
      normalizeImportedBoard(audioBoard("youtube", "https://www.youtube.com/watch?v=too-short")),
    ).toThrow("invalid source");
  });

  it("preserves normalized website preview snapshots", () => {
    const item = normalizeImportedBoard(websiteBoard(" https://EXAMPLE.com/story#top ")).board
      .items[0];
    expect(item).toMatchObject({
      kind: "website",
      websiteUrl: "https://example.com/story",
      websiteTitle: "A collected room",
      websiteSiteLabel: "example.com",
    });
  });

  it("drops legacy generic text and labels from website cards", () => {
    const imported = normalizeImportedBoard({
      ...websiteBoard("https://example.com/story"),
      items: [
        {
          ...websiteBoard("https://example.com/story").items[0],
          text: "Legacy text",
          label: "Legacy label",
        },
      ],
    });
    expect(imported.board.items[0]?.text).toBeUndefined();
    expect(imported.board.items[0]?.label).toBeUndefined();
  });

  it("rejects incomplete, private, and cross-kind website metadata", () => {
    expect(() => normalizeImportedBoard(websiteBoard("https://127.0.0.1/admin"))).toThrow(
      "invalid preview snapshot",
    );
    expect(() =>
      normalizeImportedBoard({
        ...websiteBoard("https://example.com/story"),
        items: [{ ...websiteBoard("https://example.com/story").items[0], websiteTitle: undefined }],
      }),
    ).toThrow("invalid preview snapshot");
    expect(() =>
      normalizeImportedBoard({
        ...makeBoard("#12ABEF"),
        items: [{ ...makeBoard("#12ABEF").items[0], websiteTitle: "Smuggled" }],
      }),
    ).toThrow("Only website cards may contain website metadata");
  });

  it("rejects invalid or missing colors instead of substituting a preset", () => {
    expect(() => normalizeImportedBoard(makeBoard("#12ABEZ"))).toThrow(
      "must use six-digit #RRGGBB format",
    );
    expect(() => normalizeImportedBoard(makeBoard(undefined))).toThrow(
      "must use six-digit #RRGGBB format",
    );
  });
});
