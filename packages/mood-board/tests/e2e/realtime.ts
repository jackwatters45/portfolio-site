import { strict as assert } from "node:assert";
import { mkdtemp, readdir, rmdir, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BrowserHttpClient } from "@effect/platform-browser";
import { Context, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError";
import type * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";

import {
  BoardIdSchema,
  BoardRpcs,
  ClientIdSchema,
  DEFAULT_BOARD_ID,
  ItemIdSchema,
  MutationIdSchema,
  type BoardEvent,
} from "../../src/lib/board-rpc";
import { MediaIdSchema } from "../../src/lib/media";
import { isRecord } from "../../src/lib/type-guards";
import {
  WebsiteDescriptionSchema,
  WebsiteImageUrlSchema,
  WebsiteSiteLabelSchema,
  WebsiteTitleSchema,
  WebsiteUrlSchema,
} from "../../src/lib/website-preview";
import { createBunTestSession } from "./auth-session";

class TestClient extends Context.Service<
  TestClient,
  RpcClient.RpcClient<RpcGroup.Rpcs<typeof BoardRpcs>, RpcClientError>
>()("mood-board/TestClient") {}

const privateFetch = (cookie: string, path: string, init: RequestInit = {}) =>
  fetch(`${origin}${path}`, {
    ...init,
    headers: {
      ...Object.fromEntries(new Headers(init.headers).entries()),
      cookie,
      origin,
    },
  });

const port = 32_000 + Math.floor(Math.random() * 1_000);
const dataDirectory = await mkdtemp(join(tmpdir(), "mood-board-realtime-"));
const origin = `http://127.0.0.1:${port}`;
const workspaceRoot = join(dataDirectory, "workspaces");
const authDatabasePath = join(dataDirectory, "auth.sqlite");
const legacyDatabasePath = join(dataDirectory, "legacy.sqlite");
const legacyMediaPath = join(dataDirectory, "legacy-media");

const makeRuntime = (cookie: string) =>
  ManagedRuntime.make(
    Layer.effect(TestClient, RpcClient.make(BoardRpcs)).pipe(
      Layer.provide(RpcClient.layerProtocolHttp({ url: `${origin}/rpc` })),
      Layer.provide(
        BrowserHttpClient.layerFetch.pipe(
          Layer.provideMerge(
            Layer.succeed(BrowserHttpClient.Fetch, ((input, init) =>
              fetch(input, {
                ...init,
                headers: {
                  ...Object.fromEntries(new Headers(init?.headers).entries()),
                  cookie,
                  origin,
                },
              })) as typeof globalThis.fetch),
          ),
        ),
      ),
      Layer.provide(RpcSerialization.layerNdjson),
    ),
  );

const startServer = async () => {
  const server = Bun.spawn(["bun", "src/server/main.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      DB_PATH: legacyDatabasePath,
      AUTH_DB_PATH: authDatabasePath,
      BETTER_AUTH_URL: origin,
      TRUSTED_ORIGINS: origin,
      WORKSPACE_PATH: workspaceRoot,
      LEGACY_WORKSPACE_OWNER_ID: firstSession.accountId,
      MEDIA_PATH: legacyMediaPath,
      MEDIA_UPLOADS_PER_HOUR: "1",
    },
    stdout: "ignore",
    stderr: "pipe",
  });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Server exited during startup: ${await new Response(server.stderr).text()}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return server;
    } catch {
      // Wait for the server socket to open.
    }
    await Bun.sleep(25);
  }

  server.kill();
  throw new Error("Timed out waiting for the Effect server.");
};

const stopServer = async (server: Bun.Subprocess) => {
  server.kill();
  await server.exited;
};

const runPublisher = async (args: ReadonlyArray<string>): Promise<Record<string, unknown>> => {
  const child = Bun.spawn(
    ["bun", "scripts/bootstrap-publisher.ts", ...args, "--account-id", firstSession.accountId],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AUTH_DB_PATH: authDatabasePath,
        WORKSPACE_PATH: workspaceRoot,
        LEGACY_WORKSPACE_OWNER_ID: firstSession.accountId,
        DB_PATH: legacyDatabasePath,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`Publisher CLI failed: ${stderr}`);
  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed)) throw new Error("Publisher CLI returned invalid JSON.");
  return parsed;
};

let publicId: string;
let server: Bun.Subprocess | undefined;
const runtimes: Array<ManagedRuntime.ManagedRuntime<TestClient, never>> = [];
const firstSession = await createBunTestSession({
  authDatabasePath,
  origin,
  email: "first@example.com",
});
const secondSession = await createBunTestSession({
  authDatabasePath,
  origin,
  email: "second@example.com",
});

