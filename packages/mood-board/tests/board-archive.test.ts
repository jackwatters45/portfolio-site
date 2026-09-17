import { Schema } from "effect";
import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import { createBoardArchive, importBoardFile } from "../src/client/board/board-archive";
import type { Board, BoardItem, Camera } from "../src/client/board/types";
import { BoardItemSchema, BoardSchema } from "../src/lib/board-rpc";
import {
  MediaByteLengthSchema,
  MediaIdSchema,
  MediaMimeTypeSchema,
  MediaUploadResponseSchema,
  type MediaId,
  type MediaKind,
} from "../src/lib/media";

const sourceId = MediaIdSchema.make("0123456789abcdef0123456789abcdef");
const targetId = MediaIdSchema.make("fedcba9876543210fedcba9876543210");
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const camera: Camera = { x: 10, y: -5, z: 0.8 };
const makeBoard = (value: unknown): Board => {
  const decoded = Schema.decodeUnknownSync(BoardSchema)(value);
  return { ...decoded, items: decoded.items.map((item) => ({ ...item })) };
};
const makeItem = (value: unknown): BoardItem => Schema.decodeUnknownSync(BoardItemSchema)(value);
const downloadedPng = () => ({
  blob: new Blob([png], { type: "image/png" }),
  mimeType: MediaMimeTypeSchema.make("image/png"),
  byteLength: MediaByteLengthSchema.make(png.byteLength),
});
const uploadedMedia = (blob: Blob, kind: MediaKind, mediaId: MediaId) =>
  Schema.decodeUnknownSync(MediaUploadResponseSchema)({
    mediaId,
    kind,
    mimeType: blob.type,
    byteLength: blob.size,
    url: `/media/${mediaId}`,
  });
const board = makeBoard({
  version: 1,
  title: "Portable references",
  updatedAt: 1,
  items: [
    {
      id: "image-a",
      kind: "image",
      mediaId: sourceId,
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      rotation: 0,
      order: 1,
    },
    {
      id: "image-b",
      kind: "image",
      mediaId: sourceId,
      x: 450,
      y: 0,
      width: 400,
      height: 300,
      rotation: 0,
      order: 2,
    },
  ],
});

const asFile = async (blob: Blob, name = "portable.moodboard") =>
  new File([await blob.arrayBuffer()], name, { type: blob.type });

