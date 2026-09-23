import { Context, Effect, Layer, Option, Predicate, Stream } from 'effect';
import { AccountClient } from './account-client';

import {
  BoardRevisionSchema,
  ClientIdSchema,
  DEFAULT_BOARD_ID,
  MutationIdSchema,
  type BoardId,
  type BoardMutationPayload,
} from '../lib/board-rpc';
import type { MediaId } from '../lib/media';
import { AccountConnection } from './account-connection';
import {
  AccountError,
  type AccountBoardInput,
  type AccountEditInput,
  type AccountSaveInput,
  type AccountCreateInput,
  type AccountDuplicateInput,
  type AccountDeleteInput,
  type AccountRenameInput,
} from './account-contracts';
import { uploadAccountAsset } from './account-media-transfer';
import { LocalBoardError } from './contracts';
import { LocalArchive } from './local-archive';
import { contentHash, LocalFiles } from './local-files';

const clientId = ClientIdSchema.make('moodboard-agent');

const boardUrl = (origin: string, id: BoardId) =>
  `${origin}/boards/${encodeURIComponent(id)}`;

const make = Effect.gen(function* () {
  const connection = yield* AccountConnection;
  const files = yield* LocalFiles;
  const archive = yield* LocalArchive;
  const transport = yield* AccountClient;
  const withClient = transport.read;

  const list = Effect.fn('AccountBoards.list')(() =>
    withClient(undefined, (client, session) =>
      Effect.gen(function* () {
        return {
          account: session.reference,
          boards: yield* client.ListBoards(),
        };
      }),
    ),
  );

  const get = Effect.fn('AccountBoards.get')(
    (input: typeof AccountBoardInput.Type) =>
      withClient(input.account, (client, session) =>
        Effect.gen(function* () {
          const initial = yield* client
            .SubscribeBoard({ boardId: input.boardId })
            .pipe(Stream.runHead);

          if (
            Option.isNone(initial) ||
            !Predicate.isTagged(initial.value, 'Snapshot')
          )
            return yield* new AccountError({
              code: 'Remote',
              message: 'No board snapshot was returned.',
            });

          return {
            account: session.reference,
            snapshot: initial.value,
            url: boardUrl(session.reference.origin, input.boardId),
          };
        }),
      ),
  );

  const edit = Effect.fn('AccountBoards.edit')(
    (input: typeof AccountEditInput.Type) =>
      transport.write(input, (client, session) =>
        Effect.gen(function* () {
          return yield* Effect.gen(function* () {
            // The RPC JSON codec turns explicit undefined into null. Omit
            // unchanged fields so a note edit cannot clear the background.
            let payload: BoardMutationPayload = {
              upserts: input.upserts,
              deletes: input.deletes,
            };

            if (input.title !== undefined)
              payload = { ...payload, title: input.title };

            if (input.background !== undefined)
              payload = { ...payload, background: input.background };

            if (input.backgroundMediaId !== undefined)
              payload = {
                ...payload,
                backgroundMediaId: input.backgroundMediaId,
              };

            const change = yield* client.CommitBoard({
              ...payload,
              boardId: input.boardId,
              clientId,
              mutationId: input.mutationId,
              expectedRevision: input.expectedRevision,
            });

            return {
              account: session.reference,
              boardId: input.boardId,
              revision: change.revision,
              url: boardUrl(session.reference.origin, input.boardId),
            };
          });
        }),
      ),
  );

  const save = Effect.fn('AccountBoards.save')(
    (input: typeof AccountSaveInput.Type) =>
      transport.write(input, (client, session) =>
        Effect.gen(function* () {
          if (input.boardId === DEFAULT_BOARD_ID)
            return yield* new AccountError({
              code: 'Conflict',
              message:
                'Use a fresh UUID boardId, not default. Saving never replaces an existing account board.',
            });
          const bytes = yield* files.readBoard(input.board.file);

          if (contentHash(bytes) !== input.board.sha256)
            return yield* new LocalBoardError({
              code: 'Changed',
              message:
                'The local archive changed. Call get_board and review it again.',
            });
          const document = yield* archive.read(bytes);

          return yield* Effect.gen(function* () {
            if (yield* client.BoardExists({ boardId: input.boardId }))
              return yield* new AccountError({
                code: 'Conflict',
                message:
                  'That account board already exists. Inspect it or use a fresh boardId.',
              });
            const url = boardUrl(session.reference.origin, input.boardId);

            return yield* Effect.gen(function* () {
              // Reserve the destination atomically before uploads. Failures keep a recoverable empty board.
              yield* client.CreateBoard({
                boardId: input.boardId,
                title: document.board.title,
                requireNew: true,
              });
              const ids = new Map<MediaId, MediaId>();

              for (const asset of document.media.values()) {
                const receipt = yield* uploadAccountAsset(session, asset).pipe(
                  Effect.provideService(AccountConnection, connection),
                );

                ids.set(asset.mediaId, receipt.mediaId);
              }

              const change = yield* client.CommitBoard({
                boardId: input.boardId,
                clientId,
                mutationId: MutationIdSchema.make(`import-${input.boardId}`),
                expectedRevision: BoardRevisionSchema.make(0),
                title: document.board.title,
                background: document.board.background ?? null,
                backgroundMediaId:
                  document.board.backgroundMediaId === undefined
                    ? null
                    : ids.get(document.board.backgroundMediaId),
                upserts: document.board.items.map((item) =>
                  item.mediaId === undefined
                    ? item
                    : { ...item, mediaId: ids.get(item.mediaId) },
                ),
                deletes: [],
              });

              return {
                account: session.reference,
                boardId: input.boardId,
                revision: change.revision,
                url,
                source: input.board,
                mediaCount: ids.size,
                published: false as const,
              };
            }).pipe(
              Effect.mapError(
                (error) =>
                  new AccountError({
                    code: 'PartialSave',
                    diagnostic:
                      error instanceof AccountError
                        ? error.diagnostic
                        : undefined,
                    boardId: input.boardId,
                    url,
                    message:
                      'Account save did not finish cleanly. Inspect this board before retrying: it may be empty or already saved. Uploaded media may remain. The local archive is unchanged. Use a fresh boardId for a new save; no remote rollback or deletion was attempted.',
                  }),
              ),
            );
          });
        }),
      ),
  );

  const create = Effect.fn('AccountBoards.create')(
    (input: typeof AccountCreateInput.Type) =>
      transport.write(input, (rpc, session) =>
        Effect.gen(function* () {
          if (input.boardId === DEFAULT_BOARD_ID)
            return yield* new AccountError({
              code: 'Conflict',
              message: 'Use a fresh UUID boardId, not default.',
            });

          const board = yield* rpc.CreateBoard({
            boardId: input.boardId,
            title: input.title,
            requireNew: true,
          });

          return {
            account: session.reference,
            board,
            url: boardUrl(session.reference.origin, board.id),
            published: false as const,
          };
        }),
      ),
  );

  const duplicate = Effect.fn('AccountBoards.duplicate')(
    (input: typeof AccountDuplicateInput.Type) =>
      transport.write(input, (rpc, session) =>
        Effect.gen(function* () {
          if (input.boardId === DEFAULT_BOARD_ID)
            return yield* new AccountError({
              code: 'Conflict',
              message: 'Use a fresh UUID boardId, not default.',
            });

          const board = yield* rpc.DuplicateBoard({
            sourceBoardId: input.sourceBoardId,
            boardId: input.boardId,
            title: input.title,
            expectedRevision: input.expectedRevision,
          });

          return {
            account: session.reference,
            board,
            url: boardUrl(session.reference.origin, board.id),
            published: false as const,
          };
        }),
      ),
  );

  const deleteBoard = Effect.fn('AccountBoards.delete')(
    (input: typeof AccountDeleteInput.Type) =>
      transport.write(input, (rpc, session) =>
        Effect.gen(function* () {
          const event = yield* rpc.DeleteBoard({
            boardId: input.boardId,
            expectedRevision: input.expectedRevision,
          });

          return { account: session.reference, event };
        }),
      ),
  );

  const rename = Effect.fn('AccountBoards.rename')(
    (input: typeof AccountRenameInput.Type) =>
      edit({ ...input, upserts: [], deletes: [] }),
  );

  return {
    list,
    get,
    edit,
    save,
    create,
    duplicate,
    delete: deleteBoard,
    rename,
  };
});

export class AccountBoards extends Context.Service<
  AccountBoards,
  Effect.Success<typeof make>
>()('moodboard/mcp/AccountBoards') {
  static readonly layer = Layer.effect(this, make);
}
