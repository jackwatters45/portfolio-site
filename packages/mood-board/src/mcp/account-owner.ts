import { Context, Effect, Layer, Schema } from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/unstable/http';

import {
  ConfigureOwnerProfileSchema,
  OwnerSnapshotSchema,
  PublicationGuardSchema,
} from '../lib/owner-api';
import { AccountClient, type AccountSession } from './account-client';
import { AccountConnection } from './account-connection';
import {
  AccountBoardInput,
  AccountError,
  AccountReference,
} from './account-contracts';
import {
  accountRequestError,
  accountTransportError,
} from './account-diagnostics';

export const AccountUserProfileInput = Schema.Struct({
  account: AccountReference,
  name: Schema.String.check(Schema.isLengthBetween(1, 80)),
  confirm: Schema.Literal(true),
});

export const AccountOwnerInput = Schema.Struct({ account: AccountReference });

export const AccountProfileInput = Schema.Struct({
  ...AccountOwnerInput.fields,
  ...ConfigureOwnerProfileSchema.fields,
  confirm: Schema.Literal(true),
});

export const AccountPublicationInput = Schema.Struct({
  ...AccountBoardInput.fields,
  ...PublicationGuardSchema.fields,
  confirm: Schema.Literal(true),
});

export const AccountReconcileInput = Schema.Struct({
  ...AccountOwnerInput.fields,
  confirm: Schema.Literal(true),
});

export const AccountOwnerOutput = Schema.Struct({
  account: AccountReference,
  state: OwnerSnapshotSchema,
});

const make = Effect.gen(function* () {
  const client = yield* AccountClient;
  const connection = yield* AccountConnection;

  const request = Effect.fn('AccountOwner.request')(function* (
    session: AccountSession,
    input: HttpClientRequest.HttpClientRequest,
  ) {
    const response = yield* HttpClient.withScope(session.http)
      .execute(input)
      .pipe(
        Effect.timeout('30 seconds'),
        Effect.mapError((error) => accountTransportError(error, input)),
      );

    if (response.status !== 200)
      return yield* accountRequestError(
        'HttpStatus',
        'Owner request failed. Read owner state before retrying; a write may have succeeded. Reconcile routing after a partial publication change.',
        input,
        response,
        response.status === 409 ? 'Conflict' : 'Remote',
      );

    return {
      account: session.reference,
      state: yield* connection.readJson(response, OwnerSnapshotSchema),
    };
  });

  const jsonRequest = (
    session: AccountSession,
    path: string,
    method: 'POST' | 'PUT',
    body: Schema.JsonObject,
  ) =>
    HttpClientRequest.make(method)(`${session.reference.origin}${path}`).pipe(
      HttpClientRequest.bodyJson(body),
      Effect.mapError(
        () =>
          new AccountError({
            code: 'Remote',
            message: 'Cannot encode owner request.',
          }),
      ),
      Effect.flatMap((input) => request(session, input)),
    );

  const read = Effect.fn('AccountOwner.read')(
    (input: typeof AccountOwnerInput.Type) =>
      client.read(input.account, (_rpc, session) =>
        request(
          session,
          HttpClientRequest.get(`${session.reference.origin}/api/owner`),
        ),
      ),
  );

  const configure = Effect.fn('AccountOwner.configure')(
    (input: typeof AccountProfileInput.Type) =>
      client.write(input, (_rpc, session) =>
        jsonRequest(session, '/api/owner/profile', 'PUT', {
          handle: input.handle,
          displayName: input.displayName,
          bio: input.bio,
          expectedProfileVersion: input.expectedProfileVersion,
        }),
      ),
  );

  const publication = Effect.fn('AccountOwner.publication')(
    (input: typeof AccountPublicationInput.Type, published: boolean) =>
      client.write(input, (_rpc, session) =>
        jsonRequest(
          session,
          `/api/owner/boards/${encodeURIComponent(input.boardId)}/${published ? 'publish' : 'unpublish'}`,
          'POST',
          {
            expectedRevision: input.expectedRevision,
            expectedPublicationVersion: input.expectedPublicationVersion,
            expectedProfileVersion: input.expectedProfileVersion,
          },
        ),
      ),
  );

  const reconcile = Effect.fn('AccountOwner.reconcile')(
    (input: typeof AccountReconcileInput.Type) =>
      client.write(input, (_rpc, session) =>
        jsonRequest(session, '/api/owner/reconcile', 'POST', {}),
      ),
  );

  const updateUser = Effect.fn('AccountOwner.updateUser')(
    (input: typeof AccountUserProfileInput.Type) =>
      client.write(input, (_rpc, session) =>
        Effect.gen(function* () {
          const name = input.name.trim();

          if (name.length === 0)
            return yield* new AccountError({
              code: 'Remote',
              message: 'Display name must not be blank.',
            });

          const inputRequest = yield* HttpClientRequest.post(
            `${session.reference.origin}/api/auth/update-user`,
          ).pipe(
            HttpClientRequest.bodyJson({ name }),
            Effect.mapError(
              () =>
                new AccountError({
                  code: 'Remote',
                  message: 'Cannot encode profile request.',
                }),
            ),
          );

          const response = yield* HttpClient.withScope(session.http)
            .execute(inputRequest)
            .pipe(
              Effect.timeout('30 seconds'),
              Effect.mapError((error) =>
                accountTransportError(error, inputRequest),
              ),
            );

          if (response.status !== 200)
            return yield* accountRequestError(
              'HttpStatus',
              'Account profile update failed. Read account status before retrying.',
              inputRequest,
              response,
            );
          yield* connection.readJson(
            response,
            Schema.Struct({ status: Schema.Literal(true) }),
          );
          const updated = yield* connection.connected(session.reference);

          return {
            account: updated.account,
            origin: updated.reference.origin,
            writesAllowed: connection.writesAllowed,
          };
        }),
      ),
  );

  return { read, configure, publication, reconcile, updateUser };
});

export class AccountOwner extends Context.Service<
  AccountOwner,
  Effect.Success<typeof make>
>()('moodboard/mcp/AccountOwner') {
  static readonly layer = Layer.effect(this, make);
}