describe("portable mood-board archives", () => {
  it("deduplicates downloads and uploads, then remaps every reference", async () => {
    const download = vi.fn(async (_mediaId: MediaId, _kind: MediaKind) => downloadedPng());
    const archive = await createBoardArchive(
      {
        ...board,
        backgroundMediaId: sourceId,
      },
      camera,
      { download },
    );
    expect(download).toHaveBeenCalledTimes(1);

    const upload = vi.fn(async (blob: Blob, kind: MediaKind) =>
      uploadedMedia(blob, kind, targetId),
    );
    const imported = await importBoardFile(await asFile(archive), { upload });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(imported.board.backgroundMediaId).toBe(targetId);
    expect(imported.board.items.map((item) => item.mediaId)).toEqual([targetId, targetId]);
    expect(imported.board.items.every((item) => item.src === undefined)).toBe(true);
    expect(imported.camera).toEqual(camera);
  });

  it("round-trips an archive whose only managed reference is the background", async () => {
    const backgroundOnly = makeBoard({
      version: 1,
      title: "Background only",
      background: "#242728",
      backgroundMediaId: sourceId,
      items: [],
      updatedAt: 1,
    });
    const download = vi.fn(async () => downloadedPng());
    const archive = await createBoardArchive(backgroundOnly, camera, { download });
    const upload = vi.fn(async (blob: Blob, kind: MediaKind) =>
      uploadedMedia(blob, kind, targetId),
    );

    const imported = await importBoardFile(await asFile(archive), { upload });
    expect(download).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledOnce();
    expect(imported.board).toMatchObject({
      background: "#242728",
      backgroundMediaId: targetId,
      items: [],
    });
  });

  it("rejects unsafe ZIP paths before uploading", async () => {
    const zipped = zipSync({
      "../escape.bin": png,
      "manifest.json": strToU8("{}"),
    });
    const upload = vi.fn();
    await expect(
      importBoardFile(new File([zipped], "unsafe.moodboard"), { upload }),
    ).rejects.toThrow(/unsafe path/i);
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects missing or MIME-mismatched media before uploading", async () => {
    const archive = await createBoardArchive(board, camera, {
      download: async () => downloadedPng(),
    });
    const unpacked = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    unpacked["media/0000.bin"] = new Uint8Array(png.byteLength);
    const upload = vi.fn();
    await expect(
      importBoardFile(new File([zipSync(unpacked)], "mismatch.moodboard"), { upload }),
    ).rejects.toThrow(/does not match its declared type/i);
    expect(upload).not.toHaveBeenCalled();

    delete unpacked["media/0000.bin"];
    await expect(
      importBoardFile(new File([zipSync(unpacked)], "missing.moodboard"), { upload }),
    ).rejects.toThrow(/missing/i);
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects same-size media corruption before uploading", async () => {
    const archive = await createBoardArchive(board, camera, {
      download: async () => downloadedPng(),
    });
    const unpacked = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    const corrupted = unpacked["media/0000.bin"]?.slice();
    if (corrupted === undefined) throw new Error("Test archive media missing");
    corrupted[corrupted.length - 1] = (corrupted[corrupted.length - 1] ?? 0) ^ 0xff;
    unpacked["media/0000.bin"] = corrupted;
    const upload = vi.fn();
    await expect(
      importBoardFile(new File([zipSync(unpacked)], "corrupt.moodboard"), { upload }),
    ).rejects.toThrow(/integrity/i);
    expect(upload).not.toHaveBeenCalled();
  });

  it("converts and deduplicates legacy embedded images in a mixed archive", async () => {
    const embeddedSource = `data:image/png;base64,${btoa(String.fromCharCode(...png))}`;
    const mixed = makeBoard({
      ...board,
      items: [
        ...board.items,
        {
          id: "legacy-a",
          kind: "image",
          src: embeddedSource,
          x: 0,
          y: 350,
          width: 300,
          height: 200,
          rotation: 0,
          order: 3,
        },
        {
          id: "legacy-b",
          kind: "image",
          src: embeddedSource,
          x: 320,
          y: 350,
          width: 300,
          height: 200,
          rotation: 0,
          order: 4,
        },
      ],
    });
    const download = vi.fn(async () => downloadedPng());
    const archive = await createBoardArchive(mixed, camera, { download });
    expect(download).toHaveBeenCalledTimes(1);

    let uploadCount = 0;
    const upload = vi.fn(async (blob: Blob, kind: MediaKind) => {
      uploadCount += 1;
      const mediaId =
        uploadCount === 1 ? targetId : MediaIdSchema.make("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      return uploadedMedia(blob, kind, mediaId);
    });
    const imported = await importBoardFile(await asFile(archive), { upload });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(imported.board.items.every((item) => item.src === undefined)).toBe(true);
    expect(imported.board.items[2]?.mediaId).toBe(imported.board.items[3]?.mediaId);
  });

  it("stops scheduling archive uploads after the first failure and awaits siblings", async () => {
    const manyItems = Array.from({ length: 6 }, (_, index) =>
      makeItem({
        id: `image-${index}`,
        kind: "image",
        mediaId: index.toString(16).padStart(32, "0"),
        x: index * 100,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        order: index,
      }),
    );
    const archive = await createBoardArchive({ ...board, items: manyItems }, camera, {
      download: async () => downloadedPng(),
    });
    let started = 0;
    let completed = 0;
    await expect(
      importBoardFile(await asFile(archive), {
        upload: async (blob, kind) => {
          started += 1;
          if (started === 1) throw new Error("first upload failed");
          await new Promise((resolve) => setTimeout(resolve, 20));
          completed += 1;
          const mediaId = MediaIdSchema.make(started.toString(16).padStart(32, "a"));
          return uploadedMedia(blob, kind, mediaId);
        },
      }),
    ).rejects.toThrow("first upload failed");
    expect(started).toBe(3);
    expect(completed).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(started).toBe(3);
  });

  it("does not return a replacement board when an upload fails", async () => {
    const archive = await createBoardArchive(board, camera, {
      download: async () => downloadedPng(),
    });
    await expect(
      importBoardFile(await asFile(archive), {
        upload: async () => {
          throw new Error("upload offline");
        },
      }),
    ).rejects.toThrow("upload offline");
  });

  it("keeps legacy JSON import for boards without managed media", async () => {
    const legacy = {
      format: "moodboard",
      board: {
        version: 1,
        title: "Legacy",
        updatedAt: 1,
        items: [
          {
            id: "legacy-image",
            kind: "image",
            src: "data:image/png;base64,iVBORw0KGgo=",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
            order: 1,
          },
        ],
      },
      camera,
    };
    const imported = await importBoardFile(
      new File([JSON.stringify(legacy)], "legacy.moodboard.json", { type: "application/json" }),
    );
    expect(imported.board.items[0]?.src).toMatch(/^data:image\/png/);
    expect(imported.board.items[0]?.mediaId).toBeUndefined();
  });
});
