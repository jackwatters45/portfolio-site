import { Context, Effect, Layer, Schema } from 'effect';

import {
  MAX_AUDIO_UPLOAD_BYTES,
  normalizeMediaMimeType,
} from '../../lib/media';
import { OptionalErrorCauseSchema } from '../../lib/schema';
import { blobToDataUrl, ingestImageFile } from '../media/image-processing';
import { uploadMedia } from '../media/media-client';
import { createBoardArchive, importBoardFile } from './board-archive';
import { collectDroppedImageFiles } from './bulk-image-import';
import type { Board, Camera } from './types';

export class BoardTransferError extends Schema.Error<BoardTransferError>(
  'BoardTransferError',
)({
  _tag: Schema.tag('BoardTransferError'),
  message: Schema.String,
  cause: OptionalErrorCauseSchema,
}) {}

const transfer = <A>(
  message: string,
  run: (signal: AbortSignal) => Promise<A>,
) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new BoardTransferError({
        message: cause instanceof Error ? cause.message : message,
        cause,
      }),
  });

const makeTransfers = (localOnly: boolean) => {
  const image = Effect.fn('BoardTransfers.image')(function* (
    file: File,
    onPrepared: () => void,
  ) {
    const image = yield* transfer(
      'That image could not be prepared.',
      (signal) => ingestImageFile(file, signal),
    );
    yield* Effect.sync(onPrepared);
    const source = localOnly
      ? {
          src: yield* transfer('That image could not be saved.', () =>
            blobToDataUrl(image.blob),
          ),
        }
      : {
          mediaId: (yield* transfer(
            'That image could not be uploaded.',
            (signal) => uploadMedia(image.blob, 'image', signal),
          )).mediaId,
        };
    return { width: image.width, height: image.height, ...source };
  });
  const background = Effect.fn('BoardTransfers.background')(function* (
    file: File,
  ) {
    if (localOnly)
      return yield* new BoardTransferError({
        message: 'Sign in to upload a private background image.',
      });
    const image = yield* transfer(
      'That background image could not be prepared.',
      (signal) => ingestImageFile(file, signal),
    );
    return (yield* transfer(
      'That background image could not be uploaded.',
      (signal) => uploadMedia(image.blob, 'image', signal),
    )).mediaId;
  });
  const audio = Effect.fn('BoardTransfers.audio')(function* (file: File) {
    if (localOnly)
      return yield* new BoardTransferError({
        message: 'Sign in to upload audio files to a private workspace.',
      });
    if (normalizeMediaMimeType('audio', file.type) === null)
      return yield* new BoardTransferError({
        message: 'Choose an MP3, M4A, WAV, Ogg, or WebM audio file.',
      });
    if (file.size === 0 || file.size > MAX_AUDIO_UPLOAD_BYTES)
      return yield* new BoardTransferError({
        message: 'Local audio must be non-empty and no larger than 25 MB.',
      });
    return (yield* transfer(
      'That audio file could not be uploaded.',
      (signal) => uploadMedia(file, 'audio', signal),
    )).mediaId;
  });
  const exportBoard = Effect.fn('BoardTransfers.exportBoard')(function* (
    board: Board,
    camera: Camera,
  ) {
    if (
      localOnly &&
      (board.backgroundMediaId !== undefined ||
        board.items.some((item) => item.mediaId !== undefined))
    ) {
      return yield* new BoardTransferError({
        message:
          'This guest board contains unsupported managed media and was not exported.',
      });
    }
    return yield* transfer('That board could not be exported.', (signal) =>
      createBoardArchive(board, camera, { signal }),
    );
  });
  const importBoard = Effect.fn('BoardTransfers.importBoard')((file: File) =>
    transfer('That board could not be imported.', (signal) =>
      importBoardFile(file, { signal, localOnly }),
    ),
  );
  const collectDrop = Effect.fn('BoardTransfers.collectDrop')(
    (data: DataTransfer) =>
      transfer('That folder could not be read.', (signal) =>
        collectDroppedImageFiles(data, { limit: 150, signal }),
      ),
  );
  return { image, background, audio, exportBoard, importBoard, collectDrop };
};

export class BoardTransfers extends Context.Service<
  BoardTransfers,
  ReturnType<typeof makeTransfers>
>()('mood-board/BoardTransfers') {
  static layer(localOnly: boolean) {
    return Layer.sync(this, () => makeTransfers(localOnly));
  }
}
