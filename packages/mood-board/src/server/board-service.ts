import { Context, Effect, Layer, Option, PubSub, Schema, Semaphore, Stream } from "effect";

import {
  MIN_AUDIO_CARD_WIDTH,
  MIN_NATIVE_AUDIO_CARD_HEIGHT,
  MIN_SPOTIFY_AUDIO_CARD_HEIGHT,
  MIN_YOUTUBE_AUDIO_CARD_HEIGHT,
} from "../lib/audio-card-layout";
import {
  normalizeDirectAudioSource,
  normalizeSpotifySource,
  normalizeYouTubeSource,
} from "../lib/audio-source";
import {
  BoardBackendError,
  type BoardChange,
  type BoardDeleted,
  type BoardEvent,
  type BoardId,
  type BoardSnapshot,
  type BoardSummary,
  MAX_REMOTE_ITEMS,
} from "../lib/board-rpc";
import {
  normalizeImageAnnotationDescription,
  normalizeImageAnnotationTitle,
} from "../lib/image-annotation";
import { normalizeImageLink } from "../lib/image-link";
import { SupportedImageSourceSchema } from "../lib/image-source";
import {
  MIN_WEBSITE_CARD_HEIGHT,
  MIN_WEBSITE_CARD_WIDTH,
  normalizeWebsiteImageUrl,
  normalizeWebsiteUrl,
  WebsiteDescriptionSchema,
  WebsiteSiteLabelSchema,
  WebsiteTitleSchema,
} from "../lib/website-preview";
import {
  cleanXSnapshotText,
  MAX_X_AUTHOR_HANDLE_CHARACTERS,
  MAX_X_AUTHOR_NAME_CHARACTERS,
  MAX_X_POST_TEXT_CHARACTERS,
  MIN_X_CARD_HEIGHT,
  MIN_X_CARD_WIDTH,
  normalizeXPostSource,
  XAuthorHandleSchema,
  XAuthorNameSchema,
  XPostDateSchema,
  XPostTextSchema,
} from "../lib/x-post";
import { BoardRepo, type CommitInput, type ManagementRejected } from "./board-repo";

const decodeXAuthorHandle = Schema.decodeUnknownOption(XAuthorHandleSchema);
const decodeXAuthorName = Schema.decodeUnknownOption(XAuthorNameSchema);
const decodeXPostDate = Schema.decodeUnknownOption(XPostDateSchema);
const decodeXPostText = Schema.decodeUnknownOption(XPostTextSchema);
const decodeWebsiteTitle = Schema.decodeUnknownOption(WebsiteTitleSchema);
const decodeWebsiteDescription = Schema.decodeUnknownOption(WebsiteDescriptionSchema);
const decodeWebsiteSiteLabel = Schema.decodeUnknownOption(WebsiteSiteLabelSchema);
const decodeSupportedImageSource = Schema.decodeUnknownOption(SupportedImageSourceSchema);

const persistenceError = () =>
  new BoardBackendError({
    code: "Persistence",
    message: "The board could not be persisted.",
  });

const missingBoardError = () =>
  new BoardBackendError({
    code: "NotFound",
    message: "That board does not exist.",
  });

const managementError = (rejection: ManagementRejected) => {
  switch (rejection._tag) {
    case "BoardLimit":
      return new BoardBackendError({
        code: "Limit",
        message: "This workspace can contain at most 100 boards.",
      });
    case "LastBoard":
      return new BoardBackendError({
        code: "Conflict",
        message: "The last board cannot be deleted.",
      });
    case "DeletedBoardId":
      return new BoardBackendError({
        code: "Conflict",
        message: "A deleted board id cannot be reused.",
      });
    case "InvalidOperation":
      return new BoardBackendError({
        code: "Invalid",
        message: "That board operation is not valid.",
      });
  }
};

interface BoardServiceShape {
  readonly list: () => Effect.Effect<ReadonlyArray<BoardSummary>, BoardBackendError>;
  readonly exists: (boardId: BoardId) => Effect.Effect<boolean, BoardBackendError>;
  readonly get: (boardId: BoardId) => Effect.Effect<BoardSnapshot | null, BoardBackendError>;
  readonly create: (
    boardId: BoardId,
    title: string,
  ) => Effect.Effect<BoardSummary, BoardBackendError>;
  readonly duplicate: (
    sourceBoardId: BoardId,
    boardId: BoardId,
    title: string,
  ) => Effect.Effect<BoardSummary, BoardBackendError>;
  readonly delete: (boardId: BoardId) => Effect.Effect<BoardDeleted, BoardBackendError>;
  readonly commit: (input: CommitInput) => Effect.Effect<BoardChange, BoardBackendError>;
  readonly subscribe: (boardId: BoardId) => Stream.Stream<BoardEvent, BoardBackendError>;
}

