#!/usr/bin/env bun
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Cause, Console, Effect, Layer, Logger, Schema } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { FetchHttpClient } from 'effect/unstable/http';

import { AccountBoards } from './account-boards';
import { AccountConnection } from './account-connection';
import type { AccountConfig } from './account-contracts';

import { actions } from './actions';
import { BoardRenderer } from './board-renderer';
import { LocalBoardError, MAX_INPUT_BYTES } from './contracts';
import { LocalArchive } from './local-archive';
import { LocalFiles } from './local-files';
import { LocalImages } from './local-images';
import { LocalMedia } from './local-media';
import { mcpLayer } from './mcp';
import { Moodboards } from './moodboards';

const policyFlags = {
  accountOrigin: Flag.String('account-origin').pipe(
    Flag.withDefault(''),
    Flag.withDescription(
      'Explicit HTTPS account origin. Omit to keep all actions local.',
    ),
  ),
  accountSessionDirectory: Flag.String('account-session-dir').pipe(
    Flag.withDefault(''),
    Flag.withDescription(
      'Existing owner-only (0700) session directory outside approved input/output folders.',
    ),
  ),
  allowAccountWrite: Flag.Boolean('allow-account-write').pipe(
    Flag.withDefault(false),
    Flag.withDescription(
      'Allow explicitly confirmed account board writes. Does not enable public publishing.',
    ),
  ),
  assetRoot: Flag.String('root').pipe(
    Flag.withDescription(
      'Explicit absolute path to the approved input folder for images, audio, and archives.',
    ),
  ),
  outputDirectory: Flag.String('output-dir').pipe(
    Flag.withDescription(
      'Explicit absolute path to an existing, separate output folder.',
    ),
  ),
  allowOverwrite: Flag.Boolean('allow-overwrite').pipe(
    Flag.withDefault(false),
    Flag.withDescription(
      'Allow overwrite:true requests to replace export and preview files. Edits always create new files.',
    ),
  ),
  allowDelete: Flag.Boolean('allow-delete').pipe(
    Flag.withDefault(false),
    Flag.withDescription(
      'Allow confirmed deletion of output archives. Disabled by default.',
    ),
  ),
};

const localLayer = (config: AccountConfig) => {
  const resources = Layer.mergeAll(
    LocalFiles.layer(config),
    LocalImages.layer,
    LocalArchive.layer,
  );

  const capabilities = Layer.merge(LocalMedia.layer, BoardRenderer.layer).pipe(
    Layer.provide(resources),
  );

  const account = AccountConnection.layer(config).pipe(
    Layer.provide(FetchHttpClient.layer),
  );

  return Layer.mergeAll(
    Moodboards.layer.pipe(Layer.provide(Layer.merge(resources, capabilities))),
    AccountBoards.layer.pipe(Layer.provide(Layer.merge(resources, account))),
    account,
  );
};

const commands = actions.map((action) =>
  Command.make(
    action.name,
    {
      ...policyFlags,
      input: Flag.String('input').pipe(
        Flag.withDefault('{}'),
        Flag.withDescription(
          'Action parameters as JSON. Use --help and docs/local-agent.md for examples.',
        ),
      ),
    },
    (config) =>
      Effect.gen(function* () {
        if (new TextEncoder().encode(config.input).length > MAX_INPUT_BYTES) {
          return yield* new LocalBoardError({
            code: 'Limit',
            message: 'Action JSON exceeds 256 KiB.',
          });
        }

        const payload = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(Schema.Json),
        )(config.input).pipe(
          Effect.mapError(
            (error) =>
              new LocalBoardError({
                code: 'InvalidInput',
                message: error.message,
              }),
          ),
        );

        const result = yield* action
          .execute(payload)
          .pipe(Effect.provide(localLayer(config)));

        yield* Console.log(JSON.stringify(result.value));
      }),
  ).pipe(Command.withDescription(action.description)),
);

const serve = Command.make('mcp', policyFlags, (config) =>
  Layer.launch(mcpLayer).pipe(Effect.provide(localLayer(config))),
).pipe(
  Command.withDescription(
    'Run the local stdio MCP server. Stdout is reserved for the MCP protocol.',
  ),
);

const cli = Command.make('moodboard').pipe(
  Command.withDescription(
    'Create and edit local moodboards, with optional browser-approved account access. No model or public publishing.',
  ),
  Command.withSubcommands([...commands, serve]),
);

Command.run(cli, { version: '0.1.0' }).pipe(
  Effect.provide(BunServices.layer),
  Effect.tapCause((cause) =>
    Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause),
  ),
  Effect.provideService(Logger.LogToStderr, true),
  BunRuntime.runMain({ disableErrorReporting: true }),
);
