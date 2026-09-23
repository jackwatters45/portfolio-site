import { Clock, Context, Effect, Layer, Option, Semaphore } from 'effect';

import {
  layoutBulkImages,
  placeLayoutWithoutOverlap,
  type LayoutResult,
} from '../client/board/bulk-layout';
import { fitCamera } from '../client/board/camera';
import type { BoardItem } from '../client/board/types';
import {
  MIN_AUDIO_CARD_WIDTH,
  NATIVE_AUDIO_CARD_HEIGHT,
  minimumAudioCardHeight,
} from '../lib/audio-card-layout';
import { MAX_ARCHIVE_BYTES } from '../lib/board-archive';
import {
  BoardTimestampSchema,
  ItemIdSchema,
  MAX_REMOTE_ITEMS,
  type ItemId,
} from '../lib/board-rpc';
import { MediaByteLengthSchema, type MediaId } from '../lib/media';
import {
  MIN_WEBSITE_CARD_HEIGHT,
  MIN_WEBSITE_CARD_WIDTH,
} from '../lib/website-preview';
import { MIN_X_CARD_HEIGHT, MIN_X_CARD_WIDTH } from '../lib/x-post';
import { BoardRenderer } from './board-renderer';
import {
  LocalBoardError,
  type AddAudioRequest,
  type AddPhotosRequest,
  type BoardOutput,
  type BoardReference,
  type CreateBoardRequest,
  type DeleteBoardRequest,
  type DuplicateBoardRequest,
  type EditBoardRequest,
  type ExportBoardRequest,
  type GetBoardRequest,
  type ImportBoardRequest,
  type LayoutItemsRequest,
  type ListBoardsOutput,
  type PreviewBoardRequest,
  type PreviewPhotosRequest,
  type RevisionResult,
  type ScanOutput,
  type ScanRequest,
  type SetBackgroundRequest,
  type VisualResult,
} from './contracts';
import {
  LocalArchive,
  type LocalAsset,
  type LocalDocument,
} from './local-archive';
import { contentHash, LocalFiles, type SourceBudget } from './local-files';
import { LocalMedia } from './local-media';

type MoodboardActions = {
  readonly scan: (
    input: ScanRequest,
  ) => Effect.Effect<typeof ScanOutput.Type, LocalBoardError>;
  readonly previewPhotos: (
    input: PreviewPhotosRequest,
  ) => Effect.Effect<VisualResult, LocalBoardError>;
  readonly list: () => Effect.Effect<
    typeof ListBoardsOutput.Type,
    LocalBoardError
  >;
  readonly get: (
    input: GetBoardRequest,
  ) => Effect.Effect<typeof BoardOutput.Type, LocalBoardError>;
  readonly create: (
    input: CreateBoardRequest,
  ) => Effect.Effect<RevisionResult, LocalBoardError>;
  readonly edit: (
    input: EditBoardRequest,
  ) => Effect.Effect<RevisionResult, LocalBoardError>;
  readonly addPhotos: (
    input: AddPhotosRequest,
  ) => Effect.Effect<RevisionResult, LocalBoardError>;
  readonly addAudio: (
    input: AddAudioRequest,
  ) => Effect.Effect<RevisionResult, LocalBoardError>;
  readonly setBackground: (
    input: SetBackgroundRequest,
  ) => Effect.Effect<RevisionResult, LocalBoardError>;
  readonly layout: (
    input: LayoutItemsRequest,
  ) => Effect.Effect<RevisionResult, LocalBoardError>;
  readonly importBoard: (
    input: ImportBoardRequest,
  ) => Effect.Effect<RevisionResult, LocalBoardError>;
  readonly duplicate: (
    input: DuplicateBoardRequest,
  ) => Effect.Effect<RevisionResult, LocalBoardError>;
  readonly previewBoard: (
    input: PreviewBoardRequest,
  ) => Effect.Effect<VisualResult, LocalBoardError>;
  readonly exportBoard: (
    input: ExportBoardRequest,
  ) => Effect.Effect<RevisionResult, LocalBoardError>;
  readonly deleteBoard: (
    input: DeleteBoardRequest,
  ) => Effect.Effect<{ deleted: BoardReference }, LocalBoardError>;
};

const unique = (ids: ReadonlyArray<string>) => new Set(ids).size === ids.length;

