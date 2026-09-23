import type { D1Database } from '@cloudflare/workers-types';
import { Clock, Effect, Layer } from 'effect';

import type { AccountId } from '../lib/account';
import { OwnerError, type OwnerSnapshot } from '../lib/owner-api';
import type { ProfileHandle } from '../lib/public-api';
import { PublicationRouting } from '../server/publication-routing';

export const publicationRoutingLayer = (db: D1Database) =>
  Layer.succeed(PublicationRouting, {
    claim: Effect.fn('PublicationRouting.claim')(function* (
      accountId: AccountId,
      handle: ProfileHandle,
    ) {
      const now = yield* Clock.currentTimeMillis;
      // The primary key enforces handle uniqueness across all account workspaces.
      yield* Effect.tryPromise({
        try: () =>
          db
            .prepare(
              'INSERT INTO public_profile_route (handle, userId, updatedAt) VALUES (?, ?, ?) ON CONFLICT(userId) DO UPDATE SET handle = excluded.handle, updatedAt = excluded.updatedAt',
            )
            .bind(handle, accountId, now)
            .run(),
        catch: (cause) =>
          new OwnerError({
            code:
              cause instanceof Error &&
              cause.message.includes('UNIQUE constraint failed')
                ? 'HandleTaken'
                : 'Projection',
            message:
              'The publisher handle could not be reserved. Read owner state and retry or reconcile.',
          }),
      });
    }),
    sync: Effect.fn('PublicationRouting.sync')(function* (
      accountId: AccountId,
      state: OwnerSnapshot,
    ) {
      const now = yield* Clock.currentTimeMillis;

      const statements = [
        db
          .prepare('DELETE FROM public_board_route WHERE userId = ?')
          .bind(accountId),
      ];

      if (state.profile === null)
        statements.push(
          db
            .prepare('DELETE FROM public_profile_route WHERE userId = ?')
            .bind(accountId),
        );
      else
        statements.push(
          db
            .prepare(
              'INSERT INTO public_profile_route (handle, userId, updatedAt) VALUES (?, ?, ?) ON CONFLICT(userId) DO UPDATE SET handle = excluded.handle, updatedAt = excluded.updatedAt',
            )
            .bind(state.profile.handle, accountId, now),
        );

      for (const publication of state.publications)
        statements.push(
          db
            .prepare(
              'INSERT INTO public_board_route (publicId, userId, boardId, updatedAt) VALUES (?, ?, ?, ?)',
            )
            .bind(publication.publicId, accountId, publication.boardId, now),
        );
      yield* Effect.tryPromise({
        try: () => db.batch(statements),
        catch: () =>
          new OwnerError({
            code: 'Projection',
            message:
              'Owner state is saved, but public routes need recovery. Call /api/owner/reconcile.',
            state,
          }),
      });
    }),
  });
