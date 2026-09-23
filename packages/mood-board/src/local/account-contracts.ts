import { Schema } from 'effect';

import { AccountIdSchema } from '../lib/account';
import { AGENT_USER_CODE } from '../lib/agent-auth';
import {
  BoardIdSchema,
  BoardMutationPayloadSchema,
  BoardRevisionSchema,
  BoardSnapshotSchema,
  BoardSummarySchema,
  MutationIdSchema,
} from '../lib/board-rpc';
import { BoardReferenceSchema, type LocalConfig } from './contracts';

export type AccountConfig = LocalConfig & {
  readonly accountOrigin: string;
  readonly accountSessionDirectory: string;
  readonly allowAccountWrite: boolean;
};

export class AccountError extends Schema.TaggedError<AccountError>()(
  'AccountError',
  {
    code: Schema.Literals([
      'NotConfigured',
      'Authentication',
      'Credentials',
      'Remote',
      'Conflict',
      'PartialSave',
      'Busy',
      'AccessDenied',
    ]),
    message: Schema.String,
    boardId: Schema.optional(BoardIdSchema),
    url: Schema.optional(Schema.String),
  },
) {}

export const AccountIdentity = Schema.Struct({
  id: AccountIdSchema,
  email: Schema.String,
  name: Schema.String,
});

export const AccountReference = Schema.Struct({
  origin: Schema.String,
  id: AccountIdSchema,
});

export const AccountStatusOutput = Schema.Struct({
  account: AccountIdentity,
  origin: Schema.String,
  writesAllowed: Schema.Boolean,
});

export const AccountConnectOutput = Schema.Struct({
  userCode: AGENT_USER_CODE,
  verificationUrl: Schema.String,
  expiresAt: Schema.Number,
});

export const AccountCompleteInput = Schema.Struct({
  userCode: AGENT_USER_CODE,
});

export const AccountCompleteOutput = Schema.Struct({
  status: Schema.Literals(['pending', 'connected']),
  retryAfterSeconds: Schema.optional(Schema.Number),
  account: Schema.optional(AccountIdentity),
  origin: Schema.String,
});

export const AccountDisconnectInput = Schema.Struct({
  account: AccountReference,
  confirm: Schema.Literal(true),
});

export const AccountDisconnectOutput = Schema.Struct({
  disconnected: Schema.Literal(true),
});

export const AccountListOutput = Schema.Struct({
  account: AccountReference,
  boards: Schema.Array(BoardSummarySchema),
});

export const AccountBoardInput = Schema.Struct({
  account: AccountReference,
  boardId: BoardIdSchema,
});

export const AccountBoardOutput = Schema.Struct({
  account: AccountReference,
  snapshot: BoardSnapshotSchema,
  url: Schema.String,
});

export const AccountEditInput = Schema.Struct({
  ...AccountBoardInput.fields,
  expectedRevision: BoardRevisionSchema,
  mutationId: MutationIdSchema,
  ...BoardMutationPayloadSchema.fields,
  confirm: Schema.Literal(true),
});

export const AccountEditOutput = Schema.Struct({
  account: AccountReference,
  boardId: BoardIdSchema,
  revision: BoardRevisionSchema,
  url: Schema.String,
});

export const AccountSaveInput = Schema.Struct({
  account: AccountReference,
  board: BoardReferenceSchema,
  boardId: BoardIdSchema,
  confirm: Schema.Literal(true),
});

export const AccountSaveOutput = Schema.Struct({
  ...AccountEditOutput.fields,
  source: BoardReferenceSchema,
  mediaCount: Schema.Int,
  published: Schema.Literal(false),
});
