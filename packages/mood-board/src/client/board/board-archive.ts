import { Option, Schema } from 'effect';

import {
  createPortableArchive,
  mapArchiveEntries,
  readPortableArchive,
  type ArchiveWriteOptions,
  type PortableBoard,
} from '../../lib/board-archive';
import {
  BoardSchema,
  BoardTimestampSchema,
  MAX_REMOTE_BOARD_BYTES,
} from '../../lib/board-rpc';
import type { MediaId, MediaKind, MediaUploadResponse } from '../../lib/media';
import { blobToDataUrl } from '../media/image-processing';
import { downloadMedia, uploadMedia } from '../media/media-client';
import type { Board, Camera } from './types';

export {
  MAX_ARCHIVE_BYTES,
  MAX_ARCHIVE_MEDIA,
  MOODBOARD_ARCHIVE_EXTENSION,
  type PortableBoard,
} from '../../lib/board-archive';

export function createBoardArchive(
  board: Board,
  camera: Camera,
  options: Partial<ArchiveWriteOptions> = {},
): Promise<Blob> {
  return createPortableArchive(board, camera, {
    ...options,
    download: options.download ?? downloadMedia,
  });
}

type Upload = (
  blob: Blob,
  kind: MediaKind,
  signal?: AbortSignal,
) => Promise<MediaUploadResponse>;

type ImportOptions = {
  readonly upload?: Upload;
  readonly signal?: AbortSignal;
  readonly localOnly?: boolean;
};

export async function importBoardFile(
  file: File,
  options: ImportOptions = {},
): Promise<PortableBoard> {
  const { manifest, files } = await readPortableArchive(file, options);

  const mediaBlob = (path: string, mimeType: string) => {
    const bytes = files[path];

    if (bytes === undefined)
      throw new Error('An archived media file is missing.');

    return new Blob([new Uint8Array(bytes)], { type: mimeType });
  };

  if (options.localOnly) {
    if (
      manifest.board.backgroundMediaId !== undefined ||
      manifest.media.some((entry) => entry.kind !== 'image')
    ) {
      throw new Error('Sign in to import board backgrounds or uploaded audio.');
    }

    const sources = await mapArchiveEntries(
      manifest.media,
      (entry, _index, signal) =>
        blobToDataUrl(mediaBlob(entry.path, entry.mimeType), signal),
      options.signal,
    );

    const embedded = new Map(
      manifest.media.map((entry, index) => [entry.mediaId, sources[index]]),
    );

    const board: Board = {
      ...manifest.board,
      items: manifest.board.items.map((item) => {
        if (item.mediaId === undefined) return item;

        const src = embedded.get(item.mediaId);

        if (src === undefined) throw new Error('An imported image is missing.');

        return { ...item, mediaId: undefined, src };
      }),
      updatedAt: BoardTimestampSchema.make(Date.now()),
    };

    if (
      Option.isNone(Schema.decodeUnknownOption(BoardSchema)(board)) ||
      new TextEncoder().encode(JSON.stringify(board)).byteLength >
        MAX_REMOTE_BOARD_BYTES
    ) {
      throw new Error(
        'That archive is too large for the guest demo. Sign in to import it.',
      );
    }

    return { board, camera: manifest.camera };
  }

  const upload = options.upload ?? uploadMedia;

  const uploaded = await mapArchiveEntries(
    manifest.media,
    (entry, _index, signal) =>
      upload(mediaBlob(entry.path, entry.mimeType), entry.kind, signal),
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
      throw new Error('An imported media upload returned an invalid receipt.');
    }

    remapped.set(entry.mediaId, receipt.mediaId);
  });

  const remapMediaId = (mediaId: MediaId): MediaId => {
    const mapped = remapped.get(mediaId);

    if (mapped === undefined)
      throw new Error('The archive is missing a remapped media file.');

    return mapped;
  };

  const board: Board = {
    ...manifest.board,
    items: manifest.board.items.map((item) =>
      item.mediaId === undefined
        ? item
        : { ...item, mediaId: remapMediaId(item.mediaId) },
    ),
    updatedAt: BoardTimestampSchema.make(Date.now()),
  };

  if (manifest.board.backgroundMediaId !== undefined) {
    board.backgroundMediaId = remapMediaId(manifest.board.backgroundMediaId);
  }

  return { board, camera: manifest.camera };
}
