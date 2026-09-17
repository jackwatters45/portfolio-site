import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  applyBoardChange,
  applyBoardMutation,
  diffBoards,
} from "../../src/client/board-sync-model";
import type { Board, BoardItem } from "../../src/client/board/types";
import {
  BoardChangeSchema,
  BoardItemSchema,
  BoardSchema,
  type BoardChange,
} from "../../src/lib/board-rpc";

const makeItem = (value: unknown): BoardItem => Schema.decodeUnknownSync(BoardItemSchema)(value);
const makeBoard = (value: unknown): Board => {
  const decoded = Schema.decodeUnknownSync(BoardSchema)(value);
  return { ...decoded, items: decoded.items.map((item) => ({ ...item })) };
};
const makeChange = (value: unknown): BoardChange =>
  Schema.decodeUnknownSync(BoardChangeSchema)(value);

const board = (overrides: Readonly<Record<string, unknown>> = {}): Board =>
  makeBoard({
    version: 1,
    title: "Test board",
    items: [],
    updatedAt: 1,
    ...overrides,
  });

const note = makeItem({
  id: "note-1",
  kind: "note",
  x: 10,
  y: 20,
  width: 300,
  height: 200,
  rotation: 0,
  order: 1,
  text: "hello",
});

describe("board sync model", () => {
  it("emits only changed items", () => {
    const previous = board({ items: [note] });
    const next = board({
      items: [{ ...note, x: 42 }],
      updatedAt: 2,
    });

    expect(diffBoards(previous, next)).toEqual([
      {
        upserts: [{ ...note, x: 42 }],
        deletes: [],
      },
    ]);
  });

  it("syncs an href-only image edit and preserves it during apply", () => {
    const image = makeItem({
      ...note,
      id: "image-1",
      kind: "image",
      src: "https://images.example/chair.jpg",
      text: undefined,
    });
    const linked = makeItem({ ...image, href: "https://shop.example/chair" });
    const previous = board({ items: [image] });
    const next = board({ items: [linked], updatedAt: 2 });
    const mutations = diffBoards(previous, next);

    expect(mutations).toEqual([{ upserts: [linked], deletes: [] }]);
    expect(applyBoardMutation(previous, mutations[0]).items[0]?.href).toBe(
      "https://shop.example/chair",
    );
  });

  it("diffs and replays managed media IDs without inventing a URL", () => {
    const managed = makeItem({
      ...note,
      id: "managed-image",
      kind: "image",
      mediaId: "0123456789abcdef0123456789abcdef",
      text: undefined,
    });
    const initial = board();
    const mutation = diffBoards(initial, board({ items: [managed], updatedAt: 2 }))[0];
    expect(mutation.upserts).toEqual([managed]);
    const replayed = applyBoardMutation(initial, mutation).items[0];
    expect(replayed).toMatchObject({ mediaId: managed.mediaId });
    expect(replayed?.src).toBeUndefined();
  });

  it("preserves audio kinds and sources through diffs and replay", () => {
    const spotify = makeItem({
      ...note,
      id: "spotify-1",
      kind: "spotify",
      width: 520,
      height: 300,
      src: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
      label: "Night drive",
      text: undefined,
    });
    const initial = board();
    const next = board({ items: [spotify], updatedAt: 2 });
    const mutation = diffBoards(initial, next)[0];
    expect(mutation.upserts).toEqual([spotify]);
    expect(applyBoardMutation(initial, mutation).items).toEqual([spotify]);
  });

  it("preserves image annotations and detects annotation-only edits", () => {
    const image = makeItem({
      ...note,
      id: "image-1",
      kind: "image",
      src: "https://images.example/chair.jpg",
      text: undefined,
      annotationTitle: "Waxed field jacket",
      annotationDescription: "Weathered cotton.",
    });
    const initial = board({ items: [image] });
    const edited = makeItem({
      ...image,
      annotationDescription: "Weathered waxed cotton.",
    });
    const mutation = diffBoards(initial, board({ items: [edited], updatedAt: 2 }))[0];
    expect(mutation.upserts).toEqual([edited]);
    expect(applyBoardMutation(initial, mutation).items).toEqual([edited]);
  });

  it("preserves website preview fields and detects metadata-only refreshes", () => {
    const website = makeItem({
      ...note,
      id: "website-1",
      kind: "website",
      width: 540,
      height: 360,
      text: undefined,
      websiteUrl: "https://example.com/story",
      websiteTitle: "A collected room",
      websiteDescription: "Light and stone.",
      websiteSiteLabel: "example.com",
    });
    const initial = board({ items: [website] });
    const refreshed = makeItem({ ...website, websiteTitle: "A quieter room" });
    const mutation = diffBoards(initial, board({ items: [refreshed], updatedAt: 2 }))[0];
    expect(mutation.upserts).toEqual([refreshed]);
    expect(applyBoardMutation(initial, mutation).items).toEqual([refreshed]);
  });

  it("preserves X settings and detects snapshot-only refreshes", () => {
    const x = makeItem({
      ...note,
      id: "x-1",
      kind: "x",
      width: 550,
      height: 620,
      text: undefined,
      src: "https://x.com/sheherenow_/status/2082226100764369045",
      xDisplay: "post",
      xTheme: "automatic",
      xHideThread: true,
      xAuthorHandle: "sheherenow_",
      xPostText: "Cooking inspiration",
    });
    const initial = board({ items: [x] });
    const refreshed = makeItem({ ...x, xPostText: "Updated cooking inspiration" });
    const mutation = diffBoards(initial, board({ items: [refreshed], updatedAt: 2 }))[0];
    expect(mutation.upserts).toEqual([refreshed]);
    expect(applyBoardMutation(initial, mutation).items).toEqual([refreshed]);
  });

  it("keeps title, deletes, and upserts in one logical diff", () => {
    const previous = board({ items: [note] });
    const replacement = makeItem({ ...note, id: "note-2", text: "new" });
    const next = board({ title: "Renamed", items: [replacement], updatedAt: 2 });

    expect(diffBoards(previous, next)).toEqual([
      {
        title: "Renamed",
        upserts: [replacement],
        deletes: ["note-1"],
      },
    ]);
  });

  it("diffs, applies, and resets a board background independently", () => {
    const initial = board();
    const colored = board({ background: "#242728", updatedAt: 2 });

    expect(diffBoards(initial, colored)).toEqual([
      {
        background: "#242728",
        upserts: [],
        deletes: [],
      },
    ]);
    expect(applyBoardMutation(initial, diffBoards(initial, colored)[0])).toMatchObject({
      background: "#242728",
    });
    expect(diffBoards(colored, board({ updatedAt: 3 }))).toEqual([
      {
        background: null,
        upserts: [],
        deletes: [],
      },
    ]);
    expect(
      applyBoardMutation(colored, {
        background: null,
        upserts: [],
        deletes: [],
      }).background,
    ).toBeUndefined();
  });

  it("diffs, applies, and clears managed background media independently", () => {
    const mediaId = "0123456789abcdef0123456789abcdef";
    const initial = board({ background: "#242728" });
    const managed = board({
      background: "#242728",
      backgroundMediaId: mediaId,
      updatedAt: 2,
    });

    expect(diffBoards(initial, managed)).toEqual([
      {
        backgroundMediaId: mediaId,
        upserts: [],
        deletes: [],
      },
    ]);
    expect(applyBoardMutation(initial, diffBoards(initial, managed)[0])).toMatchObject({
      background: "#242728",
      backgroundMediaId: mediaId,
    });
    expect(diffBoards(managed, board({ background: "#242728", updatedAt: 3 }))).toEqual([
      { backgroundMediaId: null, upserts: [], deletes: [] },
    ]);
  });

  it("preserves the background fields when a mutation omits them", () => {
    const colored = board({
      background: "#242728",
      backgroundMediaId: "0123456789abcdef0123456789abcdef",
    });
    const next = applyBoardMutation(colored, {
      title: "Renamed",
      upserts: [],
      deletes: [],
    });
    expect(next.background).toBe("#242728");
    expect(next.backgroundMediaId).toBe("0123456789abcdef0123456789abcdef");
  });

  it("rebases offline mutations without deleting unrelated remote additions", () => {
    const remoteItem = makeItem({ ...note, id: "remote-note", order: 2, text: "remote" });
    const remote = board({ items: [note, remoteItem] });
    const reconciled = applyBoardMutation(remote, {
      upserts: [{ ...note, x: 99 }],
      deletes: [],
    });

    expect(reconciled.items).toEqual([{ ...note, x: 99 }, remoteItem]);
    expect(diffBoards(remote, reconciled)[0]?.deletes).toEqual([]);
  });

  it("applies an authoritative local acknowledgement after an interleaved remote change", () => {
    const optimistic = board({ items: [{ ...note, x: 30 }] });
    const remote = applyBoardChange(
      optimistic,
      makeChange({
        _tag: "Change",
        boardId: "default",
        revision: 2,
        clientId: "remote-client",
        mutationId: "remote-mutation",
        upserts: [{ ...note, x: 20 }],
        deletes: [],
        updatedAt: 2,
      }),
    );
    const acknowledged = applyBoardChange(
      remote,
      makeChange({
        _tag: "Change",
        boardId: "default",
        revision: 3,
        clientId: "local-client",
        mutationId: "local-mutation",
        upserts: [{ ...note, x: 30 }],
        deletes: [],
        updatedAt: 3,
      }),
    );

    expect(acknowledged.items[0]?.x).toBe(30);
  });

  it("applies a remote change without disturbing unrelated items", () => {
    const other = makeItem({ ...note, id: "note-2", order: 2, text: "other" });
    const current = board({ items: [note, other] });

    const next = applyBoardChange(
      current,
      makeChange({
        _tag: "Change",
        boardId: "default",
        revision: 2,
        clientId: "remote-client",
        mutationId: "mutation-1",
        title: "Remote title",
        upserts: [{ ...note, x: 80 }],
        deletes: [],
        updatedAt: 20,
      }),
    );

    expect(next.title).toBe("Remote title");
    expect(next.items).toEqual([{ ...note, x: 80 }, other]);
    expect(next.updatedAt).toBe(20);
  });
});
