import { Schema } from 'effect';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  appendPendingMutations,
  deleteLocalBoard,
  loadDocument,
  loadPendingMutations,
  removePendingMutations,
  saveDocument,
} from '../src/client/board/storage';
import type {
  Board,
  BoardItem,
  PendingBoardMutation,
  SavedDocument,
} from '../src/client/board/types';
import { AccountIdSchema } from '../src/lib/account';
import {
  BoardIdSchema,
  BoardItemSchema,
  BoardSchema,
  ClientIdSchema,
  MutationIdSchema,
} from '../src/lib/board-rpc';

const makeBoard = (value: unknown): Board => {
  const decoded = Schema.decodeUnknownSync(BoardSchema)(value);
  return { ...decoded, items: decoded.items.map((item) => ({ ...item })) };
};
const makeItem = (value: unknown): BoardItem =>
  Schema.decodeUnknownSync(BoardItemSchema)(value);
const accountA = AccountIdSchema.make('account-a');
const accountB = AccountIdSchema.make('account-b');

const document: SavedDocument = {
  board: makeBoard({
    version: 1,
    title: 'Saved board',
    background: '#242728',
    items: [
      {
        id: 'image-1',
        kind: 'image',
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        rotation: 0,
        order: 1,
        src: 'https://images.example/chair.jpg',
        href: 'https://shop.example/chair',
      },
      {
        id: 'audio-1',
        kind: 'audio',
        x: 340,
        y: 0,
        width: 520,
        height: 220,
        rotation: 0,
        order: 2,
        mediaId: '0123456789abcdef0123456789abcdef',
        label: 'Field recording',
      },
      {
        id: 'website-1',
        kind: 'website',
        x: 900,
        y: 0,
        width: 540,
        height: 360,
        rotation: 0,
        order: 3,
        websiteUrl: 'https://example.com/story',
        websiteImageUrl: 'https://cdn.example.com/story.jpg',
        websiteTitle: 'A collected room',
        websiteDescription: 'Light, stone, and quiet objects.',
        websiteSiteLabel: 'example.com',
      },
    ],
    updatedAt: 1,
  }),
  camera: { x: 1, y: 2, z: 0.5 },
};

const pending = (
  rawBoardId: string,
  rawMutationId: string,
): PendingBoardMutation => ({
  boardId: BoardIdSchema.make(rawBoardId),
  clientId: ClientIdSchema.make('client-1'),
  mutationId: MutationIdSchema.make(rawMutationId),
  mutation: {
    background: null,
    upserts: [
      makeItem({
        id: 'image-1',
        kind: 'image',
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        rotation: 0,
        order: 1,
        src: 'https://images.example/chair.jpg',
        href: 'https://shop.example/chair',
      }),
      makeItem({
        id: 'spotify-1',
        kind: 'spotify',
        x: 340,
        y: 0,
        width: 520,
        height: 300,
        rotation: 0,
        order: 2,
        src: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
        label: 'Studio rotation',
      }),
    ],
    deletes: [],
  },
});

describe('account-scoped browser storage', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('isolates documents and outboxes by account and board', async () => {
    const boardA = BoardIdSchema.make('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const boardB = BoardIdSchema.make('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    const pendingA = pending(boardA, 'shared-mutation-id');
    const pendingB = pending(boardB, 'shared-mutation-id');

    await Promise.all([
      saveDocument(accountA, boardA, document),
      saveDocument(accountA, boardB, {
        ...document,
        board: { ...document.board, title: 'Second board' },
      }),
      saveDocument(accountB, boardA, {
        ...document,
        board: { ...document.board, title: 'Other account' },
      }),
    ]);
    await appendPendingMutations(accountA, boardA, [pendingA, pendingA]);
    await appendPendingMutations(accountA, boardB, [pendingB]);
    await appendPendingMutations(accountB, boardA, [pendingA]);
    await removePendingMutations(accountA, boardA, [pendingA.mutationId]);

    expect((await loadDocument(accountA, boardA))?.board.title).toBe(
      'Saved board',
    );
    expect((await loadDocument(accountA, boardB))?.board.title).toBe(
      'Second board',
    );
    expect((await loadDocument(accountB, boardA))?.board.title).toBe(
      'Other account',
    );
    expect(await loadPendingMutations(accountA, boardA)).toEqual([]);
    expect(await loadPendingMutations(accountA, boardB)).toEqual([pendingB]);
    expect(await loadPendingMutations(accountB, boardA)).toEqual([pendingA]);
  });

  it("deletes only one account's local board and outbox", async () => {
    const boardId = BoardIdSchema.make('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    await saveDocument(accountA, boardId, document);
    await saveDocument(accountB, boardId, document);
    await appendPendingMutations(accountA, boardId, [pending(boardId, 'a')]);
    await appendPendingMutations(accountB, boardId, [pending(boardId, 'b')]);

    await deleteLocalBoard(accountA, boardId);

    expect(await loadDocument(accountA, boardId)).toBeNull();
    expect(await loadPendingMutations(accountA, boardId)).toEqual([]);
    expect(await loadDocument(accountB, boardId)).toEqual(document);
    expect(await loadPendingMutations(accountB, boardId)).toHaveLength(1);
  });
});
