import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Clock, Effect, Layer, Option, Schema } from "effect";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
  HttpStaticServer,
} from "effect/unstable/http";

import { decodeAccountId, type AccountId } from "../lib/account";
import { MediaIdSchema, MediaQuotaLimitsSchema } from "../lib/media";
import { ProfileHandleSchema, PublicIdSchema } from "../lib/public-api";
import { PositiveIntegerSchema } from "../lib/schema";
import { makeBunAuth } from "./bun-auth";
import { BunMagicLinkRateLimiter, MagicLinkRateLimitTimestampSchema } from "./bun-auth-rate-limit";
import { openBunPublicDirectory } from "./bun-public-directory";
import { BunWorkspaceRegistry, makeBunLegacyWorkspaceHandler } from "./bun-workspace";
import { MISSING_MAGIC_LINK_EMAIL, decodeMagicLinkEmail } from "./magic-link";
import { DEFAULT_MEDIA_QUOTA_LIMITS } from "./media-service";
import { publicBoardReferencesMedia } from "./public-media";
import {
  type AuthResolutionError,
  isSameOriginMutation,
  resolveAuthenticatedAccountEffect,
} from "./request-auth";
import { SECURITY_HEADERS } from "./security-headers";

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "127.0.0.1";
const databasePath = process.env.DB_PATH ?? "data/mood-board.sqlite";
const authDatabasePath = process.env.AUTH_DB_PATH ?? "data/mood-board-auth.sqlite";
const mediaPath = process.env.MEDIA_PATH ?? "data/media";
const workspaceRoot = process.env.WORKSPACE_PATH ?? `${databasePath}.workspaces`;
const legacyWorkspaceOwnerId = decodeAccountId(process.env.LEGACY_WORKSPACE_OWNER_ID?.trim());
const {
  auth,
  googleEnabled,
  close: closeAuth,
} = makeBunAuth({
  databasePath: authDatabasePath,
  baseURL:
    process.env.NODE_ENV === "production" ? `http://localhost:${port}` : "http://localhost:5173",
});

const decodePositiveInteger = Schema.decodeUnknownOption(PositiveIntegerSchema);
const decodeProfileHandle = Schema.decodeUnknownOption(ProfileHandleSchema);
const decodePublicId = Schema.decodeUnknownOption(PublicIdSchema);
const decodeMediaId = Schema.decodeUnknownOption(MediaIdSchema);
const positiveInteger = (name: string, fallback: number): number =>
  Option.getOrNull(decodePositiveInteger(Number(process.env[name]))) ?? fallback;

const magicLinkRateLimiter = new BunMagicLinkRateLimiter();

const mediaLimits = Schema.decodeUnknownSync(MediaQuotaLimitsSchema)({
  requestsPerHour: positiveInteger(
    "MEDIA_UPLOADS_PER_HOUR",
    DEFAULT_MEDIA_QUOTA_LIMITS.requestsPerHour,
  ),
  bytesPerDay: positiveInteger(
    "MEDIA_UPLOAD_BYTES_PER_DAY",
    DEFAULT_MEDIA_QUOTA_LIMITS.bytesPerDay,
  ),
  managedBytes: positiveInteger("MEDIA_STORAGE_BYTES", DEFAULT_MEDIA_QUOTA_LIMITS.managedBytes),
  reservationTtlMs: positiveInteger(
    "MEDIA_RESERVATION_TTL_MS",
    DEFAULT_MEDIA_QUOTA_LIMITS.reservationTtlMs,
  ),
});

const workspaces = new BunWorkspaceRegistry(workspaceRoot, mediaLimits);
const publicDirectory = openBunPublicDirectory(authDatabasePath);
const legacyPublicWorkspace = makeBunLegacyWorkspaceHandler({
  databasePath,
  mediaPath,
  mediaLimits,
});
const fetchAccountWorkspace = (accountId: AccountId, request: Request): Promise<Response> =>
  accountId === legacyWorkspaceOwnerId
    ? legacyPublicWorkspace.fetch(request)
    : workspaces.fetch(accountId, request);

