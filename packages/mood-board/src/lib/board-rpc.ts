import { Option, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

import {
  MIN_AUDIO_CARD_WIDTH,
  MIN_NATIVE_AUDIO_CARD_HEIGHT,
  MIN_SPOTIFY_AUDIO_CARD_HEIGHT,
  MIN_YOUTUBE_AUDIO_CARD_HEIGHT,
} from "./audio-card-layout";
import {
  DirectAudioSourceUrlSchema,
  SpotifySourceUrlSchema,
  YouTubeSourceUrlSchema,
} from "./audio-source";
import { ImageAnnotationDescriptionSchema, ImageAnnotationTitleSchema } from "./image-annotation";
import { ImageLinkSchema } from "./image-link";
import { SupportedImageSourceSchema } from "./image-source";
import { itemMetadataIssue } from "./item-metadata";
import { MediaIdSchema } from "./media";
import { NonNegativeIntegerSchema } from "./schema";
import {
  MAX_WEBSITE_URL_CHARACTERS,
  MIN_WEBSITE_CARD_HEIGHT,
  MIN_WEBSITE_CARD_WIDTH,
  WebsiteDescriptionSchema,
  WebsiteImageUrlSchema,
  WebsitePreviewSchema,
  WebsiteSiteLabelSchema,
  WebsiteTitleSchema,
  WebsiteUrlSchema,
} from "./website-preview";
import {
  MAX_X_POST_URL_CHARACTERS,
  MIN_X_CARD_HEIGHT,
  MIN_X_CARD_WIDTH,
  XAuthorHandleSchema,
  XAuthorNameSchema,
  XPostDateSchema,
  XPostDisplaySchema,
  XPostPreviewSchema,
  XPostTextSchema,
  XPostThemeSchema,
  XPostUrlSchema,
} from "./x-post";

export const MAX_BOARDS = 100;
export const MAX_REMOTE_ITEMS = 500;
export const MAX_REMOTE_IMAGE_CHARACTERS = 12 * 1024 * 1024;
export const MAX_REMOTE_BOARD_BYTES = 32 * 1024 * 1024;
export const BoardItemCollectionLengthCheck = Schema.isMaxLength(MAX_REMOTE_ITEMS);
export const BoardListLengthCheck = Schema.isMaxLength(MAX_BOARDS);
export const BoardVersionSchema = Schema.Literal(1);
export const BOARD_ID_PATTERN =
  /^(?:default|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export const BoardIdSchema = Schema.String.check(Schema.isPattern(BOARD_ID_PATTERN)).pipe(
  Schema.brand("BoardId"),
);
export type BoardId = typeof BoardIdSchema.Type;
export const DEFAULT_BOARD_ID = BoardIdSchema.make("default");
const BoundedIdStringSchema = Schema.String.check(Schema.isLengthBetween(1, 120));
export const ItemIdSchema = BoundedIdStringSchema.pipe(Schema.brand("ItemId"));
export type ItemId = typeof ItemIdSchema.Type;
export const ClientIdSchema = BoundedIdStringSchema.pipe(Schema.brand("ClientId"));
export type ClientId = typeof ClientIdSchema.Type;
export const MutationIdSchema = BoundedIdStringSchema.pipe(Schema.brand("MutationId"));
export type MutationId = typeof MutationIdSchema.Type;
export const MAX_BOARD_TITLE_CHARACTERS = 120;
export const MAX_BOARD_ITEM_TEXT_CHARACTERS = 1_000;
export const MAX_BOARD_ITEM_LABEL_CHARACTERS = 120;
export const BoardTitleSchema = Schema.String.check(Schema.isMaxLength(MAX_BOARD_TITLE_CHARACTERS));
export const BoardItemTextSchema = Schema.String.check(
  Schema.isMaxLength(MAX_BOARD_ITEM_TEXT_CHARACTERS),
);
export const BoardItemLabelSchema = Schema.String.check(
  Schema.isMaxLength(MAX_BOARD_ITEM_LABEL_CHARACTERS),
);
const ImageSourceSchema = Schema.String.check(Schema.isMaxLength(MAX_REMOTE_IMAGE_CHARACTERS));
export const BoardColorSchema = Schema.String.check(Schema.isPattern(/^#[0-9a-f]{6}$/i));
export const BoardBackgroundFields = {
  background: Schema.optional(BoardColorSchema),
  backgroundMediaId: Schema.optional(MediaIdSchema),
};
export const BoardDocumentHeaderFields = {
  version: BoardVersionSchema,
  title: BoardTitleSchema,
  ...BoardBackgroundFields,
};
const PositionSchema = Schema.Finite;
export const BoardItemSizeSchema = Schema.Finite.check(
  Schema.isBetween({ minimum: 80, maximum: 5_000 }),
);
const RotationSchema = Schema.Finite.check(Schema.isBetween({ minimum: -180, maximum: 180 }));
export const MIN_BOARD_ITEM_ORDER = -10_000;
export const MAX_BOARD_ITEM_ORDER = 10_000;
export const BoardItemOrderSchema = Schema.Int.check(
  Schema.isBetween({ minimum: MIN_BOARD_ITEM_ORDER, maximum: MAX_BOARD_ITEM_ORDER }),
);
export const BoardTimestampSchema = NonNegativeIntegerSchema.pipe(Schema.brand("BoardTimestamp"));
export type BoardTimestamp = typeof BoardTimestampSchema.Type;
export const BoardUpdatedAtFields = {
  updatedAt: BoardTimestampSchema,
};
export const BoardItemCountSchema = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: MAX_REMOTE_ITEMS }),
).pipe(Schema.brand("BoardItemCount"));
export type BoardItemCount = typeof BoardItemCountSchema.Type;
export const BoardCountSchema = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: MAX_BOARDS }),
).pipe(Schema.brand("BoardCount"));
export type BoardCount = typeof BoardCountSchema.Type;
export const BoardSummaryFields = {
  title: BoardTitleSchema,
  itemCount: BoardItemCountSchema,
  ...BoardUpdatedAtFields,
};
export const BoardRevisionSchema = NonNegativeIntegerSchema.pipe(Schema.brand("BoardRevision"));
export type BoardRevision = typeof BoardRevisionSchema.Type;
const decodeSpotifySourceUrl = Schema.decodeUnknownOption(SpotifySourceUrlSchema);
const decodeYouTubeSourceUrl = Schema.decodeUnknownOption(YouTubeSourceUrlSchema);
const decodeDirectAudioSourceUrl = Schema.decodeUnknownOption(DirectAudioSourceUrlSchema);
const decodeXPostUrl = Schema.decodeUnknownOption(XPostUrlSchema);
const decodeSupportedImageSource = Schema.decodeUnknownOption(SupportedImageSourceSchema);

