import {
  Context,
  Effect,
  Layer,
  Predicate,
  Queue,
  Schema,
  Semaphore,
  Stream,
} from 'effect';
import { type Atom, AtomRegistry } from 'effect/unstable/reactivity';

import type { AccountId } from '../../lib/account';
import { minimumAudioCardHeight } from '../../lib/audio-card-layout';
import {
  BoardTimestampSchema,
  DEFAULT_BOARD_ID,
  type BoardId,
} from '../../lib/board-rpc';
import { OptionalErrorCauseSchema } from '../../lib/schema';
import { MAX_X_POST_CARD_WIDTH } from '../media/x-post-measurement';
import { createBoardCatalog } from './board-catalog';
import {
  startBoardSync,
  type BoardSync,
  type CloudSyncState,
} from './board-sync';
import { fitCamera } from './camera';
import { deleteLocalBoard, loadDocument, saveDocument } from './storage';
import type { Board, Camera, SavedDocument } from './types';

export interface EditorDocumentState {
  readonly board: Board;
  readonly camera: Camera;
  readonly ready: boolean;
  readonly saveState: 'saved' | 'saving' | 'error';
  readonly syncState: CloudSyncState;
  readonly historyState: {
    readonly canUndo: boolean;
    readonly canRedo: boolean;
  };
}

export interface BoardDocumentChange {
  readonly type: 'remote' | 'history' | 'replace';
  readonly previous: Board;
  readonly next: Board;
}

export interface BoardDocumentOptions {
  readonly accountId: AccountId;
  readonly boardId: BoardId;
  readonly localOnly: boolean;
  readonly initial: EditorDocumentState;
  readonly onChange: (change: BoardDocumentChange) => void;
  readonly onUnavailable: (boardId: BoardId) => void;
  readonly onError: (message: string) => void;
}

type HistoryEntry = { readonly board: Board; readonly camera?: Camera };

export type BoardUpdate = Board | ((current: Board) => Board);

export type CameraUpdate = Camera | ((current: Camera) => Camera);

export class BoardDocumentError extends Schema.Error<BoardDocumentError>(
  'BoardDocumentError',
)({
  _tag: Schema.tag('BoardDocumentError'),
  operation: Schema.Literals(['Load', 'Save', 'Catalog', 'Preview']),
  message: Schema.String,
  cause: OptionalErrorCauseSchema,
}) {}

const attempt = <A>(
  operation: BoardDocumentError['operation'],
  message: string,
  run: () => Promise<A>,
) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new BoardDocumentError({ operation, message, cause }),
  });

