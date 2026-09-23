import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-do';
import { Effect, Layer } from 'effect';

import { migrationLoader } from '../server/migrations';

import { WorkspaceBindings } from './workspace-bindings';

export const DurableDatabase = Layer.unwrap(
  Effect.gen(function* () {
    const { storage } = yield* WorkspaceBindings;

    return SqliteMigrator.layer({ loader: migrationLoader }).pipe(
      Layer.provideMerge(SqliteClient.layer({ storage })),
    );
  }),
);
