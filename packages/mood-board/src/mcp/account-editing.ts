import {
  Context,
  Effect,
  Layer,
  Option,
  Predicate,
  Schema,
  Stream,
} from 'effect';

import { BoardMutationPayloadSchema, ClientIdSchema } from '../lib/board-rpc';
import { AccountClient } from './account-client';
import { AccountError } from './account-contracts';
import { AccountCommandsInput } from './account-editing-contract';
import { BoardCommandError } from './board-command-schema';
import { applyBoardCommands, buildBoardMutation } from './board-commands';

const clientId = ClientIdSchema.make('moodboard-agent');

const make = Effect.gen(function* () {
  const client = yield* AccountClient;

  const apply = Effect.fn('AccountEditing.apply')(function* (
    input: typeof AccountCommandsInput.Type,
  ) {
    const request = yield* Schema.decodeUnknownEffect(AccountCommandsInput)(
      input,
    ).pipe(
      Effect.mapError(
        () =>
          new BoardCommandError({
            code: 'InvalidInput',
            message:
              'Invalid account commands. Supply an exact account, revision, mutation ID, commands, and confirm:true.',
          }),
      ),
    );

    return yield* client.write(request, (rpc, session) =>
      Effect.gen(function* () {
        const initial = yield* rpc
          .SubscribeBoard({ boardId: request.boardId })
          .pipe(Stream.runHead);

        if (
          Option.isNone(initial) ||
          !Predicate.isTagged(initial.value, 'Snapshot')
        )
          return yield* new AccountError({
            code: 'Remote',
            message: 'No board snapshot was returned.',
          });

        const snapshot = initial.value;

        if (
          snapshot.boardId !== request.boardId ||
          snapshot.revision !== request.expectedRevision
        )
          return yield* new AccountError({
            code: 'Conflict',
            message:
              'The board changed. Read its current revision before editing.',
          });

        const after = yield* applyBoardCommands(
          snapshot.board,
          request.commands,
        );

        const mutation = yield* Schema.decodeUnknownEffect(
          BoardMutationPayloadSchema,
        )(buildBoardMutation(snapshot.board, after)).pipe(
          Effect.mapError(
            () =>
              new BoardCommandError({
                code: 'InvalidInput',
                message: 'The commands produced an invalid board mutation.',
              }),
          ),
        );

        const change = yield* rpc.CommitBoard({
          ...mutation,
          boardId: request.boardId,
          expectedRevision: snapshot.revision,
          mutationId: request.mutationId,
          clientId,
        });

        return {
          account: session.reference,
          boardId: request.boardId,
          revision: change.revision,
          url: `${session.reference.origin}/boards/${encodeURIComponent(request.boardId)}`,
        };
      }),
    );
  });

  return { apply };
});

export class AccountEditing extends Context.Service<
  AccountEditing,
  Effect.Success<typeof make>
>()('moodboard/mcp/AccountEditing') {
  static readonly layer = Layer.effect(this, make);
}
