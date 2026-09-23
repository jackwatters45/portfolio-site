import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer, Schema } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/unstable/http';

import { AccountIdSchema } from '../../src/lib/account';
import { MediaIdSchema, MediaByteLengthSchema } from '../../src/lib/media';
import { type AccountSession } from '../../src/mcp/account-client';
import { AccountConnection } from '../../src/mcp/account-connection';
import { AccountError } from '../../src/mcp/account-contracts';
import {
  downloadAccountAsset,
  uploadAccountAsset,
  validMediaReceipt,
} from '../../src/mcp/account-media-transfer';
import { type LocalAsset } from '../../src/mcp/local-archive';
import { LocalImages } from '../../src/mcp/local-images';

const id = MediaIdSchema.make('0123456789abcdef0123456789abcdef');
const bytes = new Uint8Array([0x49, 0x44, 0x33, 0, 0, 0, 0, 0, 0, 0]);
const asset: LocalAsset = {
  mediaId: id,
  kind: 'audio',
  mimeType: 'audio/mpeg',
  bytes,
};
const receipt = {
  mediaId: id,
  kind: 'audio' as const,
  mimeType: 'audio/mpeg' as const,
  byteLength: MediaByteLengthSchema.make(bytes.length),
  url: `/media/${id}`,
};
const accountId = AccountIdSchema.make('owner');
const requests: string[] = [];
const session = (response: () => Response): AccountSession => ({
  reference: { origin: 'https://board.example', id: accountId },
  account: { id: accountId, name: 'Owner', email: 'owner@example.com' },
  http: HttpClient.make((request) =>
    Effect.sync(() => {
      requests.push(request.url);
      return HttpClientResponse.fromWeb(request, response());
    }),
  ),
});
const unused = () => Effect.die('Unexpected account operation');
const connection = Layer.succeed(AccountConnection, {
  begin: unused,
  complete: unused,
  connected: unused,
  disconnect: unused,
  writesAllowed: true,
  readJson: (response, schema) =>
    response.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(schema)),
      Effect.mapError(
        () => new AccountError({ code: 'Remote', message: 'Invalid response' }),
      ),
    ),
});

describe('account managed media transfer', () => {
  it.effect('uploads bytes only to the pinned account media endpoint', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const result = yield* uploadAccountAsset(
          session(() => Response.json(receipt, { status: 201 })),
          asset,
        );
        expect(result).toEqual(receipt);
        expect(requests.at(-1)).toBe(
          'https://board.example/api/owner/media?kind=audio',
        );
      }),
    ).pipe(Effect.provide(connection)),
  );

  it('rejects redirected receipt URLs and inconsistent metadata', () => {
    expect(
      validMediaReceipt(
        { ...receipt, url: 'https://other.example/media' },
        asset,
      ),
    ).toBe(false);
    expect(
      validMediaReceipt(
        { ...receipt, byteLength: MediaByteLengthSchema.make(99) },
        asset,
      ),
    ).toBe(false);
    expect(
      validMediaReceipt(
        { ...receipt, kind: 'image', mimeType: 'image/png' },
        asset,
      ),
    ).toBe(false);
  });

  it.effect('downloads validated media with a bounded aggregate budget', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const result = yield* downloadAccountAsset(
          session(
            () =>
              new Response(bytes, {
                headers: { 'content-type': 'audio/mpeg' },
              }),
          ),
          id,
          'audio',
          100,
        );
        expect(result.bytes).toEqual(bytes);
        expect(result.mediaId).toBe(id);
      }),
    ).pipe(Effect.provide(LocalImages.layer)),
  );

  for (const scenario of ['mime', 'signature', 'size', 'status']) {
    it.effect(`rejects invalid ${scenario}`, () =>
      Effect.scoped(
        Effect.gen(function* () {
          const source = session(
            () =>
              new Response(
                scenario === 'signature' ? new Uint8Array([1, 2, 3]) : bytes,
                {
                  status: scenario === 'status' ? 403 : 200,
                  headers: {
                    'content-type':
                      scenario === 'mime' ? 'image/png' : 'audio/mpeg',
                  },
                },
              ),
          );
          const error = yield* downloadAccountAsset(
            source,
            id,
            'audio',
            scenario === 'size' ? 1 : 100,
          ).pipe(Effect.flip);
          expect(error.code).toBe('Remote');
        }),
      ).pipe(Effect.provide(LocalImages.layer)),
    );
  }
});
