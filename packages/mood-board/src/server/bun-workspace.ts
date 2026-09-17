import { createHash } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { Layer } from "effect";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as RpcServer from "effect/unstable/rpc/RpcServer";

import type { AccountId } from "../lib/account";
import { BoardRpcs } from "../lib/board-rpc";
import type { MediaQuotaLimits } from "../lib/media";
import { BoardHandlers } from "./board-handlers";
import { BoardService } from "./board-service";
import { makeBunMediaObjectStore } from "./bun-media-object-store";
import { BunWebsitePreviewFetcher } from "./bun-website-preview-fetcher";
import { makeDatabaseLayer } from "./database";
import { MediaClientIdentity } from "./media-client-identity";
import { MediaHandlers } from "./media-handlers";
import { MediaMaintenanceScheduler } from "./media-maintenance";
import { MediaService } from "./media-service";
import { PublicHandlers } from "./public-handlers";
import { PublishingService } from "./publishing-service";
import { WebsitePreviewService } from "./website-preview-service";

export interface BunWorkspaceHandler {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly dispose: () => Promise<void>;
}

export interface BunWorkspaceConfig {
  readonly accountId: AccountId;
  readonly workspaceRoot: string;
  readonly mediaLimits: MediaQuotaLimits;
}

export interface BunLegacyWorkspaceConfig {
  readonly databasePath: string;
  readonly mediaPath: string;
  readonly mediaLimits: MediaQuotaLimits;
}

export const workspaceDirectoryName = (accountId: AccountId): string =>
  createHash("sha256").update(accountId).digest("hex");

export const makeBunWorkspaceHandler = (config: BunWorkspaceConfig): BunWorkspaceHandler => {
  const directory = join(config.workspaceRoot, workspaceDirectoryName(config.accountId));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);

  const database = makeDatabaseLayer(join(directory, "workspace.sqlite"));
  const websitePreviews = WebsitePreviewService.layer.pipe(Layer.provide(BunWebsitePreviewFetcher));
  const handlers = BoardHandlers.pipe(
    Layer.provide(BoardService.layer),
    Layer.provide(websitePreviews),
    Layer.provide(database),
  );
  const rpcServer = RpcServer.layerHttp({
    group: BoardRpcs,
    path: "/rpc",
    protocol: "http",
    disableFatalDefects: true,
  }).pipe(Layer.provide(handlers), Layer.provide(RpcSerialization.layerNdjson));
  const mediaService = MediaService.layerWith(config.mediaLimits).pipe(
    Layer.provide(makeBunMediaObjectStore(join(directory, "media"))),
    Layer.provide(database),
  );
  const mediaServer = MediaHandlers.pipe(
    Layer.provide(mediaService),
    Layer.provide(MediaClientIdentity.bun),
  );
  const publicServer = PublicHandlers.pipe(
    Layer.provide(PublishingService.layer),
    Layer.provide(database),
  );
  const maintenance = MediaMaintenanceScheduler.pipe(Layer.provide(mediaService));
  const web = HttpRouter.toWebHandler(
    Layer.mergeAll(rpcServer, publicServer, mediaServer, maintenance),
    { disableLogger: true },
  );
  return { fetch: web.handler, dispose: web.dispose };
};

export const makeBunLegacyWorkspaceHandler = (
  config: BunLegacyWorkspaceConfig,
): BunWorkspaceHandler => {
  const database = makeDatabaseLayer(config.databasePath);
  const websitePreviews = WebsitePreviewService.layer.pipe(Layer.provide(BunWebsitePreviewFetcher));
  const handlers = BoardHandlers.pipe(
    Layer.provide(BoardService.layer),
    Layer.provide(websitePreviews),
    Layer.provide(database),
  );
  const rpcServer = RpcServer.layerHttp({
    group: BoardRpcs,
    path: "/rpc",
    protocol: "http",
    disableFatalDefects: true,
  }).pipe(Layer.provide(handlers), Layer.provide(RpcSerialization.layerNdjson));
  const mediaService = MediaService.layerWith(config.mediaLimits).pipe(
    Layer.provide(makeBunMediaObjectStore(config.mediaPath)),
    Layer.provide(database),
  );
  const publicServer = PublicHandlers.pipe(
    Layer.provide(PublishingService.layer),
    Layer.provide(database),
  );
  const mediaServer = MediaHandlers.pipe(
    Layer.provide(mediaService),
    Layer.provide(MediaClientIdentity.bun),
  );
  const maintenance = MediaMaintenanceScheduler.pipe(Layer.provide(mediaService));
  const web = HttpRouter.toWebHandler(
    Layer.mergeAll(rpcServer, publicServer, mediaServer, maintenance),
    { disableLogger: true },
  );
  return { fetch: web.handler, dispose: web.dispose };
};

type CachedWorkspace = {
  readonly handler: Promise<BunWorkspaceHandler>;
  lastUsed: number;
};

export class BunWorkspaceRegistry {
  readonly #entries = new Map<string, CachedWorkspace>();
  readonly #sweepTimer: ReturnType<typeof setInterval>;

  constructor(
    readonly workspaceRoot: string,
    readonly mediaLimits: MediaQuotaLimits,
  ) {
    this.#sweepTimer = setInterval(() => void this.#evictIdle(), 60_000);
    this.#sweepTimer.unref();
  }

  async fetch(accountId: AccountId, request: Request): Promise<Response> {
    let entry = this.#entries.get(accountId);
    if (entry === undefined) {
      entry = {
        handler: Promise.resolve(
          makeBunWorkspaceHandler({
            accountId,
            workspaceRoot: this.workspaceRoot,
            mediaLimits: this.mediaLimits,
          }),
        ),
        lastUsed: Date.now(),
      };
      this.#entries.set(accountId, entry);
    } else {
      entry.lastUsed = Date.now();
    }
    return (await entry.handler).fetch(request);
  }

  async #evictIdle(now = Date.now()): Promise<void> {
    const maximumIdleMs = 30 * 60 * 1_000;
    const evictions: Promise<void>[] = [];
    for (const [accountId, entry] of this.#entries) {
      if (now - entry.lastUsed < maximumIdleMs) continue;
      this.#entries.delete(accountId);
      evictions.push(entry.handler.then((handler) => handler.dispose()));
    }
    await Promise.all(evictions);
  }

  async dispose(): Promise<void> {
    clearInterval(this.#sweepTimer);
    const entries = [...this.#entries.values()];
    this.#entries.clear();
    await Promise.all(entries.map(async (entry) => (await entry.handler).dispose()));
  }
}