export const BoardItemKindSchema = Schema.Literals([
  "image",
  "note",
  "swatch",
  "spotify",
  "youtube",
  "audio",
  "website",
  "x",
]);

const BoardItemPayloadStruct = Schema.Struct({
  kind: BoardItemKindSchema,
  x: PositionSchema,
  y: PositionSchema,
  width: BoardItemSizeSchema,
  height: BoardItemSizeSchema,
  rotation: RotationSchema,
  order: BoardItemOrderSchema,
  src: Schema.optional(ImageSourceSchema),
  mediaId: Schema.optional(MediaIdSchema),
  href: Schema.optional(ImageLinkSchema),
  annotationTitle: Schema.optional(ImageAnnotationTitleSchema),
  annotationDescription: Schema.optional(ImageAnnotationDescriptionSchema),
  text: Schema.optional(BoardItemTextSchema),
  color: Schema.optional(BoardColorSchema),
  label: Schema.optional(BoardItemLabelSchema),
  websiteUrl: Schema.optional(WebsiteUrlSchema),
  websiteImageUrl: Schema.optional(WebsiteImageUrlSchema),
  websiteTitle: Schema.optional(WebsiteTitleSchema),
  websiteDescription: Schema.optional(WebsiteDescriptionSchema),
  websiteSiteLabel: Schema.optional(WebsiteSiteLabelSchema),
  xDisplay: Schema.optional(XPostDisplaySchema),
  xTheme: Schema.optional(XPostThemeSchema),
  xHideThread: Schema.optional(Schema.Boolean),
  xAuthorName: Schema.optional(XAuthorNameSchema),
  xAuthorHandle: Schema.optional(XAuthorHandleSchema),
  xPostText: Schema.optional(XPostTextSchema),
  xPostDate: Schema.optional(XPostDateSchema),
});

