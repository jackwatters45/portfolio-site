import { NodeServices } from '@effect/platform-node';
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer, Path, Schema } from 'effect';
import {
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
  HttpRouter,
} from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import sharp from 'sharp';

import { AccountIdSchema } from '../../src/lib/account';
import {
  BoardIdSchema,
  BoardRevisionSchema,
  BoardRpcs,
  MutationIdSchema,
} from '../../src/lib/board-rpc';
import { ItemIdSchema } from '../../src/lib/board-rpc';
import { AccountArchive } from '../../src/mcp/account-archive';
import { AccountBoards } from '../../src/mcp/account-boards';
import { AccountClient } from '../../src/mcp/account-client';
import { AccountConnection } from '../../src/mcp/account-connection';
import { AccountError } from '../../src/mcp/account-contracts';
import { AccountMedia } from '../../src/mcp/account-media';
import { BoardRenderer } from '../../src/mcp/board-renderer';
import { LocalArchive } from '../../src/mcp/local-archive';
import { contentHash, LocalFiles } from '../../src/mcp/local-files';
import { LocalImages } from '../../src/mcp/local-images';
import { LocalMedia } from '../../src/mcp/local-media';
import { BoardService } from '../../src/server/board-service';
import { MediaClientIdentity } from '../../src/server/media-client-identity';
import { MediaHandlers } from '../../src/server/media-handlers';
import { MediaObjectStore } from '../../src/server/media-object-store';
import { MediaService } from '../../src/server/media-service';
import { migrationLoader } from '../../src/server/migrations';

