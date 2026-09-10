import { join } from "node:path";

import { Cause, Duration, Effect, Option, Schedule, Schema } from "effect";

import { decodeAccountId } from "../src/lib/account";
import { BoardIdSchema, type BoardId } from "../src/lib/board-rpc";
import { normalizeProfileHandle } from "../src/lib/public-api";
import { openBunPublicDirectory } from "../src/server/bun-public-directory";
import { workspaceDirectoryName } from "../src/server/bun-workspace";
import { makeDatabaseLayer } from "../src/server/database";
import { PublishingService } from "../src/server/publishing-service";

const args = process.argv.slice(2);
const command = args[0];

const option = (name: string): string | null => {
  const index = args.indexOf(name);
  return index < 0 ? null : (args[index + 1] ?? null);
};

const rawAccountId = option("--account-id") ?? process.env.PUBLISHER_ACCOUNT_ID ?? null;
const accountId = decodeAccountId(rawAccountId);
const authDatabasePath = process.env.AUTH_DB_PATH ?? "data/mood-board-auth.sqlite";
const workspaceRoot = process.env.WORKSPACE_PATH ?? "data/mood-board.sqlite.workspaces";
const legacyWorkspaceOwnerId = decodeAccountId(process.env.LEGACY_WORKSPACE_OWNER_ID?.trim());
const databasePath =
  accountId === null
    ? ""
    : accountId === legacyWorkspaceOwnerId
      ? (process.env.DB_PATH ?? "data/mood-board.sqlite")
      : join(workspaceRoot, workspaceDirectoryName(accountId), "workspace.sqlite");

const usage = () => {
  console.error(`Usage:
  bun scripts/bootstrap-publisher.ts profile --account-id <user-id> --handle <handle> --name <display name> [--bio <bio>]
  bun scripts/bootstrap-publisher.ts publish <board-id> --account-id <user-id>
  bun scripts/bootstrap-publisher.ts unpublish <board-id> --account-id <user-id>

PUBLISHER_ACCOUNT_ID may replace --account-id. AUTH_DB_PATH and WORKSPACE_PATH
must point at the same deployment used by the server.`);
  process.exitCode = 1;
};

const decodeBoardId = Schema.decodeUnknownOption(BoardIdSchema);

const asBoardId = (value: string | undefined): BoardId | null =>
  value === undefined ? null : Option.getOrNull(decodeBoardId(value));

if (command === undefined || accountId === null) {
  usage();
} else {
  const directory = openBunPublicDirectory(authDatabasePath);
  const program = PublishingService.use((publishing) =>
    Effect.gen(function* () {
      if (command === "profile") {
        const handle = option("--handle");
        const displayName = option("--name");
        const bio = option("--bio") ?? "";
        const normalizedHandle = handle === null ? null : normalizeProfileHandle(handle);
        if (normalizedHandle === null || displayName === null) {
          return yield* Effect.fail(new Error("Missing or invalid profile options."));
        }
        const previousHandle = directory.profileHandle(accountId);
        yield* Effect.try({
          try: () => directory.setProfile(accountId, normalizedHandle),
          catch: () => new Error("That public handle is already in use."),
        });
        const profile = yield* publishing
          .configureProfile({
            handle: normalizedHandle,
            displayName,
            bio,
          })
          .pipe(
            Effect.onError(() =>
              Effect.sync(() => {
                if (previousHandle === null) directory.removeProfile(accountId);
                else directory.setProfile(accountId, previousHandle);
              }),
            ),
          );
        console.log(JSON.stringify(profile, null, 2));
        return;
      }

      if (command === "publish") {
        const boardId = asBoardId(args[1]);
        if (boardId === null) return yield* Effect.fail(new Error("A valid board id is required."));
        const publicId = yield* publishing.publish(boardId);
        yield* Effect.sync(() => directory.setBoard(accountId, boardId, publicId));
        console.log(
          JSON.stringify({ boardId, publicId, sharePath: `/share/${publicId}` }, null, 2),
        );
        return;
      }

      if (command === "unpublish") {
        const boardId = asBoardId(args[1]);
        if (boardId === null) return yield* Effect.fail(new Error("A valid board id is required."));
        const unpublished = yield* publishing.unpublish(boardId);
        if (unpublished) yield* Effect.sync(() => directory.removeBoard(accountId, boardId));
        console.log(JSON.stringify({ boardId, unpublished }, null, 2));
        return;
      }

      return yield* Effect.fail(new Error("Unknown publisher command."));
    }),
  );

  await Effect.runPromise(
    program.pipe(
      Effect.retry(
        Schedule.recurs(6).pipe(Schedule.addDelay(() => Effect.succeed(Duration.millis(75)))),
      ),
      Effect.provide(PublishingService.layer),
      Effect.provide(makeDatabaseLayer(databasePath)),
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          console.error(Cause.pretty(cause));
          usage();
        }),
      ),
      Effect.ensuring(Effect.sync(() => directory.close())),
    ),
  );
}
