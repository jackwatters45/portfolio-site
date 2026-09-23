import {
  Context,
  Effect,
  Layer,
  Option,
  Predicate,
  Semaphore,
  Stream,
  type Scope,
} from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/unstable/http';
import {
  RpcClient,
  RpcSerialization,
  type RpcGroup,
} from 'effect/unstable/rpc';
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError';

import {
  BoardRpcs,
  BoardRevisionSchema,
  ClientIdSchema,
  DEFAULT_BOARD_ID,
  MutationIdSchema,
  BoardBackendError,
  type BoardId,
} from '../lib/board-rpc';
import { MediaUploadResponseSchema, type MediaId } from '../lib/media';
import { AccountConnection } from './account-connection';
import {
  AccountError,
  type AccountBoardInput,
  type AccountEditInput,
  type AccountReference,
  type AccountSaveInput,
} from './account-contracts';
import { LocalBoardError } from './contracts';
import { LocalArchive } from './local-archive';
import { contentHash, LocalFiles } from './local-files';

type Client = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof BoardRpcs>,
  RpcClientError
>;

type Session = Effect.Success<
  ReturnType<(typeof AccountConnection)['Service']['connected']>
>;

type Failure =
  | AccountError
  | LocalBoardError
  | BoardBackendError
  | RpcClientError;

const clientId = ClientIdSchema.make('moodboard-agent');

const boardUrl = (origin: string, id: BoardId) =>
  `${origin}/boards/${encodeURIComponent(id)}`;

const make = Effect.gen(function* () {
  const connection = yield* AccountConnection;
  const files = yield* LocalFiles;
  const archive = yield* LocalArchive;
  const permit = yield* Semaphore.make(1);

  const withClient = <A>(
    expected: typeof AccountReference.Type | undefined,
    work: (
      client: Client,
      session: Session,
    ) => Effect.Effect<A, Failure, Scope.Scope>,
  ) =>
    Effect.gen(function* () {
      const session = yield* connection.connected(expected);

      const protocol = RpcClient.layerProtocolHttp({
        url: `${session.reference.origin}/rpc`,
      }).pipe(
        Layer.provide(RpcSerialization.layerNdjson),
        Layer.provide(Layer.succeed(HttpClient.HttpClient, session.http)),
      );

      return yield* Effect.scoped(
        Effect.gen(function* () {
          const client = yield* RpcClient.make(BoardRpcs);

          return yield* work(client, session);
        }).pipe(Effect.provide(protocol)),
      ).pipe(
        Effect.timeout('10 minutes'),
        Effect.mapError((error) => {
          if (error instanceof LocalBoardError || error instanceof AccountError)
            return error;

          if (error instanceof BoardBackendError)
            return new AccountError({
              code: error.code === 'Conflict' ? 'Conflict' : 'Remote',
              message: error.message,
            });

          return new AccountError({
            code: 'Remote',
            message:
              'Account request failed or timed out. A write may have succeeded. Read the board before retrying.',
          });
        }),
      );
    });

  const writable = Effect.gen(function* () {
    if (!connection.writesAllowed)
      return yield* new AccountError({
        code: 'AccessDenied',
        message:
          'Account writes require explicit startup approval with --allow-account-write, plus confirm:true.',
      });
  });

  const exclusive = <A, E>(work: Effect.Effect<A, E>) =>
    permit
      .withPermitsIfAvailable(1)(work)
      .pipe(
        Effect.flatMap((result) =>
          Option.isSome(result)
            ? Effect.succeed(result.value)
            : Effect.fail(
                new AccountError({
                  code: 'Busy',
                  message:
                    'Another account action is running. Wait for it to finish.',
                }),
              ),
        ),
      );

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
      exclusive(
        Effect.gen(function* () {
          yield* writable;

          return yield* withClient(input.account, (client, session) =>
            Effect.gen(function* () {
              const change = yield* client.CommitBoard({
                boardId: input.boardId,
                clientId,
                mutationId: input.mutationId,
                expectedRevision: input.expectedRevision,
                title: input.title,
                background: input.background,
                backgroundMediaId: input.backgroundMediaId,
                upserts: input.upserts,
                deletes: input.deletes,
              });

              return {
                account: session.reference,
                boardId: input.boardId,
                revision: change.revision,
                url: boardUrl(session.reference.origin, input.boardId),
              };
            }),
          );
        }),
      ),
  );

  const save = Effect.fn('AccountBoards.save')(
    (input: typeof AccountSaveInput.Type) =>
      exclusive(
        Effect.gen(function* () {
          yield* writable;

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

          return yield* withClient(input.account, (client, session) =>
            Effect.gen(function* () {
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
                  const response = yield* HttpClient.withScope(session.http)
                    .execute(
                      HttpClientRequest.post(
                        `${session.reference.origin}/api/owner/media?kind=${asset.kind}`,
                      ).pipe(
                        HttpClientRequest.setHeader('x-media-kind', asset.kind),
                        HttpClientRequest.bodyUint8Array(
                          asset.bytes,
                          asset.mimeType,
                        ),
                      ),
                    )
                    .pipe(
                      Effect.timeout('60 seconds'),
                      Effect.mapError(
                        () =>
                          new AccountError({
                            code: 'Remote',
                            message: 'Media upload failed or timed out.',
                          }),
                      ),
                    );

                  if (response.status !== 201 && response.status !== 200)
                    return yield* new AccountError({
                      code: 'Remote',
                      message: `Media upload was refused (HTTP ${response.status}). Check account access and upload quotas.`,
                    });

                  const receipt = yield* connection.readJson(
                    response,
                    MediaUploadResponseSchema,
                  );

                  if (
                    receipt.kind !== asset.kind ||
                    receipt.byteLength !== asset.bytes.length
                  )
                    return yield* new AccountError({
                      code: 'Remote',
                      message: 'Invalid media upload receipt.',
                    });
                  ids.set(asset.mediaId, receipt.mediaId);
                }

                const change = yield* client.CommitBoard({
                  boardId: input.boardId,
                  clientId,
                  mutationId: MutationIdSchema.make(`import-${input.boardId}`),
                  expectedRevision: BoardRevisionSchema.make(0),
                  title: document.board.title,
                  background: document.board.background,
                  backgroundMediaId:
                    document.board.backgroundMediaId === undefined
                      ? undefined
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
                  () =>
                    new AccountError({
                      code: 'PartialSave',
                      boardId: input.boardId,
                      url,
                      message:
                        'Account save did not finish cleanly. Inspect this board before retrying: it may be empty or already saved. Uploaded media may remain. The local archive is unchanged. Use a fresh boardId for a new save; no remote rollback or deletion was attempted.',
                    }),
                ),
              );
            }),
          );
        }),
      ),
  );

  return { list, get, edit, save };
});

export class AccountBoards extends Context.Service<
  AccountBoards,
  Effect.Success<typeof make>
>()('moodboard/local/AccountBoards') {
  static readonly layer = Layer.effect(this, make);
}
