import { dirname } from "node:path";

import { BunFileSystem } from "@effect/platform-bun";
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun";
import { Effect, FileSystem, Layer } from "effect";

import { migrationLoader } from "./migrations";

export const makeDatabaseLayer = (filename: string) => {
  const sqlite = Layer.unwrap(
    FileSystem.FileSystem.use((fileSystem) =>
      fileSystem
        .makeDirectory(dirname(filename), { recursive: true })
        .pipe(Effect.as(SqliteClient.layer({ filename }))),
    ),
  ).pipe(Layer.provide(BunFileSystem.layer));

  return SqliteMigrator.layer({ loader: migrationLoader }).pipe(Layer.provideMerge(sqlite));
};