const BoardItemPayloadFilter = Schema.makeFilter((item: typeof BoardItemPayloadStruct.Type) => {
  const metadataIssue = itemMetadataIssue(item, "private");
  if (metadataIssue !== undefined) return metadataIssue;

  if (item.kind === "image") {
    if ((item.src === undefined) === (item.mediaId === undefined)) {
      return { path: ["mediaId"], issue: "Image items require exactly one media source" };
    }
    if (item.src !== undefined && Option.isNone(decodeSupportedImageSource(item.src))) {
      return { path: ["src"], issue: "Image items require a supported image source" };
    }
  }
  if (item.kind === "spotify") {
    if (item.width < MIN_AUDIO_CARD_WIDTH || item.height < MIN_SPOTIFY_AUDIO_CARD_HEIGHT) {
      return {
        path: ["height"],
        issue: `Spotify cards require at least ${MIN_AUDIO_CARD_WIDTH} by ${MIN_SPOTIFY_AUDIO_CARD_HEIGHT} pixels`,
      };
    }
    if (Option.isNone(decodeSpotifySourceUrl(item.src))) {
      return { path: ["src"], issue: "Spotify cards require a canonical supported Spotify URL" };
    }
  } else if (item.kind === "youtube") {
    if (item.width < MIN_AUDIO_CARD_WIDTH || item.height < MIN_YOUTUBE_AUDIO_CARD_HEIGHT) {
      return {
        path: ["height"],
        issue: `YouTube cards require a canonical source and at least ${MIN_AUDIO_CARD_WIDTH} by ${MIN_YOUTUBE_AUDIO_CARD_HEIGHT} pixels`,
      };
    }
    if (Option.isNone(decodeYouTubeSourceUrl(item.src))) {
      return { path: ["src"], issue: "YouTube cards require a canonical supported YouTube URL" };
    }
  } else if (item.kind === "audio") {
    if (item.width < MIN_AUDIO_CARD_WIDTH || item.height < MIN_NATIVE_AUDIO_CARD_HEIGHT) {
      return {
        path: ["height"],
        issue: `Audio cards require at least ${MIN_AUDIO_CARD_WIDTH} by ${MIN_NATIVE_AUDIO_CARD_HEIGHT} pixels`,
      };
    }
    if ((item.src === undefined) === (item.mediaId === undefined)) {
      return { path: ["mediaId"], issue: "Audio cards require exactly one media source" };
    }
    if (item.src !== undefined && Option.isNone(decodeDirectAudioSourceUrl(item.src))) {
      return { path: ["src"], issue: "Audio cards require a hosted HTTPS URL" };
    }
  }
  if (item.kind === "x") {
    if (
      item.width < MIN_X_CARD_WIDTH ||
      item.height < MIN_X_CARD_HEIGHT ||
      Option.isNone(decodeXPostUrl(item.src)) ||
      item.xDisplay === undefined ||
      item.xTheme === undefined ||
      item.xHideThread === undefined
    )
      return { path: ["src"], issue: "X cards require a canonical post source and settings" };
    return undefined;
  }
  if (item.kind === "website") {
    if (
      item.width < MIN_WEBSITE_CARD_WIDTH ||
      item.height < MIN_WEBSITE_CARD_HEIGHT ||
      item.websiteUrl === undefined ||
      item.websiteTitle === undefined ||
      item.websiteSiteLabel === undefined
    ) {
      return {
        path: ["websiteUrl"],
        issue: "Website cards require a normalized preview snapshot",
      };
    }
    return undefined;
  }
  return undefined;
});

export const BoardItemPayloadSchema = BoardItemPayloadStruct.check(BoardItemPayloadFilter);
export const BoardItemSchema = Schema.Struct({
  id: ItemIdSchema,
  ...BoardItemPayloadStruct.fields,
}).check(BoardItemPayloadFilter);
export const BoardItemArraySchema = Schema.Array(BoardItemSchema).check(
  BoardItemCollectionLengthCheck,
);

export type RemoteBoardItem = typeof BoardItemSchema.Type;

export const makeBoardDocumentSchema = <Items extends Schema.Top>(items: Items) =>
  Schema.Struct({
    ...BoardDocumentHeaderFields,
    items,
    ...BoardUpdatedAtFields,
  });

export const BoardSchema = makeBoardDocumentSchema(BoardItemArraySchema);

