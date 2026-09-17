import type {
  D1Database,
  DurableObjectState,
  R2Bucket,
  RateLimit as CloudflareRateLimit,
  ScheduledController,
} from "@cloudflare/workers-types";
import { D1Client } from "@effect/sql-d1";
import { Layer, Option, Schema } from "effect";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as RpcServer from "effect/unstable/rpc/RpcServer";

import { AccountIdSchema, decodeAccountId, type AccountId } from "../lib/account";
import { BoardRpcs } from "../lib/board-rpc";
import { MediaIdSchema, MediaQuotaLimitsSchema } from "../lib/media";
import {
  ProfileHandleSchema,
  PublicIdSchema,
  type ProfileHandle,
  type PublicId,
} from "../lib/public-api";
import { PositiveIntegerSchema } from "../lib/schema";
import { AuthCleanupTimestampSchema } from "../server/auth";
import { BoardService } from "../server/board-service";
import { decodeCatalogRouteUserId } from "../server/catalog-route";
import { decodeMagicLinkEmail } from "../server/magic-link";
import {
  MEDIA_CLIENT_ID_HEADER,
  MediaClientIdentity,
  hashMediaClientAddressPromise,
} from "../server/media-client-identity";
import { MediaHandlers } from "../server/media-handlers";
import { DEFAULT_MEDIA_QUOTA_LIMITS, MediaService } from "../server/media-service";
import { publicBoardReferencesMedia } from "../server/public-media";
import { PublishingService } from "../server/publishing-service";
import {
  accountWorkspaceName,
  isSameOriginMutation,
  resolveAuthenticatedAccount,
} from "../server/request-auth";
import { withSecurityHeaders } from "../server/security-headers";
import { WebsitePreviewService } from "../server/website-preview-service";
import { cloudflareGoogleEnabled, makeCloudflareAuth, pruneExpiredCloudflareAuth } from "./auth";
import { CloudflareBoardHandlers } from "./board-handlers";
import { CatalogProjection, DEFAULT_WORKSPACE_ID } from "./catalog-projection";
import { makeDurableDatabaseLayer } from "./database";
import { CloudflarePublicHandlers } from "./public-handlers";
import { makeR2MediaObjectStore } from "./r2-media-object-store";
import { CloudflareWebsitePreviewFetcher } from "./website-preview-fetcher";

interface WorkspaceNamespace {
  readonly idFromName: (name: string) => unknown;
  readonly get: (id: unknown) => {
    readonly fetch: (request: Request) => Promise<Response>;
  };
}

export interface CloudflareEnv {
  readonly ASSETS: {
    readonly fetch: (request: Request) => Promise<Response>;
  };
  readonly CATALOG: D1Database;
  readonly MEDIA: R2Bucket;
  readonly WORKSPACES: WorkspaceNamespace;
  readonly AUTH_RATE_LIMIT: CloudflareRateLimit;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL?: string;
  readonly TRUSTED_ORIGINS?: string;
  readonly GOOGLE_CLIENT_ID?: string;
  readonly GOOGLE_CLIENT_SECRET?: string;
  readonly RESEND_API_KEY?: string;
  readonly EMAIL_SENDER?: string;
  readonly IS_LOCAL?: string;
  readonly LEGACY_WORKSPACE_OWNER_ID?: string;
  readonly MEDIA_UPLOADS_PER_HOUR?: string;
  readonly MEDIA_UPLOAD_BYTES_PER_DAY?: string;
  readonly MEDIA_STORAGE_BYTES?: string;
  readonly MEDIA_RESERVATION_TTL_MS?: string;
}

const decodePositiveInteger = Schema.decodeUnknownOption(PositiveIntegerSchema);

export class WorkspaceDurableObject {
  readonly #webHandler: (request: Request) => Promise<Response>;

