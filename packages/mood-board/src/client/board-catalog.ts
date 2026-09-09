import { Effect } from "effect";

import {
  BoardIdSchema,
  type BoardDeleted,
  type BoardId,
  type BoardSummary,
} from "../lib/board-rpc";
import { BoardRpcClient, makeBoardRpcRuntime } from "./board-rpc-client";

export interface BoardCatalog {
  readonly list: () => Promise<ReadonlyArray<BoardSummary>>;
  readonly create: (title: string) => Promise<BoardSummary>;
  readonly duplicate: (sourceBoardId: BoardId, title: string) => Promise<BoardSummary>;
  readonly delete: (boardId: BoardId) => Promise<BoardDeleted>;
  readonly close: () => Promise<void>;
}

const newBoardId = (): BoardId => BoardIdSchema.make(globalThis.crypto.randomUUID());

export const createBoardCatalog = (): BoardCatalog => {
  const runtime = makeBoardRpcRuntime();

  return {
    list: () =>
      runtime.runPromise(
        BoardRpcClient.use((client) => client.ListBoards()).pipe(Effect.timeout("10 seconds")),
      ),
    create: (title) => {
      const boardId = newBoardId();
      return runtime.runPromise(
        BoardRpcClient.use((client) => client.CreateBoard({ boardId, title })).pipe(
          Effect.timeout("10 seconds"),
        ),
      );
    },
    duplicate: (sourceBoardId, title) => {
      const boardId = newBoardId();
      return runtime.runPromise(
        BoardRpcClient.use((client) =>
          client.DuplicateBoard({
            sourceBoardId,
            boardId,
            title,
          }),
        ).pipe(Effect.timeout("10 seconds")),
      );
    },
    delete: (boardId) =>
      runtime.runPromise(
        BoardRpcClient.use((client) => client.DeleteBoard({ boardId })).pipe(
          Effect.timeout("10 seconds"),
        ),
      ),
    close: () => runtime.dispose(),
  };
};
