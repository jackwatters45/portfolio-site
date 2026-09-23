import { Effect, Schema } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';

import { AccountIdSchema } from '../lib/account';
import { BoardIdSchema } from '../lib/board-rpc';
import {
  ConfigureOwnerProfileSchema,
  OWNER_ACCOUNT_HEADER,
  OwnerError,
  PublicationGuardSchema,
} from '../lib/owner-api';
import { OwnerService } from './owner-service';

const options = {
  headers: {
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  },
};

const invalid = () =>
  new OwnerError({ code: 'Invalid', message: 'Invalid owner request.' });

const recover = (error: OwnerError) =>
  HttpServerResponse.jsonUnsafe(
    { error: error.message, code: error.code, state: error.state },
    {
      ...options,
      status:
        error.code === 'NotFound'
          ? 404
          : error.code === 'Conflict' || error.code === 'HandleTaken'
            ? 409
            : error.code === 'Invalid'
              ? 400
              : 503,
    },
  );

// The Worker authenticates the session and forwards only to that account's DO.
export const OwnerHandlers = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const owner = yield* OwnerService;

    const handle = Effect.fn('OwnerHandlers.handle')(function* (
      operation: 'read' | 'configure' | 'publish' | 'unpublish' | 'reconcile',
    ) {
      const request = yield* HttpServerRequest.HttpServerRequest;

      const account = yield* Schema.decodeUnknownEffect(AccountIdSchema)(
        request.headers[OWNER_ACCOUNT_HEADER],
      ).pipe(Effect.mapError(invalid));

      if (operation === 'read') return yield* owner.read();

      if (operation === 'reconcile') return yield* owner.reconcile(account);
      const body = yield* request.json.pipe(Effect.mapError(invalid));

      if (operation === 'configure') {
        const input = yield* Schema.decodeUnknownEffect(
          ConfigureOwnerProfileSchema,
        )(body).pipe(Effect.mapError(invalid));

        return yield* owner.configure(account, input);
      }

      const params = yield* HttpRouter.params;

      const boardId = yield* Schema.decodeUnknownEffect(BoardIdSchema)(
        params.boardId,
      ).pipe(Effect.mapError(invalid));

      const guard = yield* Schema.decodeUnknownEffect(PublicationGuardSchema)(
        body,
      ).pipe(Effect.mapError(invalid));

      return yield* owner.publish(
        account,
        boardId,
        guard,
        operation === 'publish',
      );
    });

    const response = (operation: Parameters<typeof handle>[0]) =>
      handle(operation).pipe(
        Effect.map((state) => HttpServerResponse.jsonUnsafe(state, options)),
        Effect.catchTag('OwnerError', (error) =>
          Effect.succeed(recover(error)),
        ),
      );

    yield* router.add('GET', '/api/owner', response('read'));
    yield* router.add('PUT', '/api/owner/profile', response('configure'));
    yield* router.add(
      'POST',
      '/api/owner/boards/:boardId/publish',
      response('publish'),
    );
    yield* router.add(
      'POST',
      '/api/owner/boards/:boardId/unpublish',
      response('unpublish'),
    );
    yield* router.add('POST', '/api/owner/reconcile', response('reconcile'));
  }),
);
