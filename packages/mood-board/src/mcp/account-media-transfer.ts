import { Effect, Stream } from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/unstable/http';

import {
  hasValidMediaMagic,
  mediaByteLimit,
  MediaUploadResponseSchema,
  normalizeMediaMimeType,
  type MediaId,
  type MediaKind,
  type MediaUploadResponse,
} from '../lib/media';
import { type AccountSession } from './account-client';
import { AccountConnection } from './account-connection';
import { AccountError } from './account-contracts';
import {
  accountRequestError,
  accountTransportError,
} from './account-diagnostics';
import { type LocalAsset } from './local-archive';
import { LocalImages } from './local-images';

const remote = (message: string) =>
  new AccountError({ code: 'Remote', message });

export const ownerMediaPath = (mediaId: MediaId) =>
  `/api/owner/media/${encodeURIComponent(mediaId)}`;

export const validMediaReceipt = (
  receipt: MediaUploadResponse,
  asset: LocalAsset,
) =>
  receipt.kind === asset.kind &&
  receipt.mimeType === asset.mimeType &&
  receipt.byteLength === asset.bytes.length &&
  receipt.url === `/media/${receipt.mediaId}`;

export const uploadAccountAsset = Effect.fn('AccountMedia.uploadAsset')(
  function* (session: AccountSession, asset: LocalAsset) {
    const connection = yield* AccountConnection;

    const request = HttpClientRequest.post(
      `${session.reference.origin}/api/owner/media?kind=${asset.kind}`,
    ).pipe(
      HttpClientRequest.setHeader('x-media-kind', asset.kind),
      HttpClientRequest.bodyUint8Array(asset.bytes, asset.mimeType),
    );

    const response = yield* HttpClient.withScope(session.http)
      .execute(request)
      .pipe(
        Effect.timeout('30 seconds'),
        Effect.mapError((error) => accountTransportError(error, request)),
      );

    if (response.status !== 200 && response.status !== 201)
      return yield* accountRequestError(
        'HttpStatus',
        'Media upload was refused. Check access and quotas.',
        request,
        response,
      );

    const receipt = yield* connection.readJson(
      response,
      MediaUploadResponseSchema,
    );

    if (!validMediaReceipt(receipt, asset))
      return yield* remote(
        'Invalid media upload receipt. The upload may have succeeded.',
      );

    return receipt;
  },
);

export const downloadAccountAsset = Effect.fn('AccountMedia.downloadAsset')(
  function* (
    session: AccountSession,
    mediaId: MediaId,
    kind: MediaKind,
    remainingBytes: number,
  ) {
    const images = yield* LocalImages;

    const request = HttpClientRequest.get(
      `${session.reference.origin}${ownerMediaPath(mediaId)}`,
    );

    const response = yield* HttpClient.withScope(session.http)
      .execute(request)
      .pipe(
        Effect.timeout('30 seconds'),
        Effect.mapError((error) => accountTransportError(error, request)),
      );

    if (response.status !== 200)
      return yield* accountRequestError(
        'HttpStatus',
        'Media download was refused.',
        request,
        response,
      );

    const mimeType = normalizeMediaMimeType(
      kind,
      response.headers['content-type'],
    );

    if (mimeType === null)
      return yield* remote('Media response has the wrong MIME kind.');
    let length = 0;

    const chunks = yield* response.stream.pipe(
      Stream.mapEffect((chunk) => {
        length += chunk.length;

        return length > Math.min(mediaByteLimit(kind), remainingBytes)
          ? remote('Media download exceeds its byte budget.')
          : Effect.succeed(chunk);
      }),
      Stream.runCollect,
      Effect.timeout('30 seconds'),
      Effect.mapError(() =>
        accountRequestError(
          'ResponseRead',
          'Media download failed, timed out, or exceeded its byte budget.',
          request,
          response,
        ),
      ),
    );

    const bytes = new Uint8Array(length);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }

    if (!hasValidMediaMagic(kind, mimeType, bytes))
      return yield* remote('Media response has an invalid signature.');

    if (kind === 'image') yield* images.inspect(bytes);

    return { mediaId, kind, mimeType, bytes } satisfies LocalAsset;
  },
);
