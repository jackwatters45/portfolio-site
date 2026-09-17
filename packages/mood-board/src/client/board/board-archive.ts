import { Option, Schema } from "effect";
import { unzip, zip, type UnzipOptions } from "fflate";

import { BoardTimestampSchema } from "../../lib/board-rpc";
import {
  hasValidMediaMagic,
  MAX_AUDIO_UPLOAD_BYTES,
  mediaByteLimit,
  MediaByteLengthSchema,
  MediaEtagSchema,
  MediaIdSchema,
  MediaKindSchema,
  MediaMimeTypeSchema,
  normalizeMediaMimeType,
  type MediaByteLength,
  type MediaEtag,
  type MediaId,
  type MediaKind,
  type MediaUploadResponse,
} from "../../lib/media";
import { NonNegativeIntegerSchema } from "../../lib/schema";
import { downloadMedia, uploadMedia, type DownloadedMedia } from "../media-client";
import { normalizeImportedBoard } from "./board-import";
import type { Board, Camera } from "./types";

export const MOODBOARD_ARCHIVE_EXTENSION = ".moodboard";
export const MAX_ARCHIVE_BYTES: MediaByteLength = MediaByteLengthSchema.make(50 * 1024 * 1024);
export const MAX_LEGACY_JSON_BYTES: MediaByteLength = MediaByteLengthSchema.make(50 * 1024 * 1024);
export const MAX_ARCHIVE_MEDIA = 500;
const MAX_MANIFEST_BYTES: MediaByteLength = MediaByteLengthSchema.make(2 * 1024 * 1024);
const ManifestArchiveEntrySizeSchema = NonNegativeIntegerSchema.check(
  Schema.isBetween({ minimum: 0, maximum: MAX_MANIFEST_BYTES }),
);
const MediaArchiveEntrySizeSchema = NonNegativeIntegerSchema.check(
  Schema.isBetween({ minimum: 0, maximum: MAX_AUDIO_UPLOAD_BYTES }),
);
const decodeManifestArchiveEntrySize = Schema.decodeUnknownOption(ManifestArchiveEntrySizeSchema);
const decodeMediaArchiveEntrySize = Schema.decodeUnknownOption(MediaArchiveEntrySizeSchema);
const MANIFEST_PATH = "manifest.json";
const MEDIA_PATH_PATTERN = /^media\/[0-9]{4}\.bin$/;
const ArchiveEntryPathSchema = Schema.String.check(
  Schema.makeFilter((name) =>
    name.includes("\\") ||
    name.startsWith("/") ||
    name.split("/").includes("..") ||
    (name !== MANIFEST_PATH && !MEDIA_PATH_PATTERN.test(name))
      ? "Archive entry path is unsafe"
      : undefined,
  ),
);
const decodeArchiveEntryPath = Schema.decodeUnknownOption(ArchiveEntryPathSchema);
const ManifestMediaSchema = Schema.Struct({
  mediaId: MediaIdSchema,
  kind: MediaKindSchema,
  mimeType: MediaMimeTypeSchema,
  byteLength: MediaByteLengthSchema,
  sha256: MediaEtagSchema,
  path: Schema.String.check(Schema.isPattern(MEDIA_PATH_PATTERN)),
}).check(
  Schema.makeFilter((entry) => {
    if (normalizeMediaMimeType(entry.kind, entry.mimeType) !== entry.mimeType) {
      return { path: ["mimeType"], issue: "Media MIME type does not match its kind" };
    }
    return entry.byteLength > mediaByteLimit(entry.kind)
      ? { path: ["byteLength"], issue: "Media entry exceeds its kind's size limit" }
      : undefined;
  }),
);
type ManifestMedia = typeof ManifestMediaSchema.Type;
const ArchiveManifestEnvelopeSchema = Schema.Struct({
  format: Schema.Literal("moodboard-archive"),
  version: Schema.Literal(1),
  board: Schema.Unknown,
  camera: Schema.Unknown,
  media: Schema.Array(ManifestMediaSchema).check(Schema.isMaxLength(MAX_ARCHIVE_MEDIA)),
});
const decodeArchiveManifestEnvelope = Schema.decodeUnknownOption(ArchiveManifestEnvelopeSchema);

export type PortableBoard = {
  readonly board: Board;
  readonly camera?: Camera;
};

type ArchiveManifest = {
  readonly format: "moodboard-archive";
  readonly version: 1;
  readonly board: Board;
  readonly camera: Camera;
  readonly media: ReadonlyArray<ManifestMedia>;
};

type Download = (
  mediaId: MediaId,
  kind: MediaKind,
  signal?: AbortSignal,
) => Promise<DownloadedMedia>;
type Upload = (blob: Blob, kind: MediaKind, signal?: AbortSignal) => Promise<MediaUploadResponse>;

