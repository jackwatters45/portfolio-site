import { Context, Effect, Layer, Schema } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';

import type { BoardId } from '../lib/board-rpc';
import {
  OwnerError,
  OwnerSnapshotSchema,
  type PublicationGuard,
} from '../lib/owner-api';
import { PublicIdSchema, type PublicOwner } from '../lib/public-api';
import { PublishingRepo } from './publishing-repo';

export class OwnerRepo extends Context.Service<
  OwnerRepo,
  {
    readonly read: () => Effect.Effect<
      typeof OwnerSnapshotSchema.Type,
      OwnerError
    >;
    readonly configure: (
      profile: PublicOwner,
      expectedVersion: number,
    ) => Effect.Effect<typeof OwnerSnapshotSchema.Type, OwnerError>;
    readonly publish: (
      boardId: BoardId,
      guard: PublicationGuard,
      published: boolean,
    ) => Effect.Effect<typeof OwnerSnapshotSchema.Type, OwnerError>;
  }
>()('mood-board/OwnerRepo') {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const publishing = yield* PublishingRepo;

      const persistence = () =>
        new OwnerError({
          code: 'Persistence',
          message: 'Owner data could not be read or written.',
        });

      const read = Effect.fn('OwnerRepo.read')(function* () {
        const profiles = yield* sql<{
          handle: string;
          display_name: string;
          bio: string;
        }>`SELECT handle, display_name, bio FROM publisher_profile WHERE singleton = 1`;

        const versions = yield* sql<{
          version: number;
        }>`SELECT version FROM owner_profile_version WHERE singleton = 1`;

        const publications = yield* sql<{
          boardId: string;
          publicId: string;
          version: number;
        }>`SELECT p.board_id AS boardId, p.public_id AS publicId, COALESCE(v.version, 0) AS version FROM board_publications p LEFT JOIN owner_publication_versions v ON v.board_id = p.board_id ORDER BY p.board_id`;

        const publicationVersions = yield* sql<{
          boardId: string;
          version: number;
        }>`SELECT board_id AS boardId, version FROM owner_publication_versions ORDER BY board_id`;

        const profile = profiles[0];

        return yield* Schema.decodeUnknownEffect(OwnerSnapshotSchema)({
          profile:
            profile === undefined
              ? null
              : {
                  handle: profile.handle,
                  displayName: profile.display_name,
                  bio: profile.bio,
                },
          profileVersion: versions[0]?.version ?? 0,
          publications,
          publicationVersions,
        }).pipe(Effect.mapError(persistence));
      });

      const conflict = () =>
        new OwnerError({
          code: 'Conflict',
          message:
            'Owner settings or board revision changed. Read current state before retrying.',
        });

      const configure = Effect.fn('OwnerRepo.configure')(function* (
        profile: PublicOwner,
        expectedVersion: number,
      ) {
        return yield* sql
          .withTransaction(
            Effect.gen(function* () {
              const state = yield* read();

              if (state.profileVersion !== expectedVersion)
                return yield* conflict();
              yield* publishing.upsertProfile(
                profile.handle,
                profile.displayName,
                profile.bio,
              );
              yield* sql`UPDATE owner_profile_version SET version = version + 1 WHERE singleton = 1`;

              return yield* read();
            }),
          )
          .pipe(Effect.catchTag('SqlError', persistence));
      });

      const publish = Effect.fn('OwnerRepo.publish')(function* (
        boardId: BoardId,
        guard: PublicationGuard,
        published: boolean,
      ) {
        return yield* sql
          .withTransaction(
            Effect.gen(function* () {
              const state = yield* read();

              const boards = yield* sql<{
                revision: number;
              }>`SELECT revision FROM boards WHERE id = ${boardId}`;

              const board = boards[0];

              if (board === undefined)
                return yield* new OwnerError({
                  code: 'NotFound',
                  message: 'Board not found.',
                });

              const version =
                state.publicationVersions.find(
                  (entry) => entry.boardId === boardId,
                )?.version ?? 0;

              if (
                board.revision !== guard.expectedRevision ||
                version !== guard.expectedPublicationVersion ||
                state.profileVersion !== guard.expectedProfileVersion
              )
                return yield* conflict();

              if (published && state.profile === null)
                return yield* new OwnerError({
                  code: 'Invalid',
                  message: 'Configure a publisher profile before publishing.',
                });

              const existing = state.publications.some(
                (entry) => entry.boardId === boardId,
              );

              if (published !== existing) {
                if (published)
                  yield* publishing.publish(
                    boardId,
                    PublicIdSchema.make(
                      crypto.randomUUID().replaceAll('-', ''),
                    ),
                  );
                else yield* publishing.unpublish(boardId);
                yield* sql`INSERT INTO owner_publication_versions (board_id, version) VALUES (${boardId}, 1) ON CONFLICT(board_id) DO UPDATE SET version = version + 1`;
              }

              return yield* read();
            }),
          )
          .pipe(Effect.catchTag('SqlError', persistence));
      });

      return OwnerRepo.of({
        read: () =>
          sql
            .withTransaction(read())
            .pipe(Effect.catchTag('SqlError', persistence)),
        configure,
        publish,
      });
    }),
  ).pipe(Layer.provide(PublishingRepo.layer));
}
