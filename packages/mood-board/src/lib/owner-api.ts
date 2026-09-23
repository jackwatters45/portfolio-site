import { Schema } from 'effect';

import { BoardIdSchema } from './board-rpc';
import { PublicIdSchema, PublicOwnerSchema } from './public-api';

export const OwnerVersionSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);

export const OwnerSnapshotSchema = Schema.Struct({
  profile: Schema.NullOr(PublicOwnerSchema),
  profileVersion: OwnerVersionSchema,
  publications: Schema.Array(
    Schema.Struct({
      boardId: BoardIdSchema,
      publicId: PublicIdSchema,
      version: OwnerVersionSchema,
    }),
  ),
  publicationVersions: Schema.Array(
    Schema.Struct({ boardId: BoardIdSchema, version: OwnerVersionSchema }),
  ),
});

export type OwnerSnapshot = typeof OwnerSnapshotSchema.Type;

export const ConfigureOwnerProfileSchema = Schema.Struct({
  handle: Schema.String,
  displayName: Schema.String,
  bio: Schema.String,
  expectedProfileVersion: OwnerVersionSchema,
});

export type ConfigureOwnerProfile = typeof ConfigureOwnerProfileSchema.Type;

export const PublicationGuardSchema = Schema.Struct({
  expectedRevision: OwnerVersionSchema,
  expectedPublicationVersion: OwnerVersionSchema,
  expectedProfileVersion: OwnerVersionSchema,
});

export type PublicationGuard = typeof PublicationGuardSchema.Type;

export class OwnerError extends Schema.TaggedError<OwnerError>()('OwnerError', {
  code: Schema.Literals([
    'Invalid',
    'NotFound',
    'Conflict',
    'HandleTaken',
    'Persistence',
    'Projection',
  ]),
  message: Schema.String,
  state: Schema.optional(OwnerSnapshotSchema),
}) {}

// Set only by the authenticated Worker. Never trust this header from the internet.
export const OWNER_ACCOUNT_HEADER = 'x-mood-board-owner-account';
