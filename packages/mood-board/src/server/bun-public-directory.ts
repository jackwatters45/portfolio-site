import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { Option, Schema } from "effect";

import type { AccountId } from "../lib/account";
import type { BoardId } from "../lib/board-rpc";
import { ProfileHandleSchema, type ProfileHandle, type PublicId } from "../lib/public-api";
import { NonNegativeIntegerSchema } from "../lib/schema";
import { AUTH_SCHEMA_SQL } from "./auth-schema";
import { decodeCatalogRouteUserId } from "./catalog-route";

const PublicDirectoryTimestampSchema = NonNegativeIntegerSchema.pipe(
  Schema.brand("PublicDirectoryTimestamp"),
);
type PublicDirectoryTimestamp = typeof PublicDirectoryTimestampSchema.Type;

export interface BunPublicDirectory {
  readonly profileAccount: (handle: ProfileHandle) => AccountId | null;
  readonly profileHandle: (accountId: AccountId) => ProfileHandle | null;
  readonly boardAccount: (publicId: PublicId) => AccountId | null;
  readonly setProfile: (accountId: AccountId, handle: ProfileHandle) => void;
  readonly removeProfile: (accountId: AccountId) => void;
  readonly setBoard: (accountId: AccountId, boardId: BoardId, publicId: PublicId) => void;
  readonly removeBoard: (accountId: AccountId, boardId: BoardId) => void;
  readonly close: () => void;
}

export const openBunPublicDirectory = (databasePath: string): BunPublicDirectory => {
  const directory = dirname(databasePath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const database = new Database(databasePath, { create: true });
  chmodSync(databasePath, 0o600);
  database.exec(AUTH_SCHEMA_SQL);

  const profileAccount = database.query<{ readonly userId: unknown }, [string]>(
    'SELECT "userId" FROM "public_profile_route" WHERE "handle" = ? COLLATE NOCASE',
  );
  const profileHandle = database.query<{ readonly handle: unknown }, [string]>(
    'SELECT "handle" FROM "public_profile_route" WHERE "userId" = ?',
  );
  const boardAccount = database.query<{ readonly userId: unknown }, [string]>(
    'SELECT "userId" FROM "public_board_route" WHERE "publicId" = ?',
  );
  const decodeProfileHandle = Schema.decodeUnknownOption(ProfileHandleSchema);
  const removeProfiles = database.query<unknown, [string]>(
    'DELETE FROM "public_profile_route" WHERE "userId" = ?',
  );
  const insertProfile = database.query<unknown, [string, string, PublicDirectoryTimestamp]>(`
    INSERT INTO "public_profile_route" ("handle", "userId", "updatedAt")
    VALUES (?, ?, ?)
  `);
  const insertBoard = database.query<unknown, [string, string, string, PublicDirectoryTimestamp]>(`
    INSERT INTO "public_board_route" ("publicId", "userId", "boardId", "updatedAt")
    VALUES (?, ?, ?, ?)
    ON CONFLICT("userId", "boardId") DO UPDATE SET
      "publicId" = excluded."publicId",
      "updatedAt" = excluded."updatedAt"
  `);
  const removeBoard = database.query<unknown, [string, string]>(
    'DELETE FROM "public_board_route" WHERE "userId" = ? AND "boardId" = ?',
  );

  return {
    profileAccount: (handle) => decodeCatalogRouteUserId(profileAccount.get(handle)),
    profileHandle: (accountId) =>
      Option.getOrNull(decodeProfileHandle(profileHandle.get(accountId)?.handle)),
    boardAccount: (publicId) => decodeCatalogRouteUserId(boardAccount.get(publicId)),
    setProfile: (accountId, handle) =>
      database.transaction(() => {
        removeProfiles.run(accountId);
        insertProfile.run(handle, accountId, PublicDirectoryTimestampSchema.make(Date.now()));
      })(),
    removeProfile: (accountId) => {
      removeProfiles.run(accountId);
    },
    setBoard: (accountId, boardId, publicId) => {
      insertBoard.run(
        publicId,
        accountId,
        boardId,
        PublicDirectoryTimestampSchema.make(Date.now()),
      );
    },
    removeBoard: (accountId, boardId) => {
      removeBoard.run(accountId, boardId);
    },
    close: () => database.close(),
  };
};
