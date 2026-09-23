import { Schema } from 'effect';

import { BoardRevisionSchema, MutationIdSchema } from '../lib/board-rpc';
import {
  AccountBoardInput,
  AccountEditOutput,
  AccountError,
} from './account-contracts';
import { BoardCommandError, BoardCommandsSchema } from './board-command-schema';

export const AccountCommandsInput = Schema.Struct({
  ...AccountBoardInput.fields,
  expectedRevision: BoardRevisionSchema,
  mutationId: MutationIdSchema,
  commands: BoardCommandsSchema,
  confirm: Schema.Literal(true),
});

export const AccountCommandsOutput = AccountEditOutput;

export const AccountCommandsError = Schema.Union([
  AccountError,
  BoardCommandError,
]);
