import {
  Context,
  Effect,
  Layer,
  Option,
  Predicate,
  Schema,
  Stream,
} from 'effect';

import {
  BoardItemArraySchema,
  BoardItemSchema,
  ClientIdSchema,
} from '../lib/board-rpc';
import {
  hasValidMediaMagic,
  mediaByteLimit,
  type MediaUploadResponse,
} from '../lib/media';
import { AccountClient } from './account-client';
import { AccountConnection } from './account-connection';
import { AccountError } from './account-contracts';
import {
  AccountMediaPartialError,
  type AccountMediaPrepareInput,
  type AccountMediaUploadInput,
  type AccountMediaReadInput,
} from './account-media-contracts';
import {
  downloadAccountAsset,
  uploadAccountAsset,
} from './account-media-transfer';
import { LocalBoardError } from './contracts';
import { contentHash, LocalFiles } from './local-files';
import { LocalImages } from './local-images';
import { LocalMedia } from './local-media';

const invalid = (message: string) =>
  new LocalBoardError({ code: 'InvalidInput', message });

const remote = (message: string) =>
  new AccountError({ code: 'Remote', message });

const extensions = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.webm',
} as const;

const make = Effect.gen(function* () {
  const client = yield* AccountClient;
  const connection = yield* AccountConnection;
  const media = yield* LocalMedia;
  const images = yield* LocalImages;
  const files = yield* LocalFiles;

  const prepareAsset = Effect.fn('AccountMedia.prepareAsset')(function* (
    input: typeof AccountMediaPrepareInput.Type,
  ) {
    const budget = { used: 0 };

    const asset =
      input.kind === 'image'
        ? yield* media.photo(input.source, budget)
        : yield* media.audio(input.source, budget);

    if (
      asset.bytes.length > mediaByteLimit(input.kind) ||
      !hasValidMediaMagic(asset.kind, asset.mimeType, asset.bytes)
    )
      return yield* invalid(
        'Prepared media exceeds its byte limit or has an invalid signature.',
      );

    return asset;
  });

  const prepare = Effect.fn('AccountMedia.prepare')(function* (
    input: typeof AccountMediaPrepareInput.Type,
  ) {
    const asset = yield* prepareAsset(input);

    return {
      ...input,
      sha256: contentHash(asset.bytes),
      mimeType: asset.mimeType,
      byteLength: asset.bytes.length,
      width: 'width' in asset ? asset.width : undefined,
      height: 'height' in asset ? asset.height : undefined,
    };
  });

  const upload = Effect.fn('AccountMedia.upload')(
    (input: typeof AccountMediaUploadInput.Type) =>
      client.write(input, (rpc, session) =>
        Effect.gen(function* () {
          if (input.target === 'background' && input.prepared.kind !== 'image')
            return yield* invalid('A background requires an image.');

          if (input.target === 'item' && input.item === undefined)
            return yield* invalid('An item upload requires item placement.');
          const asset = yield* prepareAsset(input.prepared);

          if (
            contentHash(asset.bytes) !== input.prepared.sha256 ||
            asset.mimeType !== input.prepared.mimeType ||
            asset.bytes.length !== input.prepared.byteLength
          )
            return yield* invalid(
              'Prepared media changed. Prepare the source again.',
            );

          // Validate placement before creating managed media. The receipt replaces this temporary media id.
          const item =
            input.target === 'item' && input.item !== undefined
              ? yield* Schema.decodeUnknownEffect(BoardItemSchema)({
                  ...input.item,
                  kind: asset.kind,
                  mediaId: asset.mediaId,
                }).pipe(
                  Effect.mapError(() =>
                    invalid('Invalid media item placement.'),
                  ),
                )
              : undefined;

          const head = yield* rpc
            .SubscribeBoard({ boardId: input.boardId })
            .pipe(Stream.runHead);

          if (
            Option.isNone(head) ||
            !Predicate.isTagged(head.value, 'Snapshot')
          )
            return yield* remote('No board snapshot was returned.');

          if (head.value.revision !== input.expectedRevision)
            return yield* new AccountError({
              code: 'Conflict',
              message: 'The board changed. Read it before uploading.',
            });

          if (item !== undefined) {
            if (
              head.value.board.items.some((existing) => existing.id === item.id)
            )
              return yield* invalid(
                'The item id already exists. Choose a new item id.',
              );
            yield* Schema.decodeUnknownEffect(BoardItemArraySchema)([
              ...head.value.board.items,
              item,
            ]).pipe(
              Effect.mapError(() =>
                invalid('Adding this media item would exceed board limits.'),
              ),
            );
          }

          const receipts: MediaUploadResponse[] = [];

          return yield* Effect.gen(function* () {
            const receipt = yield* uploadAccountAsset(session, asset).pipe(
              Effect.provideService(AccountConnection, connection),
            );

            receipts.push(receipt);

            const mutation = {
              boardId: input.boardId,
              expectedRevision: input.expectedRevision,
              clientId: ClientIdSchema.make('moodboard-agent'),
              mutationId: input.mutationId,
              upserts:
                item === undefined
                  ? []
                  : [{ ...item, mediaId: receipt.mediaId }],
              deletes: [],
            };

            const change = yield* rpc.CommitBoard(
              input.target === 'background'
                ? { ...mutation, backgroundMediaId: receipt.mediaId }
                : mutation,
            );

            return {
              account: session.reference,
              boardId: input.boardId,
              revision: change.revision,
              url: `${session.reference.origin}/boards/${encodeURIComponent(input.boardId)}`,
              receipt,
            };
          }).pipe(
            Effect.mapError(
              (error) =>
                new AccountMediaPartialError({
                  account: session.reference,
                  boardId: input.boardId,
                  receipts,
                  uploadMayHaveSucceeded: true,
                  diagnostic:
                    error instanceof AccountError
                      ? error.diagnostic
                      : undefined,
                  message:
                    'Media upload or board commit did not finish cleanly. Read this board before any new write. Uploaded media may remain. No retry or deletion was attempted.',
                }),
            ),
          );
        }),
      ),
  );

  const read = Effect.fn('AccountMedia.read')(
    (input: typeof AccountMediaReadInput.Type) =>
      client.read(input.account, (rpc, session) =>
        Effect.gen(function* () {
          const head = yield* rpc
            .SubscribeBoard({ boardId: input.boardId })
            .pipe(Stream.runHead);

          if (
            Option.isNone(head) ||
            !Predicate.isTagged(head.value, 'Snapshot')
          )
            return yield* remote('No board snapshot was returned.');
          const snapshot = head.value;

          const referenced =
            (input.kind === 'image' &&
              snapshot.board.backgroundMediaId === input.mediaId) ||
            snapshot.board.items.some(
              (item) =>
                item.kind === input.kind && item.mediaId === input.mediaId,
            );

          if (!referenced)
            return yield* invalid(
              'The board does not reference this media with the requested kind.',
            );

          const { bytes, mimeType } = yield* downloadAccountAsset(
            session,
            input.mediaId,
            input.kind,
            mediaByteLimit(input.kind),
          ).pipe(Effect.provideService(LocalImages, images));

          const extension = extensions[mimeType];

          const output = yield* files.writeOutput(
            input.output,
            extension,
            bytes,
            input.overwrite ?? false,
          );

          return {
            account: session.reference,
            boardId: input.boardId,
            mediaId: input.mediaId,
            kind: input.kind,
            mimeType,
            byteLength: bytes.length,
            sha256: contentHash(bytes),
            output,
          };
        }).pipe(
          Effect.timeout('60 seconds'),
          Effect.catchTag('TimeoutError', () =>
            remote('Media download timed out.'),
          ),
        ),
      ),
  );

  return { prepare, upload, read };
});

export class AccountMedia extends Context.Service<
  AccountMedia,
  Effect.Success<typeof make>
>()('moodboard/mcp/AccountMedia') {
  static readonly layer = Layer.effect(this, make);
}
