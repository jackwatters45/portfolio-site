import { Schema } from 'effect';

import { MAX_BULK_FILES } from '../client/board/bulk-image-import';
import { CameraSchema } from '../client/board/camera';
import {
  BoardColorSchema,
  BoardItemArraySchema,
  BoardItemLabelSchema,
  BoardItemSchema,
  BoardMutationPayloadSchema,
  BoardSchema,
  BoardTitleSchema,
  ItemIdSchema,
  MAX_REMOTE_ITEMS,
} from '../lib/board-rpc';
import {
  MediaByteLengthSchema,
  MediaIdSchema,
  MediaKindSchema,
  MediaMimeTypeSchema,
} from '../lib/media';
import { Sha256HexSchema } from '../lib/schema';

export const MAX_SCAN_ENTRIES = 2000;

export const MAX_SCAN_DEPTH = 8;

export const MAX_OPERATION_SOURCE_BYTES = 512 * 1024 * 1024;

export const MAX_PREVIEW_PHOTOS = 20;

export const MAX_PREVIEW_BYTES = 4 * 1024 * 1024;

export const MAX_INPUT_BYTES = 256 * 1024;

export class LocalBoardError extends Schema.TaggedError<LocalBoardError>()(
  'LocalBoardError',
  {
    code: Schema.Literals([
      'InvalidInput',
      'AccessDenied',
      'NotFound',
      'Changed',
      'Unsupported',
      'Decode',
      'Limit',
      'Exists',
      'Io',
      'Busy',
      'Archive',
    ]),
    message: Schema.String,
  },
) {}

const PathText = Schema.String.check(Schema.isLengthBetween(1, 4096));

export const AssetPath = PathText.check(
  Schema.makeFilter((path) =>
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').some((part) => part === '..' || part === '')
      ? 'Use a relative path without traversal, backslashes, or empty segments.'
      : undefined,
  ),
);

export const OutputName = Schema.String.check(
  Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/),
);

export const ArchiveName = OutputName.check(Schema.isPattern(/\.moodboard$/));

export const LocalConfigSchema = Schema.Struct({
  assetRoot: PathText,
  outputDirectory: PathText,
  allowOverwrite: Schema.Boolean,
  allowDelete: Schema.Boolean,
});

export type LocalConfig = typeof LocalConfigSchema.Type;

export const AssetKindSchema = Schema.Literals(['image', 'audio', 'archive']);

export type AssetKind = typeof AssetKindSchema.Type;

export const AssetReferenceSchema = Schema.Struct({
  path: AssetPath,
  sha256: Sha256HexSchema,
});

export type AssetReference = typeof AssetReferenceSchema.Type;

export const AssetInfoSchema = Schema.Struct({
  ...AssetReferenceSchema.fields,
  kind: AssetKindSchema,
  mimeType: Schema.String,
  width: Schema.optional(Schema.Int),
  height: Schema.optional(Schema.Int),
  byteLength: Schema.Int,
});

export type AssetInfo = typeof AssetInfoSchema.Type;

export const AssetFailureSchema = Schema.Struct({
  path: Schema.String,
  code: LocalBoardError.fields.code,
  message: Schema.String,
});

export type AssetFailure = typeof AssetFailureSchema.Type;

export const ScanInput = Schema.Struct({
  directory: Schema.optional(AssetPath),
  recursive: Schema.optional(Schema.Boolean),
  kind: Schema.optional(AssetKindSchema),
});

export type ScanRequest = typeof ScanInput.Type;

export const ScanOutput = Schema.Struct({
  assets: Schema.Array(AssetInfoSchema),
  failures: Schema.Array(AssetFailureSchema),
  visited: Schema.Int,
  truncated: Schema.Boolean,
  limits: Schema.Array(Schema.String),
});

const PreviewFileFields = {
  output: OutputName,
  overwrite: Schema.optional(Schema.Boolean),
};

export const PreviewPhotosInput = Schema.Struct({
  photos: Schema.Array(AssetReferenceSchema).check(
    Schema.isLengthBetween(1, MAX_PREVIEW_PHOTOS),
  ),
  ...PreviewFileFields,
});

export type PreviewPhotosRequest = typeof PreviewPhotosInput.Type;

export const PreviewOutput = Schema.Struct({
  output: Schema.String,
  mimeType: Schema.Literal('image/jpeg'),
  width: Schema.Int,
  height: Schema.Int,
  byteLength: Schema.Int,
  warnings: Schema.Array(Schema.String),
});

export type PreviewResult = typeof PreviewOutput.Type;

export type PreviewImage = {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
};

export type VisualResult = {
  readonly value: PreviewResult;
  readonly image: PreviewImage;
};

export const BoardReferenceSchema = Schema.Struct({
  file: ArchiveName,
  sha256: Sha256HexSchema,
});

export type BoardReference = typeof BoardReferenceSchema.Type;

const BoardField = { board: BoardReferenceSchema };

const RevisionFields = { ...BoardField, output: ArchiveName };

export const RevisionOutput = Schema.Struct({
  board: BoardReferenceSchema,
  output: Schema.String,
  title: BoardTitleSchema,
  byteLength: Schema.Int,
  itemCount: Schema.Int,
  mediaCount: Schema.Int,
  previous: Schema.optional(BoardReferenceSchema),
  addedItemIds: Schema.Array(ItemIdSchema),
});

export type RevisionResult = typeof RevisionOutput.Type;

export const MediaInfoSchema = Schema.Struct({
  mediaId: MediaIdSchema,
  kind: MediaKindSchema,
  mimeType: MediaMimeTypeSchema,
  byteLength: MediaByteLengthSchema,
});

