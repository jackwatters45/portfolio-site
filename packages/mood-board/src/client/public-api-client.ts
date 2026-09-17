import { Effect, Schema } from "effect";

import {
  PublicBoardSchema,
  PublicProfileSchema,
  type ProfileHandle,
  type PublicBoard,
  type PublicId,
  type PublicProfile,
} from "../lib/public-api";
import { HttpStatusCodeSchema, type HttpStatusCode } from "../lib/schema";
import { RemoteClientErrorFields, RemoteClientFailureReasonSchema } from "./remote-client-error";

export class PublicApiError extends Schema.Error<PublicApiError>("PublicApiError")({
  _tag: Schema.tag("PublicApiError"),
  reason: RemoteClientFailureReasonSchema,
  ...RemoteClientErrorFields,
}) {}

const publicApiError = (
  reason: PublicApiError["reason"],
  status: HttpStatusCode | null,
  cause?: unknown,
) =>
  new PublicApiError({
    reason,
    status,
    message:
      status === 404
        ? "This public page is not available."
        : reason === "InvalidPayload"
          ? "The public board response was invalid."
          : "Public boards could not be loaded.",
    ...(cause === undefined ? {} : { cause }),
  });

const readJson = Effect.fn("PublicApiClient.readJson")(function* (response: Response) {
  const status = HttpStatusCodeSchema.make(response.status);
  if (!response.ok) return yield* publicApiError("Http", status);
  return yield* Effect.tryPromise({
    try: () => response.json(),
    catch: (cause) => publicApiError("InvalidPayload", status, cause),
  });
});

const requestJson = Effect.fn("PublicApiClient.requestJson")(function* (path: string) {
  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(path, {
        credentials: "omit",
        cache: "no-store",
      }),
    catch: (cause) => publicApiError("Transport", null, cause),
  });
  return yield* readJson(response);
});

const loadPublicProfileEffect = Effect.fn("PublicApiClient.loadPublicProfile")(function* (
  handle: ProfileHandle,
) {
  const value = yield* requestJson(`/api/public/profiles/${encodeURIComponent(handle)}`);
  return yield* Schema.decodeUnknownEffect(PublicProfileSchema)(value).pipe(
    Effect.mapError((cause) => publicApiError("InvalidPayload", null, cause)),
  );
});

const loadPublicBoardEffect = Effect.fn("PublicApiClient.loadPublicBoard")(function* (
  publicId: PublicId,
) {
  const value = yield* requestJson(`/api/public/boards/${encodeURIComponent(publicId)}`);
  return yield* Schema.decodeUnknownEffect(PublicBoardSchema)(value).pipe(
    Effect.mapError((cause) => publicApiError("InvalidPayload", null, cause)),
  );
});

export const loadPublicProfile = (handle: ProfileHandle): Promise<PublicProfile> =>
  Effect.runPromise(loadPublicProfileEffect(handle));

export const loadPublicBoard = (publicId: PublicId): Promise<PublicBoard> =>
  Effect.runPromise(loadPublicBoardEffect(publicId));