const newId = () => ItemIdSchema.make(crypto.randomUUID());

const nextOrder = (items: ReadonlyArray<BoardItem>) =>
  Math.max(-1, ...items.map((item) => item.order)) + 1;

const minimumSize = (item: BoardItem) => {
  if (
    item.kind === 'audio' ||
    item.kind === 'spotify' ||
    item.kind === 'youtube'
  )
    return {
      width: MIN_AUDIO_CARD_WIDTH,
      height: minimumAudioCardHeight(item.kind),
    };

  if (item.kind === 'website')
    return { width: MIN_WEBSITE_CARD_WIDTH, height: MIN_WEBSITE_CARD_HEIGHT };

  if (item.kind === 'x')
    return { width: MIN_X_CARD_WIDTH, height: MIN_X_CARD_HEIGHT };

  return { width: 80, height: 80 };
};

const sizedLayout = (
  sources: ReadonlyArray<BoardItem>,
  kind: 'loose' | 'contact' | 'masonry',
): LayoutResult => {
  const result = layoutBulkImages(sources, kind);

  const sizes = new Map(
    sources.map((source) => [source.id, minimumSize(source)]),
  );

  const factor = Math.max(
    1,
    ...result.items.map((item) => {
      const minimum = sizes.get(ItemIdSchema.make(item.id));

      return minimum === undefined
        ? 1
        : Math.max(minimum.width / item.width, minimum.height / item.height);
    }),
  );

  return {
    items: result.items.map((item) => ({
      ...item,
      x: item.x * factor,
      y: item.y * factor,
      width: item.width * factor,
      height: item.height * factor,
    })),
    bounds: {
      x: 0,
      y: 0,
      width: result.bounds.width * factor,
      height: result.bounds.height * factor,
    },
  };
};

