import { Effect, Schema } from 'effect';

import { shuffleBoardItems } from '../client/board/board-shuffle';
import { layoutBulkImages } from '../client/board/bulk-layout';
import {
  minimumAudioCardHeight,
  MIN_AUDIO_CARD_WIDTH,
} from '../lib/audio-card-layout';
import {
  BoardItemSchema,
  BoardSchema,
  type BoardMutationPayload,
  type ItemId,
  type RemoteBoard,
  type RemoteBoardItem,
} from '../lib/board-rpc';
import {
  MIN_WEBSITE_CARD_HEIGHT,
  MIN_WEBSITE_CARD_WIDTH,
} from '../lib/website-preview';
import { MIN_X_CARD_HEIGHT, MIN_X_CARD_WIDTH } from '../lib/x-post';
import { BoardCommandError, BoardCommandsSchema } from './board-command-schema';

export { BoardCommandError } from './board-command-schema';

type MutableItem = {
  -readonly [K in keyof RemoteBoardItem]: RemoteBoardItem[K];
};

type MutableMutation = {
  -readonly [K in keyof BoardMutationPayload]: BoardMutationPayload[K];
};

const uniqueIds = Effect.fn('BoardCommands.uniqueIds')(function* (
  ids: ReadonlyArray<string>,
) {
  if (new Set(ids).size !== ids.length)
    return yield* new BoardCommandError({
      code: 'DuplicateId',
      message: 'Item IDs must be unique.',
    });
});

const minimumSize = (item: RemoteBoardItem) => {
  if (
    item.kind === 'audio' ||
    item.kind === 'spotify' ||
    item.kind === 'youtube'
  )
    return {
      width: MIN_AUDIO_CARD_WIDTH,
      height: minimumAudioCardHeight(item.kind),
    };

  if (item.kind === 'website')
    return { width: MIN_WEBSITE_CARD_WIDTH, height: MIN_WEBSITE_CARD_HEIGHT };

  if (item.kind === 'x')
    return { width: MIN_X_CARD_WIDTH, height: MIN_X_CARD_HEIGHT };

  return { width: 80, height: 80 };
};

const seededRandom = (seed: number) => {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state / 4294967296;
  };
};

const validateBoard = (board: RemoteBoard) =>
  Schema.decodeUnknownEffect(BoardSchema)(board).pipe(
    Effect.mapError(
      () =>
        new BoardCommandError({
          code: 'InvalidInput',
          message:
            'Board content exceeds item, geometry, order, or metadata limits.',
        }),
    ),
  );

