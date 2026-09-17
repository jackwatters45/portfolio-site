import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { reconcileRemoteBackgroundDraft } from "../src/client/board/board-background";
import type { Board } from "../src/client/board/types";
import { BoardSchema } from "../src/lib/board-rpc";
import { MediaIdSchema, type MediaId } from "../src/lib/media";

const mediaA = MediaIdSchema.make("0123456789abcdef0123456789abcdef");
const mediaB = MediaIdSchema.make("fedcba9876543210fedcba9876543210");
const makeBoard = (value: unknown): Board => {
  const decoded = Schema.decodeUnknownSync(BoardSchema)(value);
  return { ...decoded, items: decoded.items.map((item) => ({ ...item })) };
};
const board = (background: string, backgroundMediaId?: MediaId): Board =>
  makeBoard({
    version: 1,
    title: "Background sync fixture",
    background,
    ...(backgroundMediaId === undefined ? {} : { backgroundMediaId }),
    items: [],
    updatedAt: 1,
  });

describe("remote board background draft reconciliation", () => {
  it("refreshes an untouched open draft from the remote board", () => {
    expect(
      reconcileRemoteBackgroundDraft(board("#EDEDED", mediaA), board("#242728", mediaB), false),
    ).toEqual({
      conflict: false,
      draft: { hex: "#242728", lastValidHex: "#242728", mediaId: mediaB },
    });
  });

  it("blocks a touched draft when remote background metadata changes", () => {
    expect(
      reconcileRemoteBackgroundDraft(board("#EDEDED", mediaA), board("#242728", mediaB), true),
    ).toEqual({ conflict: true });
  });

  it("preserves a touched draft during unrelated remote item changes", () => {
    const previous = board("#EDEDED", mediaA);
    expect(
      reconcileRemoteBackgroundDraft(previous, makeBoard({ ...previous, updatedAt: 2 }), true),
    ).toEqual({
      conflict: false,
    });
  });

  it("keeps an existing conflict sticky across later unrelated remote events", () => {
    const remote = board("#242728", mediaB);
    expect(
      reconcileRemoteBackgroundDraft(remote, makeBoard({ ...remote, updatedAt: 3 }), true, true),
    ).toEqual({ conflict: true });
  });
});
