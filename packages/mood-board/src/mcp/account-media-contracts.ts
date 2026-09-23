import { Schema } from 'effect';

import {
  BoardItemSchema,
  BoardRevisionSchema,
  MutationIdSchema,
} from '../lib/board-rpc';
import {
  MediaIdSchema,
  MediaKindSchema,
  MediaMimeTypeSchema,
  MediaUploadResponseSchema,
} from '../lib/media';
import { Sha256HexSchema } from '../lib/schema';
import {
  AccountBoardInput,
  AccountEditOutput,
  AccountError,
} from './account-contracts';
import { AssetReferenceSchema, OutputName } from './contracts';

export const AccountMediaPrepareInput = Schema.Struct({
  source: AssetReferenceSchema,
  kind: MediaKindSchema,
});

export const AccountMediaPrepared = Schema.Struct({
  ...AccountMediaPrepareInput.fields,
  sha256: Sha256HexSchema,
  mimeType: MediaMimeTypeSchema,
  byteLength: Schema.Int,
  width: Schema.optional(Schema.Int),
  height: Schema.optional(Schema.Int),
});

const MediaPlacement = Schema.Struct({
  id: BoardItemSchema.fields.id,
  x: BoardItemSchema.fields.x,
  y: BoardItemSchema.fields.y,
  width: BoardItemSchema.fields.width,
  height: BoardItemSchema.fields.height,
  rotation: BoardItemSchema.fields.rotation,
  order: BoardItemSchema.fields.order,
});

export const AccountMediaUploadInput = Schema.Struct({
  ...AccountBoardInput.fields,
  prepared: AccountMediaPrepared,
  target: Schema.Literals(['item', 'background']),
  item: Schema.optional(MediaPlacement),
  expectedRevision: BoardRevisionSchema,
  mutationId: MutationIdSchema,
  confirm: Schema.Literal(true),
});

export const AccountMediaUploadOutput = Schema.Struct({
  ...AccountEditOutput.fields,
  receipt: MediaUploadResponseSchema,
});

export class AccountMediaPartialError extends Schema.TaggedError<AccountMediaPartialError>()(
  'AccountMediaPartialError',
  {
    ...AccountBoardInput.fields,
    message: Schema.String,
    receipts: Schema.Array(MediaUploadResponseSchema),
    uploadMayHaveSucceeded: Schema.Boolean,
    diagnostic: AccountError.fields.diagnostic,
  },
) {}

export const AccountMediaReadInput = Schema.Struct({
  ...AccountBoardInput.fields,
  mediaId: MediaIdSchema,
  kind: MediaKindSchema,
  output: OutputName,
  overwrite: Schema.optional(Schema.Boolean),
});

export const AccountMediaReadOutput = Schema.Struct({
  ...AccountBoardInput.fields,
  mediaId: MediaIdSchema,
  kind: MediaKindSchema,
  mimeType: MediaMimeTypeSchema,
  byteLength: Schema.Int,
  sha256: Sha256HexSchema,
  output: Schema.String,
});
