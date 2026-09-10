import { Effect, Stream } from "effect";

import { BoardRpcs } from "../lib/board-rpc";
import { BoardService } from "./board-service";
import { WebsitePreviewService } from "./website-preview-service";

export const BoardHandlers = BoardRpcs.toLayer(
  Effect.gen(function* () {
    const boards = yield* BoardService;
    const websitePreviews = yield* WebsitePreviewService;

    return BoardRpcs.of({
      ListBoards: () => boards.list(),
      BoardExists: ({ boardId }) => boards.exists(boardId),
      CreateBoard: ({ boardId, title }) => boards.create(boardId, title),
      DuplicateBoard: ({ sourceBoardId, boardId, title }) =>
        boards.duplicate(sourceBoardId, boardId, title),
      DeleteBoard: ({ boardId }) => boards.delete(boardId),
      SubscribeBoard: ({ boardId }) =>
        boards.subscribe(boardId).pipe(Stream.interruptWhen(Effect.sleep("5 minutes"))),
      ResolveWebsitePreview: ({ url }) => websitePreviews.resolve(url),
      ResolveXPostPreview: ({ url }) => websitePreviews.resolveXPost(url),
      CommitBoard: (input) => boards.commit(input),
    });
  }),
);
