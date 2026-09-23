import { Effect, Schema } from 'effect';

import type { AccountArchive } from './account-archive';
import type { AccountBoards } from './account-boards';
import type { AccountConnection } from './account-connection';
import type { AccountError } from './account-contracts';
import {
  LocalBoardError,
  MAX_INPUT_BYTES,
  type PreviewImage,
} from './contracts';
import type { Moodboards } from './moodboards';

import type { AccountClient } from './account-client';
import type { AccountEditing } from './account-editing';
import type { AccountMedia } from './account-media';
import type { AccountMediaPartialError } from './account-media-contracts';
import type { AccountOwner } from './account-owner';
import type { BoardCommandError } from './board-command-schema';

export type ActionServices =
  | Moodboards
  | AccountBoards
  | AccountConnection
  | AccountEditing
  | AccountMedia
  | AccountClient
  | AccountOwner
  | AccountArchive;

type ActionValue<A> = { readonly value: A; readonly image?: PreviewImage };

type ActionDefinition<P, S> = {
  readonly name: string;
  readonly description: string;
  readonly input: Schema.Codec<P, unknown>;
  readonly output: Schema.Codec<S, unknown>;
  readonly readOnly: boolean;
  readonly destructive: boolean;
  readonly openWorld?: boolean;
  readonly handle: (
    input: P,
  ) => Effect.Effect<
    ActionValue<S>,
    | LocalBoardError
    | AccountError
    | BoardCommandError
    | AccountMediaPartialError,
    ActionServices
  >;
};

// CLI and MCP share validation, handlers, and output encoding. Secrets are never action outputs.
export const action = <P, S>(definition: ActionDefinition<P, S>) => ({
  ...definition,
  execute: Effect.fn(`MoodboardAction.${definition.name}`)(function* (
    payload: Schema.Json,
  ) {
    if (
      new TextEncoder().encode(JSON.stringify(payload)).length > MAX_INPUT_BYTES
    )
      return yield* new LocalBoardError({
        code: 'Limit',
        message: 'Action JSON exceeds 256 KiB.',
      });

    const input = yield* Schema.decodeUnknownEffect(definition.input)(payload, {
      onExcessProperty: 'error',
    }).pipe(
      Effect.mapError(
        (error) =>
          new LocalBoardError({ code: 'InvalidInput', message: error.message }),
      ),
    );

    const result = yield* definition.handle(input);

    const encoded = yield* Schema.encodeEffect(
      Schema.fromJsonString(definition.output),
    )(result.value).pipe(Effect.orDie);

    const value = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(Schema.JsonObject),
    )(encoded).pipe(Effect.orDie);

    return { value, image: result.image };
  }),
});
