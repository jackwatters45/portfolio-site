import { describe, expect, it } from '@effect/vitest';
import { Cause, Effect } from 'effect';
import {
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from 'effect/unstable/http';
import { RpcClientError } from 'effect/unstable/rpc/RpcClientError';

import { BoardBackendError } from '../../src/lib/board-rpc';
import { accountRpcErrors } from '../../src/mcp/account-client';
import { AccountError } from '../../src/mcp/account-contracts';
import {
  accountRequestError,
  accountTransportError,
} from '../../src/mcp/account-diagnostics';

const request = HttpClientRequest.get(
  'https://board.example/api/auth/get-session?token=secret-value',
).pipe(HttpClientRequest.setHeader('authorization', 'Bearer secret-value'));

describe('safe MCP account diagnostics', () => {
  it('reports transport kind without its raw cause or credentials', () => {
    const raw = new HttpClientError.HttpClientError({
      reason: new HttpClientError.TransportError({
        request,
        cause: new Error('secret-value'),
      }),
    });
    const error = accountTransportError(raw, request);
    expect(error.diagnostic).toEqual({
      category: 'TransportError',
      method: 'GET',
      endpoint: '/api/auth/get-session',
      status: undefined,
      requestId: undefined,
    });
    expect(JSON.stringify(error)).not.toContain('secret-value');
  });
  it('distinguishes request timeouts', () => {
    expect(
      accountTransportError(new Cause.TimeoutError(), request).diagnostic
        ?.category,
    ).toBe('Timeout');
  });
  it('reports status and a validated Cloudflare request ID without response data', () => {
    const response = HttpClientResponse.fromWeb(
      request,
      new Response('secret-value', {
        status: 503,
        headers: {
          'cf-ray': 'a3f9367fca004f49-MEL',
          'set-cookie': 'secret-value',
        },
      }),
    );
    const error = accountRequestError(
      'HttpStatus',
      'Unavailable',
      request,
      response,
    );
    expect(error.diagnostic?.status).toBe(503);
    expect(error.diagnostic?.requestId).toBe('a3f9367fca004f49-MEL');
    expect(JSON.stringify(error)).not.toContain('secret-value');
    const unsafe = HttpClientResponse.fromWeb(
      request,
      new Response('', { headers: { 'cf-ray': 'secret-value' } }),
    );
    expect(
      accountRequestError('HttpStatus', 'Unavailable', request, unsafe)
        .diagnostic?.requestId,
    ).toBeUndefined();
  });
  it.effect('preserves expected domain errors while mapping RPC failures', () =>
    Effect.gen(function* () {
      const domain = new AccountError({
        code: 'AccessDenied',
        message: 'Denied',
      });
      expect(
        yield* accountRpcErrors(Effect.fail(domain)).pipe(Effect.flip),
      ).toBe(domain);
      const conflict = yield* accountRpcErrors(
        Effect.fail(
          new BoardBackendError({ code: 'Conflict', message: 'secret-value' }),
        ),
      ).pipe(Effect.flip);
      expect(conflict.code).toBe('Conflict');
      expect(conflict.diagnostic?.category).toBe('BoardRejected');
      expect(JSON.stringify(conflict)).not.toContain('secret-value');
      const rpc = new RpcClientError({
        reason: new HttpClientError.HttpClientErrorSchema({
          _tag: 'HttpError',
          kind: 'TransportError',
          cause: new Error('secret-value'),
        }),
      });
      const transport = yield* accountRpcErrors(Effect.fail(rpc)).pipe(
        Effect.flip,
      );
      expect(transport.diagnostic?.category).toBe('TransportError');
      expect(JSON.stringify(transport)).not.toContain('secret-value');
    }),
  );
});
