import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { NodeServices } from '@effect/platform-node';
import { expect, it } from '@effect/vitest';
import {
  Deferred,
  Effect,
  FileSystem,
  Path,
  Queue,
  Schema,
  Stream,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import {
  BoardOutput,
  RevisionOutput,
  ScanOutput,
} from '../../src/mcp/contracts';

const entry = fileURLToPath(new URL('../../src/mcp/main.ts', import.meta.url));
const Message = Schema.Struct({
  id: Schema.optional(Schema.Number),
  result: Schema.optional(Schema.JsonObject),
  error: Schema.optional(Schema.JsonObject),
});
const ToolResult = Schema.Struct({
  structuredContent: Schema.optional(Schema.JsonObject),
  isError: Schema.optional(Schema.Boolean),
  content: Schema.Array(Schema.JsonObject),
});

it.effect(
  'runs the complete local authoring workflow through stdio MCP',
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const temporary = yield* fs.makeTempDirectoryScoped();
        const root = yield* fs.realPath(temporary);
        const input = path.join(root, 'input');
        const output = path.join(root, 'output');
        yield* fs.makeDirectory(input);
        yield* fs.makeDirectory(output);
        const png = yield* Effect.promise(() =>
          sharp({
            create: {
              width: 80,
              height: 80,
              channels: 3,
              background: '#224466',
            },
          })
            .png()
            .toBuffer(),
        );
        yield* fs.writeFile(path.join(input, 'photo.png'), png);
        yield* fs.writeFile(
          path.join(input, 'audio.mp3'),
          new Uint8Array([0x49, 0x44, 0x33, 0, 0, 0, 0, 0, 0, 0]),
        );
        const queue = yield* Queue.unbounded<Uint8Array>();
        const pending = new Map<
          number,
          Deferred.Deferred<typeof Message.Type>
        >();
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const child = yield* spawner.spawn(
          ChildProcess.make(
            'bun',
            [
              entry,
              'mcp',
              '--root',
              input,
              '--output-dir',
              output,
              '--allow-delete',
            ],
            { stdin: { stream: Stream.fromQueue(queue), endOnDone: false } },
          ),
        );
        yield* child.stderr.pipe(Stream.runDrain, Effect.forkChild);
        yield* child.stdout.pipe(
          Stream.decodeText(),
          Stream.splitLines,
          Stream.mapEffect((line) =>
            Schema.decodeUnknownEffect(Schema.fromJsonString(Message))(line),
          ),
          Stream.runForEach((message) => {
            const waiting =
              message.id === undefined ? undefined : pending.get(message.id);
            return waiting === undefined
              ? Effect.void
              : Deferred.succeed(waiting, message);
          }),
          Effect.forkChild,
        );
        let sequence = 0;
        const request = Effect.fn('TestMcp.request')(function* (
          method: string,
          params: Schema.JsonObject,
        ) {
          const id = ++sequence;
          const waiting = yield* Deferred.make<typeof Message.Type>();
          pending.set(id, waiting);
          yield* Queue.offer(
            queue,
            new TextEncoder().encode(
              JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
            ),
          );
          const response = yield* Deferred.await(waiting).pipe(
            Effect.timeout('20 seconds'),
          );
          pending.delete(id);
          expect(response.error).toBeUndefined();
          return response.result;
        });
        yield* request('initialize', {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'workflow-test', version: '1.0' },
        });
        yield* Queue.offer(
          queue,
          new TextEncoder().encode(
            '{"jsonrpc":"2.0","method":"notifications/initialized"}\n',
          ),
        );
        const tool = Effect.fn('TestMcp.tool')(function* (
          name: string,
          args: Schema.JsonObject,
        ) {
          const result = yield* request('tools/call', {
            name,
            arguments: args,
          });
          const parsed = yield* Schema.decodeUnknownEffect(ToolResult)(result);
          expect(parsed.isError, JSON.stringify(parsed.content)).not.toBe(true);
          return parsed;
        });
        const revise = Effect.fn('TestMcp.revise')(function* (
          name: string,
          args: Schema.JsonObject,
        ) {
          return yield* Schema.decodeUnknownEffect(RevisionOutput)(
            (yield* tool(name, args)).structuredContent,
          );
        });

        const capabilities = yield* tool('get_moodboard_capabilities', {});
        expect(capabilities.structuredContent?.capabilities).toBeInstanceOf(
          Array,
        );
        const audioSource = yield* tool('parse_audio_source', {
          source: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        });
        expect(audioSource.structuredContent?.kind).toBe('youtube');
        const xSource = yield* tool('parse_x_source', {
          source: 'https://x.com/example/status/1234567890',
        });
        expect(xSource.structuredContent?.src).toBe(
          'https://x.com/example/status/1234567890',
        );

        const photos = yield* Schema.decodeUnknownEffect(ScanOutput)(
          (yield* tool('scan_assets', { kind: 'image' })).structuredContent,
        );
        expect(photos.assets).toHaveLength(1);
        const photo = photos.assets[0];
        if (photo === undefined)
          return yield* Effect.die('Missing photo fixture');
        const photoRef = { path: photo.path, sha256: photo.sha256 };
        const photoPreview = yield* tool('preview_photos', {
          photos: [photoRef],
          output: 'photos.jpg',
        });
        expect(
          photoPreview.content.some((content) => content.type === 'image'),
        ).toBe(true);
        const initial = yield* revise('create_board', {
          title: 'Workflow',
          background: '#112233',
          output: '01.moodboard',
        });
        const withPhoto = yield* revise('add_photos', {
          board: initial.board,
          photos: [photoRef],
          layout: { kind: 'loose' },
          output: '02.moodboard',
        });
        const audio = yield* Schema.decodeUnknownEffect(ScanOutput)(
          (yield* tool('scan_assets', { kind: 'audio' })).structuredContent,
        );
        const sound = audio.assets[0];
        if (sound === undefined)
          return yield* Effect.die('Missing audio fixture');
        const withAudio = yield* revise('add_audio', {
          board: withPhoto.board,
          source: { path: sound.path, sha256: sound.sha256 },
          x: 400,
          y: 0,
          output: '03.moodboard',
        });
        const background = yield* revise('set_background_image', {
          board: withAudio.board,
          source: photoRef,
          output: '04.moodboard',
        });
        const edited = yield* revise('edit_board', {
          board: background.board,
          background: '#FF0000',
          upserts: [
            {
              id: 'note',
              kind: 'note',
              x: 0,
              y: 0,
              width: 400,
              height: 300,
              rotation: 0,
              order: 3,
              text: 'MCP workflow',
            },
          ],
          output: '05.moodboard',
        });
        const inspected = yield* Schema.decodeUnknownEffect(BoardOutput)(
          (yield* tool('get_board', edited.board)).structuredContent,
        );
        expect(inspected.document.background).toBe('#FF0000');
        expect(inspected.document.items).toHaveLength(3);
        const layout = yield* revise('layout_items', {
          board: edited.board,
          kind: 'contact',
          ids: inspected.document.items.map((item) => item.id),
          output: '06.moodboard',
        });
        const preview = yield* tool('preview_board', {
          board: layout.board,
          output: 'board.jpg',
        });
        expect(
          preview.content.some((content) => content.type === 'image'),
        ).toBe(true);
        const copy = yield* revise('duplicate_board', {
          board: layout.board,
          output: '07.moodboard',
        });
        yield* tool('export_board', {
          board: copy.board,
          output: 'export.moodboard',
        });
        yield* fs.copyFile(
          path.join(output, 'export.moodboard'),
          path.join(input, 'export.moodboard'),
        );
        const archives = yield* Schema.decodeUnknownEffect(ScanOutput)(
          (yield* tool('scan_assets', { kind: 'archive' })).structuredContent,
        );
        const archive = archives.assets[0];
        if (archive === undefined)
          return yield* Effect.die('Missing exported archive');
        const imported = yield* revise('import_board', {
          source: { path: archive.path, sha256: archive.sha256 },
          output: '08.moodboard',
        });
        expect(imported.itemCount).toBe(3);
        expect(imported.mediaCount).toBeGreaterThan(0);
        yield* tool('delete_board', { board: imported.board, confirm: true });
        const listed = yield* tool('list_boards', {});
        expect(listed.structuredContent?.files).not.toContain('08.moodboard');
        expect(listed.structuredContent?.files).toContain(initial.board.file);
        const denied = yield* request('tools/call', {
          name: 'delete_board',
          arguments: { board: initial.board },
        });
        expect(
          (yield* Schema.decodeUnknownEffect(ToolResult)(denied)).isError,
        ).toBe(true);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  { timeout: 60_000 },
);