/** Applies an ordered, atomic command batch without changing timestamps or external state. */
export const applyBoardCommands = Effect.fn('applyBoardCommands')(function* (
  input: RemoteBoard,
  commands: typeof BoardCommandsSchema.Type,
) {
  let board = yield* validateBoard(input);
  yield* uniqueIds(board.items.map((item) => item.id));

  const decoded = yield* Schema.decodeUnknownEffect(BoardCommandsSchema)(
    commands,
  ).pipe(
    Effect.mapError(
      () =>
        new BoardCommandError({
          code: 'InvalidInput',
          message: 'Invalid board commands.',
        }),
    ),
  );

  for (const command of decoded) {
    const items = new Map(board.items.map((item) => [item.id, item]));

    const requireItems = Effect.fn('BoardCommands.requireItems')(function* (
      ids: ReadonlyArray<ItemId>,
    ) {
      yield* uniqueIds(ids);
      const selected: RemoteBoardItem[] = [];

      for (const id of ids) {
        const item = items.get(id);

        if (item === undefined)
          return yield* new BoardCommandError({
            code: 'MissingItem',
            message: `Item ${id} does not exist.`,
          });
        selected.push(item);
      }

      return selected;
    });

    switch (command.type) {
      case 'metadata': {
        const updated = { ...board };

        if (command.title !== undefined) updated.title = command.title;

        if (command.background === null) delete updated.background;
        else if (command.background !== undefined)
          updated.background = command.background;

        if (command.backgroundMediaId === null)
          delete updated.backgroundMediaId;
        else if (command.backgroundMediaId !== undefined)
          updated.backgroundMediaId = command.backgroundMediaId;
        board = updated;
        break;
      }

      case 'upsert':
        yield* uniqueIds(command.items.map((item) => item.id));

        for (const item of command.items) items.set(item.id, item);
        break;
      case 'delete':
        yield* requireItems(command.ids);

        for (const id of command.ids) items.delete(id);
        break;
      case 'transform':
        yield* requireItems(command.transforms.map((item) => item.id));

        for (const transform of command.transforms) {
          const original = items.get(transform.id);

          if (original !== undefined)
            items.set(transform.id, { ...original, ...transform });
        }

        break;
      case 'duplicate': {
        yield* requireItems(command.duplicates.map((item) => item.id));
        yield* uniqueIds(command.duplicates.map((item) => item.newId));

        for (const duplicate of command.duplicates) {
          if (items.has(duplicate.newId))
            return yield* new BoardCommandError({
              code: 'DuplicateId',
              message: `Item ${duplicate.newId} already exists.`,
            });
          const original = items.get(duplicate.id);

          if (original !== undefined)
            items.set(duplicate.newId, {
              ...original,
              id: duplicate.newId,
              x: original.x + (duplicate.dx ?? 24),
              y: original.y + (duplicate.dy ?? 24),
              order:
                Math.max(
                  -1,
                  ...Array.from(items.values(), (item) => item.order),
                ) + 1,
            });
        }

        break;
      }

      case 'annotate':
      case 'link': {
        const selected = yield* requireItems([command.id]);

        for (const item of selected) {
          if (command.type === 'link') {
            const rest = { ...item };
            delete rest.href;
            items.set(
              item.id,
              command.href === null ? rest : { ...rest, href: command.href },
            );
          } else {
            const { annotationTitle, annotationDescription, ...rest } = item;

            const title =
              command.title === null
                ? undefined
                : (command.title ?? annotationTitle);

            const description =
              command.description === null
                ? undefined
                : (command.description ?? annotationDescription);

            const updated: MutableItem = { ...rest };

            if (title !== undefined) updated.annotationTitle = title;

            if (description !== undefined)
              updated.annotationDescription = description;
            items.set(item.id, updated);
          }
        }

        break;
      }

      case 'layer': {
        const selected = yield* requireItems(command.ids);
        const selectedIds = new Set(command.ids);
        const sorted = [...items.values()].sort((a, b) => a.order - b.order);
        const others = sorted.filter((item) => !selectedIds.has(item.id));

        const ordered =
          command.position === 'front'
            ? [...others, ...selected]
            : [...selected, ...others];

        for (const [order, item] of ordered.entries())
          items.set(item.id, { ...item, order });
        break;
      }

      case 'order': {
        const selected = yield* requireItems(command.ids);

        if (selected.length !== items.size)
          return yield* new BoardCommandError({
            code: 'InvalidOrder',
            message:
              'Layer order must include every item exactly once, back to front.',
          });

        for (const [order, item] of selected.entries())
          items.set(item.id, { ...item, order });
        break;
      }

      case 'layout':
      case 'shuffle': {
        const selected = yield* requireItems(
          command.ids ?? Array.from(items.keys()),
        );

        if (selected.length === 0) break;

        if (command.type === 'shuffle') {
          const shuffled = yield* Effect.try({
            try: () => shuffleBoardItems(selected, seededRandom(command.seed)),
            catch: () =>
              new BoardCommandError({
                code: 'InvalidLayout',
                message: 'Board cannot fit within shuffle limits.',
              }),
          });

          for (const item of shuffled) items.set(item.id, item);
        } else {
          const layout = layoutBulkImages(selected, command.kind);

          const factor = Math.max(
            1,
            ...layout.items.map((item) => {
              const source = selected.find((source) => source.id === item.id);

              if (source === undefined) return 1;
              const minimum = minimumSize(source);

              return Math.max(
                minimum.width / item.width,
                minimum.height / item.height,
              );
            }),
          );

          for (const placement of layout.items) {
            const original = selected.find((item) => item.id === placement.id);

            if (original !== undefined)
              items.set(original.id, {
                ...original,
                x: placement.x * factor + (command.anchor?.x ?? 0),
                y: placement.y * factor + (command.anchor?.y ?? 0),
                width: placement.width * factor,
                height: placement.height * factor,
                rotation: 0,
              });
          }
        }

        break;
      }
    }

    board = yield* validateBoard({
      ...board,
      items: Array.from(items.values()),
    });
  }

  return board;
});

/** Only changed persisted fields are included. Null explicitly removes a background. */
export function buildBoardMutation(
  before: RemoteBoard,
  after: RemoteBoard,
): BoardMutationPayload {
  const previous = new Map(before.items.map((item) => [item.id, item]));
  const next = new Set(after.items.map((item) => item.id));

  const mutation: MutableMutation = {
    upserts: after.items.filter((item) => {
      const original = previous.get(item.id);

      return (
        original === undefined ||
        Object.keys(BoardItemFields).some(
          (key) => isItemField(key) && original[key] !== item[key],
        )
      );
    }),
    deletes: before.items
      .filter((item) => !next.has(item.id))
      .map((item) => item.id),
  };

  if (before.title !== after.title) mutation.title = after.title;

  if (before.background !== after.background)
    mutation.background = after.background ?? null;

  if (before.backgroundMediaId !== after.backgroundMediaId)
    mutation.backgroundMediaId = after.backgroundMediaId ?? null;

  return mutation;
}

const isItemField = (key: string): key is keyof RemoteBoardItem =>
  Object.hasOwn(BoardItemSchema.fields, key);

const BoardItemFields = BoardItemSchema.fields;
