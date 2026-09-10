import type { MediaId } from "../../lib/media";
import type { BoardItem } from "./types";

export const MAX_BULK_FILES = 150;
export const BULK_CONCURRENCY = 3;

export type BulkSort = "original" | "filename" | "capture";
export type BulkLayoutKind = "loose" | "contact" | "masonry";
export type BulkEntryStatus = "checking" | "ready" | "processing" | "prepared" | "failed" | "added";

export type BulkImageEntry = {
  readonly id: string;
  readonly file: File;
  readonly previewUrl?: string;
  readonly originalIndex: number;
  readonly width?: number;
  readonly height?: number;
  readonly captureTime: number;
  readonly selected: boolean;
  readonly status: BulkEntryStatus;
  readonly error?: string;
};

export type PreparedBulkImage = {
  readonly entryId: string;
  readonly width: number;
  readonly height: number;
} & (
  | { readonly mediaId: MediaId; readonly src?: never }
  | { readonly src: string; readonly mediaId?: never }
);

export const shouldStageImageSelection = (count: number, folder = false): boolean =>
  folder || count !== 1;

export type WorkerResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown };

export async function runBoundedWorkers<T, R>(
  items: ReadonlyArray<T>,
  worker: (item: T, index: number) => Promise<R>,
  options: {
    readonly concurrency?: number;
    readonly signal?: AbortSignal;
    readonly onSettled?: (index: number, result: WorkerResult<R>) => void;
  } = {},
): Promise<ReadonlyArray<WorkerResult<R> | undefined>> {
  const concurrency = Math.max(1, Math.trunc(options.concurrency ?? BULK_CONCURRENCY));
  const results: Array<WorkerResult<R> | undefined> = Array.from({ length: items.length });
  let nextIndex = 0;

  const run = async () => {
    while (!options.signal?.aborted) {
      const index = nextIndex++;
      const item = items[index];
      if (item === undefined) return;
      let result: WorkerResult<R>;
      try {
        result = { ok: true, value: await worker(item, index) };
      } catch (error) {
        result = { ok: false, error };
      }
      results[index] = result;
      options.onSettled?.(index, result);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

export function stageBulkFiles(
  files: ReadonlyArray<File>,
  startIndex = 0,
  capacity = MAX_BULK_FILES,
): { readonly entries: ReadonlyArray<BulkImageEntry>; readonly omitted: number } {
  const accepted = files.slice(0, Math.max(0, capacity));
  return {
    entries: accepted.map((file, index) => ({
      id: crypto.randomUUID(),
      file,
      originalIndex: startIndex + index,
      captureTime: file.lastModified > 0 ? file.lastModified : 0,
      selected: true,
      status: "checking",
    })),
    omitted: Math.max(0, files.length - accepted.length),
  };
}

export function sortBulkEntries(
  entries: ReadonlyArray<BulkImageEntry>,
  sort: BulkSort,
): ReadonlyArray<BulkImageEntry> {
  return [...entries].sort((left, right) => {
    if (sort === "filename") {
      const byName = left.file.name.localeCompare(right.file.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (byName !== 0) return byName;
    } else if (sort === "capture") {
      const leftTime = left.captureTime || Number.POSITIVE_INFINITY;
      const rightTime = right.captureTime || Number.POSITIVE_INFINITY;
      if (leftTime !== rightTime) return leftTime - rightTime;
    }
    return left.originalIndex - right.originalIndex;
  });
}

export function toggleBulkSelection(
  entries: ReadonlyArray<BulkImageEntry>,
  displayedIds: ReadonlyArray<string>,
  id: string,
  selected: boolean,
  rangeAnchor: string | null,
  shift: boolean,
): ReadonlyArray<BulkImageEntry> {
  const targetIds = new Set<string>();
  if (shift && rangeAnchor !== null) {
    const anchorIndex = displayedIds.indexOf(rangeAnchor);
    const targetIndex = displayedIds.indexOf(id);
    if (anchorIndex >= 0 && targetIndex >= 0) {
      const start = Math.min(anchorIndex, targetIndex);
      const end = Math.max(anchorIndex, targetIndex);
      displayedIds.slice(start, end + 1).forEach((entryId) => targetIds.add(entryId));
    }
  }
  if (targetIds.size === 0) targetIds.add(id);
  return entries.map((entry) =>
    targetIds.has(entry.id) && entry.status !== "failed" ? { ...entry, selected } : entry,
  );
}

export function selectedBulkTotals(entries: ReadonlyArray<BulkImageEntry>): {
  readonly count: number;
  readonly bytes: number;
} {
  return entries.reduce(
    (totals, entry) =>
      entry.selected && entry.status !== "failed"
        ? { count: totals.count + 1, bytes: totals.bytes + entry.file.size }
        : totals,
    { count: 0, bytes: 0 },
  );
}

export function estimateItemBytes(item: BoardItem): number {
  const encoder = new TextEncoder();
  return (
    512 +
    encoder.encode(item.src ?? "").byteLength +
    encoder.encode(item.mediaId ?? "").byteLength +
    encoder.encode(item.href ?? "").byteLength +
    encoder.encode(item.annotationTitle ?? "").byteLength +
    encoder.encode(item.annotationDescription ?? "").byteLength +
    encoder.encode(item.text ?? "").byteLength +
    encoder.encode(item.color ?? "").byteLength +
    encoder.encode(item.label ?? "").byteLength +
    encoder.encode(item.websiteUrl ?? "").byteLength +
    encoder.encode(item.websiteImageUrl ?? "").byteLength +
    encoder.encode(item.websiteTitle ?? "").byteLength +
    encoder.encode(item.websiteDescription ?? "").byteLength +
    encoder.encode(item.websiteSiteLabel ?? "").byteLength +
    encoder.encode(item.xAuthorName ?? "").byteLength +
    encoder.encode(item.xAuthorHandle ?? "").byteLength +
    encoder.encode(item.xPostText ?? "").byteLength +
    encoder.encode(item.xPostDate ?? "").byteLength
  );
}

export type TraversalFailure = {
  readonly name: string;
  readonly message: string;
};

export type DroppedFileCollection = {
  readonly files: ReadonlyArray<File>;
  readonly failures: ReadonlyArray<TraversalFailure>;
  readonly omitted: number;
  readonly truncated: boolean;
  readonly hadDirectory: boolean;
};

type FileEntry = {
  readonly name?: string;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly file?: (success: (file: File) => void, failure?: (error: DOMException) => void) => void;
  readonly createReader?: () => {
    readEntries: (
      success: (entries: ReadonlyArray<FileEntry>) => void,
      failure?: (error: DOMException) => void,
    ) => void;
  };
};

const traversalAbortError = () => new DOMException("Folder reading was cancelled.", "AbortError");

const throwIfTraversalAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw traversalAbortError();
};

const callbackResult = <T>(
  start: (success: (value: T) => void, failure: (error: DOMException) => void) => void,
  signal?: AbortSignal,
): Promise<T> =>
  new Promise((resolve, reject) => {
    throwIfTraversalAborted(signal);
    let settled = false;
    const finish = (callback: (value: T) => void, value: T) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      callback(value);
    };
    const fail = (error: DOMException) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      reject(error);
    };
    const abort = () => fail(traversalAbortError());
    signal?.addEventListener("abort", abort, { once: true });
    start((value) => finish(resolve, value), fail);
  });

const readFileEntry = (entry: FileEntry, signal?: AbortSignal): Promise<File> => {
  if (!entry.file) return Promise.reject(new Error("The dropped file could not be read."));
  return callbackResult((success, failure) => entry.file?.(success, failure), signal);
};

const failureMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The dropped entry could not be read.";

export async function collectDroppedImageFiles(
  dataTransfer: DataTransfer,
  options: {
    readonly limit?: number;
    readonly signal?: AbortSignal;
  } = {},
): Promise<DroppedFileCollection> {
  const limit = Math.max(1, Math.trunc(options.limit ?? MAX_BULK_FILES));
  const files: File[] = [];
  const failures: TraversalFailure[] = [];
  let hadDirectory = false;
  let omitted = 0;
  let truncated = false;

  const addFile = (file: File) => {
    if (files.length < limit) files.push(file);
    else omitted += 1;
  };

  const visit = async (entry: FileEntry): Promise<void> => {
    throwIfTraversalAborted(options.signal);
    if (entry.isFile) {
      if (files.length >= limit) {
        omitted += 1;
        return;
      }
      try {
        addFile(await readFileEntry(entry, options.signal));
      } catch (error) {
        if (options.signal?.aborted) throw error;
        failures.push({
          name: entry.name || "Unreadable file",
          message: failureMessage(error),
        });
      }
      return;
    }
    if (!entry.isDirectory) return;
    const reader = entry.createReader?.();
    if (!reader) {
      failures.push({
        name: entry.name || "Unreadable folder",
        message: "The folder could not be opened.",
      });
      return;
    }
    while (true) {
      let batch: ReadonlyArray<FileEntry>;
      try {
        batch = await callbackResult<ReadonlyArray<FileEntry>>(
          (success, failure) => reader.readEntries(success, failure),
          options.signal,
        );
      } catch (error) {
        if (options.signal?.aborted) throw error;
        failures.push({
          name: entry.name || "Unreadable folder",
          message: failureMessage(error),
        });
        return;
      }
      if (batch.length === 0) return;
      for (const child of batch) {
        if (files.length >= limit) {
          omitted += 1;
          if (child.isDirectory) truncated = true;
        } else await visit(child);
      }
      if (files.length >= limit) {
        truncated = true;
        return;
      }
    }
  };

  const sources: Array<
    | { readonly _tag: "Entry"; readonly entry: FileEntry }
    | { readonly _tag: "File"; readonly file: File }
  > = [];
  for (const item of Array.from(dataTransfer.items)) {
    throwIfTraversalAborted(options.signal);
    const withEntry = item as DataTransferItem & { webkitGetAsEntry?: () => FileEntry | null };
    const entry = withEntry.webkitGetAsEntry?.();
    if (entry) {
      if (entry.isDirectory) hadDirectory = true;
      sources.push({ _tag: "Entry", entry });
    } else {
      const file = item.getAsFile();
      if (file) sources.push({ _tag: "File", file });
    }
  }

  if (sources.length === 0) {
    Array.from(dataTransfer.files).forEach(addFile);
  } else {
    for (const source of sources) {
      if (files.length >= limit) {
        omitted += 1;
        if (source._tag === "Entry" && source.entry.isDirectory) truncated = true;
      } else if (source._tag === "File") addFile(source.file);
      else await visit(source.entry);
    }
  }

  return { files, failures, omitted, truncated, hadDirectory };
}