  constructor(state: DurableObjectState, env: CloudflareEnv) {
    const workspaceId = state.id.toString();
    const legacyWorkspace = workspaceId === String(env.WORKSPACES.idFromName(DEFAULT_WORKSPACE_ID));
    const database = makeDurableDatabaseLayer(state.storage);
    const projection = CatalogProjection.layerFor(workspaceId).pipe(
      Layer.provide(D1Client.layer({ db: env.CATALOG })),
    );
    const websitePreviews = WebsitePreviewService.layer.pipe(
      Layer.provide(CloudflareWebsitePreviewFetcher),
    );
    const handlers = CloudflareBoardHandlers.pipe(
      Layer.provide(BoardService.layer),
      Layer.provide(websitePreviews),
      Layer.provide(database),
      Layer.provide(projection),
    );
    const rpcServer = RpcServer.layerHttp({
      group: BoardRpcs,
      path: "/rpc",
      protocol: "http",
    }).pipe(Layer.provide(handlers), Layer.provide(RpcSerialization.layerNdjson));
    const publicServer = CloudflarePublicHandlers.pipe(
      Layer.provide(PublishingService.layer),
      Layer.provide(database),
    );
    const positiveInteger = (value: string | undefined, fallback: number): number =>
      Option.getOrNull(decodePositiveInteger(Number(value))) ?? fallback;
    const mediaServer = MediaHandlers.pipe(
      Layer.provide(
        MediaService.layerWith(
          Schema.decodeUnknownSync(MediaQuotaLimitsSchema)({
            requestsPerHour: positiveInteger(
              env.MEDIA_UPLOADS_PER_HOUR,
              DEFAULT_MEDIA_QUOTA_LIMITS.requestsPerHour,
            ),
            bytesPerDay: positiveInteger(
              env.MEDIA_UPLOAD_BYTES_PER_DAY,
              DEFAULT_MEDIA_QUOTA_LIMITS.bytesPerDay,
            ),
            managedBytes: positiveInteger(
              env.MEDIA_STORAGE_BYTES,
              DEFAULT_MEDIA_QUOTA_LIMITS.managedBytes,
            ),
            reservationTtlMs: positiveInteger(
              env.MEDIA_RESERVATION_TTL_MS,
              DEFAULT_MEDIA_QUOTA_LIMITS.reservationTtlMs,
            ),
          }),
        ),
      ),
      Layer.provide(MediaClientIdentity.cloudflareForwarded),
      Layer.provide(makeR2MediaObjectStore(env.MEDIA, workspaceId, legacyWorkspace)),
      Layer.provide(database),
    );
    const server = Layer.mergeAll(rpcServer, publicServer, mediaServer);
    const web = HttpRouter.toWebHandler(server, { disableLogger: true });
    this.#webHandler = web.handler;
  }

  fetch(request: Request): Promise<Response> {
    return this.#webHandler(request);
  }
}

const jsonError = (status: number, error: string) =>
  withSecurityHeaders(
    Response.json(
      { error },
      {
        status,
        headers: { "cache-control": "no-store" },
      },
    ),
  );

const authRateLimitResponse = () =>
  withSecurityHeaders(
    Response.json(
      { error: "Too many sign-in links requested. Try again in a minute." },
      {
        status: 429,
        headers: { "cache-control": "no-store", "retry-after": "60" },
      },
    ),
  );

const allowMagicLinkRequest = async (
  request: Request,
  limiter: CloudflareRateLimit,
): Promise<boolean> => {
  const address = request.headers.get("CF-Connecting-IP") ?? "local";
  const ipLimit = await limiter.limit({ key: `ip:${address}` });
  if (!ipLimit.success) return false;

  try {
    const value: unknown = await request.clone().json();
    const email = decodeMagicLinkEmail(value);
    if (email === null) return true;
    if (!email) return true;
    return (await limiter.limit({ key: `email:${email}` })).success;
  } catch {
    return true;
  }
};

const workspaceStub = (env: Pick<CloudflareEnv, "WORKSPACES">, workspaceName: string) => {
  const id = env.WORKSPACES.idFromName(workspaceName);
  return env.WORKSPACES.get(id);
};

const workspaceRequest = (
  request: Request,
  pathname: string,
  headers = new Headers(request.headers),
): Request => {
  const url = new URL(request.url);
  url.pathname = pathname;
  headers.delete("x-mood-board-workspace");
  return new Request(new Request(url.toString(), request), { headers });
};

const privateResponse = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store");
  headers.set("cross-origin-resource-policy", "same-origin");
  return withSecurityHeaders(
    new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  );
};

const workspaceNameForAccount = (
  env: Pick<CloudflareEnv, "LEGACY_WORKSPACE_OWNER_ID">,
  accountId: AccountId,
): string => {
  const legacyWorkspaceOwnerId = decodeAccountId(env.LEGACY_WORKSPACE_OWNER_ID?.trim());
  return legacyWorkspaceOwnerId === accountId
    ? DEFAULT_WORKSPACE_ID
    : accountWorkspaceName(accountId);
};

