import { Option, Schema } from "effect";

import {
  MIN_AUDIO_CARD_WIDTH,
  MIN_NATIVE_AUDIO_CARD_HEIGHT,
  MIN_SPOTIFY_AUDIO_CARD_HEIGHT,
  MIN_YOUTUBE_AUDIO_CARD_HEIGHT,
} from "../../lib/audio-card-layout";
import {
  normalizeDirectAudioSource,
  normalizeSpotifySource,
  normalizeYouTubeSource,
} from "../../lib/audio-source";
import {
  BoardItemKindSchema,
  BoardItemLabelSchema,
  BoardItemOrderSchema,
  BoardItemSizeSchema,
  BoardItemTextSchema,
  BoardTimestampSchema,
  BoardTitleSchema,
  BoardVersionSchema,
  ItemIdSchema,
  type ItemId,
  MAX_BOARD_ITEM_LABEL_CHARACTERS,
  MAX_BOARD_ITEM_ORDER,
  MAX_BOARD_TITLE_CHARACTERS,
  MAX_REMOTE_ITEMS,
  MIN_BOARD_ITEM_ORDER,
} from "../../lib/board-rpc";
import {
  ImageAnnotationDescriptionSchema,
  type ImageAnnotationDescription,
  ImageAnnotationTitleSchema,
  type ImageAnnotationTitle,
  MAX_IMAGE_ANNOTATION_DESCRIPTION_CHARACTERS,
  MAX_IMAGE_ANNOTATION_TITLE_CHARACTERS,
  normalizeImageAnnotationText,
} from "../../lib/image-annotation";
import { normalizeImageLink } from "../../lib/image-link";
import { SupportedImageSourceSchema } from "../../lib/image-source";
import { MediaIdSchema, type MediaId } from "../../lib/media";
import {
  MAX_WEBSITE_DESCRIPTION_CHARACTERS,
  MAX_WEBSITE_SITE_LABEL_CHARACTERS,
  MAX_WEBSITE_TITLE_CHARACTERS,
  MIN_WEBSITE_CARD_HEIGHT,
  MIN_WEBSITE_CARD_WIDTH,
  normalizeWebsiteImageUrl,
  normalizeWebsiteUrl,
  WebsiteDescriptionSchema,
  type WebsiteDescription,
  type WebsiteImageUrl,
  WebsiteSiteLabelSchema,
  type WebsiteSiteLabel,
  WebsiteTitleSchema,
  type WebsiteTitle,
  type WebsiteUrl,
} from "../../lib/website-preview";
import {
  cleanXSnapshotText,
  MAX_X_AUTHOR_HANDLE_CHARACTERS,
  MAX_X_AUTHOR_NAME_CHARACTERS,
  MAX_X_POST_TEXT_CHARACTERS,
  MIN_X_CARD_HEIGHT,
  MIN_X_CARD_WIDTH,
  normalizeXPostSource,
  XAuthorHandleSchema,
  type XAuthorHandle,
  XAuthorNameSchema,
  type XAuthorName,
  type XPostDisplay,
  XPostDateSchema,
  type XPostDate,
  XPostDisplaySchema,
  XPostTextSchema,
  type XPostText,
  type XPostTheme,
  XPostThemeSchema,
} from "../../lib/x-post";
import {
  createId,
  MAX_EMBEDDED_IMAGE_CHARACTERS,
  MAX_ZOOM,
  MIN_ZOOM,
  normalizeHexColor,
} from "./board-utils";
import type { Board, BoardItem, Camera } from "./types";

const ImportedUnknownRecordSchema = Schema.Record(Schema.String, Schema.Unknown);
const ImportedBoardPayloadSchema = Schema.Struct({
  version: BoardVersionSchema,
  title: Schema.optional(Schema.Unknown),
  items: Schema.Array(Schema.Unknown),
  background: Schema.optional(Schema.Unknown),
  backgroundMediaId: Schema.optional(Schema.Unknown),
});
const ImportedItemGeometrySchema = Schema.Struct({
  x: Schema.Finite.check(Schema.isBetween({ minimum: -20_000, maximum: 20_000 })),
  y: Schema.Finite.check(Schema.isBetween({ minimum: -20_000, maximum: 20_000 })),
  width: BoardItemSizeSchema,
  height: BoardItemSizeSchema,
  order: Schema.Finite,
});
const ImportedCameraSchema = Schema.Struct({
  x: Schema.Finite.check(Schema.isBetween({ minimum: -50_000, maximum: 50_000 })),
  y: Schema.Finite.check(Schema.isBetween({ minimum: -50_000, maximum: 50_000 })),
  z: Schema.Finite,
});