const noStoreJson = (status: number, error: string) =>
  HttpServerResponse.jsonUnsafe({ error }, { status, headers: { "cache-control": "no-store" } });

const ServerBoundaryOperation = Schema.Literals([
  "PrivateWorkspace",
  "PublicWorkspace",
  "PublicBoardJson",
  "AuthRequestJson",
  "AuthHandler",
  "Shutdown",
]);
type ServerBoundaryOperation = typeof ServerBoundaryOperation.Type;

class ServerBoundaryError extends Schema.Error<ServerBoundaryError>("ServerBoundaryError")({
  _tag: Schema.tag("ServerBoundaryError"),
  operation: ServerBoundaryOperation,
  cause: Schema.Defect(),
}) {}

const tryServerBoundary = Effect.fn("ServerBoundary.tryPromise")(
  <A>(operation: ServerBoundaryOperation, evaluate: () => PromiseLike<A>) =>
    Effect.tryPromise({
      try: evaluate,
      catch: (cause) => new ServerBoundaryError({ operation, cause }),
    }),
);

const unauthorized = () => noStoreJson(401, "Authentication required");
const forbidden = () => noStoreJson(403, "Cross-origin request rejected");
const notFound = () => noStoreJson(404, "Not found");
const fromWebResponse = (response: Response) => HttpServerResponse.fromWeb(response);

const toPrivateWorkspaceRequest = (source: Request): Request => {
  const url = new URL(source.url);
  const match = /^\/api\/owner\/media\/([0-9a-f]{32})$/.exec(url.pathname);
  if (match !== null) url.pathname = `/media/${match[1]}`;
  const headers = new Headers(source.headers);
  headers.delete("x-mood-board-media-client");
  return new Request(url.toString(), {
    method: source.method,
    headers,
    body: source.body,
  });
};

const privateResponse = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store");
  headers.set("cross-origin-resource-policy", "same-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const recoverAuthResolution = (error: AuthResolutionError) =>
  Effect.logError(error).pipe(
    Effect.as(noStoreJson(500, "Authentication is temporarily unavailable")),
  );

const recoverServerBoundary = (error: ServerBoundaryError) =>
  Effect.logError(error).pipe(Effect.as(noStoreJson(500, "The server is temporarily unavailable")));

const recoverAuthBoundary = (error: ServerBoundaryError) =>
  Effect.logError(error).pipe(
    Effect.as(noStoreJson(500, "Authentication is temporarily unavailable")),
  );

const forwardPrivate = Effect.fn("Server.ForwardPrivate")(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const source = yield* HttpServerRequest.toWeb(request);
  if (!isSameOriginMutation(source)) return forbidden();
  const account = yield* resolveAuthenticatedAccountEffect(auth, source);
  if (account === null) return unauthorized();
  const response = yield* tryServerBoundary("PrivateWorkspace", () =>
    fetchAccountWorkspace(account.id, toPrivateWorkspaceRequest(source)),
  );
  return fromWebResponse(privateResponse(response));
});
const forwardPrivateRequest = () =>
  forwardPrivate().pipe(
    Effect.catchTag("AuthResolutionError", recoverAuthResolution),
    Effect.catchTag("ServerBoundaryError", recoverServerBoundary),
  );

const fetchPublicWorkspace = (accountId: AccountId | null, request: Request): Promise<Response> =>
  accountId === null
    ? legacyPublicWorkspace.fetch(request)
    : fetchAccountWorkspace(accountId, request);

const forwardPublicProfile = Effect.fn("Server.ForwardPublicProfile")(function* () {
  const params = yield* HttpRouter.params;
  const handle = Option.getOrNull(decodeProfileHandle(params.handle));
  if (handle === null) return notFound();
  const request = yield* HttpServerRequest.HttpServerRequest;
  const source = yield* HttpServerRequest.toWeb(request);
  const response = yield* tryServerBoundary("PublicWorkspace", () =>
    fetchPublicWorkspace(publicDirectory.profileAccount(handle), source),
  );
  return fromWebResponse(response);
});
const forwardPublicProfileRequest = () =>
  forwardPublicProfile().pipe(Effect.catchTag("ServerBoundaryError", recoverServerBoundary));

