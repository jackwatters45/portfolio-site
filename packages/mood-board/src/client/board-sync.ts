import { Deferred, Effect, Fiber, Schedule, Schema, Stream } from "effect";

import type { AccountId } from "../lib/account";
import {
  BoardIdSchema,
  ClientIdSchema,
  DEFAULT_BOARD_ID,
  MutationIdSchema,
  type BoardId,
  type BoardSnapshot,
  type ClientId,
  type MutationId,
} from "../lib/board-rpc";
import { OptionalErrorCauseSchema } from "../lib/schema";
import type { WebsitePreview } from "../lib/website-preview";
import type { XPostPreview } from "../lib/x-post";
import {
  BoardRpcClient,
  makeBoardRpcRuntime,
  makeClientId,
  makeMutationId,
} from "./board-rpc-client";
import { applyBoardChange, applyBoardMutation, diffBoards, toLocalBoard } from "./board-sync-model";
import {
  appendPendingMutations,
  loadPendingMutations,
  removePendingMutations,
} from "./board/storage";
import type { Board, BoardMutation, PendingBoardMutation } from "./board/types";

export type CloudSyncState = "connecting" | "live" | "local" | "error";

export interface BoardSync {
  readonly clientId: ClientId;
  readonly commit: (previous: Board, next: Board) => void;
  readonly resolveWebsitePreview: (url: string) => Promise<WebsitePreview>;
  readonly resolveXPostPreview: (url: string) => Promise<XPostPreview>;
  readonly close: () => Promise<void>;
}

interface StartBoardSyncOptions {
  readonly accountId: AccountId;
  readonly boardId: BoardId;
  readonly initialBoard: Board;
  readonly onBoard: (board: Board, remoteDivergence: boolean) => void;
  readonly onStatus: (status: CloudSyncState) => void;
  readonly onUnavailable: (boardId: BoardId) => void;
}

class BoardSyncError extends Schema.Error<BoardSyncError>("BoardSyncError")({
  _tag: Schema.tag("BoardSyncError"),
  reason: Schema.Literals([
    "Unavailable",
    "Outbox",
    "SkippedRevision",
    "Requested",
    "SubscriptionEnded",
  ]),
  boardId: Schema.optional(BoardIdSchema),
  cause: OptionalErrorCauseSchema,
}) {}

const isBoardUnavailable = (
  error: unknown,
): error is BoardSyncError & { readonly boardId: BoardId } =>
  error instanceof BoardSyncError && error.reason === "Unavailable" && error.boardId !== undefined;

const logSyncFailure = (error: unknown) =>
  error instanceof BoardSyncError &&
  (error.reason === "Requested" || error.reason === "Unavailable")
    ? Effect.void
    : Effect.logWarning("Board sync session failed", error);

const storageEffect = <A>(operation: () => Promise<A>) =>
  Effect.tryPromise({
    try: operation,
    catch: (cause) => new BoardSyncError({ reason: "Outbox", cause }),
  });

const makePendingEntries = (
  boardId: BoardId,
  clientId: ClientId,
  drafts: ReadonlyArray<BoardMutation>,
): PendingBoardMutation[] =>
  drafts.map((mutation) => ({
    boardId,
    clientId,
    mutationId: makeMutationId(),
    mutation,
  }));