export class BoardService extends Context.Service<BoardService, BoardServiceShape>()(
  "mood-board/BoardService",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const repo = yield* BoardRepo;
      const mutex = yield* Semaphore.make(1);
      const channels = new Map<BoardId, PubSub.PubSub<BoardChange | BoardDeleted>>();

      const recoverPersistence = Effect.fn("BoardService.recoverPersistence")(
        <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          effect.pipe(
            Effect.tapError((error) =>
              error instanceof BoardBackendError
                ? Effect.void
                : Effect.logError("Board persistence failed", error),
            ),
            Effect.mapError((error) =>
              error instanceof BoardBackendError ? error : persistenceError(),
            ),
          ),
      );

      const channelFor = Effect.fn("BoardService.channelFor")(function* (boardId: BoardId) {
        const existing = channels.get(boardId);
        if (existing !== undefined) return existing;
        const channel = yield* PubSub.sliding<BoardChange | BoardDeleted>(256);
        channels.set(boardId, channel);
        return channel;
      });

      yield* Effect.addFinalizer(() =>
        Effect.forEach(channels.values(), PubSub.shutdown, { discard: true }).pipe(Effect.asVoid),
      );

      const list = Effect.fn("BoardService.list")(function* () {
        return yield* recoverPersistence(mutex.withPermit(repo.list()));
      });

      const exists = Effect.fn("BoardService.exists")(function* (boardId: BoardId) {
        return yield* recoverPersistence(mutex.withPermit(repo.exists(boardId)));
      });

      const get = Effect.fn("BoardService.get")(function* (boardId: BoardId) {
        return yield* recoverPersistence(mutex.withPermit(repo.getSnapshot(boardId)));
      });

      const create = Effect.fn("BoardService.create")(function* (boardId: BoardId, title: string) {
        const result = yield* recoverPersistence(mutex.withPermit(repo.create(boardId, title)));
        if ("_tag" in result) return yield* managementError(result);
        return result;
      });

      const duplicate = Effect.fn("BoardService.duplicate")(function* (
        sourceBoardId: BoardId,
        boardId: BoardId,
        title: string,
      ) {
        const result = yield* recoverPersistence(
          mutex.withPermit(repo.duplicate(sourceBoardId, boardId, title)),
        );
        if (result === null) return yield* missingBoardError();
        if ("_tag" in result) return yield* managementError(result);
        return result;
      });

      const deleteBoard = Effect.fn("BoardService.delete")(function* (boardId: BoardId) {
        return yield* recoverPersistence(
          mutex.withPermit(
            Effect.uninterruptible(
              Effect.gen(function* () {
                const result = yield* repo.delete(boardId);
                if (result._tag !== "Deleted") {
                  return yield* managementError(result);
                }
                const channel = channels.get(boardId);
                if (channel !== undefined) yield* PubSub.publish(channel, result);
                channels.delete(boardId);
                return result;
              }),
            ),
          ),
        );
      });

      const commit = Effect.fn("BoardService.commit")(function* (input: CommitInput) {
        let invalidMedia = false;
        const upserts = input.upserts.map((item) => {
          let normalized = item;
          const annotationTitle = normalizeImageAnnotationTitle(item.annotationTitle);
          const annotationDescription = normalizeImageAnnotationDescription(
            item.annotationDescription,
          );
          if (
            (item.annotationTitle !== undefined || item.annotationDescription !== undefined) &&
            (item.kind !== "image" ||
              (item.annotationTitle !== undefined && annotationTitle === undefined) ||
              (item.annotationDescription !== undefined && annotationDescription === undefined))
          )
            invalidMedia = true;
          else if (item.kind === "image") {
            normalized = {
              ...normalized,
              ...(annotationTitle === undefined ? {} : { annotationTitle }),
              ...(annotationDescription === undefined ? {} : { annotationDescription }),
            };
          }
          if (
            item.kind !== "x" &&
            (item.xDisplay !== undefined ||
              item.xTheme !== undefined ||
              item.xHideThread !== undefined ||
              item.xAuthorName !== undefined ||
              item.xAuthorHandle !== undefined ||
              item.xPostText !== undefined ||
              item.xPostDate !== undefined)
          )
            invalidMedia = true;
          if (
            item.kind !== "website" &&
            (item.websiteUrl !== undefined ||
              item.websiteImageUrl !== undefined ||
              item.websiteTitle !== undefined ||
              item.websiteDescription !== undefined ||
              item.websiteSiteLabel !== undefined)
          )
            invalidMedia = true;
          if (item.kind === "image") {
            if (
              (item.src === undefined) === (item.mediaId === undefined) ||
              (item.src !== undefined && Option.isNone(decodeSupportedImageSource(item.src)))
            )
              invalidMedia = true;
          } else if (item.kind === "note" || item.kind === "swatch") {
            if (item.src !== undefined || item.mediaId !== undefined) invalidMedia = true;
          } else if (item.kind === "spotify") {
            if (item.mediaId !== undefined) invalidMedia = true;
            const src = normalizeSpotifySource(item.src ?? "");
            if (
              src === null ||
              item.width < MIN_AUDIO_CARD_WIDTH ||
              item.height < MIN_SPOTIFY_AUDIO_CARD_HEIGHT
            )
              invalidMedia = true;
            else normalized = { ...normalized, src };
          } else if (item.kind === "youtube") {
            if (item.mediaId !== undefined) invalidMedia = true;
            const src = normalizeYouTubeSource(item.src ?? "");
            if (
              src === null ||
              item.width < MIN_AUDIO_CARD_WIDTH ||
              item.height < MIN_YOUTUBE_AUDIO_CARD_HEIGHT
            )
              invalidMedia = true;
            else normalized = { ...normalized, src };
          } else if (item.kind === "x") {
            const src = normalizeXPostSource(item.src ?? "");
            const xAuthorName = Option.getOrUndefined(
              decodeXAuthorName(cleanXSnapshotText(item.xAuthorName, MAX_X_AUTHOR_NAME_CHARACTERS)),
            );
            const xAuthorHandle = Option.getOrNull(
              decodeXAuthorHandle(
                cleanXSnapshotText(item.xAuthorHandle, MAX_X_AUTHOR_HANDLE_CHARACTERS),
              ),
            );
            const xPostText = Option.getOrUndefined(
              decodeXPostText(cleanXSnapshotText(item.xPostText, MAX_X_POST_TEXT_CHARACTERS)),
            );
            const xPostDate = Option.getOrNull(decodeXPostDate(item.xPostDate));
            if (
              src === null ||
              item.width < MIN_X_CARD_WIDTH ||
              item.height < MIN_X_CARD_HEIGHT ||
              item.xDisplay === undefined ||
              item.xTheme === undefined ||
              item.xHideThread === undefined ||
              item.mediaId !== undefined ||
              item.href !== undefined ||
              item.text !== undefined ||
              item.color !== undefined ||
              item.label !== undefined ||
              (item.xAuthorName !== undefined && xAuthorName === undefined) ||
              (item.xPostText !== undefined && xPostText === undefined) ||
              (item.xAuthorHandle !== undefined && xAuthorHandle === null) ||
              (item.xPostDate !== undefined && xPostDate === null)
            )
              invalidMedia = true;
            else
              normalized = {
                ...normalized,
                src,
                ...(xAuthorName === undefined ? {} : { xAuthorName }),
                ...(xAuthorHandle === null ? {} : { xAuthorHandle }),
                ...(xPostText === undefined ? {} : { xPostText }),
              };
          } else if (item.kind === "audio") {
            const src = item.src === undefined ? undefined : normalizeDirectAudioSource(item.src);
            if (
              (item.src === undefined) === (item.mediaId === undefined) ||
              (item.src !== undefined && src === null) ||
              item.width < MIN_AUDIO_CARD_WIDTH ||
              item.height < MIN_NATIVE_AUDIO_CARD_HEIGHT
            )
              invalidMedia = true;
            else if (src !== undefined && src !== null) normalized = { ...normalized, src };
          } else if (item.kind === "website") {
            const websiteUrl = normalizeWebsiteUrl(item.websiteUrl ?? "");
            const websiteImageUrl =
              item.websiteImageUrl === undefined
                ? undefined
                : (normalizeWebsiteImageUrl(item.websiteImageUrl) ?? undefined);
            const websiteTitle = Option.getOrNull(decodeWebsiteTitle(item.websiteTitle?.trim()));
            const websiteDescriptionCandidate = item.websiteDescription?.trim() || undefined;
            const websiteDescription =
              websiteDescriptionCandidate === undefined
                ? undefined
                : Option.getOrNull(decodeWebsiteDescription(websiteDescriptionCandidate));
            const websiteSiteLabel = Option.getOrNull(
              decodeWebsiteSiteLabel(item.websiteSiteLabel?.trim()),
            );
            if (
              websiteUrl === null ||
              (item.websiteImageUrl !== undefined && websiteImageUrl === undefined) ||
              websiteTitle === null ||
              websiteDescription === null ||
              websiteSiteLabel === null ||
              item.width < MIN_WEBSITE_CARD_WIDTH ||
              item.height < MIN_WEBSITE_CARD_HEIGHT ||
              item.src !== undefined ||
              item.mediaId !== undefined ||
              item.href !== undefined ||
              item.text !== undefined ||
              item.color !== undefined ||
              item.label !== undefined
            )
              invalidMedia = true;
            else
              normalized = {
                ...normalized,
                websiteUrl,
                ...(websiteImageUrl === undefined ? {} : { websiteImageUrl }),
                websiteTitle,
                ...(websiteDescription === undefined ? {} : { websiteDescription }),
                websiteSiteLabel,
              };
          }
          if (item.href === undefined) return normalized;
          const href = normalizeImageLink(item.href);
          if (item.kind !== "image" || href === null) {
            invalidMedia = true;
            return normalized;
          }
          return { ...normalized, href };
        });
        if (invalidMedia) {
          return yield* new BoardBackendError({
            code: "Invalid",
            message: "Board media URLs are invalid or unsupported.",
          });
        }
        const normalizedInput = {
          ...input,
          upserts,
          ...(typeof input.background === "string"
            ? { background: input.background.toUpperCase() }
            : {}),
        };
        return yield* recoverPersistence(
          mutex.withPermit(
            Effect.uninterruptible(
              Effect.gen(function* () {
                const result = yield* repo.commit(normalizedInput);
                if (result === null) return yield* missingBoardError();
                if ("_tag" in result) {
                  const message =
                    result._tag === "TooManyItems"
                      ? `A board can contain at most ${MAX_REMOTE_ITEMS} items.`
                      : result._tag === "BoardTooLarge"
                        ? "That board is too large to sync."
                        : result._tag === "MutationConflict"
                          ? "That mutation id was already used for another change."
                          : result._tag === "InvalidMedia"
                            ? "Managed media is missing, not ready, or has the wrong kind."
                            : "An item cannot be upserted and deleted in the same change.";
                  const code =
                    result._tag === "TooManyItems" || result._tag === "BoardTooLarge"
                      ? ("Limit" as const)
                      : result._tag === "MutationConflict"
                        ? ("Conflict" as const)
                        : ("Invalid" as const);
                  return yield* new BoardBackendError({ code, message });
                }
                if (result.applied) {
                  const channel = yield* channelFor(normalizedInput.boardId);
                  yield* PubSub.publish(channel, result.change);
                }
                return result.change;
              }),
            ),
          ),
        );
      });

      const openSubscription = Effect.fn("BoardService.openSubscription")(function* (
        boardId: BoardId,
      ) {
        const snapshot = yield* repo.getSnapshot(boardId);
        if (snapshot === null) return yield* missingBoardError();
        const channel = yield* channelFor(boardId);
        const subscription = yield* PubSub.subscribe(channel);

        const changes = Stream.fromSubscription(subscription).pipe(
          Stream.filter((event) => event._tag === "Deleted" || event.revision > snapshot.revision),
          Stream.takeUntil((event) => event._tag === "Deleted"),
        );
        return Stream.concat(Stream.succeed(snapshot), changes);
      });

      const subscribe = (boardId: BoardId): Stream.Stream<BoardEvent, BoardBackendError> =>
        Stream.unwrap(recoverPersistence(mutex.withPermit(openSubscription(boardId))));

      return BoardService.of({
        list,
        exists,
        get,
        create,
        duplicate,
        delete: deleteBoard,
        commit,
        subscribe,
      });
    }),
  ).pipe(Layer.provide(BoardRepo.layer));
}
