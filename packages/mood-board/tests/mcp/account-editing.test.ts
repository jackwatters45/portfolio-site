import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer, Schema, Stream } from 'effect';
import { HttpClient } from 'effect/unstable/http';
import { RpcTest } from 'effect/unstable/rpc';

import {
  BoardRpcs,
  BoardBackendError,
  BoardRevisionSchema,
  BoardSchema,
  BoardSnapshotSchema,
  type BoardMutationPayload,
} from '../../src/lib/board-rpc';
import {
  AccountClient,
  accountRpcErrors,
  type AccountSession,
} from '../../src/mcp/account-client';
import {
  AccountError,
  AccountReference,
} from '../../src/mcp/account-contracts';
import { AccountEditing } from '../../src/mcp/account-editing';
import { AccountCommandsInput } from '../../src/mcp/account-editing-contract';

const account = Schema.decodeUnknownSync(AccountReference)({
  origin: 'https://board.example',
  id: 'owner',
});
const board = Schema.decodeUnknownSync(BoardSchema)({
  version: 1,
  title: 'Original',
  updatedAt: 1,
  background: '#112233',
  items: [
    {
      id: 'note',
      kind: 'note',
      text: 'Keep me',
      x: 0,
      y: 0,
      width: 300,
      height: 300,
      rotation: 0,
      order: 0,
    },
    {
      id: 'other',
      kind: 'note',
      text: 'Untouched',
      x: 400,
      y: 400,
      width: 300,
      height: 300,
      rotation: 0,
      order: 1,
    },
  ],
});
const request = (commands: unknown) =>
  Schema.decodeUnknownSync(AccountCommandsInput)({
    account,
    boardId: 'default',
    expectedRevision: 3,
    mutationId: 'edit-1',
    confirm: true,
    commands,
  });

const setup = (
  options: { stale?: boolean; conflict?: boolean; disabled?: boolean } = {},
) => {
  const mutations: BoardMutationPayload[] = [];
  const snapshot = Schema.decodeUnknownSync(BoardSnapshotSchema)({
    _tag: 'Snapshot',
    boardId: 'default',
    revision: options.stale ? 4 : 3,
    board,
  });
  const unused = () => Effect.die('Unexpected RPC');
  const handlers = BoardRpcs.toLayer({
    ListBoards: unused,
    BoardExists: unused,
    CreateBoard: unused,
    DuplicateBoard: unused,
    DeleteBoard: unused,
    ResolveWebsitePreview: unused,
    ResolveXPostPreview: unused,
    SubscribeBoard: () => Stream.succeed(snapshot),
    CommitBoard: (payload) =>
      Effect.gen(function* () {
        mutations.push(payload);
        if (options.conflict)
          return yield* new BoardBackendError({
            code: 'Conflict',
            message: 'Concurrent edit',
          });
        return {
          ...payload,
          _tag: 'Change' as const,
          revision: BoardRevisionSchema.make(4),
          updatedAt: board.updatedAt,
        };
      }),
  });
  const session: AccountSession = {
    reference: account,
    account: { id: account.id, email: 'owner@example.com', name: 'Owner' },
    http: HttpClient.make(() => Effect.die('Unexpected HTTP')),
  };
  const client = Layer.effect(
    AccountClient,
    Effect.gen(function* () {
      const rpc = yield* RpcTest.makeClient(BoardRpcs).pipe(
        Effect.provide(handlers),
      );
      const read: typeof AccountClient.Service.read = (_account, work) =>
        Effect.scoped(work(rpc, session)).pipe(accountRpcErrors);
      return AccountClient.of({
        read,
        write: (input, work) =>
          options.disabled || !input.confirm
            ? Effect.fail(
                new AccountError({
                  code: 'AccessDenied',
                  message: 'Writes disabled',
                }),
              )
            : read(input.account, work),
      });
    }),
  );
  return { mutations, layer: AccountEditing.layer.pipe(Layer.provide(client)) };
};

const run = (input: typeof AccountCommandsInput.Type) =>
  Effect.gen(function* () {
    const editing = yield* AccountEditing;
    return yield* editing.apply(input);
  });

describe('account command editing', () => {
  it.effect(
    'commits one mutation and preserves metadata and non-target items',
    () =>
      Effect.gen(function* () {
        const test = setup();
        const result = yield* run(
          request([{ type: 'transform', transforms: [{ id: 'note', x: 70 }] }]),
        ).pipe(Effect.provide(test.layer));
        expect(result.revision).toBe(4);
        expect(test.mutations).toHaveLength(1);
        expect(test.mutations[0]?.upserts).toEqual([
          { ...board.items[0], x: 70 },
        ]);
        expect(test.mutations[0]).not.toHaveProperty('background');
        expect(test.mutations[0]).not.toHaveProperty('backgroundMediaId');
        expect(test.mutations[0]).not.toHaveProperty('title');
      }),
  );

  for (const metadata of [
    { background: '#abcdef' },
    { background: null },
    { backgroundMediaId: '0123456789abcdef0123456789abcdef' },
    { backgroundMediaId: null },
    { background: null, backgroundMediaId: null },
  ])
    it.effect(`supports background ${JSON.stringify(metadata)}`, () =>
      Effect.gen(function* () {
        const test = setup();
        yield* run(request([{ type: 'metadata', ...metadata }])).pipe(
          Effect.provide(test.layer),
        );
        expect(test.mutations).toHaveLength(1);
        expect(test.mutations[0]?.upserts).toEqual([]);
        for (const [key, value] of Object.entries(metadata)) {
          if (key === 'backgroundMediaId' && value === null) continue;
          expect(test.mutations[0]).toHaveProperty(key, value);
        }
      }),
    );

  it.effect('rejects missing item references without a commit', () =>
    Effect.gen(function* () {
      const test = setup();
      const result = yield* run(
        request([{ type: 'delete', ids: ['missing'] }]),
      ).pipe(Effect.provide(test.layer), Effect.result);
      expect(result._tag).toBe('Failure');
      expect(test.mutations).toEqual([]);
    }),
  );

  for (const options of [
    { stale: true },
    { disabled: true },
    { conflict: true },
  ]) {
    it.effect(`rejects ${JSON.stringify(options)}`, () =>
      Effect.gen(function* () {
        const test = setup(options);
        const result = yield* run(
          request([{ type: 'transform', transforms: [{ id: 'note', x: 90 }] }]),
        ).pipe(Effect.provide(test.layer), Effect.result);
        expect(result._tag).toBe('Failure');
        expect(test.mutations).toHaveLength(options.conflict ? 1 : 0);
      }),
    );
  }

  it('requires top-level confirmation', () => {
    const { confirm: _confirm, ...input } = request([]);
    expect(Schema.is(AccountCommandsInput)(input)).toBe(false);
    expect(
      Schema.is(AccountCommandsInput)({
        ...input,
        commands: [{ confirm: true }],
      }),
    ).toBe(false);
  });
});