const forwardPrivateRequest = async (
  request: Request,
  env: CloudflareEnv,
  accountId: AccountId,
  pathname: string,
): Promise<Response> => {
  const headers = new Headers(request.headers);
  headers.delete(MEDIA_CLIENT_ID_HEADER);
  if (pathname === "/api/owner/media" && request.method === "POST") {
    headers.set(
      MEDIA_CLIENT_ID_HEADER,
      await hashMediaClientAddressPromise(
        request.headers.get("CF-Connecting-IP") ?? "unknown-cloudflare",
      ),
    );
  }
  const response = await workspaceStub(env, workspaceNameForAccount(env, accountId)).fetch(
    workspaceRequest(request, pathname, headers),
  );
  return privateResponse(response);
};

const CatalogUserRowSchema = Schema.Struct({ id: AccountIdSchema });
const decodeCatalogUserRow = Schema.decodeUnknownOption(CatalogUserRowSchema);
const decodeProfileHandle = Schema.decodeUnknownOption(ProfileHandleSchema);
const decodePublicId = Schema.decodeUnknownOption(PublicIdSchema);
const decodeMediaId = Schema.decodeUnknownOption(MediaIdSchema);

type PublicCatalogRoute =
  | { readonly kind: "profile"; readonly identifier: ProfileHandle }
  | { readonly kind: "board"; readonly identifier: PublicId };

const publicWorkspaceName = async (
  env: CloudflareEnv,
  route: PublicCatalogRoute,
): Promise<string> => {
  const rawRow =
    route.kind === "profile"
      ? await env.CATALOG.prepare(
          'SELECT "userId" FROM "public_profile_route" WHERE "handle" = ? COLLATE NOCASE',
        )
          .bind(route.identifier)
          .first<{ readonly userId: unknown }>()
      : await env.CATALOG.prepare('SELECT "userId" FROM "public_board_route" WHERE "publicId" = ?')
          .bind(route.identifier)
          .first<{ readonly userId: unknown }>();
  const userId = decodeCatalogRouteUserId(rawRow);
  return userId === null ? DEFAULT_WORKSPACE_ID : workspaceNameForAccount(env, userId);
};

const servePublicMedia = async (
  request: Request,
  env: CloudflareEnv,
  publicId: string,
  mediaId: string,
): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") return jsonError(404, "Not found");

  const decodedPublicId = Option.getOrNull(decodePublicId(publicId));
  const decodedMediaId = Option.getOrNull(decodeMediaId(mediaId));
  if (decodedPublicId === null || decodedMediaId === null) return jsonError(404, "Not found");

  const workspace = workspaceStub(
    env,
    await publicWorkspaceName(env, { kind: "board", identifier: decodedPublicId }),
  );
  const boardResponse = await workspace.fetch(
    workspaceRequest(
      new Request(request.url, { headers: request.headers }),
      `/api/public/boards/${decodedPublicId}`,
    ),
  );
  if (!boardResponse.ok || !publicBoardReferencesMedia(await boardResponse.json(), decodedMediaId))
    return jsonError(404, "Not found");

  const response = await workspace.fetch(workspaceRequest(request, `/media/${decodedMediaId}`));
  const headers = new Headers(response.headers);
  headers.set("cache-control", "public, max-age=60, must-revalidate");
  return withSecurityHeaders(
    new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  );
};

export const runScheduledMediaMaintenance = async (
  env: Pick<CloudflareEnv, "WORKSPACES">,
  workspaceNames: ReadonlyArray<string> = [DEFAULT_WORKSPACE_ID],
): Promise<void> => {
  for (const workspaceName of workspaceNames) {
    const response = await workspaceStub(env, workspaceName).fetch(
      new Request("https://mood-board.internal/_internal/media/maintenance", {
        method: "POST",
        headers: { "x-mood-board-maintenance": "scheduled" },
      }),
    );
    if (!response.ok) {
      throw new Error(
        `Media maintenance failed for ${workspaceName} with status ${response.status}`,
      );
    }
  }
};