const account = {
  origin: 'https://board.example',
  id: AccountIdSchema.make('owner'),
};
const boardId = BoardIdSchema.make('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const copyId = BoardIdSchema.make('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
const unused = () => Effect.die('Unexpected operation');
const mutationId = () => MutationIdSchema.make(crypto.randomUUID());

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const temporary = yield* fs.makeTempDirectoryScoped();
  const root = yield* fs.realPath(temporary);
  const input = path.join(root, 'input');
  const output = path.join(root, 'output');
  yield* fs.makeDirectory(input);
  yield* fs.makeDirectory(output);
  const audio = new Uint8Array([0x49, 0x44, 0x33, 0, 0, 0, 0, 0, 0, 0]);
  const png = yield* Effect.promise(() =>
    sharp({
      create: { width: 80, height: 80, channels: 3, background: '#224466' },
    })
      .png()
      .toBuffer(),
  );
  yield* fs.writeFile(path.join(input, 'photo.png'), png);
  yield* fs.writeFile(path.join(input, 'audio.mp3'), audio);
  const assets = {
    photo: { path: 'photo.png', sha256: contentHash(png) },
    audio: { path: 'audio.mp3', sha256: contentHash(audio) },
  };
  const database = SqliteMigrator.layer({ loader: migrationLoader }).pipe(
    Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
  );
  const handlers = BoardRpcs.toLayer(
    Effect.gen(function* () {
      const service = yield* BoardService;
      return {
        ListBoards: () => service.list(),
        BoardExists: ({ boardId }) => service.exists(boardId),
        CreateBoard: ({ boardId, title, requireNew }) =>
          service.create(boardId, title, requireNew),
        DuplicateBoard: ({ sourceBoardId, boardId, title, expectedRevision }) =>
          service.duplicate(sourceBoardId, boardId, title, expectedRevision),
        DeleteBoard: ({ boardId, expectedRevision }) =>
          service.delete(boardId, expectedRevision),
        SubscribeBoard: ({ boardId }) => service.subscribe(boardId),
        CommitBoard: (input) => service.commit(input),
        ResolveWebsitePreview: unused,
        ResolveXPostPreview: unused,
      };
    }),
  ).pipe(Layer.provide(BoardService.layer), Layer.provide(database));
  const objects = new Map<string, Uint8Array>();
  const store = Layer.succeed(MediaObjectStore, {
    put: (key, bytes) =>
      Effect.sync(() => {
        objects.set(key, bytes.slice());
      }),
    get: (key, range) =>
      Effect.sync(() => {
        const bytes = objects.get(key);
        return bytes === undefined
          ? null
          : {
              bytes:
                range === undefined
                  ? bytes.slice()
                  : bytes.slice(range.offset, range.offset + range.length),
            };
      }),
    delete: (key) =>
      Effect.sync(() => {
        objects.delete(key);
      }),
  });
  const mediaServer = MediaHandlers.pipe(
    Layer.provide(MediaService.layer),
    Layer.provide(MediaClientIdentity.layer),
    Layer.provide(store),
    Layer.provide(database),
  );
  const web = yield* Effect.acquireRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        Layer.merge(
          mediaServer,
          RpcServer.layerHttp({
            group: BoardRpcs,
            path: '/rpc',
            protocol: 'http',
          }).pipe(
            Layer.provide(handlers),
            Layer.provide(RpcSerialization.layerNdjson),
          ),
        ),
        { disableLogger: true },
      ),
    ),
    (web) => Effect.promise(() => web.dispose()),
  );
  const http = HttpClient.make((request) =>
    Effect.gen(function* () {
      const path = new URL(request.url).pathname;
      const routed =
        request.method === 'GET' && path.startsWith('/api/owner/media/')
          ? HttpClientRequest.setUrl(
              request,
              request.url.replace('/api/owner/media/', '/media/'),
            )
          : request;
      const native = yield* HttpClientRequest.toWeb(routed).pipe(Effect.orDie);
      const response = yield* Effect.tryPromise({
        try: () => web.handler(native),
        catch: (cause) =>
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({ request, cause }),
          }),
      });
      return HttpClientResponse.fromWeb(request, response);
    }),
  );
  let writesAllowed = true;
  const connection = Layer.succeed(
    AccountConnection,
    AccountConnection.of({
      begin: unused,
      complete: unused,
      disconnect: unused,
      readJson: (response, schema) =>
        response.json.pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(schema)),
          Effect.mapError(
            () =>
              new AccountError({ code: 'Remote', message: 'Invalid response' }),
          ),
        ),
      connected: (expected) =>
        expected !== undefined &&
        (expected.origin !== account.origin || expected.id !== account.id)
          ? Effect.fail(
              new AccountError({
                code: 'Authentication',
                message: 'Wrong account',
              }),
            )
          : Effect.succeed({
              reference: account,
              account: {
                id: account.id,
                email: 'owner@example.com',
                name: 'Owner',
              },
              http,
            }),
      get writesAllowed() {
        return writesAllowed;
      },
    }),
  );
  const resources = Layer.mergeAll(
    LocalArchive.layer,
    LocalImages.layer,
    LocalFiles.layer({
      assetRoot: input,
      outputDirectory: output,
      allowDelete: false,
      allowOverwrite: false,
    }),
  );
  const layer = Layer.mergeAll(
    AccountBoards.layer,
    AccountArchive.layer,
    AccountMedia.layer,
  ).pipe(
    Layer.provide(
      Layer.mergeAll(
        AccountClient.layer.pipe(Layer.provide(connection)),
        connection,
        resources,
        LocalMedia.layer.pipe(Layer.provide(resources)),
        BoardRenderer.layer.pipe(Layer.provide(LocalImages.layer)),
      ),
    ),
  );
  return {
    layer,
    assets,
    disableWrites: () => {
      writesAllowed = false;
    },
  };
});

const run = <A, E>(
  work: (
    boards: typeof AccountBoards.Service,
    disable: () => void,
    archives: typeof AccountArchive.Service,
    media: typeof AccountMedia.Service,
    assets: Effect.Success<typeof fixture>['assets'],
  ) => Effect.Effect<A, E>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const setup = yield* fixture;
      return yield* Effect.gen(function* () {
        const boards = yield* AccountBoards;
        const archives = yield* AccountArchive;
        const media = yield* AccountMedia;
        return yield* work(
          boards,
          setup.disableWrites,
          archives,
          media,
          setup.assets,
        );
      }).pipe(Effect.provide(setup.layer));
    }),
  ).pipe(Effect.provide(NodeServices.layer));