const forwardPublicBoard = Effect.fn("Server.ForwardPublicBoard")(function* () {
  const params = yield* HttpRouter.params;
  const publicId = Option.getOrNull(decodePublicId(params.publicId));
  if (publicId === null) return notFound();
  const request = yield* HttpServerRequest.HttpServerRequest;
  const source = yield* HttpServerRequest.toWeb(request);
  const response = yield* tryServerBoundary("PublicWorkspace", () =>
    fetchPublicWorkspace(publicDirectory.boardAccount(publicId), source),
  );
  return fromWebResponse(response);
});
const forwardPublicBoardRequest = () =>
  forwardPublicBoard().pipe(Effect.catchTag("ServerBoundaryError", recoverServerBoundary));

const servePublicMedia = Effect.fn("Server.ServePublicMedia")(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  if (request.method !== "GET" && request.method !== "HEAD") return notFound();
  const params = yield* HttpRouter.params;
  const publicId = Option.getOrNull(decodePublicId(params.publicId));
  const mediaId = Option.getOrNull(decodeMediaId(params.mediaId));
  if (publicId === null || mediaId === null) return notFound();
  const accountId = publicDirectory.boardAccount(publicId);
  const boardRequest = new Request(
    `http://mood-board.internal/api/public/boards/${encodeURIComponent(publicId)}`,
  );
  const boardResponse = yield* tryServerBoundary("PublicWorkspace", () =>
    fetchPublicWorkspace(accountId, boardRequest),
  );
  const publicBoard = yield* tryServerBoundary("PublicBoardJson", () => boardResponse.json());
  if (!boardResponse.ok || !publicBoardReferencesMedia(publicBoard, mediaId)) return notFound();

  const source = yield* HttpServerRequest.toWeb(request);
  const headers = new Headers(source.headers);
  const mediaResponse = yield* tryServerBoundary("PublicWorkspace", () =>
    fetchPublicWorkspace(
      accountId,
      new Request(`http://mood-board.internal/media/${mediaId}`, {
        method: source.method,
        headers,
      }),
    ),
  );
  const responseHeaders = new Headers(mediaResponse.headers);
  responseHeaders.set("cache-control", "public, max-age=60, must-revalidate");
  return fromWebResponse(
    new Response(mediaResponse.body, {
      status: mediaResponse.status,
      statusText: mediaResponse.statusText,
      headers: responseHeaders,
    }),
  );
});
const servePublicMediaRequest = () =>
  servePublicMedia().pipe(Effect.catchTag("ServerBoundaryError", recoverServerBoundary));

const HealthRoute = HttpRouter.use((router) =>
  router.add("GET", "/health", HttpServerResponse.jsonUnsafe({ status: "ok" })),
);

const requestMagicLink = Effect.fn("Server.RequestMagicLink")(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const source = yield* HttpServerRequest.toWeb(request);
  const body = yield* tryServerBoundary("AuthRequestJson", () => source.clone().json()).pipe(
    Effect.map((value) => decodeMagicLinkEmail(value) ?? MISSING_MAGIC_LINK_EMAIL),
    Effect.catch(() => Effect.succeed(MISSING_MAGIC_LINK_EMAIL)),
  );
  const address = request.remoteAddress.pipe((option) =>
    option._tag === "Some" ? option.value : "unknown-socket",
  );
  const rateLimitTime = MagicLinkRateLimitTimestampSchema.make(yield* Clock.currentTimeMillis);
  if (!magicLinkRateLimiter.allow(address, body, rateLimitTime)) {
    return HttpServerResponse.jsonUnsafe(
      { error: "Too many sign-in links requested. Try again in a minute." },
      {
        status: 429,
        headers: { "cache-control": "no-store", "retry-after": "60" },
      },
    );
  }
  return fromWebResponse(yield* tryServerBoundary("AuthHandler", () => auth.handler(source)));
});

