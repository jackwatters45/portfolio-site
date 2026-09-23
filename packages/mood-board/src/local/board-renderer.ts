import { Context, Effect, Layer, Match } from 'effect';

import { DEFAULT_BOARD_BACKGROUND } from '../client/board/board-background';
import { rotatedItemBounds } from '../client/board/bulk-layout';
import type { BoardItem } from '../client/board/types';
import { LocalBoardError, type PreviewImage } from './contracts';
import type { LocalDocument } from './local-archive';
import { LocalImages, type PreviewTile } from './local-images';

type RenderedBoard = {
  readonly image: PreviewImage;
  readonly warnings: ReadonlyArray<string>;
};

type Renderer = {
  readonly render: (
    document: LocalDocument,
  ) => Effect.Effect<RenderedBoard, LocalBoardError>;
};

const escapeXml = (text: string) =>
  Array.from(text.slice(0, 1200))
    .map((character) => {
      const point = character.codePointAt(0) ?? 0;

      return (point >= 32 && point <= 0xd7ff) ||
        (point >= 0xe000 && point <= 0xfffd) ||
        point >= 0x10000
        ? character
        : ' ';
    })
    .join('')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const textLines = (text: string, columns: number, rows: number) => {
  const lines: string[] = [];
  let line = '';

  for (const word of text.slice(0, 1200).split(/\s+/)) {
    for (let offset = 0; offset < word.length; offset += columns) {
      const part = word.slice(offset, offset + columns);

      if (line.length > 0 && line.length + part.length + 1 > columns) {
        lines.push(line);
        line = '';
      }

      line = line.length === 0 ? part : `${line} ${part}`;
    }
  }

  if (line.length > 0) lines.push(line);

  return lines
    .slice(0, rows)
    .map((value, index) =>
      index === rows - 1 && lines.length > rows
        ? `${value.slice(0, -1)}…`
        : value,
    );
};

const cardSvg = (item: BoardItem, width: number, height: number) => {
  const heading = Match.value(item.kind).pipe(
    Match.when('note', () => 'Field note'),
    Match.when('swatch', () => item.color ?? 'Color'),
    Match.when('image', () => 'Remote image'),
    Match.when('website', () => item.websiteSiteLabel ?? 'Website'),
    Match.when('x', () => 'X post'),
    Match.when('spotify', () => 'Spotify'),
    Match.when('youtube', () => 'YouTube'),
    Match.when('audio', () => 'Audio'),
    Match.exhaustive,
  );

  const content =
    item.text ??
    item.websiteTitle ??
    item.xPostText ??
    item.label ??
    item.annotationTitle ??
    item.src ??
    '';

  const fill = item.kind === 'swatch' ? (item.color ?? '#eeeeee') : '#f7f1e7';
  const font = Math.max(9, Math.min(24, Math.round(width / 16)));
  const padding = Math.min(16, Math.max(2, Math.round(width / 16)));

  const rows = Math.max(
    1,
    Math.floor((height - padding * 3 - font * 2) / (font * 1.4)),
  );

  const lines = textLines(
    content,
    Math.max(3, Math.floor((width - padding * 2) / (font * 0.6))),
    rows,
  );

  const top =
    item.kind === 'swatch' ? Math.max(0, height - font * 3 - padding * 2) : 0;

  const backdrop =
    item.kind === 'swatch'
      ? `<rect y="${top}" width="${width}" height="${height - top}" fill="#ffffff" fill-opacity="0.9"/>`
      : '';

  const text = lines
    .map(
      (line, index) =>
        `<text x="${padding}" y="${top + padding + font * 2.5 + index * font * 1.4}" font-size="${font}" fill="#222222">${escapeXml(line)}</text>`,
    )
    .join('');

  // Only generated markup reaches SVG decoding. User text is escaped; no links, scripts, or external image references.
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${escapeXml(fill)}"/>${backdrop}<g font-family="sans-serif"><text x="${padding}" y="${top + padding + font}" font-size="${font * 0.8}" fill="#555555">${escapeXml(heading)}</text>${text}</g></svg>`,
  );
};

export class BoardRenderer extends Context.Service<BoardRenderer, Renderer>()(
  'moodboard/local/BoardRenderer',
) {
  static readonly layer = Layer.effect(
    BoardRenderer,
    Effect.gen(function* () {
      const images = yield* LocalImages;

      const render = Effect.fn('BoardRenderer.render')(function* (
        document: LocalDocument,
      ) {
        const items = [...document.board.items].sort(
          (left, right) => left.order - right.order,
        );

        const bounds = items.map(rotatedItemBounds);

        const minX =
          bounds.length === 0 ? 0 : Math.min(...bounds.map((item) => item.x));

        const minY =
          bounds.length === 0 ? 0 : Math.min(...bounds.map((item) => item.y));

        const width =
          bounds.length === 0
            ? 960
            : Math.max(...bounds.map((item) => item.x + item.width)) - minX;

        const height =
          bounds.length === 0
            ? 576
            : Math.max(...bounds.map((item) => item.y + item.height)) - minY;

        if (
          !Number.isFinite(width) ||
          !Number.isFinite(height) ||
          width <= 0 ||
          height <= 0
        ) {
          return yield* new LocalBoardError({
            code: 'Limit',
            message:
              'Board bounds cannot be rendered. Move items closer to the origin.',
          });
        }

        const scale = Math.min(1, 1984 / Math.max(width, height));
        const warnings = new Set<string>();
        let preparedBytes = 0;

        const tiles = yield* Effect.forEach(
          items,
          (item) =>
            Effect.gen(function* () {
              const tileWidth = Math.max(1, Math.round(item.width * scale));
              const tileHeight = Math.max(1, Math.round(item.height * scale));

              const asset =
                item.mediaId === undefined
                  ? undefined
                  : document.media.get(item.mediaId);

              let bytes: Uint8Array;

              if (item.kind === 'image' && asset?.kind === 'image') {
                const prepared = yield* images.prepare(
                  asset.bytes,
                  Math.max(tileWidth, tileHeight),
                );

                bytes = prepared.bytes;
              } else {
                bytes = cardSvg(item, tileWidth, tileHeight);

                if (item.kind !== 'note' && item.kind !== 'swatch')
                  warnings.add(
                    'Remote images, links, and player cards are static placeholders. No external content was fetched or played.',
                  );
              }

              preparedBytes += bytes.length;

              if (preparedBytes > 32 * 1024 * 1024)
                return yield* new LocalBoardError({
                  code: 'Limit',
                  message:
                    'Preview inputs exceed 32 MiB. Reduce the board or preview individual photos.',
                });

              return {
                bytes,
                width: tileWidth,
                height: tileHeight,
                rotation: item.rotation,
                x: 32 + (item.x - minX) * scale,
                y: 32 + (item.y - minY) * scale,
              } satisfies PreviewTile;
            }),
          { concurrency: 1 },
        );

        const backgroundId = document.board.backgroundMediaId;

        const backgroundAsset =
          backgroundId === undefined
            ? undefined
            : document.media.get(backgroundId);

        const background =
          backgroundAsset === undefined
            ? undefined
            : yield* images.prepare(backgroundAsset.bytes, 2048);

        const image = yield* images.render(tiles, {
          width: Math.ceil(width * scale) + 64,
          height: Math.ceil(height * scale) + 64,
          background: document.board.background ?? DEFAULT_BOARD_BACKGROUND,
          backgroundImage: background?.bytes,
        });

        return { image, warnings: [...warnings] };
      });

      return BoardRenderer.of({ render });
    }),
  );
}