describe('account MCP board operations through JSON RPC and SQLite', () => {
  it.effect(
    'uploads image/audio/background media, downloads, exports, and restores their bytes',
    () =>
      run((boards, _disable, archives, media, assets) =>
        Effect.gen(function* () {
          yield* boards.create({
            account,
            boardId,
            title: 'Media workflow',
            confirm: true,
          });
          const audio = yield* media.prepare({
            source: assets.audio,
            kind: 'audio',
          });
          const image = yield* media.prepare({
            source: assets.photo,
            kind: 'image',
          });
          const sound = yield* media.upload({
            account,
            boardId,
            expectedRevision: BoardRevisionSchema.make(0),
            mutationId: mutationId(),
            prepared: audio,
            target: 'item',
            item: {
              id: ItemIdSchema.make('sound'),
              x: 0,
              y: 0,
              width: 400,
              height: 220,
              rotation: 0,
              order: 0,
            },
            confirm: true,
          });
          const downloaded = yield* media.read({
            account,
            boardId,
            mediaId: sound.receipt.mediaId,
            kind: 'audio',
            output: 'sound.mp3',
          });
          expect(downloaded.sha256).toBe(audio.sha256);
          yield* media.upload({
            account,
            boardId,
            expectedRevision: BoardRevisionSchema.make(1),
            mutationId: mutationId(),
            prepared: image,
            target: 'background',
            confirm: true,
          });
          yield* media.upload({
            account,
            boardId,
            expectedRevision: BoardRevisionSchema.make(2),
            mutationId: mutationId(),
            prepared: image,
            target: 'item',
            item: {
              id: ItemIdSchema.make('photo'),
              x: 450,
              y: 0,
              width: 300,
              height: 300,
              rotation: 0,
              order: 1,
            },
            confirm: true,
          });
          const checkpoint = yield* archives.export({
            account,
            boardId,
            output: 'media.moodboard',
          });
          expect(checkpoint.mediaCount).toBe(3);
          const before = yield* boards.get({ account, boardId });
          yield* archives.restore({
            account,
            boardId,
            board: checkpoint.board,
            expectedRevision: BoardRevisionSchema.make(3),
            mutationId: mutationId(),
            confirm: true,
          });
          const after = yield* boards.get({ account, boardId });
          expect(after.snapshot.board.items).toHaveLength(2);
          expect(after.snapshot.board.backgroundMediaId).toBeDefined();
          expect(after.snapshot.board.backgroundMediaId).not.toBe(
            before.snapshot.board.backgroundMediaId,
          );
          const preview = yield* archives.preview({
            account,
            boardId,
            output: 'media.jpg',
          });
          expect(preview.image.bytes.length).toBeGreaterThan(0);
        }),
      ),
    { timeout: 20_000 },
  );
  it.effect(
    'preserves omitted backgrounds, changes color, and clears explicitly',
    () =>
      run((boards) =>
        Effect.gen(function* () {
          yield* boards.create({
            account,
            boardId,
            title: 'Test',
            confirm: true,
          });
          yield* boards.edit({
            account,
            boardId,
            expectedRevision: BoardRevisionSchema.make(0),
            mutationId: mutationId(),
            background: '#FF0000',
            upserts: [],
            deletes: [],
            confirm: true,
          });
          yield* boards.rename({
            account,
            boardId,
            expectedRevision: BoardRevisionSchema.make(1),
            mutationId: mutationId(),
            title: 'Renamed',
            confirm: true,
          });
          const snapshot = yield* boards.get({ account, boardId });
          expect(snapshot.snapshot.board.background).toBe('#FF0000');
          expect(snapshot.snapshot.board.title).toBe('Renamed');
          yield* boards.edit({
            account,
            boardId,
            expectedRevision: BoardRevisionSchema.make(2),
            mutationId: mutationId(),
            background: null,
            upserts: [],
            deletes: [],
            confirm: true,
          });
          expect(
            (yield* boards.get({ account, boardId })).snapshot.board.background,
          ).toBeUndefined();
        }),
      ),
  );

  it.effect(
    'guards duplicate destinations, stale revisions, and deletion',
    () =>
      run((boards) =>
        Effect.gen(function* () {
          yield* boards.create({
            account,
            boardId,
            title: 'Original',
            confirm: true,
          });
          yield* boards.duplicate({
            account,
            sourceBoardId: boardId,
            boardId: copyId,
            title: 'Copy',
            expectedRevision: BoardRevisionSchema.make(0),
            confirm: true,
          });
          expect(
            (yield* boards
              .duplicate({
                account,
                sourceBoardId: boardId,
                boardId: copyId,
                title: 'Cannot replace',
                expectedRevision: BoardRevisionSchema.make(0),
                confirm: true,
              })
              .pipe(Effect.flip)).code,
          ).toBe('Conflict');
          expect(
            (yield* boards
              .delete({
                account,
                boardId: copyId,
                expectedRevision: BoardRevisionSchema.make(99),
                confirm: true,
              })
              .pipe(Effect.flip)).code,
          ).toBe('Conflict');
          yield* boards.delete({
            account,
            boardId: copyId,
            expectedRevision: BoardRevisionSchema.make(0),
            confirm: true,
          });
          expect(
            (yield* boards.list()).boards.map((board) => board.id),
          ).not.toContain(copyId);
        }),
      ),
  );

  it.effect(
    'exports, previews, and restores a portable checkpoint as a new revision',
    () =>
      run((boards, _disable, archives) =>
        Effect.gen(function* () {
          yield* boards.create({
            account,
            boardId,
            title: 'Checkpoint',
            confirm: true,
          });
          yield* boards.edit({
            account,
            boardId,
            expectedRevision: BoardRevisionSchema.make(0),
            mutationId: mutationId(),
            background: '#FF0000',
            upserts: [],
            deletes: [],
            confirm: true,
          });
          const checkpoint = yield* archives.export({
            account,
            boardId,
            output: 'checkpoint.moodboard',
          });
          expect(checkpoint.revision).toBe(1);
          expect(checkpoint.mediaCount).toBe(0);
          const preview = yield* archives.preview({
            account,
            boardId,
            output: 'preview.jpg',
          });
          expect(preview.image.bytes.length).toBeGreaterThan(0);
          expect(preview.value.revision).toBe(1);
          yield* boards.rename({
            account,
            boardId,
            title: 'Changed',
            expectedRevision: BoardRevisionSchema.make(1),
            mutationId: mutationId(),
            confirm: true,
          });
          expect(
            (yield* archives
              .restore({
                account,
                boardId,
                board: checkpoint.board,
                expectedRevision: BoardRevisionSchema.make(1),
                mutationId: mutationId(),
                confirm: true,
              })
              .pipe(Effect.flip)).code,
          ).toBe('Conflict');
          const restored = yield* archives.restore({
            account,
            boardId,
            board: checkpoint.board,
            expectedRevision: BoardRevisionSchema.make(2),
            mutationId: mutationId(),
            confirm: true,
          });
          expect(restored.revision).toBe(3);
          const result = yield* boards.get({ account, boardId });
          expect(result.snapshot.board.title).toBe('Checkpoint');
          expect(result.snapshot.board.background).toBe('#FF0000');
        }),
      ),
  );

  it.effect('rejects disabled writes and mismatched accounts', () =>
    run((boards, disable) =>
      Effect.gen(function* () {
        expect(
          (yield* boards
            .create({
              account: { ...account, id: AccountIdSchema.make('other') },
              boardId,
              title: 'Denied',
              confirm: true,
            })
            .pipe(Effect.flip)).code,
        ).toBe('Authentication');
        disable();
        expect(
          (yield* boards
            .create({ account, boardId, title: 'Denied', confirm: true })
            .pipe(Effect.flip)).code,
        ).toBe('AccessDenied');
        expect((yield* boards.list()).boards).toEqual([]);
      }),
    ),
  );
});