const forwardAuth = Effect.fn("Server.ForwardAuth")(function* (
  request: HttpServerRequest.HttpServerRequest,
) {
  const source = yield* HttpServerRequest.toWeb(request);
  return fromWebResponse(yield* tryServerBoundary("AuthHandler", () => auth.handler(source)));
});

const AuthRoute = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add(
      "GET",
      "/api/auth/providers",
      HttpServerResponse.jsonUnsafe(
        { google: googleEnabled },
        { headers: { "cache-control": "no-store" } },
      ),
    );
    yield* router.add(
      "POST",
      "/api/auth/sign-in/magic-link",
      requestMagicLink().pipe(Effect.catchTag("ServerBoundaryError", recoverAuthBoundary)),
    );
    yield* router.add("*", "/api/auth/*", (request) =>
      forwardAuth(request).pipe(Effect.catchTag("ServerBoundaryError", recoverAuthBoundary)),
    );
  }),
);

const PrivateRoutes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add("POST", "/rpc", forwardPrivateRequest());
    yield* router.add("*", "/api/owner/*", forwardPrivateRequest());
  }),
);

const servePrivatePage = Effect.fn("Server.ServePrivatePage")(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const source = yield* HttpServerRequest.toWeb(request);
  const account = yield* resolveAuthenticatedAccountEffect(auth, source);
  if (account === null) {
    const url = new URL(source.url);
    const returnTo = `${url.pathname}${url.search}`;
    return HttpServerResponse.empty({
      status: 302,
      headers: {
        location: `/login?returnTo=${encodeURIComponent(returnTo)}`,
        "cache-control": "no-store",
      },
    });
  }
  return HttpServerResponse.raw(Bun.file("dist/index.html"), {
    contentType: "text/html; charset=utf-8",
    headers: { "cache-control": "no-store" },
  });
});
const servePrivatePageRequest = () =>
  servePrivatePage().pipe(Effect.catchTag("AuthResolutionError", recoverAuthResolution));

const PrivatePageRoutes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add("GET", "/boards/:boardId", servePrivatePageRequest());
    yield* router.add("GET", "/profile", servePrivatePageRequest());
  }),
);

const GuestDemoRoute = HttpRouter.add(
  "GET",
  "/demo",
  HttpServerResponse.raw(Bun.file("dist/index.html"), {
    contentType: "text/html; charset=utf-8",
    headers: { "cache-control": "public, max-age=0, must-revalidate" },
  }),
);

const PublicRoutes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add(
      "GET",
      "/api/public/boards/:publicId/media/:mediaId",
      servePublicMediaRequest(),
    );
    yield* router.add("GET", "/api/public/profiles/:handle", forwardPublicProfileRequest());
    yield* router.add("GET", "/api/public/boards/:publicId", forwardPublicBoardRequest());
    yield* router.add("*", "/api/public/*", notFound());
    yield* router.add("*", "/media/*", notFound());
    yield* router.add("*", "/_internal/*", notFound());
  }),
);

const StaticRoute = HttpStaticServer.layer({
  root: "dist",
  spa: true,
  cacheControl: "public, max-age=0, must-revalidate",
});

const SecurityHeaders = HttpRouter.middleware(
  (response) =>
    Effect.map(response, (value) => HttpServerResponse.setHeaders(value, SECURITY_HEADERS)),
  { global: true },
);

const ResourceLifecycle = Layer.effectDiscard(
  Effect.acquireRelease(Effect.void, () =>
    tryServerBoundary("Shutdown", async () => {
      await Promise.all([workspaces.dispose(), legacyPublicWorkspace.dispose()]);
      publicDirectory.close();
      closeAuth();
    }).pipe(Effect.orDie),
  ),
);

const Routes = Layer.mergeAll(
  HealthRoute,
  AuthRoute,
  PrivateRoutes,
  PrivatePageRoutes,
  GuestDemoRoute,
  PublicRoutes,
  StaticRoute,
  SecurityHeaders,
  ResourceLifecycle,
);

const ServerLive = HttpRouter.serve(Routes).pipe(
  Layer.provide(BunHttpServer.layer({ hostname, port })),
);

BunRuntime.runMain(Layer.launch(ServerLive));
