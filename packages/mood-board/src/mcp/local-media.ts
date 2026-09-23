import { Context, Effect, Layer } from 'effect';

import { MAX_ARCHIVE_BYTES } from '../lib/board-archive';
import { PREPARED_IMAGE_LONGEST_EDGE } from '../lib/image-preflight';
import {
  hasValidMediaMagic,
  MediaIdSchema,
  type MediaMimeType,
} from '../lib/media';
import {
  LocalBoardError,
  type AssetInfo,
  type AssetKind,
  type AssetReference,
  type PreviewPhotosRequest,
  type ScanRequest,
  type ScanOutput,
  type VisualResult,
} from './contracts';
import { LocalArchive, type LocalAsset } from './local-archive';
import { contentHash, LocalFiles, type SourceBudget } from './local-files';
import { LocalImages, type PreviewTile } from './local-images';

export type PreparedImage = LocalAsset & {
  readonly kind: 'image';
  readonly width: number;
  readonly height: number;
};

type MediaPreparation = {
  readonly scan: (
    input: ScanRequest,
  ) => Effect.Effect<typeof ScanOutput.Type, LocalBoardError>;
  readonly readReference: (
    source: AssetReference,
    kind: AssetKind,
    budget: SourceBudget,
  ) => Effect.Effect<Uint8Array, LocalBoardError>;
  readonly photo: (
    source: AssetReference,
    budget: SourceBudget,
    longestEdge?: number,
  ) => Effect.Effect<PreparedImage, LocalBoardError>;
  readonly photoBytes: (
    bytes: Uint8Array,
    longestEdge?: number,
  ) => Effect.Effect<PreparedImage, LocalBoardError>;
  readonly audio: (
    source: AssetReference,
    budget: SourceBudget,
  ) => Effect.Effect<LocalAsset, LocalBoardError>;
  readonly preview: (
    input: PreviewPhotosRequest,
  ) => Effect.Effect<VisualResult, LocalBoardError>;
};

const audioMime = (path: string, bytes: Uint8Array) => {
  const types = new Map<string, MediaMimeType>([
    ['mp3', 'audio/mpeg'],
    ['m4a', 'audio/mp4'],
    ['mp4', 'audio/mp4'],
    ['wav', 'audio/wav'],
    ['ogg', 'audio/ogg'],
    ['oga', 'audio/ogg'],
    ['webm', 'audio/webm'],
  ]);

  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  const mime = types.get(extension);

  return mime !== undefined && hasValidMediaMagic('audio', mime, bytes)
    ? mime
    : undefined;
};