export class Moodboards extends Context.Service<Moodboards, MoodboardActions>()(
  'moodboard/local/Moodboards',
) {
  static readonly layer = Layer.effect(
    Moodboards,
    Effect.gen(function* () {
      const files = yield* LocalFiles;
      const media = yield* LocalMedia;
      const archives = yield* LocalArchive;
      const renderer = yield* BoardRenderer;
      const permit = yield* Semaphore.make(1);

      const exclusive = Effect.fn('Moodboards.exclusive')(function* <A>(
        work: Effect.Effect<A, LocalBoardError>,
      ) {
        const result = yield* permit.withPermitsIfAvailable(1)(work);

        if (Option.isNone(result))
          return yield* new LocalBoardError({
            code: 'Busy',
            message:
              'Another action is running. Wait for it to finish, then retry.',
          });

        return result.value;
      });

      const load = Effect.fn('Moodboards.load')(function* (
        reference: GetBoardRequest,
      ) {
        const bytes = yield* files.readBoard(reference.file);
        const sha256 = contentHash(bytes);

        if (reference.sha256 !== undefined && reference.sha256 !== sha256)
          return yield* new LocalBoardError({
            code: 'Changed',
            message:
              'Board archive changed. Call get_board and review it before editing.',
          });

        return {
          document: yield* archives.read(bytes),
          reference: { file: reference.file, sha256 },
          bytes,
        };
      });

      const receipt = (
        document: LocalDocument,
        file: string,
        output: string,
        bytes: Uint8Array,
        previous: BoardReference | undefined,
        addedItemIds: ReadonlyArray<ItemId>,
      ): RevisionResult => ({
        board: { file, sha256: contentHash(bytes) },
        output,
        title: document.board.title,
        byteLength: bytes.length,
        itemCount: document.board.items.length,
        mediaCount: document.media.size,
        previous,
        addedItemIds,
      });

      const save = Effect.fn('Moodboards.save')(function* (
        document: LocalDocument,
        file: string,
        previous?: BoardReference,
        addedItemIds: ReadonlyArray<ItemId> = [],
      ) {
        yield* files.checkOutput(file, '.moodboard', false);

        const checked = yield* archives.validate({
          ...document,
          board: {
            ...document.board,
            updatedAt: BoardTimestampSchema.make(
              yield* Clock.currentTimeMillis,
            ),
          },
        });

        const bytes = yield* archives.encode(checked);

        const output = yield* files.writeOutput(
          file,
          '.moodboard',
          bytes,
          false,
        );

        return receipt(checked, file, output, bytes, previous, addedItemIds);
      });

      const putAsset = Effect.fn('Moodboards.putAsset')(function* (
        assets: Map<MediaId, LocalAsset>,
        asset: LocalAsset,
      ) {
        const existing = assets.get(asset.mediaId);

        if (
          existing !== undefined &&
          (existing.kind !== asset.kind ||
            contentHash(existing.bytes) !== contentHash(asset.bytes))
        ) {
          return yield* new LocalBoardError({
            code: 'InvalidInput',
            message: 'Media identity collision. Choose another source.',
          });
        }

        assets.set(asset.mediaId, asset);

        if (
          [...assets.values()].reduce(
            (sum, value) => sum + value.bytes.length,
            0,
          ) > MAX_ARCHIVE_BYTES
        ) {
          return yield* new LocalBoardError({
            code: 'Limit',
            message:
              'Board media exceeds 50 MiB. Remove some media before adding more.',
          });
        }
      });

      const place = Effect.fn('Moodboards.place')(function* (
        items: ReadonlyArray<BoardItem>,
        kind: 'loose' | 'contact' | 'masonry',
        anchor: { readonly x: number; readonly y: number },
        obstacles: ReadonlyArray<BoardItem>,
      ) {
        return yield* Effect.try({
          try: () =>
            placeLayoutWithoutOverlap(
              sizedLayout(items, kind),
              anchor,
              obstacles,
            ),
          catch: (cause) =>
            new LocalBoardError({
              code: 'InvalidInput',
              message:
                cause instanceof Error
                  ? `${cause.message} Use contact layout or explicit transforms.`
                  : 'Layout failed.',
            }),
        });
      });

      const get = Effect.fn('Moodboards.get')(function* (
        input: GetBoardRequest,
      ) {
        const loaded = yield* load(input);

        return {
          reference: loaded.reference,
          document: loaded.document.board,
          camera: loaded.document.camera,
          media: [...loaded.document.media.values()].map((asset) => ({
            mediaId: asset.mediaId,
            kind: asset.kind,
            mimeType: asset.mimeType,
            byteLength: MediaByteLengthSchema.make(asset.bytes.length),
          })),
        };
      });

      const create = Effect.fn('Moodboards.create')(function* (
        input: CreateBoardRequest,
      ) {
        const items = (input.items ?? []).map((item) => ({ ...item }));

        const board = {
          version: 1 as const,
          title: input.title,
          background: input.background,
          items,
          updatedAt: BoardTimestampSchema.make(yield* Clock.currentTimeMillis),
        };

        return yield* save(
          {
            board,
            camera: fitCamera(items, { width: 1440, height: 900 }),
            media: new Map(),
          },
          input.output,
          undefined,
          items.map((item) => item.id),
        );
      });

      const edit = Effect.fn('Moodboards.edit')(function* (
        input: EditBoardRequest,
      ) {
        yield* files.checkOutput(input.output, '.moodboard', false);
        const loaded = yield* load(input.board);
        const current = loaded.document;

        const items = new Map(
          current.board.items.map((item) => [item.id, item]),
        );

        const addedItemIds: ItemId[] = [];
        const upserts = input.upserts ?? [];
        const deletes = input.deletes ?? [];
        const transforms = input.transforms ?? [];
        const duplicates = input.duplicates ?? [];

        if (
          !unique(upserts.map((item) => item.id)) ||
          !unique(deletes) ||
          !unique(transforms.map((item) => item.id)) ||
          !unique(duplicates.map((item) => item.newId))
        ) {
          return yield* new LocalBoardError({
            code: 'InvalidInput',
            message: 'An operation repeats an item ID.',
          });
        }

        if (upserts.some((item) => deletes.includes(item.id)))
          return yield* new LocalBoardError({
            code: 'InvalidInput',
            message: 'Do not delete and upsert the same item in one edit.',
          });

        if (
          upserts.length +
            deletes.length +
            transforms.length +
            duplicates.length ===
            0 &&
          input.title === undefined &&
          input.background === undefined &&
          input.backgroundMediaId === undefined &&
          input.camera === undefined &&
          input.fitCamera !== true
        ) {
          return yield* new LocalBoardError({
            code: 'InvalidInput',
            message: 'Supply at least one board change.',
          });
        }

        if (input.camera !== undefined && input.fitCamera === true) {
          return yield* new LocalBoardError({
            code: 'InvalidInput',
            message: 'Supply camera or fitCamera:true, not both.',
          });
        }

        for (const id of deletes) {
          if (!items.delete(id))
            return yield* new LocalBoardError({
              code: 'NotFound',
              message: `Item ${id} does not exist.`,
            });
        }

        for (const item of upserts) {
          if (!items.has(item.id)) addedItemIds.push(item.id);
          items.set(item.id, { ...item });
        }

        for (const transform of transforms) {
          const item = items.get(transform.id);

          if (item === undefined)
            return yield* new LocalBoardError({
              code: 'NotFound',
              message: `Item ${transform.id} does not exist.`,
            });

          items.set(item.id, { ...item, ...transform });
        }

        for (const duplicate of duplicates) {
          const source = items.get(duplicate.id);

          if (source === undefined)
            return yield* new LocalBoardError({
              code: 'NotFound',
              message: `Item ${duplicate.id} does not exist.`,
            });

          if (items.has(duplicate.newId))
            return yield* new LocalBoardError({
              code: 'InvalidInput',
              message: `Item ${duplicate.newId} already exists.`,
            });

          items.set(duplicate.newId, {
            ...source,
            id: duplicate.newId,
            x: source.x + (duplicate.dx ?? 32),
            y: source.y + (duplicate.dy ?? 32),
            order: nextOrder([...items.values()]),
          });
          addedItemIds.push(duplicate.newId);
        }

        const board = {
          ...current.board,
          items: [...items.values()],
          title: input.title ?? current.board.title,
          background:
            input.background === undefined
              ? current.board.background
              : (input.background ?? undefined),
          backgroundMediaId:
            input.backgroundMediaId === undefined
              ? current.board.backgroundMediaId
              : (input.backgroundMediaId ?? undefined),
        };

        return yield* save(
          {
            ...current,
            board,
            camera:
              input.fitCamera === true
                ? fitCamera(board.items, { width: 1440, height: 900 })
                : (input.camera ?? current.camera),
          },
          input.output,
          loaded.reference,
          addedItemIds,
        );
      });

      const addPhotos = Effect.fn('Moodboards.addPhotos')(function* (
        input: AddPhotosRequest,
      ) {
        yield* files.checkOutput(input.output, '.moodboard', false);
        const loaded = yield* load(input.board);
        const assets = new Map(loaded.document.media);
        const budget: SourceBudget = { used: 0 };
        const firstOrder = nextOrder(loaded.document.board.items);

        if (
          loaded.document.board.items.length + input.photos.length >
          MAX_REMOTE_ITEMS
        ) {
          return yield* new LocalBoardError({
            code: 'Limit',
            message:
              'Adding these photos would exceed the 500-item board limit.',
          });
        }

        if (!unique(input.photos.map((source) => source.path)))
          return yield* new LocalBoardError({
            code: 'InvalidInput',
            message:
              'Select each photo path once, then use edit_board duplicates for copies.',
          });

        if (
          input.layout.kind === 'explicit' &&
          input.layout.positions.length !== input.photos.length
        )
          return yield* new LocalBoardError({
            code: 'InvalidInput',
            message: 'Provide one explicit position per photo, in photo order.',
          });

        const items = yield* Effect.forEach(
          input.photos,
          (source, index) =>
            Effect.gen(function* () {
              const photo = yield* media.photo(source, budget);
              yield* putAsset(assets, photo);

              return {
                id: newId(),
                kind: 'image' as const,
                mediaId: photo.mediaId,
                x: 0,
                y: 0,
                width: photo.width,
                height: photo.height,
                rotation: 0,
                order: firstOrder + index,
              };
            }),
          { concurrency: 1 },
        );

        const positions =
          input.layout.kind === 'explicit'
            ? input.layout.positions
            : (yield* place(
                items,
                input.layout.kind,
                input.layout.anchor ?? { x: 0, y: 0 },
                loaded.document.board.items,
              )).items;

        const added = yield* Effect.forEach(items, (item, index) =>
          Effect.gen(function* () {
            const position = positions[index];

            if (position === undefined)
              return yield* new LocalBoardError({
                code: 'InvalidInput',
                message: 'Missing photo position.',
              });

            return {
              ...item,
              x: position.x,
              y: position.y,
              width: position.width,
              height: position.height,
            };
          }),
        );

        const board = {
          ...loaded.document.board,
          items: [...loaded.document.board.items, ...added],
        };

        return yield* save(
          {
            board,
            media: assets,
            camera: fitCamera(board.items, { width: 1440, height: 900 }),
          },
          input.output,
          loaded.reference,
          added.map((item) => item.id),
        );
      });

      const addAudio = Effect.fn('Moodboards.addAudio')(function* (
        input: AddAudioRequest,
      ) {
        yield* files.checkOutput(input.output, '.moodboard', false);
        const loaded = yield* load(input.board);

        if (loaded.document.board.items.length >= MAX_REMOTE_ITEMS) {
          return yield* new LocalBoardError({
            code: 'Limit',
            message:
              'This board already has 500 items. Remove an item before adding audio.',
          });
        }

        const asset = yield* media.audio(input.source, { used: 0 });
        const assets = new Map(loaded.document.media);
        yield* putAsset(assets, asset);

        const item = {
          id: newId(),
          kind: 'audio' as const,
          mediaId: asset.mediaId,
          label: input.label,
          x: input.x,
          y: input.y,
          width: MIN_AUDIO_CARD_WIDTH,
          height: NATIVE_AUDIO_CARD_HEIGHT,
          rotation: 0,
          order: nextOrder(loaded.document.board.items),
        };

        const board = {
          ...loaded.document.board,
          items: [...loaded.document.board.items, item],
        };

        return yield* save(
          {
            board,
            media: assets,
            camera: fitCamera(board.items, { width: 1440, height: 900 }),
          },
          input.output,
          loaded.reference,
          [item.id],
        );
      });

      const setBackground = Effect.fn('Moodboards.setBackground')(function* (
        input: SetBackgroundRequest,
      ) {
        yield* files.checkOutput(input.output, '.moodboard', false);
        const loaded = yield* load(input.board);

        // Prune a replaced background before applying the media budget, but preserve it if an item still uses it.
        const withoutBackground = yield* archives.validate({
          ...loaded.document,
          board: { ...loaded.document.board, backgroundMediaId: undefined },
        });

        const asset = yield* media.photo(input.source, { used: 0 });
        const assets = new Map(withoutBackground.media);
        yield* putAsset(assets, asset);

        return yield* save(
          {
            ...withoutBackground,
            media: assets,
            board: {
              ...withoutBackground.board,
              backgroundMediaId: asset.mediaId,
            },
          },
          input.output,
          loaded.reference,
        );
      });

      const layout = Effect.fn('Moodboards.layout')(function* (
        input: LayoutItemsRequest,
      ) {
        yield* files.checkOutput(input.output, '.moodboard', false);
        const loaded = yield* load(input.board);
        const selected = new Set(input.ids);

        const sources = input.ids.map((id) =>
          loaded.document.board.items.find((item) => item.id === id),
        );

        const found: BoardItem[] = [];

        if (!unique(input.ids))
          return yield* new LocalBoardError({
            code: 'InvalidInput',
            message: 'Layout selection repeats an item.',
          });

        for (const item of sources) {
          if (item === undefined)
            return yield* new LocalBoardError({
              code: 'NotFound',
              message: 'Layout selection contains a missing item.',
            });
          found.push(item);
        }

        const placed = yield* place(
          found,
          input.kind,
          input.anchor ?? { x: 0, y: 0 },
          loaded.document.board.items.filter((item) => !selected.has(item.id)),
        );

        const positions = new Map(placed.items.map((item) => [item.id, item]));

        const board = {
          ...loaded.document.board,
          items: loaded.document.board.items.map((item) => {
            const position = positions.get(item.id);

            return position === undefined
              ? item
              : {
                  ...item,
                  x: position.x,
                  y: position.y,
                  width: position.width,
                  height: position.height,
                  rotation: 0,
                };
          }),
        };

        return yield* save(
          {
            ...loaded.document,
            board,
            camera: fitCamera(board.items, { width: 1440, height: 900 }),
          },
          input.output,
          loaded.reference,
        );
      });

      const importBoard = Effect.fn('Moodboards.importBoard')(function* (
        input: ImportBoardRequest,
      ) {
        yield* files.checkOutput(input.output, '.moodboard', false);

        const source = yield* media.readReference(input.source, 'archive', {
          used: 0,
        });

        const document = yield* archives.read(source);
        const assets = new Map<MediaId, LocalAsset>();
        const remapped = new Map<MediaId, MediaId>();

        for (const asset of document.media.values()) {
          const prepared =
            asset.kind === 'image'
              ? yield* media.photoBytes(asset.bytes)
              : asset;

          yield* putAsset(assets, prepared);
          remapped.set(asset.mediaId, prepared.mediaId);
        }

        const items = document.board.items.map((item) => ({
          ...item,
          mediaId:
            item.mediaId === undefined ? undefined : remapped.get(item.mediaId),
        }));

        const board = {
          ...document.board,
          items,
          backgroundMediaId:
            document.board.backgroundMediaId === undefined
              ? undefined
              : remapped.get(document.board.backgroundMediaId),
        };

        return yield* save(
          { ...document, board, media: assets },
          input.output,
          undefined,
          items.map((item) => item.id),
        );
      });

      const duplicate = Effect.fn('Moodboards.duplicate')(function* (
        input: DuplicateBoardRequest,
      ) {
        const loaded = yield* load(input.board);

        return yield* save(
          {
            ...loaded.document,
            board: {
              ...loaded.document.board,
              title: input.title ?? loaded.document.board.title,
            },
          },
          input.output,
          loaded.reference,
        );
      });

      const previewBoard = Effect.fn('Moodboards.previewBoard')(function* (
        input: PreviewBoardRequest,
      ) {
        yield* files.checkOutput(
          input.output,
          '.jpg',
          input.overwrite ?? false,
        );
        const loaded = yield* load(input.board);
        const rendered = yield* renderer.render(loaded.document);

        const output = yield* files.writeOutput(
          input.output,
          '.jpg',
          rendered.image.bytes,
          input.overwrite ?? false,
        );

        return {
          value: {
            output,
            mimeType: 'image/jpeg' as const,
            width: rendered.image.width,
            height: rendered.image.height,
            byteLength: rendered.image.bytes.length,
            warnings: rendered.warnings,
          },
          image: rendered.image,
        };
      });

      const exportBoard = Effect.fn('Moodboards.exportBoard')(function* (
        input: ExportBoardRequest,
      ) {
        if (input.output === input.board.file)
          return yield* new LocalBoardError({
            code: 'InvalidInput',
            message:
              'The current revision is already a portable archive. Use a different filename for an export copy.',
          });

        yield* files.checkOutput(
          input.output,
          '.moodboard',
          input.overwrite ?? false,
        );
        const loaded = yield* load(input.board);

        const output = yield* files.writeOutput(
          input.output,
          '.moodboard',
          loaded.bytes,
          input.overwrite ?? false,
        );

        return receipt(
          loaded.document,
          input.output,
          output,
          loaded.bytes,
          loaded.reference,
          [],
        );
      });

      const deleteBoard = Effect.fn('Moodboards.deleteBoard')(function* (
        input: DeleteBoardRequest,
      ) {
        const loaded = yield* load(input.board);
        yield* files.deleteBoard(loaded.reference);

        return { deleted: loaded.reference };
      });

      return Moodboards.of({
        scan: (input) => exclusive(media.scan(input)),
        previewPhotos: (input) => exclusive(media.preview(input)),
        list: () => exclusive(files.listBoards()),
        get: (input) => exclusive(get(input)),
        create: (input) => exclusive(create(input)),
        edit: (input) => exclusive(edit(input)),
        addPhotos: (input) => exclusive(addPhotos(input)),
        addAudio: (input) => exclusive(addAudio(input)),
        setBackground: (input) => exclusive(setBackground(input)),
        layout: (input) => exclusive(layout(input)),
        importBoard: (input) => exclusive(importBoard(input)),
        duplicate: (input) => exclusive(duplicate(input)),
        previewBoard: (input) => exclusive(previewBoard(input)),
        exportBoard: (input) => exclusive(exportBoard(input)),
        deleteBoard: (input) => exclusive(deleteBoard(input)),
      });
    }),
  );
}
