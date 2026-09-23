import { flow, Option, Schema } from 'effect';

import type { AccountId } from '../../lib/account';
import {
  BoardIdSchema,
  BoardMutationPayloadSchema,
  BoardSchema,
  ClientIdSchema,
  MutationIdSchema,
  type BoardId,
  type MutationId,
} from '../../lib/board-rpc';
import { CameraSchema } from './camera';
import type {
  BoardMutation,
  PendingBoardMutation,
  SavedDocument,
} from './types';

const DATABASE = 'moodboard-studio';

const DOCUMENT_STORE = 'documents';

const SYNC_STORE = 'sync';

const documentKey = (accountId: AccountId, boardId: BoardId) =>
  `account:${accountId}:board:${boardId}`;

const outboxKey = (accountId: AccountId, boardId: BoardId) =>
  `account:${accountId}:outbox:${boardId}`;

const PendingBoardMutationSchema = Schema.Struct({
  boardId: BoardIdSchema,
  clientId: ClientIdSchema,
  mutationId: MutationIdSchema,
  mutation: BoardMutationPayloadSchema,
});

const SavedDocumentSchema = Schema.Struct({
  board: BoardSchema,
  camera: CameraSchema,
});

const decodePendingMutation = Schema.decodeUnknownOption(
  PendingBoardMutationSchema,
);

const decodeSavedDocumentValue =
  Schema.decodeUnknownOption(SavedDocumentSchema);

const toBoardMutation = (
  mutation: typeof BoardMutationPayloadSchema.Type,
): BoardMutation => {
  const local: BoardMutation = {
    upserts: mutation.upserts.map((item) => ({ ...item })),
    deletes: [...mutation.deletes],
  };

  if (mutation.title !== undefined) local.title = mutation.title;

  if (mutation.background !== undefined) local.background = mutation.background;

  if (mutation.backgroundMediaId !== undefined)
    local.backgroundMediaId = mutation.backgroundMediaId;

  return local;
};

const toPendingMutation = (
  value: typeof PendingBoardMutationSchema.Type,
): PendingBoardMutation => ({
  boardId: value.boardId,
  clientId: value.clientId,
  mutationId: value.mutationId,
  mutation: toBoardMutation(value.mutation),
});

const decodePendingValues = flow(
  Schema.decodeUnknownOption(Schema.Array(Schema.Unknown)),
  Option.map((values) =>
    values.flatMap((value) => Option.toArray(decodePendingMutation(value))),
  ),
  Option.getOrElse(() => []),
);

const boardPendingMutations = (
  entries: ReadonlyArray<typeof PendingBoardMutationSchema.Type>,
  boardId: BoardId,
): PendingBoardMutation[] =>
  entries.flatMap((entry) =>
    entry.boardId === boardId ? [toPendingMutation(entry)] : [],
  );

const decodeSavedDocument = flow(
  decodeSavedDocumentValue,
  Option.map((value): SavedDocument => ({
    board: {
      ...value.board,
      items: value.board.items.map((item) => ({ ...item })),
    },
    camera: { ...value.camera },
  })),
  Option.getOrNull,
);

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 3);

    request.onupgradeneeded = () => {
      const database = request.result;

      for (const store of [DOCUMENT_STORE, SYNC_STORE]) {
        if (!database.objectStoreNames.contains(store)) {
          database.createObjectStore(store);
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadDocument(
  accountId: AccountId,
  boardId: BoardId,
): Promise<SavedDocument | null> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DOCUMENT_STORE, 'readonly');

    const request = transaction
      .objectStore(DOCUMENT_STORE)
      .get(documentKey(accountId, boardId));

    request.onsuccess = () => resolve(decodeSavedDocument(request.result));
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function saveDocument(
  accountId: AccountId,
  boardId: BoardId,
  document: SavedDocument,
): Promise<void> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DOCUMENT_STORE, 'readwrite');
    transaction
      .objectStore(DOCUMENT_STORE)
      .put(document, documentKey(accountId, boardId));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };

    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function loadPendingMutations(
  accountId: AccountId,
  boardId: BoardId,
): Promise<PendingBoardMutation[]> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SYNC_STORE, 'readonly');

    const request = transaction
      .objectStore(SYNC_STORE)
      .get(outboxKey(accountId, boardId));

    request.onsuccess = () =>
      resolve(
        boardPendingMutations(decodePendingValues(request.result), boardId),
      );
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function appendPendingMutations(
  accountId: AccountId,
  boardId: BoardId,
  entries: ReadonlyArray<PendingBoardMutation>,
): Promise<void> {
  if (entries.length === 0) return;

  if (entries.some((entry) => entry.boardId !== boardId)) {
    throw new Error('A pending mutation cannot be stored under another board.');
  }

  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SYNC_STORE, 'readwrite');
    const store = transaction.objectStore(SYNC_STORE);
    const key = outboxKey(accountId, boardId);
    const request = store.get(key);

    request.onsuccess = () => {
      const current = boardPendingMutations(
        decodePendingValues(request.result),
        boardId,
      );

      const known = new Set(current.map((entry) => entry.mutationId));
      const additions: PendingBoardMutation[] = [];

      for (const entry of entries) {
        if (known.has(entry.mutationId)) continue;
        known.add(entry.mutationId);
        additions.push(entry);
      }

      store.put([...current, ...additions], key);
    };

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };

    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function removePendingMutations(
  accountId: AccountId,
  boardId: BoardId,
  mutationIds: ReadonlyArray<MutationId>,
): Promise<void> {
  if (mutationIds.length === 0) return;
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SYNC_STORE, 'readwrite');
    const store = transaction.objectStore(SYNC_STORE);
    const key = outboxKey(accountId, boardId);
    const request = store.get(key);

    request.onsuccess = () => {
      const removals = new Set(mutationIds);

      const current = boardPendingMutations(
        decodePendingValues(request.result),
        boardId,
      );

      store.put(
        current.filter((entry) => !removals.has(entry.mutationId)),
        key,
      );
    };

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };

    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function deleteLocalBoard(
  accountId: AccountId,
  boardId: BoardId,
): Promise<void> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      [DOCUMENT_STORE, SYNC_STORE],
      'readwrite',
    );

    transaction
      .objectStore(DOCUMENT_STORE)
      .delete(documentKey(accountId, boardId));
    transaction.objectStore(SYNC_STORE).delete(outboxKey(accountId, boardId));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };

    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}
