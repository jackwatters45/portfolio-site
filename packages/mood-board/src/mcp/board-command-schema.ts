import { Schema } from 'effect';

import {
  BoardItemArraySchema,
  BoardItemSchema,
  BoardMutationPayloadSchema,
  ItemIdSchema,
  MAX_REMOTE_ITEMS,
} from '../lib/board-rpc';
import {
  ImageAnnotationDescriptionSchema,
  ImageAnnotationTitleSchema,
} from '../lib/image-annotation';
import { ImageLinkSchema } from '../lib/image-link';

export const CommandItemIdsSchema = Schema.Array(ItemIdSchema).check(
  Schema.isMaxLength(MAX_REMOTE_ITEMS),
);

export const ItemTransformSchema = Schema.Struct({
  id: ItemIdSchema,
  x: Schema.optional(BoardItemSchema.fields.x),
  y: Schema.optional(BoardItemSchema.fields.y),
  width: Schema.optional(BoardItemSchema.fields.width),
  height: Schema.optional(BoardItemSchema.fields.height),
  rotation: Schema.optional(BoardItemSchema.fields.rotation),
  order: Schema.optional(BoardItemSchema.fields.order),
});

export const ItemDuplicateSchema = Schema.Struct({
  id: ItemIdSchema,
  newId: ItemIdSchema,
  dx: Schema.optional(Schema.Finite),
  dy: Schema.optional(Schema.Finite),
});

export const BoardCommandSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('upsert'),
    items: BoardItemArraySchema,
  }),
  Schema.Struct({ type: Schema.Literal('delete'), ids: CommandItemIdsSchema }),
  Schema.Struct({
    type: Schema.Literal('transform'),
    transforms: Schema.Array(ItemTransformSchema).check(
      Schema.isMaxLength(MAX_REMOTE_ITEMS),
    ),
  }),
  Schema.Struct({
    type: Schema.Literal('duplicate'),
    duplicates: Schema.Array(ItemDuplicateSchema).check(
      Schema.isMaxLength(MAX_REMOTE_ITEMS),
    ),
  }),
  Schema.Struct({
    type: Schema.Literal('annotate'),
    id: ItemIdSchema,
    title: Schema.optional(Schema.NullOr(ImageAnnotationTitleSchema)),
    description: Schema.optional(
      Schema.NullOr(ImageAnnotationDescriptionSchema),
    ),
  }),
  Schema.Struct({
    type: Schema.Literal('link'),
    id: ItemIdSchema,
    href: Schema.NullOr(ImageLinkSchema),
  }),
  Schema.Struct({ type: Schema.Literal('order'), ids: CommandItemIdsSchema }),
  Schema.Struct({
    type: Schema.Literal('layer'),
    ids: CommandItemIdsSchema,
    position: Schema.Literals(['front', 'back']),
  }),
  Schema.Struct({
    type: Schema.Literal('layout'),
    ids: Schema.optional(CommandItemIdsSchema),
    kind: Schema.Literals(['loose', 'contact', 'masonry']),
    anchor: Schema.optional(
      Schema.Struct({ x: Schema.Finite, y: Schema.Finite }),
    ),
  }),
  Schema.Struct({
    type: Schema.Literal('shuffle'),
    ids: Schema.optional(CommandItemIdsSchema),
    seed: Schema.Int,
  }),
  Schema.Struct({
    type: Schema.Literal('metadata'),
    title: BoardMutationPayloadSchema.fields.title,
    background: BoardMutationPayloadSchema.fields.background,
    backgroundMediaId: BoardMutationPayloadSchema.fields.backgroundMediaId,
  }),
]);

export const BoardCommandsSchema = Schema.Array(BoardCommandSchema).check(
  Schema.isMaxLength(MAX_REMOTE_ITEMS),
);

export type BoardCommand = typeof BoardCommandSchema.Type;

export class BoardCommandError extends Schema.TaggedError<BoardCommandError>()(
  'BoardCommandError',
  {
    code: Schema.Literals([
      'InvalidInput',
      'DuplicateId',
      'MissingItem',
      'InvalidOrder',
      'InvalidLayout',
    ]),
    message: Schema.String,
  },
) {}