const listWorkspaceNames = async (
  env: Pick<CloudflareEnv, "CATALOG" | "LEGACY_WORKSPACE_OWNER_ID">,
): Promise<string[]> => {
  const users = await env.CATALOG.prepare('SELECT id FROM "user" ORDER BY id').all<{
    readonly id: unknown;
  }>();
  const workspaceNames = (users.results ?? []).flatMap((user) => {
    const decoded = decodeCatalogUserRow(user);
    return Option.isSome(decoded) ? [workspaceNameForAccount(env, decoded.value.id)] : [];
  });
  return [...new Set([DEFAULT_WORKSPACE_ID, ...workspaceNames])];
};

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return withSecurityHeaders(
        Response.json({
          status: "ok",
          runtime: "cloudflare",
          storage: "account-durable-object-sqlite",
        }),
      );
    }

    if (
      url.pathname === "/api/auth/sign-in/magic-link" &&
      request.method === "POST" &&
      !(await allowMagicLinkRequest(request, env.AUTH_RATE_LIMIT))
    )
      return authRateLimitResponse();

    if (url.pathname === "/api/auth/providers" && request.method === "GET") {
      return withSecurityHeaders(
        Response.json(
          { google: cloudflareGoogleEnabled(env) },
          { headers: { "cache-control": "no-store" } },
        ),
      );
    }

    if (url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/")) {
      try {
        return withSecurityHeaders(await makeCloudflareAuth(env, url.origin).handler(request));
      } catch (cause) {
        console.error("[auth] request failed", cause);
        return jsonError(500, "Authentication is temporarily unavailable");
      }
    }

    const privateMedia = /^\/api\/owner\/media\/([0-9a-f]{32})$/.exec(url.pathname);
    const privateApi =
      /^\/rpc\/?$/.test(url.pathname) ||
      url.pathname === "/api/owner" ||
      url.pathname.startsWith("/api/owner/");
    if (privateApi) {
      if (/^\/rpc\/?$/.test(url.pathname) && request.method !== "POST") {
        return jsonError(404, "Not found");
      }
      if (!isSameOriginMutation(request)) {
        return jsonError(403, "Cross-origin request rejected");
      }
      const account = await resolveAuthenticatedAccount(
        makeCloudflareAuth(env, url.origin),
        request,
      );
      if (account === null) return jsonError(401, "Authentication required");
      return forwardPrivateRequest(
        request,
        env,
        account.id,
        privateMedia === null
          ? /^\/rpc\/?$/.test(url.pathname)
            ? "/rpc"
            : url.pathname
          : `/media/${privateMedia[1]}`,
      );
    }

    const publicMedia = /^\/api\/public\/boards\/([^/]+)\/media\/([^/]+)$/.exec(url.pathname);
    if (publicMedia !== null) {
      return servePublicMedia(request, env, publicMedia[1], publicMedia[2]);
    }

    const publicProfile = /^\/api\/public\/profiles\/([^/]+)\/?$/.exec(url.pathname);
    const publicBoard = /^\/api\/public\/boards\/([^/]+)\/?$/.exec(url.pathname);
    if (request.method === "GET" && (publicProfile !== null || publicBoard !== null)) {
      let route: PublicCatalogRoute | null = null;
      if (publicProfile !== null) {
        const handle = Option.getOrNull(decodeProfileHandle(publicProfile[1]));
        if (handle !== null) route = { kind: "profile", identifier: handle };
      } else if (publicBoard !== null) {
        const publicId = Option.getOrNull(decodePublicId(publicBoard[1]));
        if (publicId !== null) route = { kind: "board", identifier: publicId };
      }
      if (route === null) return jsonError(404, "Not found");
      const response = await workspaceStub(env, await publicWorkspaceName(env, route)).fetch(
        workspaceRequest(request, url.pathname),
      );
      return withSecurityHeaders(response);
    }

    if (
      url.pathname === "/_internal" ||
      url.pathname.startsWith("/_internal/") ||
      url.pathname === "/media" ||
      url.pathname.startsWith("/media/") ||
      url.pathname === "/api/catalog" ||
      url.pathname === "/api/public" ||
      url.pathname.startsWith("/api/public/")
    )
      return jsonError(404, "Not found");

    if (
      request.method === "GET" &&
      (/^\/boards(?:\/|$)/.test(url.pathname) || /^\/profile\/?$/.test(url.pathname))
    ) {
      const account = await resolveAuthenticatedAccount(
        makeCloudflareAuth(env, url.origin),
        request,
      );
      if (account === null) {
        const returnTo = `${url.pathname}${url.search}`;
        return withSecurityHeaders(
          new Response(null, {
            status: 302,
            headers: {
              location: `/login?returnTo=${encodeURIComponent(returnTo)}`,
              "cache-control": "no-store",
            },
          }),
        );
      }
    }

    return withSecurityHeaders(await env.ASSETS.fetch(request), {
      allowViteDevelopmentScripts: env.IS_LOCAL === "true",
    });
  },

  async scheduled(_controller: ScheduledController, env: CloudflareEnv): Promise<void> {
    const cleanupTime = AuthCleanupTimestampSchema.make(Date.now());
    await Promise.all([
      listWorkspaceNames(env).then((names) => runScheduledMediaMaintenance(env, names)),
      pruneExpiredCloudflareAuth(env.CATALOG, cleanupTime),
    ]);
  },
};
