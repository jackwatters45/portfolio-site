import { RegistryContext, useAtomSet, useAtomValue } from '@effect/atom-react';
import { Effect } from 'effect';
import { Atom, type AtomRegistry } from 'effect/unstable/reactivity';
import { useContext, useMemo, useRef, type RefObject } from 'react';

import {
  MIN_AUDIO_CARD_WIDTH,
  preferredAudioCardHeight,
} from '../../lib/audio-card-layout';
import {
  MAX_REMOTE_BOARD_BYTES,
  MAX_REMOTE_ITEMS,
  type ItemId,
} from '../../lib/board-rpc';
import type { MediaId } from '../../lib/media';
import type { BoardUpdate } from './board-document';
import { createId } from './board-factory';
import { BoardTransferError, BoardTransfers } from './board-transfers';
import {
  estimateItemBytes,
  shouldStageImageSelection,
  type BulkLayoutKind,
  type PreparedBulkImage,
  type TraversalFailure,
} from './bulk-image-import';
import { layoutBulkImages, placeLayoutWithoutOverlap } from './bulk-layout';
import { screenToWorld } from './camera';
import type { Board, BoardItem, Camera } from './types';

type Point = { readonly x: number; readonly y: number };

interface BulkSession {
  readonly files: ReadonlyArray<File>;
  readonly anchor: Point;
  readonly omitted: number;
  readonly truncated: boolean;
  readonly failures: ReadonlyArray<TraversalFailure>;
}

interface IntakeState {
  readonly bulkSession: BulkSession | null;
  readonly collectingDrop: boolean;
  readonly imageIntakeStatus: string;
  readonly backgroundUploadError: string;
}

interface IntakeOptions {
  readonly localOnly: boolean;
  readonly boardRef: Readonly<RefObject<Board>>;
  readonly cameraRef: Readonly<RefObject<Camera>>;
  readonly applyBoard: (update: BoardUpdate) => void;
  readonly replaceDocument: (
    board: Board,
    camera: Camera,
    enablePersistence?: boolean,
  ) => void;
  readonly beginWorking: () => void;
  readonly endWorking: () => void;
  readonly showToast: (message: string, duration?: number) => void;
  readonly onSelect: (id: ItemId | null) => void;
  readonly onClosePanel: () => void;
  readonly onPanelError: (message: string) => void;
  readonly onBackgroundStart: () => void;
  readonly onBackgroundReady: (id: MediaId) => void;
  readonly pauseAudio: () => void;
}

const center = (): Point => ({
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
});

const prepare = <A>(run: () => A) =>
  Effect.try({
    try: run,
    catch: (cause) =>
      new BoardTransferError({
        message:
          cause instanceof Error
            ? cause.message
            : 'That file could not be placed.',
        cause,
      }),
  });

