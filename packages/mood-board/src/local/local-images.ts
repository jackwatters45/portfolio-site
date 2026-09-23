import { Context, Effect, Layer } from 'effect';
import sharp, { type Sharp } from 'sharp';

import {
  MAX_SOURCE_IMAGE_PIXELS,
  PREPARED_IMAGE_LONGEST_EDGE,
  preflightImageBytes,
  validateImageLimits,
  type ImagePreflight,
} from '../lib/image-preflight';
import { hasValidMediaMagic, MAX_IMAGE_UPLOAD_BYTES } from '../lib/media';
import {
  LocalBoardError,
  MAX_PREVIEW_BYTES,
  type PreviewImage,
} from './contracts';

export type PreparedPhoto = PreviewImage;

export type PreviewTile = PreviewImage & {
  readonly x: number;
  readonly y: number;
  readonly label?: number;
  readonly rotation?: number;
};

type PreviewCanvas = {
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly backgroundImage?: Uint8Array;
};

type ImageAdapter = {
  readonly inspect: (
    bytes: Uint8Array,
  ) => Effect.Effect<ImagePreflight, LocalBoardError>;
  readonly prepare: (
    bytes: Uint8Array,
    longestEdge: number,
  ) => Effect.Effect<PreparedPhoto, LocalBoardError>;
  readonly render: (
    tiles: ReadonlyArray<PreviewTile>,
    canvas: PreviewCanvas,
  ) => Effect.Effect<PreviewImage, LocalBoardError>;
};

const decodingError = () =>
  new LocalBoardError({
    code: 'Decode',
    message:
      'Image decoding failed or timed out. It may be corrupt or use an unavailable codec (notably HEIC). Convert a copy to JPEG or PNG.',
  });

// Hold the request permit until native libvips work settles. Interruption cannot stop native work immediately.
const decode = Effect.fn('LocalImages.decode')(
  <A>(pipeline: Sharp, finish: (image: Sharp) => Promise<A>) =>
    Effect.acquireUseRelease(
      Effect.succeed(pipeline.timeout({ seconds: 15 })),
      (image) =>
        Effect.tryPromise({
          try: () => finish(image),
          catch: decodingError,
        }).pipe(Effect.uninterruptible),
      (image) =>
        Effect.sync(() => {
          image.destroy();
        }),
    ),
);