export class LocalMedia extends Context.Service<LocalMedia, MediaPreparation>()(
  'moodboard/mcp/LocalMedia',
) {
  static readonly layer = Layer.effect(
    LocalMedia,
    Effect.gen(function* () {
      const files = yield* LocalFiles;
      const images = yield* LocalImages;
      const archives = yield* LocalArchive;

      const readReference = Effect.fn('LocalMedia.readReference')(function* (
        source: AssetReference,
        kind: AssetKind,
        budget: SourceBudget,
      ) {
        const bytes = yield* files.readAsset(source.path, kind, budget);

        if (contentHash(bytes) !== source.sha256)
          return yield* new LocalBoardError({
            code: 'Changed',
            message: `${source.path} changed. Scan it again.`,
          });

        return bytes;
      });

      const photoBytes = Effect.fn('LocalMedia.photoBytes')(function* (
        bytes: Uint8Array,
        longestEdge = PREPARED_IMAGE_LONGEST_EDGE,
      ) {
        const image = yield* images.prepare(bytes, longestEdge);

        return {
          ...image,
          mediaId: MediaIdSchema.make(contentHash(image.bytes).slice(0, 32)),
          kind: 'image' as const,
          mimeType: 'image/webp' as const,
        };
      });

      const photo = Effect.fn('LocalMedia.photo')(function* (
        source: AssetReference,
        budget: SourceBudget,
        longestEdge = PREPARED_IMAGE_LONGEST_EDGE,
      ) {
        return yield* photoBytes(
          yield* readReference(source, 'image', budget),
          longestEdge,
        );
      });

      const audio = Effect.fn('LocalMedia.audio')(function* (
        source: AssetReference,
        budget: SourceBudget,
      ) {
        const bytes = yield* readReference(source, 'audio', budget);
        const mimeType = audioMime(source.path, bytes);

        if (mimeType === undefined)
          return yield* new LocalBoardError({
            code: 'Unsupported',
            message:
              'Audio extension and file signature must match an accepted MP3, M4A/MP4, WAV, Ogg, or WebM format.',
          });

        return {
          mediaId: MediaIdSchema.make(contentHash(bytes).slice(0, 32)),
          kind: 'audio' as const,
          mimeType,
          bytes,
        };
      });

      const scan = Effect.fn('LocalMedia.scan')(function* (input: ScanRequest) {
        const listing = yield* files.list(input);
        const assets: AssetInfo[] = [];
        const failures = [...listing.failures];
        const budget: SourceBudget = { used: 0 };
        const kind = input.kind ?? 'image';

        for (const path of listing.paths) {
          yield* Effect.gen(function* () {
            const bytes = yield* files.readAsset(path, kind, budget);

            const reference = {
              path,
              sha256: contentHash(bytes),
              kind,
              byteLength: bytes.length,
            };

            if (kind === 'image') {
              const metadata = yield* images.inspect(bytes);
              assets.push({
                ...reference,
                mimeType: `image/${metadata.format}`,
                width: metadata.width,
                height: metadata.height,
              });
            } else if (kind === 'audio') {
              const mimeType = audioMime(path, bytes);

              if (mimeType === undefined)
                return yield* new LocalBoardError({
                  code: 'Unsupported',
                  message: 'Audio extension and signature do not match.',
                });

              assets.push({ ...reference, mimeType });
            } else {
              yield* archives.read(bytes);
              assets.push({
                ...reference,
                mimeType: 'application/vnd.moodboard+zip',
              });
            }
          }).pipe(
            Effect.catchTag('LocalBoardError', (error) =>
              Effect.sync(() => {
                failures.push({
                  path,
                  code: error.code,
                  message: error.message,
                });
              }),
            ),
          );
        }

        return {
          assets,
          failures,
          visited: listing.visited,
          truncated: listing.truncated || listing.limits.length > 0,
          limits: listing.limits,
        };
      });

      const preview = Effect.fn('LocalMedia.preview')(function* (
        input: PreviewPhotosRequest,
      ) {
        yield* files.checkOutput(
          input.output,
          '.jpg',
          input.overwrite ?? false,
        );
        const budget: SourceBudget = { used: 0 };
        const single = input.photos.length === 1;
        let preparedBytes = 0;

        const photos = yield* Effect.forEach(
          input.photos,
          (source) =>
            Effect.gen(function* () {
              const image = yield* photo(source, budget, single ? 1600 : 320);
              preparedBytes += image.bytes.length;

              if (preparedBytes > MAX_ARCHIVE_BYTES)
                return yield* new LocalBoardError({
                  code: 'Limit',
                  message: 'Preview inputs exceed 50 MiB.',
                });

              return image;
            }),
          { concurrency: 1 },
        );

        const columns = Math.min(4, photos.length);

        const tiles = photos.map((image, index): PreviewTile => {
          const scale = single
            ? 1
            : Math.min(300 / image.width, 216 / image.height);

          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));

          return {
            bytes: image.bytes,
            width,
            height,
            x: single
              ? 0
              : (index % columns) * 320 + Math.floor((320 - width) / 2),
            y: single
              ? 0
              : Math.floor(index / columns) * 240 +
                Math.floor((240 - height) / 2),
            label: index + 1,
          };
        });

        const first = tiles[0];

        if (first === undefined)
          return yield* new LocalBoardError({
            code: 'InvalidInput',
            message: 'Select at least one photo.',
          });

        const image = yield* images.render(tiles, {
          width: single ? first.width : columns * 320,
          height: single
            ? first.height
            : Math.ceil(tiles.length / columns) * 240,
          background: '#eeeeee',
        });

        const output = yield* files.writeOutput(
          input.output,
          '.jpg',
          image.bytes,
          input.overwrite ?? false,
        );

        return {
          value: {
            output,
            mimeType: 'image/jpeg' as const,
            width: image.width,
            height: image.height,
            byteLength: image.bytes.length,
            warnings: [],
          },
          image,
        };
      });

      return LocalMedia.of({
        scan,
        readReference,
        photo,
        photoBytes,
        audio,
        preview,
      });
    }),
  );
}