const createIntakeAtoms = (options: IntakeOptions) => {
  const state = Atom.make<IntakeState>({
    bulkSession: null,
    collectingDrop: false,
    imageIntakeStatus: '',
    backgroundUploadError: '',
  });

  const runtime = Atom.runtime(BoardTransfers.layer(options.localOnly)).pipe(
    Atom.setIdleTTL(0),
  );

  const view = Atom.make((get) => {
    get.mount(runtime);

    return { ...get(state), backgroundUploading: get(background).waiting };
  }).pipe(Atom.setIdleTTL(0));

  const withWorking = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.acquireUseRelease(
      Effect.sync(options.beginWorking),
      () => effect,
      () => Effect.sync(options.endWorking),
    );

  const patch = (
    registry: AtomRegistry.AtomRegistry,
    patch: Partial<IntakeState>,
  ) => registry.update(state, (current) => ({ ...current, ...patch }));

  const openBulk = (
    registry: AtomRegistry.AtomRegistry,
    files: ReadonlyArray<File>,
    point?: Point,
    intake: {
      readonly omitted?: number;
      readonly truncated?: boolean;
      readonly failures?: ReadonlyArray<TraversalFailure>;
    } = {},
  ) => {
    if (files.length === 0 || registry.get(state).bulkSession !== null) return;
    options.beginWorking();
    patch(registry, {
      bulkSession: {
        files,
        anchor: screenToWorld(point ?? center(), options.cameraRef.current),
        omitted: intake.omitted ?? 0,
        truncated: intake.truncated ?? false,
        failures: intake.failures ?? [],
      },
    });
    options.onClosePanel();
    options.onSelect(null);
  };

  const addImage = (
    file: File,
    point: Point | undefined,
    registry: AtomRegistry.AtomRegistry,
  ) =>
    Effect.gen(function* () {
      if (options.boardRef.current.items.length >= MAX_REMOTE_ITEMS)
        return yield* new BoardTransferError({
          message: `This board can hold ${MAX_REMOTE_ITEMS} items.`,
        });
      patch(registry, {
        imageIntakeStatus:
          /^image\/hei[cf]$/i.test(file.type) ||
          /\.(?:heic|heif|hif)$/i.test(file.name)
            ? 'Converting HEIC photo…'
            : 'Preparing image…',
      });
      const transfers = yield* BoardTransfers;

      const image = yield* transfers.image(file, () =>
        patch(registry, {
          imageIntakeStatus: options.localOnly
            ? 'Saving image to this browser…'
            : 'Uploading image…',
        }),
      );

      patch(registry, { imageIntakeStatus: 'Adding image to board…' });
      const current = options.boardRef.current;

      if (current.items.length >= MAX_REMOTE_ITEMS)
        return yield* new BoardTransferError({
          message: `This board can hold ${MAX_REMOTE_ITEMS} items.`,
        });

      const layout = yield* prepare(() =>
        placeLayoutWithoutOverlap(
          layoutBulkImages(
            [{ id: 'single', width: image.width, height: image.height }],
            'loose',
          ),
          screenToWorld(point ?? center(), options.cameraRef.current),
          current.items,
        ),
      );

      const placed = layout.items[0];

      if (placed === undefined)
        return yield* new BoardTransferError({
          message: 'The image could not be placed.',
        });

      const item: BoardItem = {
        id: createId(),
        kind: 'image',
        ...(image.mediaId === undefined
          ? { src: image.src }
          : { mediaId: image.mediaId }),
        x: placed.x,
        y: placed.y,
        width: placed.width,
        height: placed.height,
        rotation: 0,
        order: Math.max(0, ...current.items.map((entry) => entry.order)) + 1,
      };

      if (
        [...current.items, item].reduce(
          (total, entry) => total + estimateItemBytes(entry),
          0,
        ) > MAX_REMOTE_BOARD_BYTES
      )
        return yield* new BoardTransferError({
          message: options.localOnly
            ? 'That image would make this browser board too large.'
            : 'That image would exceed this board’s remote storage limit.',
        });
      options.applyBoard({ ...current, items: [...current.items, item] });
      options.onSelect(item.id);
    }).pipe(
      Effect.catchTag('BoardTransferError', (error) =>
        Effect.sync(() => options.showToast(error.message, 8000)),
      ),
      Effect.ensuring(
        Effect.sync(() => patch(registry, { imageIntakeStatus: '' })),
      ),
    );

  const image = runtime
    .fn(
      (input: { readonly file: File; readonly point?: Point }, get) =>
        withWorking(addImage(input.file, input.point, get.registry)),
      { concurrent: true },
    )
    .pipe(Atom.setIdleTTL(0));

  const drop = runtime
    .fn((input: { readonly data: DataTransfer; readonly point: Point }, get) =>
      withWorking(
        Effect.gen(function* () {
          patch(get.registry, { collectingDrop: true });
          const transfers = yield* BoardTransfers;
          const collection = yield* transfers.collectDrop(input.data);
          patch(get.registry, { collectingDrop: false });

          if (collection.files.length === 0) {
            options.showToast(
              collection.failures[0]?.message ??
                'No files were found in that drop.',
            );
          } else if (
            collection.hadDirectory ||
            collection.files.length > 1 ||
            collection.failures.length > 0 ||
            collection.omitted > 0 ||
            collection.truncated
          ) {
            openBulk(get.registry, collection.files, input.point, collection);
          } else {
            const file = collection.files[0];

            if (file !== undefined)
              get.set(image, { file, point: input.point });
          }
        }).pipe(
          Effect.catchTag('BoardTransferError', (error) =>
            Effect.sync(() => options.showToast(error.message)),
          ),
          Effect.ensuring(
            Effect.sync(() => patch(get.registry, { collectingDrop: false })),
          ),
        ),
      ),
    )
    .pipe(Atom.setIdleTTL(0));

  const background = runtime
    .fn((file: File, get) =>
      withWorking(
        Effect.gen(function* () {
          patch(get.registry, {
            backgroundUploadError: '',
          });
          options.onBackgroundStart();
          const transfers = yield* BoardTransfers;
          const mediaId = yield* transfers.background(file);
          options.onBackgroundReady(mediaId);
          options.showToast('Background image ready — apply to save');
        }).pipe(
          Effect.catchTag('BoardTransferError', (error) =>
            Effect.sync(() =>
              patch(get.registry, { backgroundUploadError: error.message }),
            ),
          ),
        ),
      ),
    )
    .pipe(Atom.setIdleTTL(0));

  const audio = runtime
    .fn(
      (
        input: {
          readonly file: File;
          readonly editingId?: ItemId;
          readonly label: string;
        },
        _get,
      ) =>
        withWorking(
          Effect.gen(function* () {
            options.onPanelError('');

            if (
              !input.editingId &&
              options.boardRef.current.items.length >= MAX_REMOTE_ITEMS
            )
              return yield* new BoardTransferError({
                message: `This board can hold ${MAX_REMOTE_ITEMS} items.`,
              });
            const transfers = yield* BoardTransfers;
            const mediaId = yield* transfers.audio(input.file);

            const label =
              input.label.trim() ||
              input.file.name.replace(/\.[^.]+$/, '').slice(0, 120) ||
              undefined;

            if (input.editingId) {
              options.pauseAudio();
              options.applyBoard((current) => ({
                ...current,
                items: current.items.map((item) =>
                  item.id === input.editingId &&
                  (item.kind === 'audio' ||
                    item.kind === 'spotify' ||
                    item.kind === 'youtube')
                    ? {
                        ...item,
                        kind: 'audio',
                        src: undefined,
                        mediaId,
                        label,
                        width: Math.max(MIN_AUDIO_CARD_WIDTH, item.width),
                        height: preferredAudioCardHeight(
                          'audio',
                          Math.max(MIN_AUDIO_CARD_WIDTH, item.width),
                        ),
                      }
                    : item,
                ),
              }));
            } else {
              const point = screenToWorld(center(), options.cameraRef.current);
              const width = 520;
              const height = preferredAudioCardHeight('audio', width);

              const item: BoardItem = {
                id: createId(),
                kind: 'audio',
                mediaId,
                label,
                x: point.x - width / 2,
                y: point.y - height / 2,
                width,
                height,
                rotation: 0,
                order:
                  Math.max(
                    0,
                    ...options.boardRef.current.items.map(
                      (entry) => entry.order,
                    ),
                  ) + 1,
              };

              options.applyBoard((current) => ({
                ...current,
                items: [...current.items, item],
              }));
              options.onSelect(item.id);
            }

            options.onClosePanel();
            options.showToast(
              input.editingId ? 'Audio card updated' : 'Local audio added',
            );
          }).pipe(
            Effect.catchTag('BoardTransferError', (error) =>
              Effect.sync(() => options.onPanelError(error.message)),
            ),
          ),
        ),
    )
    .pipe(Atom.setIdleTTL(0));

  const archive = runtime
    .fn(
      (
        input:
          | { readonly type: 'export' }
          | { readonly type: 'import'; readonly file: File },
      ) =>
        withWorking(
          Effect.gen(function* () {
            const transfers = yield* BoardTransfers;

            if (input.type === 'import') {
              const imported = yield* transfers.importBoard(input.file);
              options.replaceDocument(imported.board, imported.camera, true);
              options.onClosePanel();
              options.showToast('Board imported');

              return;
            }

            const current = options.boardRef.current;

            const blob = yield* transfers.exportBoard(
              current,
              options.cameraRef.current,
            );

            yield* Effect.scoped(
              Effect.gen(function* () {
                const url = yield* Effect.acquireRelease(
                  Effect.sync(() => URL.createObjectURL(blob)),
                  (url) => Effect.sync(() => URL.revokeObjectURL(url)),
                );

                const link = document.createElement('a');
                link.href = url;
                link.download = `${
                  current.title
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '') || 'mood'
                }.moodboard`;
                link.click();
                options.showToast('Portable board archive downloaded');
                yield* Effect.sleep('1 second');
              }),
            );
          }).pipe(
            Effect.catchTag('BoardTransferError', (error) =>
              Effect.sync(() => options.showToast(error.message)),
            ),
          ),
        ),
    )
    .pipe(Atom.setIdleTTL(0));

  const commitBulk = (
    registry: AtomRegistry.AtomRegistry,
    images: ReadonlyArray<PreparedBulkImage>,
    layoutKind: BulkLayoutKind,
  ): string | null => {
    const current = options.boardRef.current;

    if (current.items.length + images.length > MAX_REMOTE_ITEMS)
      return `This board can hold ${MAX_REMOTE_ITEMS} items. Select fewer images.`;

    const layout = layoutBulkImages(
      images.map((image) => ({
        id: image.entryId,
        width: image.width,
        height: image.height,
      })),
      layoutKind,
    );

    let placed;

    try {
      placed = placeLayoutWithoutOverlap(
        layout,
        registry.get(state).bulkSession?.anchor ?? { x: 0, y: 0 },
        current.items,
      );
    } catch (error) {
      return error instanceof Error
        ? error.message
        : 'Open canvas space could not be found.';
    }

    const prepared = new Map(images.map((image) => [image.entryId, image]));
    const topOrder = Math.max(0, ...current.items.map((item) => item.order));

    const additions = placed.items.map((item, index): BoardItem => {
      const image = prepared.get(item.id);

      if (!image)
        throw new Error('A prepared image was missing from this import.');

      return {
        id: createId(),
        kind: 'image',
        ...(image.mediaId === undefined
          ? { src: image.src }
          : { mediaId: image.mediaId }),
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: 0,
        order: topOrder + index + 1,
      };
    });

    if (
      [...current.items, ...additions].reduce(
        (total, item) => total + estimateItemBytes(item),
        0,
      ) > MAX_REMOTE_BOARD_BYTES
    )
      return options.localOnly
        ? 'Those images would make this browser board too large. Select fewer images.'
        : 'Those images would exceed this board’s remote storage limit. Select fewer images.';
    options.applyBoard({ ...current, items: [...current.items, ...additions] });
    options.onSelect(additions.at(-1)?.id ?? null);
    options.showToast(
      `${additions.length} ${additions.length === 1 ? 'image' : 'images'} added`,
    );

    return null;
  };

  return {
    state,
    view,
    image,
    drop,
    background,
    audio,
    archive,
    openBulk,
    commitBulk,
    patch,
  };
};

