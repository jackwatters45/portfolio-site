import { describe, expect, it } from '@effect/vitest';
import { Effect, Schema } from 'effect';

import { BoardSchema, MAX_REMOTE_ITEMS } from '../../src/lib/board-rpc';
import type { RemoteBoard } from '../../src/lib/board-rpc';
import {
  BoardCommandError,
  BoardCommandsSchema,
} from '../../src/mcp/board-command-schema';
import {
  applyBoardCommands as applyParsedCommands,
  buildBoardMutation,
} from '../../src/mcp/board-commands';
import { boardCapabilities } from '../../src/mcp/capabilities';

const item = (id = 'a') => ({
  id,
  kind: 'note',
  x: 0,
  y: 0,
  width: 400,
  height: 400,
  rotation: 0,
  order: 0,
  text: 'Keep me',
});
const board = (items = [item()]) =>
  Schema.decodeUnknownSync(BoardSchema)({
    version: 1,
    title: 'Board',
    updatedAt: 100,
    items,
  });

const applyBoardCommands = (source: RemoteBoard, commands: unknown) =>
  Schema.decodeUnknownEffect(BoardCommandsSchema)(commands).pipe(
    Effect.mapError(
      () =>
        new BoardCommandError({
          code: 'InvalidInput',
          message: 'Invalid board commands.',
        }),
    ),
    Effect.flatMap((parsed) => applyParsedCommands(source, parsed)),
  );

const failure = (commands: unknown, source = board()) =>
  applyBoardCommands(source, commands).pipe(Effect.flip);

