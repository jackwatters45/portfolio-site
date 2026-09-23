import { fileURLToPath } from 'node:url';

import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Option, Path, Schema, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

const entry = fileURLToPath(new URL('../../src/mcp/main.ts', import.meta.url));

const folders = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const temporary = yield* fs.makeTempDirectoryScoped({
    prefix: 'moodboard-startup-',
  });
  const root = yield* fs.realPath(temporary);
  const input = path.join(root, 'input');
  const output = path.join(root, 'output');
  yield* fs.makeDirectory(input);
  yield* fs.makeDirectory(output);
  return { input, output, args: ['--root', input, '--output-dir', output] };
});

const Hello = Schema.Struct({
  jsonrpc: Schema.Literal('2.0'),
  id: Schema.optional(Schema.Number),
  result: Schema.optional(
    Schema.Struct({
      protocolVersion: Schema.String,
      serverInfo: Schema.Struct({ name: Schema.String }),
    }),
  ),
});

describe('MCP and CLI process startup', () => {
  it.effect(
    'exposes account editing, media, archives, and publishing through MCP',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { args } = yield* folders;
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
          const messages = [
            {
              jsonrpc: '2.0',
              id: 1,
              method: 'initialize',
              params: {
                protocolVersion: '2025-11-25',
                capabilities: {},
                clientInfo: { name: 'catalog-check', version: '1.0' },
              },
            },
            { jsonrpc: '2.0', method: 'notifications/initialized' },
            { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
          ];
          const child = yield* spawner.spawn(
            ChildProcess.make('bun', [entry, 'mcp', ...args], {
              stdin: {
                stream: Stream.make(
                  new TextEncoder().encode(
                    messages
                      .map((message) => JSON.stringify(message))
                      .join('\n') + '\n',
                  ),
                ),
                endOnDone: false,
              },
            }),
          );
          const catalog = yield* child.stdout.pipe(
            Stream.decodeText(),
            Stream.splitLines,
            Stream.mapEffect((line) =>
              Schema.decodeUnknownEffect(
                Schema.fromJsonString(
                  Schema.Struct({
                    id: Schema.optional(Schema.Number),
                    result: Schema.optional(Schema.JsonObject),
                  }),
                ),
              )(line),
            ),
            Stream.filter((message) => message.id === 2),
            Stream.runHead,
          );
          if (Option.isNone(catalog))
            return yield* Effect.die('No tool catalog');
          const result = yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              tools: Schema.Array(
                Schema.Struct({
                  name: Schema.String,
                  inputSchema: Schema.JsonObject,
                  annotations: Schema.JsonObject,
                }),
              ),
            }),
          )(catalog.value.result);
          const names = result.tools.map((tool) => tool.name);
          for (const name of [
            'create_account_board',
            'rename_account_board',
            'duplicate_account_board',
            'delete_account_board',
            'apply_account_board_commands',
            'prepare_account_media',
            'upload_account_media',
            'read_account_media',
            'resolve_account_website',
            'resolve_account_x_post',
            'get_account_publishing',
            'configure_account_publisher',
            'publish_account_board',
            'unpublish_account_board',
            'reconcile_account_publishing',
            'export_account_board',
            'preview_account_board',
            'restore_account_board',
          ])
            expect(names).toContain(name);
          for (const name of [
            'delete_account_board',
            'publish_account_board',
            'unpublish_account_board',
            'restore_account_board',
          ]) {
            const tool = result.tools.find((tool) => tool.name === name);
            expect(tool?.annotations.destructiveHint).toBe(true);
            expect(tool?.inputSchema.required).toContain('confirm');
          }
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    { timeout: 30_000 },
  );
  it.effect(
    'reports startup failures only on stderr',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { input, output } = yield* folders;
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
          const child = yield* spawner.spawn(
            ChildProcess.make('bun', [
              entry,
              'mcp',
              '--root',
              `${input}/missing`,
              '--output-dir',
              output,
            ]),
          );
          const [stdout, stderr, status] = yield* Effect.all(
            [
              child.stdout.pipe(Stream.decodeText(), Stream.mkString),
              child.stderr.pipe(Stream.decodeText(), Stream.mkString),
              child.exitCode,
            ],
            { concurrency: 'unbounded' },
          );
          expect(status).toBe(1);
          expect(stdout).toBe('');
          expect(stderr).toContain('LocalBoardError');
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    { timeout: 20_000 },
  );
  it.effect(
    'runs read-only CLI actions without permission flags',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { args } = yield* folders;
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
          const child = yield* spawner.spawn(
            ChildProcess.make('bun', [entry, 'list_boards', ...args]),
          );
          const output = yield* child.stdout.pipe(
            Stream.decodeText(),
            Stream.mkString,
          );
          const status = yield* child.exitCode;
          expect(status).toBe(0);
          const result = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(
              Schema.Struct({
                files: Schema.Array(Schema.String),
                truncated: Schema.Boolean,
              }),
            ),
          )(output.trim());
          expect(result).toEqual({ files: [], truncated: false });
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    { timeout: 20_000 },
  );

  it.effect(
    'negotiates MCP with only approved local folders and protocol-only stdout',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { args } = yield* folders;
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
          const packet = new TextEncoder().encode(
            `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'startup-regression', version: '1.0.0' } } })}\n`,
          );
          const child = yield* spawner.spawn(
            ChildProcess.make('bun', [entry, 'mcp', ...args], {
              stdin: { stream: Stream.make(packet), endOnDone: false },
            }),
          );
          const response = yield* child.stdout.pipe(
            Stream.decodeText(),
            Stream.splitLines,
            Stream.filter((line) => line.trim().length > 0),
            Stream.mapEffect((line) =>
              Schema.decodeUnknownEffect(Schema.fromJsonString(Hello))(line),
            ),
            Stream.filter((message) => message.id === 1),
            Stream.runHead,
          );
          expect(Option.isSome(response)).toBe(true);
          if (Option.isSome(response)) {
            expect(response.value.result?.protocolVersion).toBe('2025-11-25');
            expect(response.value.result?.serverInfo.name).toBe('moodboard');
          }
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    { timeout: 20_000 },
  );
});
