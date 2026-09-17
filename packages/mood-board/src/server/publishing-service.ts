import { Context, Effect, Layer, Option, Schema, Semaphore } from "effect";

import type { BoardId } from "../lib/board-rpc";
import {
  normalizeDisplayName,
  normalizeProfileBio,
  normalizeProfileHandle,
  PublicIdSchema,
  type PublicBoard,
  type PublicId,
  type PublicOwner,
  type PublicProfile,
} from "../lib/public-api";
import { OptionalErrorCauseSchema } from "../lib/schema";
import { PublishingRepo } from "./publishing-repo";

export class PublishingError extends Schema.Error<PublishingError>("PublishingError")({
  code: Schema.Literals(["Invalid", "NotFound", "Persistence"]),
  message: Schema.String,
  cause: OptionalErrorCauseSchema,
}) {}

const persistenceError = (cause: unknown) =>
  new PublishingError({
    code: "Persistence",
    message: "Publishing data could not be read or written.",
    cause,
  });

const decodePublicId = Schema.decodeUnknownOption(PublicIdSchema);

const makePublicId = (): PublicId =>
  PublicIdSchema.make(crypto.randomUUID().replaceAll("-", "").toLowerCase());

interface PublishingServiceShape {
  readonly configureProfile: (input: {
    readonly handle: string;
    readonly displayName: string;
    readonly bio: string;
  }) => Effect.Effect<PublicOwner, PublishingError>;
  readonly publish: (boardId: BoardId) => Effect.Effect<PublicId, PublishingError>;
  readonly unpublish: (boardId: BoardId) => Effect.Effect<boolean, PublishingError>;
  readonly getProfile: (handle: string) => Effect.Effect<PublicProfile | null, PublishingError>;
  readonly getBoard: (publicId: string) => Effect.Effect<PublicBoard | null, PublishingError>;
}

export class PublishingService extends Context.Service<PublishingService, PublishingServiceShape>()(
  "mood-board/PublishingService",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const repo = yield* PublishingRepo;
      const mutex = yield* Semaphore.make(1);

      const configureProfile = Effect.fn("PublishingService.configureProfile")(function* (input: {
        readonly handle: string;
        readonly displayName: string;
        readonly bio: string;
      }) {
        const handle = normalizeProfileHandle(input.handle);
        const displayName = normalizeDisplayName(input.displayName);
        const bio = normalizeProfileBio(input.bio);
        if (handle === null || displayName === null || bio === null) {
          return yield* new PublishingError({
            code: "Invalid",
            message: "The profile handle, display name, or bio is invalid.",
          });
        }
        return yield* mutex
          .withPermit(repo.upsertProfile(handle, displayName, bio))
          .pipe(Effect.mapError(persistenceError));
      });

      const publish = Effect.fn("PublishingService.publish")(function* (boardId: BoardId) {
        const result = yield* mutex
          .withPermit(repo.publish(boardId, makePublicId()))
          .pipe(Effect.mapError(persistenceError));
        if (result === null) {
          return yield* new PublishingError({
            code: "NotFound",
            message: "Create the publisher profile and board before publishing.",
          });
        }
        return result;
      });

      const unpublish = Effect.fn("PublishingService.unpublish")(function* (boardId: BoardId) {
        return yield* mutex
          .withPermit(repo.unpublish(boardId))
          .pipe(Effect.mapError(persistenceError));
      });

      const getProfile = Effect.fn("PublishingService.getProfile")(function* (rawHandle: string) {
        const handle = normalizeProfileHandle(rawHandle);
        if (handle === null) return null;
        return yield* mutex
          .withPermit(repo.getProfile(handle))
          .pipe(Effect.mapError(persistenceError));
      });

      const getBoard = Effect.fn("PublishingService.getBoard")(function* (rawPublicId: string) {
        const publicId = Option.getOrNull(decodePublicId(rawPublicId));
        if (publicId === null) return null;
        return yield* mutex
          .withPermit(repo.getBoard(publicId))
          .pipe(Effect.mapError(persistenceError));
      });

      return PublishingService.of({
        configureProfile,
        publish,
        unpublish,
        getProfile,
        getBoard,
      });
    }),
  ).pipe(Layer.provide(PublishingRepo.layer));
}