describe('shared board commands', () => {
  it.effect(
    'preserves metadata and timestamps through transforms and duplication',
    () =>
      Effect.gen(function* () {
        const source = board();
        const after = yield* applyBoardCommands(source, [
          { type: 'transform', transforms: [{ id: 'a', x: 200 }] },
          { type: 'duplicate', duplicates: [{ id: 'a', newId: 'b' }] },
        ]);
        expect(after.items.map((entry) => entry.text)).toEqual([
          'Keep me',
          'Keep me',
        ]);
        expect(after.items[1]?.x).toBe(224);
        expect(after.updatedAt).toBe(100);
        expect(source.items[0]?.x).toBe(0);
        expect(buildBoardMutation(source, after)).not.toHaveProperty('title');
        expect(buildBoardMutation(source, after)).not.toHaveProperty(
          'background',
        );
        expect(buildBoardMutation(source, after)).not.toHaveProperty(
          'backgroundMediaId',
        );
      }),
  );

  for (const commands of [
    [{ type: 'delete', ids: ['missing'] }],
    [{ type: 'transform', transforms: [{ id: 'missing', x: 2 }] }],
    [{ type: 'layout', ids: ['missing'], kind: 'loose' }],
    [{ type: 'shuffle', ids: ['missing'], seed: 1 }],
  ])
    it.effect('rejects missing IDs', () =>
      Effect.gen(function* () {
        expect((yield* failure(commands)).code).toBe('MissingItem');
      }),
    );

  for (const commands of [
    [{ type: 'delete', ids: ['a', 'a'] }],
    [{ type: 'upsert', items: [item('b'), item('b')] }],
    [{ type: 'duplicate', duplicates: [{ id: 'a', newId: 'a' }] }],
  ])
    it.effect('rejects duplicate IDs', () =>
      Effect.gen(function* () {
        expect((yield* failure(commands)).code).toBe('DuplicateId');
      }),
    );

  it.effect('rejects duplicate source board IDs', () =>
    Effect.gen(function* () {
      expect((yield* failure([], board([item(), item()]))).code).toBe(
        'DuplicateId',
      );
    }),
  );

  for (const transform of [
    { width: 79 },
    { height: 5001 },
    { x: Infinity },
    { rotation: 181 },
    { order: 10001 },
    { order: 0.5 },
  ])
    it.effect('validates geometry and order limits', () =>
      Effect.gen(function* () {
        expect(
          (yield* failure([
            { type: 'transform', transforms: [{ id: 'a', ...transform }] },
          ])).code,
        ).toBe('InvalidInput');
      }),
    );

  it.effect('enforces aggregate item limits', () =>
    Effect.gen(function* () {
      const source = board(
        Array.from({ length: MAX_REMOTE_ITEMS }, (_, index) =>
          item(String(index)),
        ),
      );
      expect(
        (yield* failure([{ type: 'upsert', items: [item('extra')] }], source))
          .code,
      ).toBe('InvalidInput');
    }),
  );

  it.effect('handles empty boards and complete layer ordering', () =>
    Effect.gen(function* () {
      const empty = board([]);
      expect(
        yield* applyBoardCommands(empty, [
          { type: 'layout', kind: 'contact' },
          { type: 'shuffle', seed: 3 },
          { type: 'order', ids: [] },
        ]),
      ).toEqual(empty);
      expect((yield* failure([{ type: 'order', ids: [] }])).code).toBe(
        'InvalidOrder',
      );
      const after = yield* applyBoardCommands(board([item('a'), item('b')]), [
        { type: 'layer', ids: ['a'], position: 'front' },
      ]);
      expect(after.items.find((entry) => entry.id === 'a')?.order).toBe(1);
    }),
  );

  it.effect(
    'uses deterministic shuffle and leaves non-target items unchanged',
    () =>
      Effect.gen(function* () {
        const source = board([item('a'), item('b'), item('c')]);
        const commands = [{ type: 'shuffle', ids: ['a', 'b'], seed: 42 }];
        const first = yield* applyBoardCommands(source, commands);
        expect(yield* applyBoardCommands(source, commands)).toEqual(first);
        expect(first.items[2]).toEqual(source.items[2]);
      }),
  );

  it.effect('preserves all eight item kinds and metadata through layouts', () =>
    Effect.gen(function* () {
      const variants = [
        {
          ...item('image'),
          kind: 'image',
          text: undefined,
          src: 'https://example.com/image.png',
          annotationTitle: 'Photo',
          href: 'https://example.com/',
        },
        item('note'),
        {
          ...item('swatch'),
          kind: 'swatch',
          text: undefined,
          color: '#123456',
        },
        {
          ...item('spotify'),
          kind: 'spotify',
          text: undefined,
          src: 'https://open.spotify.com/track/0123456789012345678901',
        },
        {
          ...item('youtube'),
          kind: 'youtube',
          text: undefined,
          src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
        {
          ...item('audio'),
          kind: 'audio',
          text: undefined,
          src: 'https://example.com/audio.mp3',
        },
        {
          ...item('website'),
          kind: 'website',
          text: undefined,
          websiteUrl: 'https://example.com/',
          websiteTitle: 'Example',
          websiteSiteLabel: 'example.com',
        },
        {
          ...item('x'),
          kind: 'x',
          text: undefined,
          src: 'https://x.com/example/status/123456789',
          xDisplay: 'post',
          xTheme: 'light',
          xHideThread: true,
        },
      ];
      const source = Schema.decodeUnknownSync(BoardSchema)({
        version: 1,
        title: 'Kinds',
        updatedAt: 0,
        items: variants,
      });
      for (const kind of ['loose', 'contact', 'masonry']) {
        const after = yield* applyBoardCommands(source, [
          { type: 'layout', kind },
        ]);
        expect(after.items.map((entry) => entry.kind)).toEqual(
          source.items.map((entry) => entry.kind),
        );
        expect(after.items[0]?.annotationTitle).toBe('Photo');
        expect(after.items[0]?.href).toBe('https://example.com/');
      }
      const changed = yield* applyBoardCommands(source, [
        { type: 'annotate', id: 'image', title: null, description: 'Caption' },
        { type: 'link', id: 'image', href: null },
      ]);
      expect(changed.items[0]).not.toHaveProperty('annotationTitle');
      expect(changed.items[0]).not.toHaveProperty('href');
      expect(changed.items[0]?.annotationDescription).toBe('Caption');
    }),
  );

  it.effect('builds precise deletions and explicit background reset', () =>
    Effect.gen(function* () {
      const source = { ...board(), background: '#123456' };
      const after = yield* applyBoardCommands(source, [
        { type: 'metadata', background: null, title: 'New' },
        { type: 'delete', ids: ['a'] },
      ]);
      expect(buildBoardMutation(source, after)).toEqual({
        title: 'New',
        background: null,
        upserts: [],
        deletes: ['a'],
      });
      expect(buildBoardMutation(after, after)).toEqual({
        upserts: [],
        deletes: [],
      });
    }),
  );

  it('does not claim browser control', () => {
    expect(
      boardCapabilities.find(
        (entry) => entry.feature === 'browser playback and control',
      )?.mode,
    ).toBe('unsupported');
    expect(
      boardCapabilities.find((entry) => entry.feature === 'camera')?.mode,
    ).toBe('render-only');
  });
});
