import { describe, expect, it } from "vitest";

import {
  collectDroppedImageFiles,
  MAX_BULK_FILES,
  runBoundedWorkers,
  selectedBulkTotals,
  shouldStageImageSelection,
  sortBulkEntries,
  stageBulkFiles,
  toggleBulkSelection,
  type BulkImageEntry,
} from "../src/client/board/bulk-image-import";

const file = (name: string, size = 4, modified = 1) =>
  new File([new Uint8Array(size)], name, { type: "image/png", lastModified: modified });

const entry = (
  id: string,
  originalIndex: number,
  name: string,
  captureTime: number,
): BulkImageEntry => ({
  id,
  originalIndex,
  file: file(name, originalIndex + 1, captureTime),
  previewUrl: `blob:${id}`,
  captureTime,
  selected: false,
  status: "ready",
  width: 100,
  height: 100,
});

describe("bulk image intake helpers", () => {
  it("adds one picked file directly and stages groups or folders", () => {
    expect(shouldStageImageSelection(1)).toBe(false);
    expect(shouldStageImageSelection(2)).toBe(true);
    expect(shouldStageImageSelection(1, true)).toBe(true);
    expect(shouldStageImageSelection(0)).toBe(true);
  });

  it("runs bounded workers concurrently, isolates failures, and preserves result order", async () => {
    let active = 0;
    let maximum = 0;
    const results = await runBoundedWorkers(
      [0, 1, 2, 3, 4, 5],
      async (value) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        if (value === 2) throw new Error("broken");
        return value * 2;
      },
      { concurrency: 3 },
    );
    expect(maximum).toBe(3);
    expect(results.map((result) => (result?.ok ? result.value : "failed"))).toEqual([
      0,
      2,
      "failed",
      6,
      8,
      10,
    ]);
  });

  it("stops scheduling new work after cancellation", async () => {
    const controller = new AbortController();
    const started: number[] = [];
    await runBoundedWorkers(
      [0, 1, 2, 3, 4],
      async (value) => {
        started.push(value);
        controller.abort();
        await Promise.resolve();
        return value;
      },
      { concurrency: 1, signal: controller.signal },
    );
    expect(started).toEqual([0]);
  });

  it("caps staging at 150 and reports every omitted file", () => {
    const files = Array.from({ length: MAX_BULK_FILES + 7 }, (_, index) => file(`${index}.png`));
    const staged = stageBulkFiles(files);
    expect(staged.entries).toHaveLength(MAX_BULK_FILES);
    expect(staged.omitted).toBe(7);
    expect(staged.entries.every((item) => item.previewUrl === undefined)).toBe(true);
  });

  it("sorts stably by acquisition, natural filename, and capture time", () => {
    const entries = [
      entry("c", 2, "image10.png", 30),
      entry("a", 0, "image2.png", 20),
      entry("b", 1, "image1.png", 20),
      entry("d", 3, "unknown.png", 0),
    ];
    expect(sortBulkEntries(entries, "original").map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(sortBulkEntries(entries, "filename").map((item) => item.id)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
    expect(sortBulkEntries(entries, "capture").map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("recursively reads folder drops and falls back to delivered files", async () => {
    const nestedFile = file("nested.png");
    let reads = 0;
    const root = {
      isFile: false,
      isDirectory: true,
      createReader: () => ({
        readEntries: (success: (entries: ReadonlyArray<object>) => void) => {
          reads += 1;
          success(
            reads === 1
              ? [
                  {
                    isFile: true,
                    isDirectory: false,
                    file: (resolve: (value: File) => void) => resolve(nestedFile),
                  },
                ]
              : [],
          );
        },
      }),
    };
    const directoryTransfer = Object.create(null) as DataTransfer;
    Object.defineProperty(directoryTransfer, "items", {
      value: [{ webkitGetAsEntry: () => root }],
    });
    Object.defineProperty(directoryTransfer, "files", { value: [] });
    expect((await collectDroppedImageFiles(directoryTransfer)).files).toEqual([nestedFile]);
    expect(reads).toBe(2);

    const fallbackFile = file("fallback.png");
    const fallbackTransfer = Object.create(null) as DataTransfer;
    Object.defineProperty(fallbackTransfer, "items", { value: [] });
    Object.defineProperty(fallbackTransfer, "files", { value: [fallbackFile] });
    expect((await collectDroppedImageFiles(fallbackTransfer)).files).toEqual([fallbackFile]);
  });

  it("keeps valid direct and nested files when neighboring entries fail", async () => {
    const nestedFile = file("nested.png");
    const directFile = file("direct.png");
    const root = {
      name: "trip",
      isFile: false,
      isDirectory: true,
      createReader: () => {
        let read = false;
        return {
          readEntries: (success: (entries: ReadonlyArray<object>) => void) => {
            if (read) success([]);
            else {
              read = true;
              success([
                {
                  name: "nested.png",
                  isFile: true,
                  isDirectory: false,
                  file: (resolve: (value: File) => void) => resolve(nestedFile),
                },
                {
                  name: "damaged.jpg",
                  isFile: true,
                  isDirectory: false,
                  file: (_resolve: (value: File) => void, reject: (error: DOMException) => void) =>
                    reject(new DOMException("Unreadable")),
                },
              ]);
            }
          },
        };
      },
    };
    const transfer = Object.create(null) as DataTransfer;
    Object.defineProperty(transfer, "items", {
      value: [
        { webkitGetAsEntry: () => root, getAsFile: () => null },
        { webkitGetAsEntry: () => null, getAsFile: () => directFile },
      ],
    });
    Object.defineProperty(transfer, "files", { value: [] });

    const collected = await collectDroppedImageFiles(transfer);
    expect(collected.files).toEqual([nestedFile, directFile]);
    expect(collected.failures).toEqual([{ name: "damaged.jpg", message: "Unreadable" }]);
  });

  it("caps folder file reads and reports truncated directory subtrees", async () => {
    let fileReads = 0;
    const makeFileEntry = (name: string) => ({
      name,
      isFile: true,
      isDirectory: false,
      file: (resolve: (value: File) => void) => {
        fileReads += 1;
        resolve(file(name));
      },
    });
    const root = {
      name: "root",
      isFile: false,
      isDirectory: true,
      createReader: () => {
        let read = false;
        return {
          readEntries: (success: (entries: ReadonlyArray<object>) => void) => {
            if (read) success([]);
            else {
              read = true;
              success([
                makeFileEntry("one.png"),
                makeFileEntry("two.png"),
                { name: "more", isFile: false, isDirectory: true },
              ]);
            }
          },
        };
      },
    };
    const transfer = Object.create(null) as DataTransfer;
    Object.defineProperty(transfer, "items", {
      value: [{ webkitGetAsEntry: () => root, getAsFile: () => null }],
    });
    Object.defineProperty(transfer, "files", { value: [] });

    const collected = await collectDroppedImageFiles(transfer, { limit: 1 });
    expect(collected.files.map((item) => item.name)).toEqual(["one.png"]);
    expect(fileReads).toBe(1);
    expect(collected.omitted).toBe(2);
    expect(collected.truncated).toBe(true);
  });

  it("stops folder callbacks after abort", async () => {
    const controller = new AbortController();
    const transfer = Object.create(null) as DataTransfer;
    Object.defineProperty(transfer, "items", {
      value: [
        {
          webkitGetAsEntry: () => ({
            name: "slow",
            isFile: false,
            isDirectory: true,
            createReader: () => ({
              readEntries: () => undefined,
            }),
          }),
          getAsFile: () => null,
        },
      ],
    });
    Object.defineProperty(transfer, "files", { value: [] });
    const collecting = collectDroppedImageFiles(transfer, { signal: controller.signal });
    controller.abort();
    await expect(collecting).rejects.toMatchObject({ name: "AbortError" });
  });

  it("selects contiguous ranges in displayed order and totals bytes", () => {
    const entries = [
      entry("a", 0, "a.png", 1),
      entry("b", 1, "b.png", 1),
      entry("c", 2, "c.png", 1),
    ];
    const selected = toggleBulkSelection(entries, ["c", "b", "a"], "a", true, "c", true);
    expect(selected.map((item) => item.selected)).toEqual([true, true, true]);
    expect(selectedBulkTotals(selected)).toEqual({ count: 3, bytes: 6 });
  });
});