export type RemoteBoard = typeof BoardSchema.Type;

export const BoardSummarySchema = Schema.Struct({
  id: BoardIdSchema,
  ...BoardSummaryFields,
});

export type BoardSummary = typeof BoardSummarySchema.Type;

export const BoardMutationPayloadSchema = Schema.Struct({
  title: Schema.optional(BoardTitleSchema),
  background: Schema.optional(Schema.NullOr(BoardColorSchema)),
  backgroundMediaId: Schema.optional(Schema.NullOr(MediaIdSchema)),
  upserts: BoardItemArraySchema,
  deletes: Schema.Array(ItemIdSchema).check(BoardItemCollectionLengthCheck),
});
export type BoardMutationPayload = typeof BoardMutationPayloadSchema.Type;

const BoardIdentityFields = {
  boardId: BoardIdSchema,
};
const BoardEventRevisionFields = {
  ...BoardIdentityFields,
  revision: BoardRevisionSchema,
};
const BoardMutationIdentityFields = {
  clientId: ClientIdSchema,
  mutationId: MutationIdSchema,
};

export const BoardSnapshotSchema = Schema.TaggedStruct("Snapshot", {
  ...BoardEventRevisionFields,
  board: BoardSchema,
});

export type BoardSnapshot = typeof BoardSnapshotSchema.Type;

export const BoardChangeSchema = Schema.TaggedStruct("Change", {
  ...BoardEventRevisionFields,
  ...BoardMutationIdentityFields,
  ...BoardMutationPayloadSchema.fields,
  ...BoardUpdatedAtFields,
});

export type BoardChange = typeof BoardChangeSchema.Type;

export const BoardDeletedSchema = Schema.TaggedStruct("Deleted", {
  ...BoardEventRevisionFields,
  ...BoardUpdatedAtFields,
});

export type BoardDeleted = typeof BoardDeletedSchema.Type;

export const BoardEventSchema = Schema.Union([
  BoardSnapshotSchema,
  BoardChangeSchema,
  BoardDeletedSchema,
]);
export type BoardEvent = typeof BoardEventSchema.Type;

export class BoardBackendError extends Schema.Error<BoardBackendError>("BoardBackendError")({
  code: Schema.Literals(["NotFound", "Conflict", "Limit", "Invalid", "Persistence"]),
  message: Schema.String,
}) {}

const NewBoardFields = {
  ...BoardIdentityFields,
  title: BoardTitleSchema,
};

export const BoardRpcs = RpcGroup.make(
  Rpc.make("ListBoards", {
    success: Schema.Array(BoardSummarySchema).check(BoardListLengthCheck),
    error: BoardBackendError,
  }),
  Rpc.make("BoardExists", {
    payload: BoardIdentityFields,
    success: Schema.Boolean,
    error: BoardBackendError,
  }),
  Rpc.make("CreateBoard", {
    payload: NewBoardFields,
    success: BoardSummarySchema,
    error: BoardBackendError,
  }),
  Rpc.make("DuplicateBoard", {
    payload: {
      sourceBoardId: BoardIdSchema,
      ...NewBoardFields,
    },
    success: BoardSummarySchema,
    error: BoardBackendError,
  }),
  Rpc.make("DeleteBoard", {
    payload: BoardIdentityFields,
    success: BoardDeletedSchema,
    error: BoardBackendError,
  }),
  Rpc.make("SubscribeBoard", {
    payload: BoardIdentityFields,
    success: BoardEventSchema,
    error: BoardBackendError,
    stream: true,
  }),
  Rpc.make("ResolveWebsitePreview", {
    payload: {
      url: Schema.String.check(Schema.isMaxLength(MAX_WEBSITE_URL_CHARACTERS)),
    },
    success: WebsitePreviewSchema,
    error: BoardBackendError,
  }),
  Rpc.make("ResolveXPostPreview", {
    payload: {
      url: Schema.String.check(Schema.isMaxLength(MAX_X_POST_URL_CHARACTERS)),
    },
    success: XPostPreviewSchema,
    error: BoardBackendError,
  }),
  Rpc.make("CommitBoard", {
    payload: {
      ...BoardIdentityFields,
      ...BoardMutationIdentityFields,
      ...BoardMutationPayloadSchema.fields,
    },
    success: BoardChangeSchema,
    error: BoardBackendError,
  }),
);
