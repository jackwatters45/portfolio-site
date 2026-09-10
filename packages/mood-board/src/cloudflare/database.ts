import type { DurableObjectStorage } from "@cloudflare/workers-types";
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-do";
import { Layer } from "effect";

import { migrationLoader } from "../server/migrations";

export const makeDurableDatabaseLayer = (storage: DurableObjectStorage) =>
  SqliteMigrator.layer({ loader: migrationLoader }).pipe(
    Layer.provideMerge(SqliteClient.layer({ storage })),
  );