export class LocalImages extends Context.Service<LocalImages, ImageAdapter>()(
  'moodboard/local/LocalImages',
) {
  static readonly layer = Layer.effect(
    LocalImages,
    Effect.gen(function* () {
      yield* Effect.sync(() => {
        sharp.cache(false);
        sharp.concurrency(1);
      });

      const inspect = Effect.fn('LocalImages.inspect')(function* (
        bytes: Uint8Array,
      ) {
        const header = yield* Effect.try({
          try: () => preflightImageBytes(bytes),
          catch: (cause) =>
            new LocalBoardError({
              code: 'Unsupported',
              message:
                cause instanceof Error
                  ? cause.message
                  : 'Invalid image header.',
            }),
        });

        const mimeTypes = {
          jpeg: 'image/jpeg',
          png: 'image/png',
          gif: 'image/gif',
          webp: 'image/webp',
          heic: undefined,
        } as const;

        const mimeType = mimeTypes[header.format];

        if (
          mimeType !== undefined &&
          !hasValidMediaMagic('image', mimeType, bytes)
        ) {
          return yield* new LocalBoardError({
            code: 'Unsupported',
            message: 'Image signature does not match its detected format.',
          });
        }

        const metadata = yield* decode(
          sharp(bytes, {
            limitInputPixels: MAX_SOURCE_IMAGE_PIXELS,
            failOn: 'warning',
            pages: 1,
          }),
          (image) => image.metadata(),
        );

        const dimensions = yield* Effect.try({
          try: () =>
            validateImageLimits(
              {
                type: header.format,
                width: metadata.width,
                height: metadata.height,
              },
              bytes.length,
            ),
          catch: (cause) =>
            new LocalBoardError({
              code: 'Limit',
              message:
                cause instanceof Error
                  ? cause.message
                  : 'Image dimensions exceed limits.',
            }),
        });

        if (
          dimensions.width !== header.width ||
          dimensions.height !== header.height
        ) {
          return yield* new LocalBoardError({
            code: 'Unsupported',
            message: 'Decoder dimensions do not match the image header.',
          });
        }

        return metadata.orientation !== undefined && metadata.orientation >= 5
          ? { ...header, width: header.height, height: header.width }
          : header;
      });

      const prepare = Effect.fn('LocalImages.prepare')(function* (
        bytes: Uint8Array,
        longestEdge: number,
      ) {
        yield* inspect(bytes);
        const edge = Math.min(PREPARED_IMAGE_LONGEST_EDGE, longestEdge);

        // Sharp strips EXIF, XMP, GPS and ICC by default; orientation is applied before resizing.
        const result = yield* decode(
          sharp(bytes, {
            limitInputPixels: MAX_SOURCE_IMAGE_PIXELS,
            failOn: 'warning',
            pages: 1,
          })
            .rotate()
            .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
            .toColourspace('srgb')
            .webp({ quality: 88 }),
          (image) => image.toBuffer({ resolveWithObject: true }),
        );

        if (
          result.data.length > MAX_IMAGE_UPLOAD_BYTES ||
          !hasValidMediaMagic('image', 'image/webp', result.data)
        ) {
          return yield* new LocalBoardError({
            code: 'Limit',
            message: 'Prepared image exceeds the 12 MiB media limit.',
          });
        }

        return {
          bytes: result.data,
          width: result.info.width,
          height: result.info.height,
        };
      });

      const render = Effect.fn('LocalImages.render')(function* (
        tiles: ReadonlyArray<PreviewTile>,
        canvas: PreviewCanvas,
      ) {
        if (
          canvas.width < 1 ||
          canvas.height < 1 ||
          canvas.width > 2048 ||
          canvas.height > 2048
        ) {
          return yield* new LocalBoardError({
            code: 'Limit',
            message: 'Preview canvas must fit within 2048 by 2048 pixels.',
          });
        }

        if (
          tiles.reduce((total, tile) => {
            const angle = ((tile.rotation ?? 0) * Math.PI) / 180;

            const width =
              Math.abs(tile.width * Math.cos(angle)) +
              Math.abs(tile.height * Math.sin(angle));

            const height =
              Math.abs(tile.width * Math.sin(angle)) +
              Math.abs(tile.height * Math.cos(angle));

            return total + width * height;
          }, 0) > 24_000_000
        ) {
          return yield* new LocalBoardError({
            code: 'Limit',
            message:
              'Preview tiles exceed 24 megapixels. Reduce large overlapping photos.',
          });
        }

        let overlayBytes = 0;

        const overlays = yield* Effect.forEach(
          tiles,
          (tile) =>
            Effect.gen(function* () {
              const resized = yield* decode(
                sharp(tile.bytes, { limitInputPixels: MAX_SOURCE_IMAGE_PIXELS })
                  .resize(tile.width, tile.height, { fit: 'cover' })
                  .png(),
                (image) => image.toBuffer(),
              );

              const rotated = yield* decode(
                sharp(resized)
                  .rotate(tile.rotation ?? 0, {
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                  })
                  .png(),
                (image) => image.toBuffer({ resolveWithObject: true }),
              );

              overlayBytes += rotated.data.length;

              if (overlayBytes > 32 * 1024 * 1024)
                return yield* new LocalBoardError({
                  code: 'Limit',
                  message: 'Preview tiles exceed 32 MiB. Select fewer photos.',
                });

              return {
                input: rotated.data,
                left: Math.round(
                  tile.x + (tile.width - rotated.info.width) / 2,
                ),
                top: Math.round(
                  tile.y + (tile.height - rotated.info.height) / 2,
                ),
              };
            }),
          { concurrency: 1 },
        );

        const labels = tiles.flatMap((tile) =>
          tile.label === undefined
            ? []
            : [
                `<rect x="${tile.x}" y="${tile.y}" width="40" height="28" fill="#111"/><text x="${tile.x + 20}" y="${tile.y + 20}" text-anchor="middle" font-size="18" font-family="sans-serif" fill="white">${tile.label}</text>`,
              ],
        );

        if (labels.length > 0)
          overlays.push({
            input: Buffer.from(
              `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">${labels.join('')}</svg>`,
            ),
            left: 0,
            top: 0,
          });

        if (canvas.backgroundImage !== undefined) {
          const background = yield* decode(
            sharp(canvas.backgroundImage, {
              limitInputPixels: MAX_SOURCE_IMAGE_PIXELS,
            })
              .resize(canvas.width, canvas.height, { fit: 'cover' })
              .png(),
            (image) => image.toBuffer(),
          );

          overlays.unshift({ input: background, left: 0, top: 0 });
        }

        const result = yield* decode(
          sharp({
            create: {
              width: canvas.width,
              height: canvas.height,
              background: canvas.background,
              channels: 3,
            },
          })
            .composite(overlays)
            .jpeg({ quality: 82 }),
          (image) => image.toBuffer({ resolveWithObject: true }),
        );

        if (result.data.length > MAX_PREVIEW_BYTES)
          return yield* new LocalBoardError({
            code: 'Limit',
            message: 'Preview exceeds 4 MiB. Preview fewer photos.',
          });

        return {
          bytes: result.data,
          width: result.info.width,
          height: result.info.height,
        };
      });

      return LocalImages.of({ inspect, prepare, render });
    }),
  );
}