const makeDocument = (
  options: BoardDocumentOptions,
  stateAtom: Atom.Writable<EditorDocumentState>,
) =>
  Effect.gen(function* () {
    const registry = yield* AtomRegistry.AtomRegistry;

    const saves = yield* Queue.sliding<{
      readonly generation: number;
      readonly document: SavedDocument;
    }>(1);

    const cameraChanges = yield* Queue.sliding<null>(1);
    const saveLock = yield* Semaphore.make(1);
    let state = options.initial;
    let closed = false;
    let persistenceEnabled = true;
    let deletingBoard: BoardId | null = null;
    let deleted = false;
    let saveGeneration = 0;
    let sync: BoardSync | undefined;
    let undoStack: HistoryEntry[] = [];
    let redoStack: HistoryEntry[] = [];

    const update = (patch: Partial<EditorDocumentState>) => {
      state = { ...state, ...patch };

      if (!closed) registry.set(stateAtom, state);
    };

    const historyState = () => ({
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    });

    const canSave = () =>
      state.ready &&
      persistenceEnabled &&
      !deleted &&
      deletingBoard !== options.boardId;

    const queueSave = () => {
      if (closed || !canSave()) return;
      Queue.offerUnsafe(saves, {
        generation: ++saveGeneration,
        document: { board: state.board, camera: state.camera },
      });
    };

    const writeDocument = Effect.fn('BoardDocument.write')(function* (
      document: SavedDocument,
    ) {
      yield* attempt(
        'Save',
        'The board could not be saved to this browser.',
        () => saveDocument(options.accountId, options.boardId, document),
      );
    });

    yield* Stream.fromQueue(saves).pipe(
      Stream.runForEach(({ generation, document }) =>
        saveLock.withPermit(
          Effect.gen(function* () {
            if (closed || !canSave() || generation !== saveGeneration) return;
            update({ saveState: 'saving' });
            yield* writeDocument(document).pipe(
              Effect.match({
                onFailure: () => {
                  if (generation === saveGeneration)
                    update({ saveState: 'error' });
                },
                onSuccess: () => {
                  if (generation === saveGeneration)
                    update({ saveState: 'saved' });
                },
              }),
              // IndexedDB transactions must finish before deleting the local board.
              Effect.uninterruptible,
            );
          }),
        ),
      ),
      Effect.forkScoped,
    );
    yield* Stream.fromQueue(cameraChanges).pipe(
      Stream.debounce('550 millis'),
      Stream.runForEach(() => Effect.sync(queueSave)),
      Effect.forkScoped,
    );

    const catalog = options.localOnly
      ? undefined
      : yield* Effect.acquireRelease(Effect.sync(createBoardCatalog), (value) =>
          Effect.promise(() => value.close()),
        );

    const commit = (board: Board, camera = state.camera) => {
      const previous = state.board;

      const next = {
        ...board,
        updatedAt: BoardTimestampSchema.make(Date.now()),
      };

      update({ board: next, camera, historyState: historyState() });
      sync?.commit(previous, next);
      queueSave();

      return next;
    };

    const initialize = Effect.gen(function* () {
      const document = yield* attempt(
        'Load',
        'The saved board could not be opened. Its local copy was left untouched.',
        () => loadDocument(options.accountId, options.boardId),
      );

      if (
        options.localOnly &&
        document !== null &&
        (document.board.backgroundMediaId !== undefined ||
          document.board.items.some((item) => item.mediaId !== undefined))
      ) {
        return yield* new BoardDocumentError({
          operation: 'Load',
          message:
            'The saved board could not be opened. Its local copy was left untouched.',
        });
      }

      if (document !== null)
        update({ board: document.board, camera: document.camera });
      else update({ camera: fitCamera(options.initial.board.items) });
    }).pipe(
      Effect.catchTag('BoardDocumentError', (error) =>
        Effect.sync(() => {
          persistenceEnabled = false;
          update({
            camera: fitCamera(options.initial.board.items),
            saveState: 'error',
          });
          options.onError(error.message);
        }),
      ),
      Effect.andThen(
        Effect.gen(function* () {
          update({ ready: true });
          queueSave();

          if (options.localOnly) return;
          sync = yield* Effect.acquireRelease(
            Effect.sync(() =>
              startBoardSync({
                accountId: options.accountId,
                boardId: options.boardId,
                initialBoard: state.board,
                onBoard: (next, remoteDivergence) => {
                  if (closed || deleted) return;
                  const previous = state.board;

                  if (remoteDivergence) {
                    undoStack = [];
                    redoStack = [];
                  }

                  update({ board: next, historyState: historyState() });
                  options.onChange({ type: 'remote', previous, next });
                  queueSave();
                },
                onStatus: (syncState) => {
                  if (!closed) update({ syncState });
                },
                onUnavailable: (boardId) => {
                  if (
                    !closed &&
                    boardId === options.boardId &&
                    deletingBoard !== boardId
                  )
                    options.onUnavailable(DEFAULT_BOARD_ID);
                },
              }),
            ),
            (value) => Effect.promise(() => value.close()),
          );
        }),
      ),
    );

    yield* initialize.pipe(Effect.forkScoped);
    yield* Effect.addFinalizer(() => {
      closed = true;

      if (!canSave()) return Effect.void;

      return saveLock
        .withPermit(writeDocument({ board: state.board, camera: state.camera }))
        .pipe(
          Effect.catchTag('BoardDocumentError', (error) =>
            Effect.logWarning(error.message, error),
          ),
        );
    });

    const edit = Effect.fn('BoardDocument.edit')(function* (
      updater: BoardUpdate,
    ) {
      if (closed || deleted) return;

      const next = Predicate.isFunction(updater)
        ? updater(state.board)
        : updater;

      if (next === state.board) return;
      undoStack = [...undoStack.slice(-49), { board: state.board }];
      redoStack = [];
      commit(next);
    });

    const replace = Effect.fn('BoardDocument.replace')(function* (
      board: Board,
      camera: Camera,
      enablePersistence = false,
    ) {
      if (closed || deleted) return;
      const previous = state.board;
      undoStack = [
        ...undoStack.slice(-49),
        { board: previous, camera: state.camera },
      ];
      redoStack = [];

      if (enablePersistence) persistenceEnabled = true;
      const next = commit(board, camera);
      options.onChange({ type: 'replace', previous, next });
    });

    const restoreHistory = Effect.fn('BoardDocument.restoreHistory')(function* (
      direction: 'undo' | 'redo',
    ) {
      if (closed || deleted) return;
      const entry = (direction === 'undo' ? undoStack : redoStack).pop();

      if (entry === undefined) return;
      const previous = state.board;

      const currentEntry: HistoryEntry =
        entry.camera === undefined
          ? { board: previous }
          : { board: previous, camera: state.camera };

      (direction === 'undo' ? redoStack : undoStack).push(currentEntry);
      const next = commit(entry.board, entry.camera ?? state.camera);
      options.onChange({ type: 'history', previous, next });
    });

    const setCamera = Effect.fn('BoardDocument.setCamera')(function* (
      updater: CameraUpdate,
    ) {
      if (closed || deleted) return;
      update({
        camera: Predicate.isFunction(updater) ? updater(state.camera) : updater,
      });
      Queue.offerUnsafe(cameraChanges, null);
    });

    const resizeEmbeddedItem = Effect.fn('BoardDocument.resizeEmbeddedItem')(
      function* (id: string, width: number, height: number) {
        if (closed || deleted) return;
        const source = state.board.items.find((item) => item.id === id);

        if (source === undefined) return;

        const nextWidth = Math.min(
          source.kind === 'x' ? MAX_X_POST_CARD_WIDTH : 2_400,
          Math.max(320, width),
        );

        const nextHeight =
          source.kind === 'x'
            ? Math.min(2_000, Math.max(240, height))
            : source.kind === 'audio' ||
                source.kind === 'spotify' ||
                source.kind === 'youtube'
              ? Math.min(
                  2_400,
                  Math.max(minimumAudioCardHeight(source.kind), height),
                )
              : undefined;

        if (
          nextHeight === undefined ||
          (Math.abs(source.width - nextWidth) < 1 &&
            Math.abs(source.height - nextHeight) < 4)
        )
          return;
        // Provider measurements synchronize, but do not create undo steps.
        commit({
          ...state.board,
          items: state.board.items.map((item) =>
            item.id === id
              ? { ...item, width: nextWidth, height: nextHeight }
              : item,
          ),
        });
      },
    );

    const requireCatalog = () =>
      catalog === undefined
        ? Effect.fail(
            new BoardDocumentError({
              operation: 'Catalog',
              message: 'Sign in to use the board library.',
            }),
          )
        : Effect.succeed(catalog);

    const listBoards = Effect.fn('BoardDocument.listBoards')(function* () {
      const client = yield* requireCatalog();

      return yield* attempt(
        'Catalog',
        'The board library could not be refreshed.',
        () => client.list(),
      );
    });

    const createBoard = Effect.fn('BoardDocument.createBoard')(function* (
      title: string,
    ) {
      const client = yield* requireCatalog();

      return yield* attempt(
        'Catalog',
        'The new board could not be created.',
        () => client.create(title),
      );
    });

    const duplicateBoard = Effect.fn('BoardDocument.duplicateBoard')(function* (
      boardId: BoardId,
      title: string,
    ) {
      const client = yield* requireCatalog();

      return yield* attempt(
        'Catalog',
        'That board could not be duplicated.',
        () => client.duplicate(boardId, title),
      );
    });

    const deleteBoard = Effect.fn('BoardDocument.deleteBoard')(function* (
      boardId: BoardId,
    ) {
      const client = yield* requireCatalog();
      deletingBoard = boardId;
      // Once the server deletes a board, finish local cleanup even if navigation unmounts the editor.
      yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          yield* restore(
            attempt('Catalog', 'That board could not be deleted.', () =>
              client.delete(boardId),
            ),
          );

          if (boardId === options.boardId) {
            deleted = true;
            options.onUnavailable(DEFAULT_BOARD_ID);
          }

          yield* saveLock
            .withPermit(
              attempt(
                'Save',
                'The local board copy could not be removed.',
                () => deleteLocalBoard(options.accountId, boardId),
              ),
            )
            .pipe(
              Effect.catchTag('BoardDocumentError', (error) =>
                Effect.logWarning(error.message, error),
              ),
            );
        }),
      ).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            deletingBoard = null;
          }),
        ),
      );
    });

    const resolveWebsitePreview = Effect.fn(
      'BoardDocument.resolveWebsitePreview',
    )(function* (url: string) {
      const client = sync;

      if (client === undefined || state.syncState !== 'live')
        return yield* new BoardDocumentError({
          operation: 'Preview',
          message: 'Connect to the board server before resolving this link.',
        });

      return yield* attempt(
        'Preview',
        'That website preview could not be created.',
        () => client.resolveWebsitePreview(url),
      );
    });

    const resolveXPostPreview = Effect.fn('BoardDocument.resolveXPostPreview')(
      function* (url: string) {
        const client = sync;

        if (client === undefined || state.syncState !== 'live')
          return undefined;

        return yield* attempt(
          'Preview',
          'That X post could not be resolved.',
          () => client.resolveXPostPreview(url),
        );
      },
    );

    return {
      edit,
      replace,
      restoreHistory,
      setCamera,
      resizeEmbeddedItem,
      flush: Effect.sync(queueSave),
      listBoards,
      createBoard,
      duplicateBoard,
      deleteBoard,
      resolveWebsitePreview,
      resolveXPostPreview,
    };
  });

export class BoardDocument extends Context.Service<
  BoardDocument,
  Effect.Success<ReturnType<typeof makeDocument>>
>()('mood-board/BoardDocument') {
  static layer(
    options: BoardDocumentOptions,
    state: Atom.Writable<EditorDocumentState>,
  ) {
    return Layer.effect(this, makeDocument(options, state));
  }
}