const copyBytes = (value: Uint8Array): Uint8Array<ArrayBuffer> => {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
};

const decodeMediaId = Schema.decodeUnknownOption(MediaIdSchema);

const randomMediaId = (reserved: ReadonlySet<string>): MediaId => {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const id = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    if (!reserved.has(id)) return MediaIdSchema.make(id);
  }
};

const sha256 = async (bytes: Uint8Array): Promise<MediaEtag> => {
  const copy = copyBytes(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  const hash = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return MediaEtagSchema.make(hash);
};

const decodeEmbeddedImage = (source: string): DownloadedMedia => {
  const match = /^data:image\/(png|jpe?g|gif|webp);base64,([a-z0-9+/=\s]+)$/i.exec(source);
  if (match === null) throw new Error("A legacy embedded image is malformed.");
  const subtype = match[1]?.toLowerCase();
  const mimeType = normalizeMediaMimeType(
    "image",
    subtype === "jpg" ? "image/jpeg" : `image/${subtype}`,
  );
  if (mimeType === null) throw new Error("A legacy embedded image has an unsupported media type.");
  const encoded = match[2]?.replace(/\s/g, "") ?? "";
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    throw new Error("A legacy embedded image is not valid base64.");
  }
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  if (bytes.byteLength > mediaByteLimit("image") || !hasValidMediaMagic("image", mimeType, bytes)) {
    throw new Error("A legacy embedded image is invalid or too large.");
  }
  return {
    blob: new Blob([bytes], { type: mimeType }),
    mimeType,
    byteLength: MediaByteLengthSchema.make(bytes.byteLength),
  };
};

const preparePortableBoard = (
  board: Board,
): {
  readonly board: Board;
  readonly embedded: ReadonlyMap<MediaId, DownloadedMedia>;
} => {
  const reserved = new Set([
    ...(board.backgroundMediaId === undefined ? [] : [board.backgroundMediaId]),
    ...board.items.flatMap((item) => (item.mediaId === undefined ? [] : [item.mediaId])),
  ]);
  const idsBySource = new Map<string, MediaId>();
  const embedded = new Map<MediaId, DownloadedMedia>();
  const items = board.items.map((item) => {
    if (item.kind !== "image" || item.src === undefined || !item.src.startsWith("data:")) {
      return item;
    }
    let id = idsBySource.get(item.src);
    if (id === undefined) {
      id = randomMediaId(reserved);
      reserved.add(id);
      idsBySource.set(item.src, id);
      embedded.set(id, decodeEmbeddedImage(item.src));
    }
    return { ...item, src: undefined, mediaId: id };
  });
  return { board: { ...board, items }, embedded };
};

const mediaReferences = (board: Board): Map<MediaId, MediaKind> => {
  const references = new Map<MediaId, MediaKind>();
  if (board.backgroundMediaId !== undefined) {
    const decoded = Option.getOrNull(decodeMediaId(board.backgroundMediaId));
    if (decoded === null) {
      throw new Error("The board contains an invalid managed background reference.");
    }
    references.set(decoded, "image");
  }
  for (const item of board.items) {
    if (item.mediaId === undefined) continue;
    const mediaId = Option.getOrNull(decodeMediaId(item.mediaId));
    if (mediaId === null || (item.kind !== "image" && item.kind !== "audio")) {
      throw new Error("The board contains an invalid managed media reference.");
    }
    const known = references.get(mediaId);
    if (known !== undefined && known !== item.kind) {
      throw new Error("A managed media file is used as more than one media kind.");
    }
    references.set(mediaId, item.kind);
  }
  return references;
};

const mapBounded = async <T, R>(
  entries: ReadonlyArray<T>,
  worker: (entry: T, index: number, signal: AbortSignal) => Promise<R>,
  signal?: AbortSignal,
): Promise<ReadonlyArray<R>> => {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });

  const results: Array<R | undefined> = Array.from({ length: entries.length });
  let next = 0;
  let failure: unknown;
  const run = async () => {
    while (!controller.signal.aborted) {
      const index = next++;
      const entry = entries[index];
      if (entry === undefined) return;
      try {
        results[index] = await worker(entry, index, controller.signal);
      } catch (error) {
        if (failure === undefined) failure = error;
        controller.abort(error);
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(3, entries.length) }, run));
  } finally {
    signal?.removeEventListener("abort", abortFromCaller);
  }
  if (failure !== undefined) throw failure;
  if (controller.signal.aborted) {
    throw new DOMException("Archive operation cancelled.", "AbortError");
  }
  return results.map((result) => {
    if (result === undefined) throw new Error("An archive operation did not finish.");
    return result;
  });
};

