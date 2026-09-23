import { RegistryContext, useAtomSet, useAtomValue } from '@effect/atom-react';
import { Atom } from 'effect/unstable/reactivity';
import { useContext, useEffect, useMemo } from 'react';

import type { AccountId } from '../../lib/account';
import {
  DEFAULT_BOARD_ID,
  type BoardId,
  type ItemId,
} from '../../lib/board-rpc';
import {
  BoardDocument,
  type BoardDocumentChange,
  type BoardDocumentOptions,
  type BoardUpdate,
  type CameraUpdate,
  type EditorDocumentState,
} from './board-document';
import { createDemoBoard, createEmptyBoard } from './board-factory';
import type { Board, Camera } from './types';

type DocumentCommand =
  | { readonly type: 'edit'; readonly update: BoardUpdate }
  | { readonly type: 'camera'; readonly update: CameraUpdate }
  | {
      readonly type: 'replace';
      readonly board: Board;
      readonly camera: Camera;
      readonly enablePersistence: boolean;
    }
  | { readonly type: 'undo' | 'redo' | 'flush' }
  | {
      readonly type: 'resize';
      readonly id: ItemId;
      readonly width: number;
      readonly height: number;
    };

const createEditorAtoms = (options: Omit<BoardDocumentOptions, 'initial'>) => {
  const initial: EditorDocumentState = {
    board:
      options.boardId === DEFAULT_BOARD_ID
        ? createDemoBoard()
        : createEmptyBoard(),
    camera: { x: window.innerWidth / 2, y: window.innerHeight / 2, z: 0.45 },
    ready: false,
    saveState: 'saved',
    syncState: options.localOnly ? 'local' : 'connecting',
    historyState: { canUndo: false, canRedo: false },
  };

  const snapshot = Atom.make(initial);

  const runtime = Atom.runtime(
    BoardDocument.layer({ ...options, initial }, snapshot),
  ).pipe(Atom.setIdleTTL(0));

  const state = Atom.make((get) => {
    get.mount(runtime);

    return get(snapshot);
  }).pipe(Atom.setIdleTTL(0));

  const command = runtime
    .fn(
      (command: DocumentCommand) =>
        BoardDocument.use((document) => {
          switch (command.type) {
            case 'edit':
              return document.edit(command.update);
            case 'camera':
              return document.setCamera(command.update);
            case 'replace':
              return document.replace(
                command.board,
                command.camera,
                command.enablePersistence,
              );
            case 'undo':
            case 'redo':
              return document.restoreHistory(command.type);
            case 'resize':
              return document.resizeEmbeddedItem(
                command.id,
                command.width,
                command.height,
              );
            case 'flush':
              return document.flush;
          }
        }),
      { concurrent: true },
    )
    .pipe(Atom.setIdleTTL(0));

  return {
    state,
    command,
    listBoards: runtime
      .fn(() => BoardDocument.use((document) => document.listBoards()))
      .pipe(Atom.setIdleTTL(0)),
    createBoard: runtime
      .fn((title: string) =>
        BoardDocument.use((document) => document.createBoard(title)),
      )
      .pipe(Atom.setIdleTTL(0)),
    duplicateBoard: runtime
      .fn((input: { readonly id: BoardId; readonly title: string }) =>
        BoardDocument.use((document) =>
          document.duplicateBoard(input.id, input.title),
        ),
      )
      .pipe(Atom.setIdleTTL(0)),
    deleteBoard: runtime
      .fn((id: BoardId) =>
        BoardDocument.use((document) => document.deleteBoard(id)),
      )
      .pipe(Atom.setIdleTTL(0)),
    resolveWebsitePreview: runtime
      .fn((url: string) =>
        BoardDocument.use((document) => document.resolveWebsitePreview(url)),
      )
      .pipe(Atom.setIdleTTL(0)),
    resolveXPostPreview: runtime
      .fn((url: string) =>
        BoardDocument.use((document) => document.resolveXPostPreview(url)),
      )
      .pipe(Atom.setIdleTTL(0)),
  };
};

/** React boundary: atoms own the service scope; this hook only binds commands and browser events. */
export function useBoardDocument({
  accountId,
  boardId,
  localOnly,
  onNavigate,
  onChange,
  showToast,
}: {
  readonly accountId: AccountId;
  readonly boardId: BoardId;
  readonly localOnly: boolean;
  readonly onNavigate: (
    boardId: BoardId,
    replace?: boolean,
    force?: boolean,
  ) => void;
  readonly onChange: (change: BoardDocumentChange) => void;
  readonly showToast: (message: string) => void;
}) {
  const registry = useContext(RegistryContext);

  const atoms = useMemo(
    () =>
      createEditorAtoms({
        accountId,
        boardId,
        localOnly,
        onChange,
        onUnavailable: (id) => onNavigate(id, true, true),
        onError: showToast,
      }),
    [accountId, boardId, localOnly, onChange, onNavigate, showToast],
  );

  const state = useAtomValue(atoms.state);
  const dispatch = useAtomSet(atoms.command);
  const listBoards = useAtomSet(atoms.listBoards, { mode: 'promise' });
  const createBoard = useAtomSet(atoms.createBoard, { mode: 'promise' });
  const duplicateBoard = useAtomSet(atoms.duplicateBoard, { mode: 'promise' });
  const deleteBoard = useAtomSet(atoms.deleteBoard, { mode: 'promise' });

  const resolveWebsitePreview = useAtomSet(atoms.resolveWebsitePreview, {
    mode: 'promise',
  });

  const resolveXPostPreview = useAtomSet(atoms.resolveXPostPreview, {
    mode: 'promise',
  });

  const commands = useMemo(
    () => ({
      // Read-only views keep event handlers current without another copy of document state.
      boardRef: {
        get current() {
          return registry.get(atoms.state).board;
        },
      },
      cameraRef: {
        get current() {
          return registry.get(atoms.state).camera;
        },
      },
      applyBoard: (update: BoardUpdate) => dispatch({ type: 'edit', update }),
      setCamera: (update: CameraUpdate) => dispatch({ type: 'camera', update }),
      replaceDocument: (
        board: Board,
        camera: Camera,
        enablePersistence = false,
      ) => dispatch({ type: 'replace', board, camera, enablePersistence }),
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),
      reconcileEmbeddedItemSize: (id: ItemId, width: number, height: number) =>
        dispatch({ type: 'resize', id, width, height }),
    }),
    [atoms, dispatch, registry],
  );

  useEffect(() => {
    const flush = () => dispatch({ type: 'flush' });

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [dispatch]);

  return {
    ...state,
    ...commands,
    listBoards,
    createBoard,
    duplicateBoard,
    deleteBoard,
    resolveWebsitePreview,
    resolveXPostPreview,
  };
}