export const BoardOutput = Schema.Struct({
  reference: BoardReferenceSchema,
  document: BoardSchema,
  camera: CameraSchema,
  media: Schema.Array(MediaInfoSchema),
});

export const ListBoardsInput = Schema.Struct({});

export const ListBoardsOutput = Schema.Struct({
  files: Schema.Array(ArchiveName),
  truncated: Schema.Boolean,
});

export const GetBoardInput = Schema.Struct({
  file: ArchiveName,
  sha256: Schema.optional(Sha256HexSchema),
});

export type GetBoardRequest = typeof GetBoardInput.Type;

export const CreateBoardInput = Schema.Struct({
  title: BoardTitleSchema,
  background: Schema.optional(BoardColorSchema),
  items: Schema.optional(BoardItemArraySchema),
  output: ArchiveName,
});

export type CreateBoardRequest = typeof CreateBoardInput.Type;

const ItemIds = Schema.Array(ItemIdSchema).check(
  Schema.isLengthBetween(1, MAX_REMOTE_ITEMS),
);

const TransformSchema = Schema.Struct({
  id: ItemIdSchema,
  x: Schema.optional(BoardItemSchema.fields.x),
  y: Schema.optional(BoardItemSchema.fields.y),
  width: Schema.optional(BoardItemSchema.fields.width),
  height: Schema.optional(BoardItemSchema.fields.height),
  rotation: Schema.optional(BoardItemSchema.fields.rotation),
  order: Schema.optional(BoardItemSchema.fields.order),
});

const DuplicateSchema = Schema.Struct({
  id: ItemIdSchema,
  newId: ItemIdSchema,
  dx: Schema.optional(Schema.Finite),
  dy: Schema.optional(Schema.Finite),
});

export const EditBoardInput = Schema.Struct({
  ...RevisionFields,
  title: BoardMutationPayloadSchema.fields.title,
  background: BoardMutationPayloadSchema.fields.background,
  backgroundMediaId: BoardMutationPayloadSchema.fields.backgroundMediaId,
  upserts: Schema.optional(BoardItemArraySchema),
  deletes: Schema.optional(BoardMutationPayloadSchema.fields.deletes),
  transforms: Schema.optional(
    Schema.Array(TransformSchema).check(Schema.isMaxLength(MAX_REMOTE_ITEMS)),
  ),
  duplicates: Schema.optional(
    Schema.Array(DuplicateSchema).check(Schema.isMaxLength(MAX_REMOTE_ITEMS)),
  ),
  camera: Schema.optional(CameraSchema),
  fitCamera: Schema.optional(Schema.Boolean),
});

export type EditBoardRequest = typeof EditBoardInput.Type;

export const LayoutKindSchema = Schema.Literals([
  'loose',
  'contact',
  'masonry',
]);

export const AnchorSchema = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
});

export const PhotoLayoutSchema = Schema.Union([
  Schema.Struct({
    kind: LayoutKindSchema,
    anchor: Schema.optional(AnchorSchema),
  }),
  Schema.Struct({
    kind: Schema.Literal('explicit'),
    positions: Schema.Array(
      Schema.Struct({
        x: BoardItemSchema.fields.x,
        y: BoardItemSchema.fields.y,
        width: BoardItemSchema.fields.width,
        height: BoardItemSchema.fields.height,
      }),
    ).check(Schema.isLengthBetween(1, MAX_BULK_FILES)),
  }),
]);

export const AddPhotosInput = Schema.Struct({
  ...RevisionFields,
  photos: Schema.Array(AssetReferenceSchema).check(
    Schema.isLengthBetween(1, MAX_BULK_FILES),
  ),
  layout: PhotoLayoutSchema,
});

export type AddPhotosRequest = typeof AddPhotosInput.Type;

export const AddAudioInput = Schema.Struct({
  ...RevisionFields,
  source: AssetReferenceSchema,
  label: Schema.optional(BoardItemLabelSchema),
  x: Schema.Finite,
  y: Schema.Finite,
});

export type AddAudioRequest = typeof AddAudioInput.Type;

export const SetBackgroundInput = Schema.Struct({
  ...RevisionFields,
  source: AssetReferenceSchema,
});

export type SetBackgroundRequest = typeof SetBackgroundInput.Type;

export const LayoutItemsInput = Schema.Struct({
  ...RevisionFields,
  ids: ItemIds,
  kind: LayoutKindSchema,
  anchor: Schema.optional(AnchorSchema),
});

export type LayoutItemsRequest = typeof LayoutItemsInput.Type;

export const ImportBoardInput = Schema.Struct({
  source: AssetReferenceSchema,
  output: ArchiveName,
});

export type ImportBoardRequest = typeof ImportBoardInput.Type;

export const DuplicateBoardInput = Schema.Struct({
  ...RevisionFields,
  title: Schema.optional(BoardTitleSchema),
});

export type DuplicateBoardRequest = typeof DuplicateBoardInput.Type;

export const PreviewBoardInput = Schema.Struct({
  ...BoardField,
  ...PreviewFileFields,
});

export type PreviewBoardRequest = typeof PreviewBoardInput.Type;

export const ExportBoardInput = Schema.Struct({
  ...BoardField,
  ...PreviewFileFields,
});

export type ExportBoardRequest = typeof ExportBoardInput.Type;

export const DeleteBoardInput = Schema.Struct({
  ...BoardField,
  confirm: Schema.Literal(true),
});

export type DeleteBoardRequest = typeof DeleteBoardInput.Type;

export const DeleteBoardOutput = Schema.Struct({
  deleted: BoardReferenceSchema,
});
