import { Effect, ManagedRuntime, Option, Predicate, Stream } from 'effect';

import {
  BoardIdSchema,
  BoardBackendError,
  type BoardDeleted,
  type BoardId,
  type BoardSummary,
} from '../../lib/board-rpc';
import { BoardRpcClient } from './board-rpc-client';

export interface BoardCatalog {
  readonly list: () => Promise<ReadonlyArray<BoardSummary>>;
  readonly create: (title: string) => Promise<BoardSummary>;
  readonly duplicate: (
    sourceBoardId: BoardId,
    title: string,
  ) => Promise<BoardSummary>;
  readonly delete: (boardId: BoardId) => Promise<BoardDeleted>;
  readonly close: () => Promise<void>;
}

const newBoardId = (): BoardId =>
  BoardIdSchema.make(globalThis.crypto.randomUUID());

export const createBoardCatalog = (): BoardCatalog => {
  const runtime = ManagedRuntime.make(BoardRpcClient.layer);

  return {
    list: () =>
      runtime.runPromise(
        BoardRpcClient.use((client) => client.ListBoards()).pipe(
          Effect.timeout('10 seconds'),
        ),
      ),
    create: (title) => {
      const boardId = newBoardId();

      return runtime.runPromise(
        BoardRpcClient.use((client) =>
          client.CreateBoard({ boardId, title }),
        ).pipe(Effect.timeout('10 seconds')),
      );
    },
    duplicate: (sourceBoardId, title) => {
      const boardId = newBoardId();

      return runtime.runPromise(
        BoardRpcClient.use((client) =>
          Effect.gen(function* () {
            const snapshot = yield* client
              .SubscribeBoard({ boardId: sourceBoardId })
              .pipe(Stream.runHead);

            if (
              Option.isNone(snapshot) ||
              !Predicate.isTagged(snapshot.value, 'Snapshot')
            )
              return yield* new BoardBackendError({
                code: 'NotFound',
                message: 'That board does not exist.',
              });

            return yield* client.DuplicateBoard({
              sourceBoardId,
              boardId,
              title,
              expectedRevision: snapshot.value.revision,
            });
          }),
        ).pipe(Effect.timeout('10 seconds')),
      );
    },
    delete: (boardId) =>
      runtime.runPromise(
        BoardRpcClient.use((client) =>
          Effect.gen(function* () {
            const snapshot = yield* client
              .SubscribeBoard({ boardId })
              .pipe(Stream.runHead);

            if (
              Option.isNone(snapshot) ||
              !Predicate.isTagged(snapshot.value, 'Snapshot')
            )
              return yield* new BoardBackendError({
                code: 'NotFound',
                message: 'That board does not exist.',
              });

            return yield* client.DeleteBoard({
              boardId,
              expectedRevision: snapshot.value.revision,
            });
          }),
        ).pipe(Effect.timeout('10 seconds')),
      ),
    close: () => runtime.dispose(),
  };
};