export const startBoardSync = (options: StartBoardSyncOptions): BoardSync => {
  const { accountId, boardId } = options;
  const clientId = makeClientId();
  const runtime = makeBoardRpcRuntime();
  const optimisticMutations = new Map<MutationId, BoardMutation>();
  let closed = false;
  let live = false;
  let writeQueue = Promise.resolve();
  let requestRestart: (() => void) | undefined;

  const sendEntry = Effect.fn("BoardSync.sendEntry")(function* (entry: PendingBoardMutation) {
    const entryClientId = yield* Schema.decodeUnknownEffect(ClientIdSchema)(entry.clientId).pipe(
      Effect.mapError((cause) => new BoardSyncError({ reason: "Outbox", cause })),
    );
    const mutationId = yield* Schema.decodeUnknownEffect(MutationIdSchema)(entry.mutationId).pipe(
      Effect.mapError((cause) => new BoardSyncError({ reason: "Outbox", cause })),
    );
    return yield* BoardRpcClient.use((client) =>
      client.CommitBoard({
        boardId,
        clientId: entryClientId,
        mutationId,
        ...(entry.mutation.title === undefined ? {} : { title: entry.mutation.title }),
        ...(entry.mutation.background === undefined
          ? {}
          : { background: entry.mutation.background }),
        ...(entry.mutation.backgroundMediaId === undefined
          ? {}
          : { backgroundMediaId: entry.mutation.backgroundMediaId }),
        upserts: entry.mutation.upserts,
        deletes: entry.mutation.deletes,
      }),
    );
  });

  const persistAndSend = (entries: ReadonlyArray<PendingBoardMutation>) => {
    if (entries.length === 0) return;
    for (const entry of entries) {
      optimisticMutations.set(entry.mutationId, entry.mutation);
    }
    writeQueue = writeQueue
      .then(async () => {
        await appendPendingMutations(accountId, boardId, entries);
        if (closed || !live) return;

        try {
          for (const entry of entries) {
            await runtime.runPromise(sendEntry(entry));
            await removePendingMutations(accountId, boardId, [entry.mutationId]);
          }
        } catch {
          live = false;
          options.onStatus("error");
          requestRestart?.();
        }
      })
      .catch(() => {
        if (!closed) options.onStatus("error");
      });
  };

  const runSession = Effect.fn("BoardSync.runSession")(() =>
    Effect.suspend(() => {
      let revision = -1;
      let serverBoard: Board | undefined;

      options.onStatus("connecting");

      return Effect.gen(function* () {
        const client = yield* BoardRpcClient;
        const outboxBeforeOpen = yield* storageEffect(() =>
          loadPendingMutations(accountId, boardId),
        );
        const exists = yield* client.BoardExists({ boardId });

        if (!exists) {
          if (boardId !== DEFAULT_BOARD_ID) {
            return yield* new BoardSyncError({ reason: "Unavailable", boardId });
          }

          let seedBoard = options.initialBoard;
          for (const entry of outboxBeforeOpen) {
            seedBoard = applyBoardMutation(seedBoard, entry.mutation);
          }

          const emptyBoard: Board = {
            version: 1,
            title: "",
            items: [],
            updatedAt: seedBoard.updatedAt,
          };
          const seedEntries = makePendingEntries(
            boardId,
            clientId,
            diffBoards(emptyBoard, seedBoard),
          );
          yield* storageEffect(() => appendPendingMutations(accountId, boardId, seedEntries));
          yield* client.CreateBoard({
            boardId,
            title: seedBoard.title,
          });
        }

        const restartSignal = yield* Deferred.make<void>();
        requestRestart = () => {
          runtime.runFork(Deferred.succeed(restartSignal, undefined));
        };

        const reconcileSnapshot = Effect.fn("BoardSync.reconcileSnapshot")(function* (
          event: BoardSnapshot,
        ) {
          revision = event.revision;
          serverBoard = toLocalBoard(event.board);

          yield* storageEffect(() => writeQueue);
          const pending = yield* storageEffect(() => loadPendingMutations(accountId, boardId));
          const pendingIds = new Set(pending.map((entry) => entry.mutationId));
          for (const mutationId of optimisticMutations.keys()) {
            if (!pendingIds.has(mutationId)) optimisticMutations.delete(mutationId);
          }

          let reconciled = serverBoard;
          for (const entry of pending) {
            reconciled = applyBoardMutation(reconciled, entry.mutation);
            optimisticMutations.delete(entry.mutationId);
          }

          options.onBoard(reconciled, true);
          live = true;
          options.onStatus("live");

          const squashed = makePendingEntries(
            boardId,
            clientId,
            diffBoards(serverBoard, reconciled),
          );
          if (squashed.length > 0) {
            yield* storageEffect(() => appendPendingMutations(accountId, boardId, squashed));
            for (const entry of squashed) {
              optimisticMutations.set(entry.mutationId, entry.mutation);
              yield* sendEntry(entry);
            }
          }
          yield* storageEffect(() =>
            removePendingMutations(accountId, boardId, [
              ...pending.map((entry) => entry.mutationId),
              ...squashed.map((entry) => entry.mutationId),
            ]),
          );
        });

        const subscription = client.SubscribeBoard({ boardId }).pipe(
          Stream.runForEach((event) => {
            if (event._tag === "Snapshot") return reconcileSnapshot(event);

            if (event._tag === "Deleted") {
              return Effect.fail(new BoardSyncError({ reason: "Unavailable", boardId }));
            }

            if (event.revision <= revision) return Effect.void;
            if (event.revision !== revision + 1) {
              return Effect.fail(new BoardSyncError({ reason: "SkippedRevision" }));
            }

            revision = event.revision;
            if (serverBoard === undefined) return Effect.void;
            serverBoard = applyBoardChange(serverBoard, event);
            const localAcknowledgement = optimisticMutations.delete(event.mutationId);
            let displayBoard = serverBoard;
            for (const mutation of optimisticMutations.values()) {
              displayBoard = applyBoardMutation(displayBoard, mutation);
            }
            return Effect.sync(() => options.onBoard(displayBoard, !localAcknowledgement));
          }),
        );

        yield* Effect.raceFirst(
          subscription,
          Deferred.await(restartSignal).pipe(
            Effect.andThen(Effect.fail(new BoardSyncError({ reason: "Requested" }))),
          ),
        );
        return yield* new BoardSyncError({ reason: "SubscriptionEnded" });
      });
    }),
  )().pipe(
    Effect.tapError(logSyncFailure),
    Effect.tapCause(() =>
      Effect.sync(() => {
        requestRestart = undefined;
        if (closed) return;
        live = false;
        options.onStatus("local");
      }),
    ),
    Effect.catchIf(isBoardUnavailable, (error) =>
      Effect.sync(() => options.onUnavailable(error.boardId)),
    ),
    Effect.retry(Schedule.spaced("1 second")),
  );

  const fiber = runtime.runFork(runSession);

  return {
    clientId,
    commit(previous, next) {
      persistAndSend(makePendingEntries(boardId, clientId, diffBoards(previous, next)));
    },
    resolveWebsitePreview(url) {
      return runtime.runPromise(
        BoardRpcClient.use((client) => client.ResolveWebsitePreview({ url })),
      );
    },
    resolveXPostPreview(url) {
      return runtime.runPromise(
        BoardRpcClient.use((client) => client.ResolveXPostPreview({ url })),
      );
    },
    async close() {
      if (closed) return;
      closed = true;
      await runtime.runPromise(Fiber.interrupt(fiber));
      await writeQueue.catch(() => undefined);
      await runtime.dispose();
    },
  };
};
