import { Context, Effect, Layer, Semaphore } from 'effect';

import type { AccountId } from '../lib/account';
import type { BoardId } from '../lib/board-rpc';
import {
  OwnerError,
  type ConfigureOwnerProfile,
  type OwnerSnapshot,
  type PublicationGuard,
} from '../lib/owner-api';
import {
  normalizeDisplayName,
  normalizeProfileBio,
  normalizeProfileHandle,
} from '../lib/public-api';
import { OwnerRepo } from './owner-repo';
import { PublicationRouting } from './publication-routing';

export class OwnerService extends Context.Service<
  OwnerService,
  {
    readonly read: () => Effect.Effect<OwnerSnapshot, OwnerError>;
    readonly configure: (
      accountId: AccountId,
      input: ConfigureOwnerProfile,
    ) => Effect.Effect<OwnerSnapshot, OwnerError>;
    readonly publish: (
      accountId: AccountId,
      boardId: BoardId,
      guard: PublicationGuard,
      published: boolean,
    ) => Effect.Effect<OwnerSnapshot, OwnerError>;
    readonly reconcile: (
      accountId: AccountId,
    ) => Effect.Effect<OwnerSnapshot, OwnerError>;
  }
>()('mood-board/OwnerService') {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const repo = yield* OwnerRepo;
      const routing = yield* PublicationRouting;
      const mutex = yield* Semaphore.make(1);

      const sync = Effect.fn('OwnerService.sync')(function* (
        accountId: AccountId,
        state: OwnerSnapshot,
      ) {
        yield* routing.sync(accountId, state);

        return state;
      });

      return OwnerService.of({
        read: repo.read,
        configure: Effect.fn('OwnerService.configure')(
          function* (accountId, input) {
            const handle = normalizeProfileHandle(input.handle);
            const displayName = normalizeDisplayName(input.displayName);
            const bio = normalizeProfileBio(input.bio);

            if (handle === null || displayName === null || bio === null)
              return yield* new OwnerError({
                code: 'Invalid',
                message: 'Invalid publisher profile.',
              });

            return yield* mutex.withPermit(
              Effect.gen(function* () {
                const before = yield* repo.read();

                if (before.profileVersion !== input.expectedProfileVersion)
                  return yield* new OwnerError({
                    code: 'Conflict',
                    message: 'Publisher profile version changed.',
                  });
                yield* routing.claim(accountId, handle);

                const state = yield* repo
                  .configure(
                    { handle, displayName, bio },
                    input.expectedProfileVersion,
                  )
                  .pipe(
                    Effect.catchTag('OwnerError', (error) =>
                      routing
                        .sync(accountId, before)
                        .pipe(Effect.andThen(Effect.fail(error))),
                    ),
                  );

                return yield* sync(accountId, state);
              }),
            );
          },
        ),
        publish: Effect.fn('OwnerService.publish')(
          function* (accountId, boardId, guard, published) {
            return yield* mutex.withPermit(
              Effect.gen(function* () {
                const state = yield* repo.publish(boardId, guard, published);

                return yield* sync(accountId, state);
              }),
            );
          },
        ),
        reconcile: Effect.fn('OwnerService.reconcile')(function* (accountId) {
          return yield* mutex.withPermit(
            Effect.gen(function* () {
              return yield* sync(accountId, yield* repo.read());
            }),
          );
        }),
      });
    }),
  ).pipe(Layer.provide(OwnerRepo.layer));
}
