import {
  Context,
  Effect,
  Layer,
  Option,
  Predicate,
  Schema,
  Stream,
} from 'effect';

import { fitCamera } from '../client/board/camera';
import { boardMediaReferences, MAX_ARCHIVE_BYTES } from '../lib/board-archive';
import {
  BoardRevisionSchema,
  ClientIdSchema,
  MutationIdSchema,
} from '../lib/board-rpc';
import { type MediaId } from '../lib/media';
import {
  AccountClient,
  type AccountRpcClient,
  type AccountSession,
} from './account-client';
import { AccountConnection } from './account-connection';
import {
  AccountBoardInput,
  AccountEditOutput,
  AccountError,
  AccountReference,
} from './account-contracts';
import {
  downloadAccountAsset,
  uploadAccountAsset,
} from './account-media-transfer';
import { BoardRenderer } from './board-renderer';
import {
  ArchiveName,
  BoardReferenceSchema,
  LocalBoardError,
  OutputName,
} from './contracts';
import { LocalArchive, type LocalAsset } from './local-archive';
import { contentHash, LocalFiles } from './local-files';
import { LocalImages } from './local-images';

export const AccountExportInput = Schema.Struct({
  ...AccountBoardInput.fields,
  output: ArchiveName,
  overwrite: Schema.optional(Schema.Boolean),
});

export const AccountExportOutput = Schema.Struct({
  account: AccountReference,
  boardId: AccountBoardInput.fields.boardId,
  revision: BoardRevisionSchema,
  board: BoardReferenceSchema,
  output: Schema.String,
  byteLength: Schema.Int,
  mediaCount: Schema.Int,
});

export const AccountPreviewInput = Schema.Struct({
  ...AccountBoardInput.fields,
  output: OutputName,
  overwrite: Schema.optional(Schema.Boolean),
});

export const AccountPreviewOutput = Schema.Struct({
  account: AccountReference,
  boardId: AccountBoardInput.fields.boardId,
  revision: BoardRevisionSchema,
  output: Schema.String,
  mimeType: Schema.Literal('image/jpeg'),
  width: Schema.Int,
  height: Schema.Int,
  byteLength: Schema.Int,
  warnings: Schema.Array(Schema.String),
});

export const AccountRestoreInput = Schema.Struct({
  ...AccountBoardInput.fields,
  board: BoardReferenceSchema,
  expectedRevision: BoardRevisionSchema,
  mutationId: MutationIdSchema,
  confirm: Schema.Literal(true),
});

export const AccountRestoreOutput = AccountEditOutput;

const snapshot = Effect.fn('AccountArchive.snapshot')(function* (
  rpc: AccountRpcClient,
  input: typeof AccountBoardInput.Type,
) {
  const result = yield* rpc
    .SubscribeBoard({ boardId: input.boardId })
    .pipe(Stream.runHead);

  if (Option.isNone(result) || !Predicate.isTagged(result.value, 'Snapshot'))
    return yield* new AccountError({
      code: 'Remote',
      message: 'No board snapshot was returned.',
    });

  return result.value;
});