const zipArchive = (files: Record<string, Uint8Array>, signal?: AbortSignal): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Archive operation cancelled.", "AbortError"));
      return;
    }
    const terminate = zip(files, { level: 0 }, (error, data) => {
      signal?.removeEventListener("abort", onAbort);
      if (error !== null) reject(error);
      else resolve(data);
    });
    const onAbort = () => {
      terminate();
      reject(new DOMException("Archive operation cancelled.", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export async function createBoardArchive(
  board: Board,
  camera: Camera,
  options: { readonly download?: Download; readonly signal?: AbortSignal } = {},
): Promise<Blob> {
  const portable = preparePortableBoard(board);
  const references = [...mediaReferences(portable.board).entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (references.length === 0) {
    throw new Error("A binary archive is only needed for boards with managed or embedded media.");
  }
  if (references.length > MAX_ARCHIVE_MEDIA)
    throw new Error("That board uses too many media files to export.");
  const download = options.download ?? downloadMedia;
  const downloaded = await mapBounded(
    references,
    async ([mediaId, kind], _index, signal) =>
      portable.embedded.get(mediaId) ?? (await download(mediaId, kind, signal)),
    options.signal,
  );

  let total = 0;
  const files: Record<string, Uint8Array> = {};
  const media: ManifestMedia[] = [];
  for (const [index, [mediaId, kind]] of references.entries()) {
    const value = downloaded[index];
    if (value === undefined) throw new Error("A managed media file was not downloaded.");
    const mimeType = normalizeMediaMimeType(kind, value.mimeType);
    if (
      mimeType === null ||
      value.byteLength !== value.blob.size ||
      value.byteLength > mediaByteLimit(kind)
    ) {
      throw new Error("A managed media file has invalid metadata.");
    }
    const bytes = new Uint8Array(await value.blob.arrayBuffer());
    if (bytes.byteLength !== value.byteLength || !hasValidMediaMagic(kind, mimeType, bytes)) {
      throw new Error("A managed media file does not match its declared type.");
    }
    total += bytes.byteLength;
    if (total > MAX_ARCHIVE_BYTES)
      throw new Error("This board's media is too large to export safely.");
    const path = `media/${index.toString().padStart(4, "0")}.bin`;
    files[path] = bytes;
    media.push({
      mediaId,
      kind,
      mimeType,
      byteLength: MediaByteLengthSchema.make(bytes.byteLength),
      sha256: await sha256(bytes),
      path,
    });
  }

  const manifest: ArchiveManifest = {
    format: "moodboard-archive",
    version: 1,
    board: portable.board,
    camera,
    media,
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  if (manifestBytes.byteLength > MAX_MANIFEST_BYTES)
    throw new Error("The board manifest is too large.");
  files[MANIFEST_PATH] = manifestBytes;

  const zipped = await zipArchive(files, options.signal);
  if (zipped.byteLength > MAX_ARCHIVE_BYTES)
    throw new Error("The portable archive is larger than 50 MB.");
  return new Blob([copyBytes(zipped)], { type: "application/vnd.moodboard+zip" });
}

const parseManifest = (bytes: Uint8Array): ArchiveManifest => {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("The archive manifest is not valid UTF-8 JSON.");
  }
  const decoded = Option.getOrNull(decodeArchiveManifestEnvelope(value));
  if (decoded === null) throw new Error("That mood-board archive version is not supported.");
  const normalized = normalizeImportedBoard(
    { board: decoded.board, camera: decoded.camera },
    { allowManagedMedia: true },
  );
  if (normalized.camera === undefined) throw new Error("The archive camera is missing.");
  return {
    format: "moodboard-archive",
    version: 1,
    board: normalized.board,
    camera: normalized.camera,
    media: decoded.media,
  };
};

const unzipArchive = (
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<Record<string, Uint8Array>> => {
  const seen = new Set<string>();
  let total = 0;
  let count = 0;
  const options: UnzipOptions = {
    filter: (entry) => {
      count += 1;
      if (count > MAX_ARCHIVE_MEDIA + 1) throw new Error("The archive contains too many files.");
      const name = Option.getOrNull(decodeArchiveEntryPath(entry.name));
      if (name === null) throw new Error("The archive contains an unsafe path.");
      if (seen.has(name)) throw new Error("The archive contains duplicate paths.");
      seen.add(name);
      const originalSize = Option.getOrNull(
        name === MANIFEST_PATH
          ? decodeManifestArchiveEntrySize(entry.originalSize)
          : decodeMediaArchiveEntrySize(entry.originalSize),
      );
      if (originalSize === null) throw new Error("An archived file is too large.");
      total += originalSize;
      if (total > MAX_ARCHIVE_BYTES)
        throw new Error("The archive expands beyond the safe size limit.");
      return true;
    },
  };
  return new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Archive operation cancelled.", "AbortError"));
      return;
    }
    const terminate = unzip(bytes, options, (error, files) => {
      signal?.removeEventListener("abort", onAbort);
      if (error !== null) reject(error);
      else resolve(files);
    });
    const onAbort = () => {
      terminate();
      reject(new DOMException("Archive operation cancelled.", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  }).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof Error && /archive|unsafe|duplicate|large/i.test(error.message))
      throw error;
    throw new Error("That file is not a valid mood-board ZIP archive.", { cause: error });
  });
};

const isZip = (bytes: Uint8Array): boolean =>
  bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

export async function importBoardFile(
  file: File,
  options: { readonly upload?: Upload; readonly signal?: AbortSignal } = {},
): Promise<PortableBoard> {
  if (file.size === 0) throw new Error("That board file is empty.");
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error("That board file is larger than 50 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isZip(bytes)) {
    if (file.size > MAX_LEGACY_JSON_BYTES) {
      throw new Error("That legacy JSON board is larger than 50 MB.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new Error("That file is neither a mood-board archive nor valid JSON.");
    }
    return normalizeImportedBoard(parsed);
  }

  const files = await unzipArchive(bytes, options.signal);
  const manifestBytes = files[MANIFEST_PATH];
  if (manifestBytes === undefined) throw new Error("The archive manifest is missing.");
  const manifest = parseManifest(manifestBytes);
  const references = mediaReferences(manifest.board);
  const ids = new Set<string>();
  const paths = new Set<string>();
  let declaredTotal = 0;
  for (const entry of manifest.media) {
    if (ids.has(entry.mediaId)) throw new Error("The archive manifest repeats a media ID.");
    if (paths.has(entry.path)) throw new Error("The archive manifest repeats a media path.");
    ids.add(entry.mediaId);
    paths.add(entry.path);
    if (references.get(entry.mediaId) !== entry.kind) {
      throw new Error("The archive media does not match its board references.");
    }
    const mediaBytes = files[entry.path];
    if (mediaBytes === undefined) throw new Error("An archived media file is missing.");
    if (mediaBytes.byteLength !== entry.byteLength)
      throw new Error("An archived media size does not match its manifest.");
    if (!hasValidMediaMagic(entry.kind, entry.mimeType, mediaBytes)) {
      throw new Error("An archived media file does not match its declared type.");
    }
    if ((await sha256(mediaBytes)) !== entry.sha256) {
      throw new Error("An archived media file failed its integrity check.");
    }
    declaredTotal += entry.byteLength;
    if (declaredTotal > MAX_ARCHIVE_BYTES)
      throw new Error("The archived media exceeds the safe size limit.");
  }
  if (ids.size !== references.size)
    throw new Error("The archive is missing a board media reference.");
  const expectedPaths = new Set([MANIFEST_PATH, ...paths]);
  if (Object.keys(files).some((path) => !expectedPaths.has(path))) {
    throw new Error("The archive contains undeclared files.");
  }

  const upload = options.upload ?? uploadMedia;
  const uploaded = await mapBounded(
    manifest.media,
    (entry, _index, signal) => {
      const mediaBytes = files[entry.path];
      if (mediaBytes === undefined) throw new Error("An archived media file is missing.");
      return upload(
        new Blob([copyBytes(mediaBytes)], { type: entry.mimeType }),
        entry.kind,
        signal,
      );
    },
    options.signal,
  );
  const remapped = new Map<MediaId, MediaId>();
  manifest.media.forEach((entry, index) => {
    const receipt = uploaded[index];
    if (
      receipt === undefined ||
      receipt.kind !== entry.kind ||
      receipt.byteLength !== entry.byteLength
    ) {
      throw new Error("An imported media upload returned an invalid receipt.");
    }
    remapped.set(entry.mediaId, receipt.mediaId);
  });
  const remapMediaId = (mediaId: MediaId): MediaId => {
    const mapped = remapped.get(mediaId);
    if (mapped === undefined) throw new Error("The archive is missing a remapped media file.");
    return mapped;
  };

  const remappedBoard: Board = {
    ...manifest.board,
    ...(manifest.board.backgroundMediaId === undefined
      ? {}
      : { backgroundMediaId: remapMediaId(manifest.board.backgroundMediaId) }),
    items: manifest.board.items.map((item) =>
      item.mediaId === undefined ? item : { ...item, mediaId: remapMediaId(item.mediaId) },
    ),
    updatedAt: BoardTimestampSchema.make(Date.now()),
  };
  return normalizeImportedBoard(
    { board: remappedBoard, camera: manifest.camera },
    { allowManagedMedia: true },
  );
}