const decodeImportedUnknownRecord = Schema.decodeUnknownOption(ImportedUnknownRecordSchema);
const decodeImportedBoardPayload = Schema.decodeUnknownOption(ImportedBoardPayloadSchema);
const decodeImportedItemGeometry = Schema.decodeUnknownOption(ImportedItemGeometrySchema);
const decodeImportedCamera = Schema.decodeUnknownOption(ImportedCameraSchema);
const decodeImportedBoolean = Schema.decodeUnknownOption(Schema.Boolean);
const decodeImportedFinite = Schema.decodeUnknownOption(Schema.Finite);
const decodeImportedString = Schema.decodeUnknownOption(Schema.String);
const importedString = (value: unknown): string | undefined =>
  Option.getOrUndefined(decodeImportedString(value));
const decodeBoardItemKind = Schema.decodeUnknownOption(BoardItemKindSchema);
const decodeBoardItemText = Schema.decodeUnknownOption(BoardItemTextSchema);
const decodeBoardItemLabel = Schema.decodeUnknownOption(BoardItemLabelSchema);
const decodeBoardTitle = Schema.decodeUnknownOption(BoardTitleSchema);
const decodeItemId = Schema.decodeUnknownOption(ItemIdSchema);
const decodeMediaId = Schema.decodeUnknownOption(MediaIdSchema);
const decodeSupportedImageSource = Schema.decodeUnknownOption(SupportedImageSourceSchema);
const decodeImageAnnotationTitle = Schema.decodeUnknownOption(ImageAnnotationTitleSchema);
const decodeImageAnnotationDescription = Schema.decodeUnknownOption(
  ImageAnnotationDescriptionSchema,
);
const decodeXAuthorName = Schema.decodeUnknownOption(XAuthorNameSchema);
const decodeXAuthorHandle = Schema.decodeUnknownOption(XAuthorHandleSchema);
const decodeXPostText = Schema.decodeUnknownOption(XPostTextSchema);
const decodeXPostDate = Schema.decodeUnknownOption(XPostDateSchema);
const decodeXPostDisplay = Schema.decodeUnknownOption(XPostDisplaySchema);
const decodeXPostTheme = Schema.decodeUnknownOption(XPostThemeSchema);
const decodeWebsiteTitle = Schema.decodeUnknownOption(WebsiteTitleSchema);
const decodeWebsiteDescription = Schema.decodeUnknownOption(WebsiteDescriptionSchema);
const decodeWebsiteSiteLabel = Schema.decodeUnknownOption(WebsiteSiteLabelSchema);