const make = Effect.gen(function* () {
  const client = yield* AccountClient;
  const connection = yield* AccountConnection;
  const images = yield* LocalImages;
  const archive = yield* LocalArchive;
  const files = yield* LocalFiles;
  const renderer = yield* BoardRenderer;

  const capture = Effect.fn('AccountArchive.capture')(function* (
    rpc: AccountRpcClient,
    session: AccountSession,
    input: typeof AccountBoardInput.Type,
  ) {
    const current = yield* snapshot(rpc, input);

    const board = {
      ...current.board,
      items: current.board.items.map((item) => ({ ...item })),
    };

    const references = yield* Effect.try({
      try: () => boardMediaReferences(board),
      catch: () =>
        new AccountError({
          code: 'Remote',
          message: 'Board media references are invalid.',
        }),
    });

    const media = new Map<MediaId, LocalAsset>();
    let bytes = 0;

    for (const [mediaId, kind] of references) {
      const asset = yield* downloadAccountAsset(
        session,
        mediaId,
        kind,
        MAX_ARCHIVE_BYTES - bytes,
      ).pipe(Effect.provideService(LocalImages, images));

      bytes += asset.bytes.length;
      media.set(mediaId, asset);
    }

    const document = yield* archive.validate({
      board,
      media,
      camera: fitCamera(board.items, { width: 1440, height: 900 }),
    });

    return { revision: current.revision, document };
  });

  const exportBoard = Effect.fn('AccountArchive.export')(
    (input: typeof AccountExportInput.Type) =>
      client.read(input.account, (rpc, session) =>
        Effect.gen(function* () {
          yield* files.checkOutput(
            input.output,
            '.moodboard',
            input.overwrite ?? false,
          );
          const { revision, document } = yield* capture(rpc, session, input);
          const bytes = yield* archive.encode(document);

          const output = yield* files.writeOutput(
            input.output,
            '.moodboard',
            bytes,
            input.overwrite ?? false,
          );

          return {
            account: session.reference,
            boardId: input.boardId,
            revision,
            board: { file: input.output, sha256: contentHash(bytes) },
            output,
            byteLength: bytes.length,
            mediaCount: document.media.size,
          };
        }),
      ),
  );

  const preview = Effect.fn('AccountArchive.preview')(
    (input: typeof AccountPreviewInput.Type) =>
      client.read(input.account, (rpc, session) =>
        Effect.gen(function* () {
          yield* files.checkOutput(
            input.output,
            '.jpg',
            input.overwrite ?? false,
          );
          const { revision, document } = yield* capture(rpc, session, input);
          const rendered = yield* renderer.render(document);

          const output = yield* files.writeOutput(
            input.output,
            '.jpg',
            rendered.image.bytes,
            input.overwrite ?? false,
          );

          return {
            value: {
              account: session.reference,
              boardId: input.boardId,
              revision,
              output,
              mimeType: 'image/jpeg' as const,
              width: rendered.image.width,
              height: rendered.image.height,
              byteLength: rendered.image.bytes.length,
              warnings: rendered.warnings,
            },
            image: rendered.image,
          };
        }),
      ),
  );

  const restore = Effect.fn('AccountArchive.restore')(
    (input: typeof AccountRestoreInput.Type) =>
      client.write(input, (rpc, session) =>
        Effect.gen(function* () {
          const bytes = yield* files.readBoard(input.board.file);

          if (contentHash(bytes) !== input.board.sha256)
            return yield* new LocalBoardError({
              code: 'Changed',
              message:
                'The checkpoint changed. Inspect it again before restoring.',
            });
          const document = yield* archive.read(bytes);
          const current = yield* snapshot(rpc, input);

          if (current.revision !== input.expectedRevision)
            return yield* new AccountError({
              code: 'Conflict',
              message:
                'The board changed. Read its current revision before restoring.',
            });
          const url = `${session.reference.origin}/boards/${encodeURIComponent(input.boardId)}`;

          return yield* Effect.gen(function* () {
            const ids = new Map<MediaId, MediaId>();

            for (const asset of document.media.values()) {
              const receipt = yield* uploadAccountAsset(session, asset).pipe(
                Effect.provideService(AccountConnection, connection),
              );

              ids.set(asset.mediaId, receipt.mediaId);
            }

            const remap = (
              id: MediaId,
            ): Effect.Effect<MediaId, AccountError> => {
              const mapped = ids.get(id);

              return mapped === undefined
                ? Effect.fail(
                    new AccountError({
                      code: 'Remote',
                      message: 'Missing uploaded checkpoint media.',
                    }),
                  )
                : Effect.succeed(mapped);
            };

            const upserts = yield* Effect.forEach(
              document.board.items,
              (item) =>
                item.mediaId === undefined
                  ? Effect.succeed(item)
                  : remap(item.mediaId).pipe(
                      Effect.map((mediaId) => ({ ...item, mediaId })),
                    ),
            );

            const backgroundMediaId =
              document.board.backgroundMediaId === undefined
                ? null
                : yield* remap(document.board.backgroundMediaId);

            const keep = new Set(upserts.map((item) => item.id));

            const change = yield* rpc.CommitBoard({
              boardId: input.boardId,
              expectedRevision: input.expectedRevision,
              mutationId: input.mutationId,
              clientId: ClientIdSchema.make('moodboard-agent'),
              title: document.board.title,
              background: document.board.background ?? null,
              backgroundMediaId,
              upserts,
              deletes: current.board.items
                .filter((item) => !keep.has(item.id))
                .map((item) => item.id),
            });

            return {
              account: session.reference,
              boardId: input.boardId,
              revision: change.revision,
              url,
            };
          }).pipe(
            Effect.mapError(
              (error) =>
                new AccountError({
                  code: 'PartialSave',
                  boardId: input.boardId,
                  url,
                  diagnostic:
                    error instanceof AccountError
                      ? error.diagnostic
                      : undefined,
                  message:
                    'Checkpoint restoration did not finish cleanly. Read the board before retrying. Uploaded media may remain. No retry or rollback was attempted.',
                }),
            ),
          );
        }),
      ),
  );

  return { export: exportBoard, preview, restore };
});

export class AccountArchive extends Context.Service<
  AccountArchive,
  Effect.Success<typeof make>
>()('moodboard/mcp/AccountArchive') {
  static readonly layer = Layer.effect(this, make);
}
