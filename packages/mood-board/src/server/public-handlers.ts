import { Effect } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

import { PublishingService, type PublishingError } from "./publishing-service";

const responseOptions = {
  headers: {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  },
} as const;

const notFound = () =>
  HttpServerResponse.jsonUnsafe({ error: "Not found" }, { ...responseOptions, status: 404 });

const unavailable = () =>
  HttpServerResponse.jsonUnsafe(
    { error: "Public boards are temporarily unavailable" },
    { ...responseOptions, status: 503 },
  );

const recoverPublishing = (error: PublishingError) =>
  Effect.logError(error).pipe(Effect.as(unavailable()));

export const PublicHandlers = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const publishing = yield* PublishingService;

    const getProfile = Effect.fn("PublicHandlers.GetProfile")(function* () {
      const params = yield* HttpRouter.params;
      const profile = yield* publishing.getProfile(params.handle ?? "");
      return profile === null
        ? notFound()
        : HttpServerResponse.jsonUnsafe(profile, responseOptions);
    });

    const getBoard = Effect.fn("PublicHandlers.GetBoard")(function* () {
      const params = yield* HttpRouter.params;
      const board = yield* publishing.getBoard(params.publicId ?? "");
      return board === null ? notFound() : HttpServerResponse.jsonUnsafe(board, responseOptions);
    });

    yield* router.add(
      "GET",
      "/api/public/profiles/:handle",
      getProfile().pipe(Effect.catch(recoverPublishing)),
    );

    yield* router.add(
      "GET",
      "/api/public/boards/:publicId",
      getBoard().pipe(Effect.catch(recoverPublishing)),
    );

    yield* router.add("*", "/api/public/*", notFound());
  }),
);