export function normalizeImportedBoard(
  value: unknown,
  options: { readonly allowManagedMedia?: boolean } = {},
): { board: Board; camera?: Camera } {
  const candidate = Option.getOrNull(decodeImportedUnknownRecord(value));
  if (candidate === null) throw new Error("That file does not contain a mood board.");
  const rawBoard = Option.getOrNull(decodeImportedBoardPayload(candidate.board ?? candidate));
  if (rawBoard === null) throw new Error("That mood board format is not supported.");
  if (rawBoard.items.length > MAX_REMOTE_ITEMS)
    throw new Error("That board contains too many items.");

  const seenIds = new Set<ItemId>();
  const items: BoardItem[] = rawBoard.items.map((item, index) => {
    const entry = Option.getOrNull(decodeImportedUnknownRecord(item));
    if (entry === null) throw new Error(`Item ${index + 1} is malformed.`);
    const kind = Option.getOrNull(decodeBoardItemKind(entry.kind));
    const geometry = Option.getOrNull(decodeImportedItemGeometry(entry));
    if (
      kind === null ||
      geometry === null ||
      geometry.width / geometry.height < 0.125 ||
      geometry.width / geometry.height > 8
    ) {
      throw new Error(`Item ${index + 1} has invalid geometry.`);
    }

    let src: string | undefined;
    let mediaId: MediaId | undefined;
    if (entry.mediaId !== undefined) {
      if (!options.allowManagedMedia) {
        throw new Error("Managed media must be imported from a portable .moodboard archive.");
      }
      const decodedMediaId = Option.getOrNull(decodeMediaId(entry.mediaId));
      if (decodedMediaId === null) {
        throw new Error(`Item ${index + 1} has an invalid managed media ID.`);
      }
      mediaId = decodedMediaId;
    }
    if (kind === "image") {
      if ((entry.src === undefined) === (mediaId === undefined)) {
        throw new Error(`Image ${index + 1} requires exactly one source.`);
      }
      if (entry.src !== undefined) {
        const rawSource = importedString(entry.src);
        if (rawSource === undefined) throw new Error(`Image ${index + 1} has no source.`);
        const decodedSource = Option.getOrNull(decodeSupportedImageSource(rawSource));
        const embedded = /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(rawSource);
        if (
          decodedSource === null ||
          (!embedded && rawSource.length > 4096) ||
          (embedded && rawSource.length > MAX_EMBEDDED_IMAGE_CHARACTERS)
        ) {
          throw new Error(`Image ${index + 1} uses an unsupported or oversized source.`);
        }
        src = decodedSource;
      }
    } else if (kind === "spotify") {
      if (mediaId !== undefined)
        throw new Error(`Spotify card ${index + 1} cannot use managed media.`);
      src = normalizeSpotifySource(importedString(entry.src) ?? "") ?? undefined;
      if (src === undefined) throw new Error(`Spotify card ${index + 1} has an invalid source.`);
    } else if (kind === "youtube") {
      if (mediaId !== undefined)
        throw new Error(`YouTube card ${index + 1} cannot use managed media.`);
      src = normalizeYouTubeSource(importedString(entry.src) ?? "") ?? undefined;
      if (src === undefined) throw new Error(`YouTube card ${index + 1} has an invalid source.`);
    } else if (kind === "x") {
      if (mediaId !== undefined) throw new Error(`X card ${index + 1} cannot use managed media.`);
      src = normalizeXPostSource(importedString(entry.src) ?? "") ?? undefined;
      if (src === undefined) throw new Error(`X card ${index + 1} has an invalid source.`);
    } else if (kind === "audio") {
      if ((entry.src === undefined) === (mediaId === undefined)) {
        throw new Error(`Audio card ${index + 1} requires exactly one source.`);
      }
      if (entry.src !== undefined) {
        src = normalizeDirectAudioSource(importedString(entry.src) ?? "") ?? undefined;
        if (src === undefined)
          throw new Error(`Audio card ${index + 1} requires a hosted HTTPS source.`);
      }
    } else if (mediaId !== undefined) {
      throw new Error(`Only image and audio items may use managed media (item ${index + 1}).`);
    }
    if (
      kind === "spotify" &&
      (geometry.width < MIN_AUDIO_CARD_WIDTH || geometry.height < MIN_SPOTIFY_AUDIO_CARD_HEIGHT)
    ) {
      throw new Error(`Spotify card ${index + 1} is too small.`);
    }
    if (
      kind === "youtube" &&
      (geometry.width < MIN_AUDIO_CARD_WIDTH || geometry.height < MIN_YOUTUBE_AUDIO_CARD_HEIGHT)
    ) {
      throw new Error(`YouTube card ${index + 1} is too small.`);
    }
    if (
      kind === "audio" &&
      (geometry.width < MIN_AUDIO_CARD_WIDTH || geometry.height < MIN_NATIVE_AUDIO_CARD_HEIGHT)
    ) {
      throw new Error(`Audio card ${index + 1} is too small.`);
    }
    if (
      kind === "x" &&
      (geometry.width < MIN_X_CARD_WIDTH || geometry.height < MIN_X_CARD_HEIGHT)
    ) {
      throw new Error(`X card ${index + 1} is too small.`);
    }

    const hasXFields =
      entry.xDisplay !== undefined ||
      entry.xTheme !== undefined ||
      entry.xHideThread !== undefined ||
      entry.xAuthorName !== undefined ||
      entry.xAuthorHandle !== undefined ||
      entry.xPostText !== undefined ||
      entry.xPostDate !== undefined;
    let xDisplay: XPostDisplay | undefined;
    let xTheme: XPostTheme | undefined;
    let xHideThread: boolean | undefined;
    let xAuthorName: XAuthorName | undefined;
    let xAuthorHandle: XAuthorHandle | undefined;
    let xPostText: XPostText | undefined;
    let xPostDate: XPostDate | undefined;
    if (kind === "x") {
      xDisplay = Option.getOrUndefined(decodeXPostDisplay(entry.xDisplay));
      xTheme = Option.getOrUndefined(decodeXPostTheme(entry.xTheme));
      xHideThread = Option.getOrUndefined(decodeImportedBoolean(entry.xHideThread));
      xAuthorName = Option.getOrUndefined(
        decodeXAuthorName(cleanXSnapshotText(entry.xAuthorName, MAX_X_AUTHOR_NAME_CHARACTERS)),
      );
      xPostText = Option.getOrUndefined(
        decodeXPostText(cleanXSnapshotText(entry.xPostText, MAX_X_POST_TEXT_CHARACTERS)),
      );
      xAuthorHandle = Option.getOrUndefined(
        decodeXAuthorHandle(
          cleanXSnapshotText(entry.xAuthorHandle, MAX_X_AUTHOR_HANDLE_CHARACTERS),
        ),
      );
      xPostDate = Option.getOrUndefined(decodeXPostDate(entry.xPostDate));
      if (
        xDisplay === undefined ||
        xTheme === undefined ||
        xHideThread === undefined ||
        (entry.xAuthorName !== undefined && xAuthorName === undefined) ||
        (entry.xPostText !== undefined && xPostText === undefined) ||
        (entry.xAuthorHandle !== undefined && xAuthorHandle === undefined) ||
        (entry.xPostDate !== undefined && xPostDate === undefined) ||
        entry.href !== undefined ||
        entry.color !== undefined
      )
        throw new Error(`X card ${index + 1} has invalid settings or snapshot metadata.`);
    } else if (hasXFields) {
      throw new Error(`Only X cards may contain X metadata (item ${index + 1}).`);
    }

    let websiteUrl: WebsiteUrl | undefined;
    let websiteImageUrl: WebsiteImageUrl | undefined;
    let websiteTitle: WebsiteTitle | undefined;
    let websiteDescription: WebsiteDescription | undefined;
    let websiteSiteLabel: WebsiteSiteLabel | undefined;
    const hasWebsiteFields =
      entry.websiteUrl !== undefined ||
      entry.websiteImageUrl !== undefined ||
      entry.websiteTitle !== undefined ||
      entry.websiteDescription !== undefined ||
      entry.websiteSiteLabel !== undefined;
    if (kind === "website") {
      websiteUrl = normalizeWebsiteUrl(importedString(entry.websiteUrl) ?? "") ?? undefined;
      websiteImageUrl =
        entry.websiteImageUrl === undefined
          ? undefined
          : (normalizeWebsiteImageUrl(importedString(entry.websiteImageUrl) ?? "") ?? undefined);
      websiteTitle = Option.getOrUndefined(
        decodeWebsiteTitle(
          importedString(entry.websiteTitle)?.trim().slice(0, MAX_WEBSITE_TITLE_CHARACTERS),
        ),
      );
      websiteDescription = Option.getOrUndefined(
        decodeWebsiteDescription(
          importedString(entry.websiteDescription)
            ?.trim()
            .slice(0, MAX_WEBSITE_DESCRIPTION_CHARACTERS) || undefined,
        ),
      );
      websiteSiteLabel = Option.getOrUndefined(
        decodeWebsiteSiteLabel(
          importedString(entry.websiteSiteLabel)
            ?.trim()
            .slice(0, MAX_WEBSITE_SITE_LABEL_CHARACTERS),
        ),
      );
      if (
        websiteUrl === undefined ||
        (entry.websiteImageUrl !== undefined && websiteImageUrl === undefined) ||
        websiteTitle === undefined ||
        websiteSiteLabel === undefined ||
        geometry.width < MIN_WEBSITE_CARD_WIDTH ||
        geometry.height < MIN_WEBSITE_CARD_HEIGHT ||
        entry.src !== undefined ||
        entry.mediaId !== undefined ||
        entry.href !== undefined ||
        entry.color !== undefined
      )
        throw new Error(`Website card ${index + 1} has an invalid preview snapshot.`);
    } else if (hasWebsiteFields) {
      throw new Error(`Only website cards may contain website metadata (item ${index + 1}).`);
    }

    let annotationTitle: ImageAnnotationTitle | undefined;
    let annotationDescription: ImageAnnotationDescription | undefined;
    if (entry.annotationTitle !== undefined || entry.annotationDescription !== undefined) {
      if (kind !== "image") {
        throw new Error(`Only image items may have annotations (item ${index + 1}).`);
      }
      const rawAnnotationTitle = importedString(entry.annotationTitle);
      if (entry.annotationTitle !== undefined && rawAnnotationTitle === undefined) {
        throw new Error(`Image ${index + 1} has an invalid annotation title.`);
      }
      const rawAnnotationDescription = importedString(entry.annotationDescription);
      if (entry.annotationDescription !== undefined && rawAnnotationDescription === undefined) {
        throw new Error(`Image ${index + 1} has an invalid annotation description.`);
      }
      annotationTitle = Option.getOrUndefined(
        decodeImageAnnotationTitle(
          normalizeImageAnnotationText(rawAnnotationTitle, MAX_IMAGE_ANNOTATION_TITLE_CHARACTERS),
        ),
      );
      annotationDescription = Option.getOrUndefined(
        decodeImageAnnotationDescription(
          normalizeImageAnnotationText(
            rawAnnotationDescription,
            MAX_IMAGE_ANNOTATION_DESCRIPTION_CHARACTERS,
          ),
        ),
      );
    }

    let href: string | undefined;
    if (entry.href !== undefined) {
      const rawHref = importedString(entry.href);
      if (kind !== "image" || rawHref === undefined) {
        throw new Error(`Only image items may have an external link (item ${index + 1}).`);
      }
      href = normalizeImageLink(rawHref) ?? undefined;
      if (href === undefined) {
        throw new Error(`Image ${index + 1} has an invalid external link.`);
      }
    }
    const text =
      kind === "note" ? Option.getOrUndefined(decodeBoardItemText(entry.text)) : undefined;
    if (kind === "note" && text === undefined) {
      throw new Error(`Note ${index + 1} is invalid or too long.`);
    }
    const allowsLabel =
      kind === "swatch" || kind === "spotify" || kind === "youtube" || kind === "audio";
    const label = allowsLabel
      ? Option.getOrUndefined(
          decodeBoardItemLabel(
            importedString(entry.label)?.slice(0, MAX_BOARD_ITEM_LABEL_CHARACTERS),
          ),
        )
      : undefined;

    let color: string | undefined;
    if (kind === "swatch") {
      color = normalizeHexColor(importedString(entry.color) ?? "") ?? undefined;
      if (color === undefined) {
        throw new Error(`Color ${index + 1} must use six-digit #RRGGBB format.`);
      }
    }

    const rotation = Option.getOrNull(decodeImportedFinite(entry.rotation)) ?? 0;
    let id = Option.getOrNull(decodeItemId(entry.id)) ?? createId();
    if (seenIds.has(id)) id = createId();
    seenIds.add(id);

    return {
      id,
      kind,
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      rotation: Math.min(180, Math.max(-180, rotation)),
      order: BoardItemOrderSchema.make(
        Math.min(MAX_BOARD_ITEM_ORDER, Math.max(MIN_BOARD_ITEM_ORDER, Math.trunc(geometry.order))),
      ),
      src,
      mediaId,
      href,
      annotationTitle,
      annotationDescription,
      text,
      color,
      label,
      websiteUrl,
      websiteImageUrl,
      websiteTitle,
      websiteDescription,
      websiteSiteLabel,
      xDisplay,
      xTheme,
      xHideThread,
      xAuthorName,
      xAuthorHandle,
      xPostText,
      xPostDate,
    };
  });

  items
    .sort((a, b) => a.order - b.order)
    .forEach((item, index) => {
      item.order = index + 1;
    });

  let backgroundMediaId: MediaId | undefined;
  if (rawBoard.backgroundMediaId !== undefined) {
    if (!options.allowManagedMedia) {
      throw new Error(
        "Managed background media must be imported from a portable .moodboard archive.",
      );
    }
    const decodedBackgroundMediaId = Option.getOrNull(decodeMediaId(rawBoard.backgroundMediaId));
    if (decodedBackgroundMediaId === null) {
      throw new Error("The board background has an invalid managed media ID.");
    }
    backgroundMediaId = decodedBackgroundMediaId;
  }

  let background: string | undefined;
  if (rawBoard.background !== undefined) {
    background = normalizeHexColor(importedString(rawBoard.background) ?? "") ?? undefined;
    if (background === undefined) {
      throw new Error("The board background must use six-digit #RRGGBB format.");
    }
  }

  const title = Option.getOrUndefined(
    decodeBoardTitle(importedString(rawBoard.title)?.slice(0, MAX_BOARD_TITLE_CHARACTERS)),
  );
  const board: Board = {
    version: 1,
    title: title ?? "Imported mood",
    ...(background === undefined ? {} : { background }),
    ...(backgroundMediaId === undefined ? {} : { backgroundMediaId }),
    items,
    updatedAt: BoardTimestampSchema.make(Date.now()),
  };

  let camera: Camera | undefined;
  if (candidate.camera) {
    const decodedCamera = Option.getOrNull(decodeImportedCamera(candidate.camera));
    if (decodedCamera === null) {
      throw new Error("The saved camera position is invalid.");
    }
    camera = {
      x: decodedCamera.x,
      y: decodedCamera.y,
      z: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, decodedCamera.z)),
    };
  }

  return { board, camera };
}
