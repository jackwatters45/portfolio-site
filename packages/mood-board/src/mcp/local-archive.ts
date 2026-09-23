import { Context, Effect, Layer, Schema } from 'effect';

import type { Board, Camera } from '../client/board/types';
import {
  boardMediaReferences,
  createPortableArchive,
  MAX_ARCHIVE_BYTES,
  readPortableArchive,
} from '../lib/board-archive';
import { BoardSchema } from '../lib/board-rpc';
import {
  MediaByteLengthSchema,
  type MediaId,
  type MediaKind,
  type MediaMimeType,
} from '../lib/media';
import { LocalBoardError } from './contracts';

export type LocalAsset = {
  readonly mediaId: MediaId;
  readonly kind: MediaKind;
  readonly mimeType: MediaMimeType;
  readonly bytes: Uint8Array;
  readonly width?: number;
  readonly height?: number;
};

export type LocalDocument = {
  readonly board: Board;
  readonly camera: Camera;
  readonly media: ReadonlyMap<MediaId, LocalAsset>;
};

type ArchiveCodec = {
  readonly read: (
    bytes: Uint8Array,
  ) => Effect.Effect<LocalDocument, LocalBoardError>;
  readonly encode: (
    document: LocalDocument,
  ) => Effect.Effect<Uint8Array, LocalBoardError>;
  readonly validate: (
    document: LocalDocument,
  ) => Effect.Effect<LocalDocument, LocalBoardError>;
};

export class LocalArchive extends Context.Service<LocalArchive, ArchiveCodec>()(
  'moodboard/mcp/LocalArchive',
) {
  static readonly layer = Layer.sync(LocalArchive, () => {
    const validate = Effect.fn('LocalArchive.validate')(function* (
      document: LocalDocument,
    ) {
      yield* Schema.decodeUnknownEffect(BoardSchema)(document.board).pipe(
        Effect.mapError(
          (error) =>
            new LocalBoardError({
              code: 'InvalidInput',
              message: error.message,
            }),
        ),
      );

      if (
        new Set(document.board.items.map((item) => item.id)).size !==
        document.board.items.length
      ) {
        return yield* new LocalBoardError({
          code: 'InvalidInput',
          message: 'Board item IDs must be unique.',
        });
      }

      if (
        document.board.items.some((item) =>
          item.src?.toLowerCase().startsWith('data:'),
        )
      ) {
        return yield* new LocalBoardError({
          code: 'Unsupported',
          message:
            'Use binary archive media or add_photos, not embedded image data in item JSON.',
        });
      }

      const references = yield* Effect.try({
        try: () => boardMediaReferences(document.board),
        catch: () =>
          new LocalBoardError({
            code: 'InvalidInput',
            message: 'Invalid managed media reference.',
          }),
      });

      const media = new Map<MediaId, LocalAsset>();
      let bytes = 0;

      for (const [id, kind] of references) {
        const asset = document.media.get(id);

        if (asset === undefined || asset.kind !== kind)
          return yield* new LocalBoardError({
            code: 'InvalidInput',
            message: `Media ${id} is absent or has the wrong kind. Add local media before referencing it.`,
          });

        bytes += asset.bytes.length;
        media.set(id, asset);
      }

      if (bytes > MAX_ARCHIVE_BYTES)
        return yield* new LocalBoardError({
          code: 'Limit',
          message:
            'Referenced media exceeds 50 MiB. Remove some items or reduce media size.',
        });

      // Keep only referenced assets in each revision. Older archives retain assets needed for undo.
      return { ...document, media };
    });

    const read = Effect.fn('LocalArchive.read')(function* (bytes: Uint8Array) {
      // Keep the action permit until ZIP work and non-abortable digest operations settle.
      const decoded = yield* Effect.tryPromise({
        try: (signal) =>
          readPortableArchive(new Blob([new Uint8Array(bytes)]), { signal }),
        catch: (cause) =>
          new LocalBoardError({
            code: 'Archive',
            message:
              cause instanceof Error ? cause.message : 'Invalid archive.',
          }),
      }).pipe(Effect.uninterruptible);

      const media = new Map<MediaId, LocalAsset>();

      for (const entry of decoded.manifest.media) {
        const assetBytes = decoded.files[entry.path];

        if (assetBytes === undefined)
          return yield* new LocalBoardError({
            code: 'Archive',
            message: 'Archived media is missing.',
          });

        media.set(entry.mediaId, {
          mediaId: entry.mediaId,
          kind: entry.kind,
          mimeType: entry.mimeType,
          bytes: assetBytes,
        });
      }

      return yield* validate({
        board: decoded.manifest.board,
        camera: decoded.manifest.camera,
        media,
      });
    });

    const encode = Effect.fn('LocalArchive.encode')(function* (
      document: LocalDocument,
    ) {
      const valid = yield* validate(document);

      return yield* Effect.tryPromise({
        try: async (signal) => {
          const blob = await createPortableArchive(valid.board, valid.camera, {
            signal,
            download: async (id) => {
              const asset = valid.media.get(id);

              if (asset === undefined)
                throw new Error('Referenced media is missing.');

              return {
                blob: new Blob([new Uint8Array(asset.bytes)], {
                  type: asset.mimeType,
                }),
                mimeType: asset.mimeType,
                byteLength: MediaByteLengthSchema.make(asset.bytes.length),
              };
            },
          });

          await readPortableArchive(blob, { signal });

          return new Uint8Array(await blob.arrayBuffer());
        },
        catch: (cause) =>
          new LocalBoardError({
            code: 'Archive',
            message:
              cause instanceof Error
                ? cause.message
                : 'Archive creation failed.',
          }),
      }).pipe(Effect.uninterruptible);
    });

    return LocalArchive.of({ read, encode, validate });
  });
}
