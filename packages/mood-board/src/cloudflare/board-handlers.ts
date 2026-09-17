import { Effect, Stream } from "effect";

import {
  BoardBackendError,
  BoardItemCountSchema,
  BoardRevisionSchema,
  BoardRpcs,
  type BoardId,
  type BoardRevision,
  type BoardSnapshot,
  type BoardSummary,
} from "../lib/board-rpc";
import { BoardService } from "../server/board-service";
import { WebsitePreviewService } from "../server/website-preview-service";
import { CatalogProjection } from "./catalog-projection";

const summaryFromSnapshot = (boardId: BoardId, snapshot: BoardSnapshot): BoardSummary => ({
  id: boardId,
  title: snapshot.board.title,
  itemCount: BoardItemCountSchema.make(snapshot.board.items.length),
  updatedAt: snapshot.board.updatedAt,
});

const missingBoard = () =>
  new BoardBackendError({
    code: "NotFound",
    message: "That board does not exist.",
  });

export const CloudflareBoardHandlers = BoardRpcs.toLayer(
  Effect.gen(function* () {
    const boards = yield* BoardService;
    const projection = yield* CatalogProjection;
    const websitePreviews = yield* WebsitePreviewService;

    const bestEffort = Effect.fn("CloudflareBoardHandlers.bestEffort")(
      <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        effect.pipe(
          Effect.catch((error) =>
            Effect.logWarning("The D1 board directory projection is behind.", error),
          ),
          Effect.asVoid,
        ),
    );

    const listBoards = Effect.fn("CloudflareBoardHandlers.ListBoards")(function* () {
      const summaries = yield* boards.list();
      const entries: Array<{
        readonly summary: BoardSummary;
        readonly revision: BoardRevision;
      }> = [];
      for (const summary of summaries) {
        const snapshot = yield* boards.get(summary.id);
        if (snapshot !== null) {
          entries.push({ summary, revision: snapshot.revision });
        }
      }
      yield* bestEffort(projection.reconcile(entries));
      return summaries;
    });

    const createBoard = Effect.fn("CloudflareBoardHandlers.CreateBoard")(function* (
      ...args: Parameters<typeof boards.create>
    ) {
      const summary = yield* boards.create(...args);
      yield* bestEffort(projection.upsert(summary, BoardRevisionSchema.make(0)));
      return summary;
    });

    const duplicateBoard = Effect.fn("CloudflareBoardHandlers.DuplicateBoard")(function* (
      ...args: Parameters<typeof boards.duplicate>
    ) {
      const summary = yield* boards.duplicate(...args);
      yield* bestEffort(projection.upsert(summary, BoardRevisionSchema.make(0)));
      return summary;
    });

    const deleteBoard = Effect.fn("CloudflareBoardHandlers.DeleteBoard")(function* (
      ...args: Parameters<typeof boards.delete>
    ) {
      const event = yield* boards.delete(...args);
      yield* bestEffort(projection.tombstone(event));
      return event;
    });

    const commitBoard = Effect.fn("CloudflareBoardHandlers.CommitBoard")(function* (
      input: Parameters<typeof boards.commit>[0],
    ) {
      const change = yield* boards.commit(input);
      const snapshot = yield* boards.get(input.boardId);
      if (snapshot === null) return yield* missingBoard();
      yield* bestEffort(
        projection.upsert(summaryFromSnapshot(input.boardId, snapshot), snapshot.revision),
      );
      return change;
    });

    return BoardRpcs.of({
      ListBoards: listBoards,
      BoardExists: ({ boardId }) => boards.exists(boardId),
      CreateBoard: ({ boardId, title }) => createBoard(boardId, title),
      DuplicateBoard: ({ sourceBoardId, boardId, title }) =>
        duplicateBoard(sourceBoardId, boardId, title),
      DeleteBoard: ({ boardId }) => deleteBoard(boardId),
      SubscribeBoard: ({ boardId }) =>
        boards.subscribe(boardId).pipe(Stream.interruptWhen(Effect.sleep("5 minutes"))),
      ResolveWebsitePreview: ({ url }) => websitePreviews.resolve(url),
      ResolveXPostPreview: ({ url }) => websitePreviews.resolveXPost(url),
      CommitBoard: commitBoard,
    });
  }),
);
