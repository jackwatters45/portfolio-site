import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { AccountIdSchema } from '../../src/lib/account';
import {
  BoardIdSchema,
  ClientIdSchema,
  MutationIdSchema,
} from '../../src/lib/board-rpc';
import { OwnerError, type OwnerSnapshot } from '../../src/lib/owner-api';
import { BoardService } from '../../src/server/board-service';
import { migrationLoader } from '../../src/server/migrations';
import { OwnerService } from '../../src/server/owner-service';
import { PublicationRouting } from '../../src/server/publication-routing';
import { PublishingService } from '../../src/server/publishing-service';

const account = AccountIdSchema.make('owner-tests');
const boardId = BoardIdSchema.make('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const profile = {
  handle: 'studio',
  displayName: 'Studio',
  bio: '',
  expectedProfileVersion: 0,
};
const guard = {
  expectedRevision: 0,
  expectedProfileVersion: 1,
  expectedPublicationVersion: 0,
};

const setup = () => {
  const synced: OwnerSnapshot[] = [];
  let refuseClaim = false;
  let failSync = false;
  const routing = Layer.succeed(PublicationRouting, {
    claim: () =>
      refuseClaim
        ? Effect.fail(
            new OwnerError({ code: 'HandleTaken', message: 'Handle in use.' }),
          )
        : Effect.void,
    sync: (_account, state) =>
      failSync
        ? Effect.fail(
            new OwnerError({
              code: 'Projection',
              message: 'Routing unavailable.',
              state,
            }),
          )
        : Effect.sync(() => {
            synced.push(state);
          }),
  });
  const database = SqliteMigrator.layer({ loader: migrationLoader }).pipe(
    Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
  );
  const layer = Layer.mergeAll(
    OwnerService.layer.pipe(Layer.provide(routing)),
    BoardService.layer,
    PublishingService.layer,
  ).pipe(Layer.provide(database));
  return {
    layer,
    synced,
    refuseClaim: () => {
      refuseClaim = true;
    },
    failSync: (value: boolean) => {
      failSync = value;
    },
  };
};

const prepare = Effect.gen(function* () {
  const owner = yield* OwnerService;
  const boards = yield* BoardService;
  yield* boards.create(boardId, 'Private board');
  return { owner, boards };
});

describe('guarded owner operations', () => {
  it.effect('publishes and revokes public access with guarded versions', () => {
    const test = setup();
    return Effect.gen(function* () {
      const { owner } = yield* prepare;
      const publishing = yield* PublishingService;
      expect((yield* owner.read()).profileVersion).toBe(0);
      yield* owner.configure(account, profile);
      const published = yield* owner.publish(account, boardId, guard, true);
      expect(published.publications).toHaveLength(1);
      const publication = published.publications[0];
      if (publication === undefined)
        return yield* Effect.die('Missing publication');
      expect(yield* publishing.getBoard(publication.publicId)).not.toBeNull();
      const privateState = yield* owner.publish(
        account,
        boardId,
        { ...guard, expectedPublicationVersion: 1 },
        false,
      );
      expect(privateState.publications).toEqual([]);
      expect(privateState.publicationVersions).toEqual([
        { boardId, version: 2 },
      ]);
      expect(yield* publishing.getBoard(publication.publicId)).toBeNull();
      expect(test.synced).toHaveLength(3);
    }).pipe(Effect.provide(test.layer));
  });

  for (const field of [
    'expectedRevision',
    'expectedProfileVersion',
    'expectedPublicationVersion',
  ]) {
    it.effect(`rejects stale ${field}`, () => {
      const test = setup();
      return Effect.gen(function* () {
        const { owner } = yield* prepare;
        yield* owner.configure(account, profile);
        const error = yield* owner
          .publish(account, boardId, { ...guard, [field]: 99 }, true)
          .pipe(Effect.flip);
        expect(error.code).toBe('Conflict');
        expect((yield* owner.read()).publications).toEqual([]);
      }).pipe(Effect.provide(test.layer));
    });
  }

  it.effect(
    'rejects publishing without a profile and conflicting profile writes',
    () => {
      const test = setup();
      return Effect.gen(function* () {
        const { owner } = yield* prepare;
        expect(
          (yield* owner
            .publish(
              account,
              boardId,
              { ...guard, expectedProfileVersion: 0 },
              true,
            )
            .pipe(Effect.flip)).code,
        ).toBe('Invalid');
        yield* owner.configure(account, profile);
        expect(
          (yield* owner.configure(account, profile).pipe(Effect.flip)).code,
        ).toBe('Conflict');
        test.refuseClaim();
        expect(
          (yield* owner
            .configure(account, {
              ...profile,
              handle: 'taken',
              expectedProfileVersion: 1,
            })
            .pipe(Effect.flip)).code,
        ).toBe('HandleTaken');
        expect((yield* owner.read()).profile?.handle).toBe('studio');
      }).pipe(Effect.provide(test.layer));
    },
  );

  it.effect(
    'retains authoritative state and permits reconciliation after routing fails',
    () => {
      const test = setup();
      return Effect.gen(function* () {
        const { owner, boards } = yield* prepare;
        yield* owner.configure(account, profile);
        test.failSync(true);
        expect(
          (yield* owner
            .publish(account, boardId, guard, true)
            .pipe(Effect.flip)).code,
        ).toBe('Projection');
        expect((yield* owner.read()).publications).toHaveLength(1);
        test.failSync(false);
        expect((yield* owner.reconcile(account)).publications).toHaveLength(1);
        yield* boards.commit({
          boardId,
          clientId: ClientIdSchema.make('test'),
          mutationId: MutationIdSchema.make('rename'),
          title: 'Changed',
          upserts: [],
          deletes: [],
        });
        expect(
          (yield* owner
            .publish(
              account,
              boardId,
              { ...guard, expectedPublicationVersion: 1 },
              false,
            )
            .pipe(Effect.flip)).code,
        ).toBe('Conflict');
      }).pipe(Effect.provide(test.layer));
    },
  );
});
