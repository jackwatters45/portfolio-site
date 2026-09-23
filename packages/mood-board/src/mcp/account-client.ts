import {
  Cause,
  Context,
  Effect,
  Layer,
  Option,
  Predicate,
  Semaphore,
} from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/unstable/http';
import {
  RpcClient,
  RpcSerialization,
  type RpcGroup,
} from 'effect/unstable/rpc';
import { RpcClientError } from 'effect/unstable/rpc/RpcClientError';

import { BoardBackendError, BoardRpcs } from '../lib/board-rpc';
import { AccountConnection } from './account-connection';
import { AccountError, type AccountReference } from './account-contracts';

export type AccountRpcClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof BoardRpcs>,
  RpcClientError
>;

export type AccountSession = Effect.Success<
  ReturnType<(typeof AccountConnection)['Service']['connected']>
>;

export const accountRpcErrors = <A, E, R>(
  effect: Effect.Effect<A, E | BoardBackendError | RpcClientError, R>,
) =>
  effect.pipe(
    Effect.timeout('10 minutes'),
    Effect.catchIf(
      (error: unknown): error is BoardBackendError =>
        error instanceof BoardBackendError,
      (error) =>
        new AccountError({
          code: error.code === 'Conflict' ? 'Conflict' : 'Remote',
          message:
            error.code === 'Conflict'
              ? 'This board changed. Read its current revision before editing.'
              : `The board request was rejected (${error.code}). Read the board before retrying.`,
          diagnostic: {
            category: 'BoardRejected',
            method: 'POST',
            endpoint: '/rpc',
          },
        }),
    ),
    Effect.catchIf(
      (error: unknown): error is RpcClientError =>
        error instanceof RpcClientError,
      (error) =>
        new AccountError({
          code: 'Remote',
          message:
            'Account RPC failed. A write may have succeeded. Read the board before retrying.',
          diagnostic: {
            category: Predicate.isTagged(error.reason, 'HttpError')
              ? error.reason.kind
              : 'RpcError',
            method: 'POST',
            endpoint: '/rpc',
          },
        }),
    ),
    Effect.catchIf(
      Cause.isTimeoutError,
      () =>
        new AccountError({
          code: 'Remote',
          message:
            'Account RPC timed out after 10 minutes. A write may have succeeded. Read the board before retrying.',
          diagnostic: { category: 'Timeout', method: 'POST', endpoint: '/rpc' },
        }),
    ),
  );

const make = Effect.gen(function* () {
  const connection = yield* AccountConnection;
  const permit = yield* Semaphore.make(1);

  const read = <A, E, R>(
    account: typeof AccountReference.Type | undefined,
    work: (
      rpc: AccountRpcClient,
      session: AccountSession,
    ) => Effect.Effect<A, E, R>,
  ) =>
    Effect.gen(function* () {
      const session = yield* connection.connected(account);

      // Resolve the RPC URL before the authenticated client's origin check.
      const protocol = Layer.effect(
        RpcClient.Protocol,
        RpcClient.makeProtocolHttp(
          HttpClient.mapRequestInput(
            session.http,
            HttpClientRequest.prependUrl(`${session.reference.origin}/rpc`),
          ),
        ),
      ).pipe(Layer.provide(RpcSerialization.layerNdjson));

      return yield* Effect.scoped(
        Effect.gen(function* () {
          const rpc = yield* RpcClient.make(BoardRpcs).pipe(
            Effect.provide(protocol),
          );

          return yield* work(rpc, session);
        }),
      ).pipe(accountRpcErrors);
    });

  const write = <A, E, R>(
    input: {
      readonly account: typeof AccountReference.Type;
      readonly confirm: boolean;
    },
    work: (
      rpc: AccountRpcClient,
      session: AccountSession,
    ) => Effect.Effect<A, E, R>,
  ) =>
    Effect.gen(function* () {
      if (!connection.writesAllowed || input.confirm !== true)
        return yield* new AccountError({
          code: 'AccessDenied',
          message:
            'Account writes require explicit startup approval with --allow-account-write, plus confirm:true.',
        });

      const result = yield* permit.withPermitsIfAvailable(1)(
        read(input.account, work),
      );

      if (Option.isNone(result))
        return yield* new AccountError({
          code: 'Busy',
          message: 'Another account action is running. Wait for it to finish.',
        });

      return result.value;
    });

  return { read, write };
});

export class AccountClient extends Context.Service<
  AccountClient,
  Effect.Success<typeof make>
>()('moodboard/mcp/AccountClient') {
  static readonly layer = Layer.effect(this, make);
}