try {
  server = await startServer();
  assert.equal((await stat(authDatabasePath)).mode & 0o777, 0o600);
  assert.equal((await stat(dataDirectory)).mode & 0o077, 0);
  const securityPolicy =
    (await fetch(`http://127.0.0.1:${port}/health`)).headers.get("content-security-policy") ?? "";
  assert.match(securityPolicy, /script-src[^;]*https:\/\/embed-cdn\.spotifycdn\.com/);
  assert.match(
    securityPolicy,
    /frame-src https:\/\/open\.spotify\.com https:\/\/www\.youtube-nocookie\.com/,
  );
  assert.match(securityPolicy, /media-src 'self' https:/);
  assert.doesNotMatch(securityPolicy, /media-src[^;]*data:/);
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(`${origin}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({
        email: "bun-rate-limit@example.com",
        callbackURL: "/",
      }),
    });
    assert.equal(response.status, attempt <= 5 ? 200 : 429);
    if (attempt === 6) assert.equal(response.headers.get("retry-after"), "60");
  }
  const guestDemoPage = await fetch(`${origin}/demo`);
  assert.equal(guestDemoPage.status, 200);
  assert.match(await guestDemoPage.text(), /<div id="root"><\/div>/);
  assert.ok(guestDemoPage.headers.get("content-security-policy"));
  const guestBoardPage = await fetch(`${origin}/boards/default`, {
    redirect: "manual",
  });
  assert.equal(guestBoardPage.status, 302);
  assert.equal(guestBoardPage.headers.get("location"), "/login?returnTo=%2Fboards%2Fdefault");
  const guestRpc = await fetch(`${origin}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: "{}",
  });
  assert.equal(guestRpc.status, 401);
  const guestMedia = await fetch(`${origin}/api/owner/media/${"a".repeat(32)}`);
  assert.equal(guestMedia.status, 401);
  const crossOriginRpc = await fetch(`${origin}/rpc`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: firstSession.cookie,
      origin: "https://evil.example",
    },
    body: "{}",
  });
  assert.equal(crossOriginRpc.status, 403);

  const subscriber = makeRuntime(firstSession.cookie);
  const writer = makeRuntime(firstSession.cookie);
  const otherAccount = makeRuntime(secondSession.cookie);
  runtimes.push(subscriber, writer, otherAccount);

  const exists = await writer.runPromise(
    TestClient.use((client) => client.BoardExists({ boardId: DEFAULT_BOARD_ID })),
  );
  assert.equal(exists, false);
  let blockedPreview = false;
  try {
    await writer.runPromise(
      TestClient.use((client) =>
        client.ResolveWebsitePreview({
          url: "https://127.0.0.1/private",
        }),
      ),
    );
  } catch {
    blockedPreview = true;
  }
  assert.equal(blockedPreview, true);
  await writer.runPromise(
    TestClient.use((client) =>
      client.CreateBoard({
        boardId: DEFAULT_BOARD_ID,
        title: "Realtime test",
      }),
    ),
  );
  assert.deepEqual(
    await otherAccount.runPromise(TestClient.use((client) => client.ListBoards())),
    [],
  );
  await otherAccount.runPromise(
    TestClient.use((client) =>
      client.CreateBoard({
        boardId: DEFAULT_BOARD_ID,
        title: "Other account",
      }),
    ),
  );
  assert.equal(
    (await writer.runPromise(TestClient.use((client) => client.ListBoards())))[0]?.title,
    "Realtime test",
  );
  const privateMaintenance = await fetch(`http://127.0.0.1:${port}/_internal/media/maintenance`, {
    method: "POST",
    headers: { "x-mood-board-maintenance": "scheduled" },
  });
  assert.equal(privateMaintenance.status, 404);
  const mediaUploadResponse = await privateFetch(
    firstSession.cookie,
    "/api/owner/media?kind=image",
    {
      method: "POST",
      headers: {
        "content-type": "image/png",
        "x-forwarded-for": "198.51.100.10",
        "x-mood-board-media-client": "a".repeat(64),
      },
      body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    },
  );
  assert.equal(mediaUploadResponse.status, 201);
  const limitedUploadResponse = await privateFetch(
    firstSession.cookie,
    "/api/owner/media?kind=image",
    {
      method: "POST",
      headers: {
        "content-type": "image/png",
        "x-forwarded-for": "203.0.113.20",
        "x-mood-board-media-client": "b".repeat(64),
      },
      body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    },
  );
  assert.equal(limitedUploadResponse.status, 429);
  assert.equal(limitedUploadResponse.headers.get("cache-control"), "private, no-store");
  assert(Number(limitedUploadResponse.headers.get("retry-after")) > 0);
  const limitedBody: unknown = await limitedUploadResponse.json();
  assert(isRecord(limitedBody));
  assert.equal(limitedBody.code, "media_request_rate_limited");
  const mediaUpload: unknown = await mediaUploadResponse.json();
  assert(isRecord(mediaUpload));
  const managedMediaId = Schema.decodeUnknownSync(MediaIdSchema)(mediaUpload.mediaId);
  const mediaPath = `/api/owner/media/${managedMediaId}`;
  const mediaHead = await privateFetch(firstSession.cookie, mediaPath, {
    method: "HEAD",
    headers: { range: "bytes=1-3" },
  });
  assert.equal(mediaHead.status, 206);
  assert.equal(mediaHead.headers.get("content-length"), "3");
  const mediaEtag = mediaHead.headers.get("etag");
  assert(mediaEtag);
  const mediaNotModified = await privateFetch(firstSession.cookie, mediaPath, {
    headers: { "if-none-match": `W/${mediaEtag}, "other"` },
  });
  assert.equal(mediaNotModified.status, 304);
  const staleRange = await privateFetch(firstSession.cookie, mediaPath, {
    headers: { range: "bytes=1-3", "if-range": '"stale"' },
  });
  assert.equal(staleRange.status, 200);
  assert.equal((await staleRange.arrayBuffer()).byteLength, 8);

  const events: BoardEvent[] = [];
  const collectThree = subscriber.runPromise(
    TestClient.use((client) =>
      client.SubscribeBoard({ boardId: DEFAULT_BOARD_ID }).pipe(
        Stream.take(3),
        Stream.runForEach((event) => Effect.sync(() => events.push(event))),
      ),
    ),
  );

  await Bun.sleep(50);
  await writer.runPromise(
    TestClient.use((client) =>
      client.CommitBoard({
        boardId: DEFAULT_BOARD_ID,
        clientId: ClientIdSchema.make("writer"),
        mutationId: MutationIdSchema.make(crypto.randomUUID()),
        upserts: [
          {
            id: ItemIdSchema.make("note-1"),
            kind: "note",
            x: 0,
            y: 0,
            width: 300,
            height: 200,
            rotation: 0,
            order: 1,
            text: "persisted and broadcast",
          },
          {
            id: ItemIdSchema.make("image-1"),
            kind: "image",
            x: 340,
            y: 0,
            width: 300,
            height: 200,
            rotation: 0,
            order: 2,
            mediaId: managedMediaId,
            href: "https://shop.example/chair",
          },
          {
            id: ItemIdSchema.make("spotify-1"),
            kind: "spotify",
            x: 680,
            y: 0,
            width: 520,
            height: 300,
            rotation: 0,
            order: 3,
            src: "https://open.spotify.com/playlist/4uLU6hMCjMI75M1A2tKUQC",
            label: "Studio rotation",
          },
          {
            id: ItemIdSchema.make("youtube-1"),
            kind: "youtube",
            x: 1220,
            y: 0,
            width: 520,
            height: 400,
            rotation: 0,
            order: 4,
            src: "https://www.youtube.com/watch?v=ryig6M3rZYU",
            label: "Reference film",
          },
          {
            id: ItemIdSchema.make("audio-1"),
            kind: "audio",
            x: 1760,
            y: 0,
            width: 520,
            height: 220,
            rotation: 0,
            order: 5,
            src: "https://media.example/field-recording.mp3",
            label: "Field recording",
          },
          {
            id: ItemIdSchema.make("website-1"),
            kind: "website",
            x: 2300,
            y: 0,
            width: 540,
            height: 360,
            rotation: 0,
            order: 6,
            websiteUrl: WebsiteUrlSchema.make("https://example.com/story"),
            websiteImageUrl: WebsiteImageUrlSchema.make("https://cdn.example.com/story.jpg"),
            websiteTitle: WebsiteTitleSchema.make("A collected room"),
            websiteDescription: WebsiteDescriptionSchema.make("Light, stone, and quiet objects."),
            websiteSiteLabel: WebsiteSiteLabelSchema.make("example.com"),
          },
        ],
        deletes: [],
      }),
    ),
  );
  await writer.runPromise(
    TestClient.use((client) =>
      client.CommitBoard({
        boardId: DEFAULT_BOARD_ID,
        clientId: ClientIdSchema.make("writer"),
        mutationId: MutationIdSchema.make(crypto.randomUUID()),
        background: "#242728",
        upserts: [],
        deletes: [],
      }),
    ),
  );
  await collectThree;

  assert.deepEqual(
    events.map((event) => event._tag),
    ["Snapshot", "Change", "Change"],
  );
  assert.deepEqual(
    events.map((event) => event.revision),
    [0, 1, 2],
  );
  assert.equal(events[2]?._tag === "Change" && events[2].background, "#242728");

  const privateResponse = await fetch(
    `http://127.0.0.1:${port}/api/public/boards/0123456789abcdef0123456789abcdef`,
  );
  const invalidResponse = await fetch(`http://127.0.0.1:${port}/api/public/boards/default`);
  const malformedResponse = await fetch(`http://127.0.0.1:${port}/api/public/boards/default/edit`);
  const wrongMethodResponse = await fetch(
    `http://127.0.0.1:${port}/api/public/boards/0123456789abcdef0123456789abcdef`,
    { method: "POST" },
  );
  assert.equal(privateResponse.status, 404);
  assert.equal(invalidResponse.status, 404);
  assert.equal(privateResponse.headers.get("cache-control"), "no-store");
  assert.equal(malformedResponse.headers.get("cache-control"), "no-store");
  assert.equal(wrongMethodResponse.headers.get("cache-control"), "no-store");
  const denialBody = await privateResponse.text();
  assert.equal(denialBody, await invalidResponse.text());
  assert.equal(denialBody, await malformedResponse.text());
  assert.equal(denialBody, await wrongMethodResponse.text());

  await runPublisher([
    "profile",
    "--handle",
    "studio-notes",
    "--name",
    "Studio Notes",
    "--bio",
    "Published from the trusted CLI",
  ]);
  const publication = await runPublisher(["publish", DEFAULT_BOARD_ID]);
  assert.equal(typeof publication.publicId, "string");
  publicId = String(publication.publicId);
  assert.match(publicId, /^[0-9a-f]{32}$/);

  const publicProfileResponse = await fetch(
    `http://127.0.0.1:${port}/api/public/profiles/studio-notes`,
  );
  const publicBoardResponse = await fetch(`http://127.0.0.1:${port}/api/public/boards/${publicId}`);
  assert.equal(publicProfileResponse.status, 200);
  assert.equal(publicBoardResponse.status, 200);
  assert.equal(publicBoardResponse.headers.get("cache-control"), "no-store");
  const publicBoard: unknown = await publicBoardResponse.json();
  assert(isRecord(publicBoard));
  assert.equal("boardId" in publicBoard, false);
  assert.equal("revision" in publicBoard, false);
  const publicBoardData = publicBoard.board;
  assert(isRecord(publicBoardData));
  assert(Array.isArray(publicBoardData.items));
  const firstPublicItem = publicBoardData.items[0];
  assert(typeof firstPublicItem === "object" && firstPublicItem !== null);
  assert.equal("id" in firstPublicItem, false);
  const publicWebsite = publicBoardData.items.find(
    (item) => isRecord(item) && item.kind === "website",
  );
  assert(isRecord(publicWebsite));
  assert.equal(publicWebsite.websiteTitle, "A collected room");
  const publicYouTube = publicBoardData.items.find(
    (item) => isRecord(item) && item.kind === "youtube",
  );
  assert(isRecord(publicYouTube));
  assert.equal(publicYouTube.src, "https://www.youtube.com/watch?v=ryig6M3rZYU");

  const secondBoardId = BoardIdSchema.make("123e4567-e89b-42d3-a456-426614174000");
  const duplicate = await writer.runPromise(
    TestClient.use((client) =>
      client.DuplicateBoard({
        sourceBoardId: DEFAULT_BOARD_ID,
        boardId: secondBoardId,
        title: "Realtime test — copy",
      }),
    ),
  );
  assert.equal(duplicate.itemCount, 6);
  const listed = await writer.runPromise(TestClient.use((client) => client.ListBoards()));
  assert.deepEqual(
    new Set(listed.map((board) => board.id)),
    new Set([DEFAULT_BOARD_ID, secondBoardId]),
  );

  const duplicateEvents: BoardEvent[] = [];
  const collectDeletion = subscriber.runPromise(
    TestClient.use((client) =>
      client.SubscribeBoard({ boardId: secondBoardId }).pipe(
        Stream.take(2),
        Stream.runForEach((event) => Effect.sync(() => duplicateEvents.push(event))),
      ),
    ),
  );
  await Bun.sleep(50);
  await writer.runPromise(
    TestClient.use((client) => client.DeleteBoard({ boardId: secondBoardId })),
  );
  await collectDeletion;
  assert.deepEqual(
    duplicateEvents.map((event) => event._tag),
    ["Snapshot", "Deleted"],
  );
  assert.equal(
    duplicateEvents[0]?._tag === "Snapshot" && duplicateEvents[0].board.items[0]?.text,
    "persisted and broadcast",
  );
  assert.equal(
    duplicateEvents[0]?._tag === "Snapshot" && duplicateEvents[0].board.background,
    "#242728",
  );
  assert.equal(
    duplicateEvents[0]?._tag === "Snapshot" &&
      duplicateEvents[0].board.items.find((item) => item.id === "image-1")?.href,
    "https://shop.example/chair",
  );
  assert.equal(
    duplicateEvents[0]?._tag === "Snapshot" &&
      duplicateEvents[0].board.items.find((item) => item.id === "spotify-1")?.kind,
    "spotify",
  );
  assert.equal(
    duplicateEvents[0]?._tag === "Snapshot" &&
      duplicateEvents[0].board.items.find((item) => item.id === "youtube-1")?.src,
    "https://www.youtube.com/watch?v=ryig6M3rZYU",
  );

  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
  await stopServer(server);
  server = await startServer();

  const afterRestart = makeRuntime(firstSession.cookie);
  runtimes.push(afterRestart);
  const snapshots: BoardEvent[] = [];
  await afterRestart.runPromise(
    TestClient.use((client) =>
      client.SubscribeBoard({ boardId: DEFAULT_BOARD_ID }).pipe(
        Stream.take(1),
        Stream.runForEach((event) => Effect.sync(() => snapshots.push(event))),
      ),
    ),
  );

  const snapshot = snapshots[0];
  assert(snapshot?._tag === "Snapshot");
  assert.equal(snapshot.revision, 2);
  assert.equal(snapshot.board.items[0]?.text, "persisted and broadcast");
  assert.equal(snapshot.board.background, "#242728");
  assert.equal(
    snapshot.board.items.find((item) => item.id === "image-1")?.href,
    "https://shop.example/chair",
  );
  assert.equal(snapshot.board.items.find((item) => item.id === "image-1")?.mediaId, managedMediaId);
  const persistedMediaResponse = await privateFetch(
    firstSession.cookie,
    `/api/owner/media/${managedMediaId}`,
    { headers: { range: "bytes=-3" } },
  );
  assert.equal(persistedMediaResponse.status, 206);
  assert.equal(persistedMediaResponse.headers.get("content-range"), "bytes 5-7/8");
  assert.equal((await persistedMediaResponse.arrayBuffer()).byteLength, 3);
  assert.equal(
    snapshot.board.items.find((item) => item.id === "audio-1")?.src,
    "https://media.example/field-recording.mp3",
  );
  assert.equal(
    snapshot.board.items.find((item) => item.id === "youtube-1")?.src,
    "https://www.youtube.com/watch?v=ryig6M3rZYU",
  );
  assert.equal(
    snapshot.board.items.find((item) => item.id === "website-1")?.websiteTitle,
    "A collected room",
  );
  const persistedPublicResponse = await fetch(`${origin}/api/public/boards/${publicId}`);
  assert.equal(persistedPublicResponse.status, 200);
  const publicMediaPath = `/api/public/boards/${publicId}/media/${managedMediaId}`;
  assert.equal((await fetch(`${origin}${publicMediaPath}`)).status, 200);
  await runPublisher(["unpublish", DEFAULT_BOARD_ID]);
  const revokedResponse = await fetch(`${origin}/api/public/boards/${publicId}`);
  assert.equal(revokedResponse.status, 404);
  assert.equal((await fetch(`${origin}${publicMediaPath}`)).status, 404);
  console.log("Effect RPC, public publishing, and SQLite restart smoke passed");
} finally {
  await Promise.all(runtimes.map((runtime) => runtime.dispose().catch(() => undefined)));
  if (server !== undefined && server.exitCode === null) await stopServer(server);
  const removeTree = async (path: string): Promise<void> => {
    const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await removeTree(child);
      else await unlink(child).catch(() => undefined);
    }
    await rmdir(path).catch(() => undefined);
  };
  await removeTree(dataDirectory);
}