/** File inputs and canvas intake are UI adapters. Effects own pending transfers and cancellation. */
export function useBoardFiles(options: IntakeOptions) {
  const {
    localOnly,
    boardRef,
    cameraRef,
    applyBoard,
    replaceDocument,
    beginWorking,
    endWorking,
    showToast,
    onSelect,
    onClosePanel,
    onPanelError,
    onBackgroundStart,
    onBackgroundReady,
    pauseAudio,
  } = options;

  const atoms = useMemo(
    () =>
      createIntakeAtoms({
        localOnly,
        boardRef,
        cameraRef,
        applyBoard,
        replaceDocument,
        beginWorking,
        endWorking,
        showToast,
        onSelect,
        onClosePanel,
        onPanelError,
        onBackgroundStart,
        onBackgroundReady,
        pauseAudio,
      }),
    [
      localOnly,
      boardRef,
      cameraRef,
      applyBoard,
      replaceDocument,
      beginWorking,
      endWorking,
      showToast,
      onSelect,
      onClosePanel,
      onPanelError,
      onBackgroundStart,
      onBackgroundReady,
      pauseAudio,
    ],
  );

  const registry = useContext(RegistryContext);
  const state = useAtomValue(atoms.view);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageSelectionFolderRef = useRef(false);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const image = useAtomSet(atoms.image);
  const drop = useAtomSet(atoms.drop);
  const background = useAtomSet(atoms.background);
  const audio = useAtomSet(atoms.audio);
  const archive = useAtomSet(atoms.archive);

  const actions = useMemo(
    () => ({
      imageInputRef,
      imageSelectionFolderRef,
      audioInputRef,
      importInputRef,
      addImageSelection: (
        files: ReadonlyArray<File>,
        selection: {
          readonly folder?: boolean;
          readonly screenPoint?: Point;
        } = {},
      ) => {
        if (files.length > 0) onClosePanel();
        const file = files[0];

        if (
          !shouldStageImageSelection(files.length, selection.folder) &&
          file !== undefined
        )
          image({ file, point: selection.screenPoint });
        else if (!registry.get(atoms.state).collectingDrop)
          atoms.openBulk(registry, files, selection.screenPoint);
      },
      collectDroppedFiles: (data: DataTransfer, point: Point) => {
        const current = registry.get(atoms.state);

        if (current.bulkSession === null && !current.collectingDrop)
          drop({ data, point });
      },
      closeBulkStaging: () => {
        if (registry.get(atoms.state).bulkSession === null) return;
        atoms.patch(registry, { bulkSession: null });
        endWorking();
      },
      cancelDropCollection: () => {
        if (!registry.get(atoms.state).collectingDrop) return;
        drop(Atom.Interrupt);
        showToast('Folder reading cancelled');
      },
      commitBulkImages: (
        images: ReadonlyArray<PreparedBulkImage>,
        layout: BulkLayoutKind,
      ) => atoms.commitBulk(registry, images, layout),
      chooseBackgroundImage: (file: File) => background(file),
      cancelBackgroundTransfer: () => {
        background(Atom.Interrupt);
        atoms.patch(registry, {
          backgroundUploadError: '',
        });
      },
      clearBackgroundError: () =>
        atoms.patch(registry, { backgroundUploadError: '' }),
      addLocalAudio: (file: File, label: string, editingId?: ItemId) => {
        audio({ file, label, editingId });

        if (audioInputRef.current) audioInputRef.current.value = '';
      },
      exportBoard: () => archive({ type: 'export' }),
      importBoard: (file: File) => {
        archive({ type: 'import', file });

        if (importInputRef.current) importInputRef.current.value = '';
      },
      cancelArchive: () => archive(Atom.Interrupt),
    }),
    [
      archive,
      atoms,
      audio,
      background,
      drop,
      endWorking,
      image,
      onClosePanel,
      registry,
      showToast,
    ],
  );

  return { ...state, ...actions };
}
