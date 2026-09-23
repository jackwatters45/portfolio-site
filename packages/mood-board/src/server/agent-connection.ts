import { Effect, Option, Schema, Stream } from 'effect';

import { signInPath } from '../client/auth-route';
import {
  AGENT_CLIENT_ID,
  AGENT_CONNECT_PATH,
  AGENT_USER_CODE,
} from '../lib/agent-auth';
import type { Auth } from './auth';
import {
  isSameOriginMutation,
  resolveAuthenticatedAccountEffect,
} from './request-auth';
import { withSecurityHeaders } from './security-headers';

class AgentConsentError extends Schema.TaggedError<AgentConsentError>()(
  'AgentConsentError',
  {},
) {}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });

const page = (body: string, status = 200) =>
  withSecurityHeaders(
    new Response(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect agent — Moodboard</title><style>body{font:16px/1.5 system-ui,sans-serif;background:#faf9f6;color:#242424;padding:24px}main{max-width:460px;margin:64px auto}h1{font-size:28px;line-height:1.2}code{display:block;font-size:32px;letter-spacing:4px;padding:16px 0}form{display:flex;gap:12px;padding-top:16px}button{font:inherit;padding:10px 18px;cursor:pointer}a{color:inherit}</style></head><body><main>${body}</main></body></html>`,
      {
        status,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      },
    ),
    // Native POST forms need a non-null Origin for same-origin validation.
    { referrerPolicy: 'same-origin' },
  );

const failure = () =>
  page(
    '<h1>Connection unavailable</h1><p>This request has expired, was already used, or belongs to another account. Start a new connection from your agent.</p>',
    400,
  );

// This is an authentication boundary, not a board API. Better Auth owns codes and sessions.
export const handleAgentConnection = Effect.fn('AgentConnection.handle')(
  function* (auth: Auth, request: Request) {
    if (request.method !== 'GET' && request.method !== 'POST')
      return page('<h1>Method not allowed</h1>', 405);

    if (!isSameOriginMutation(request))
      return page('<h1>Cross-origin request rejected</h1>', 403);

    const url = new URL(request.url);
    const account = yield* resolveAuthenticatedAccountEffect(auth, request);

    if (account === null) {
      return withSecurityHeaders(
        new Response(null, {
          status: 303,
          headers: {
            location: signInPath(`${AGENT_CONNECT_PATH}${url.search}`),
            'cache-control': 'no-store',
          },
        }),
      );
    }

    const code = Schema.decodeUnknownOption(AGENT_USER_CODE)(
      url.searchParams.get('user_code'),
    );

    if (Option.isNone(code)) return failure();

    const verification = yield* Effect.tryPromise({
      try: () =>
        auth.api.deviceVerify({
          query: { user_code: code.value },
          headers: request.headers,
        }),
      catch: () => new AgentConsentError({}),
    });

    if (
      verification.status !== 'pending' ||
      verification.client_id !== AGENT_CLIENT_ID
    )
      return failure();

    if (request.method === 'GET') {
      return page(
        `<h1>Connect your agent?</h1><p>Account: <strong>${escapeHtml(account.email)}</strong></p><code>${code.value}</code><p>Approve only if this code appears in your own agent client. This creates a separate signed-in session with full account access, including changes and deletion.</p><p>The agent tools save privately. They do not publish boards. Use disconnect_account to revoke this session.</p><form method="post" action="${AGENT_CONNECT_PATH}?user_code=${code.value}"><button name="decision" value="approve">Approve connection</button><button name="decision" value="deny">Deny</button></form>`,
      );
    }

    const body = request.body;

    if (
      request.headers.get('content-type')?.split(';')[0] !==
        'application/x-www-form-urlencoded' ||
      body === null
    )
      return failure();
    let length = 0;

    const chunks = yield* Stream.fromReadableStream({
      evaluate: () => body,
      onError: () => new AgentConsentError({}),
    }).pipe(
      Stream.mapEffect((chunk) => {
        length += chunk.byteLength;

        return length > 1024
          ? new AgentConsentError({})
          : Effect.succeed(chunk);
      }),
      Stream.runCollect,
      Effect.timeout('10 seconds'),
      Effect.mapError(() => new AgentConsentError({})),
    );

    const bytes = new Uint8Array(length);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }

    const decision = new URLSearchParams(new TextDecoder().decode(bytes)).get(
      'decision',
    );

    if (decision !== 'approve' && decision !== 'deny') return failure();
    const input = { body: { userCode: code.value }, headers: request.headers };
    yield* Effect.tryPromise({
      try: () =>
        decision === 'approve'
          ? auth.api.deviceApprove(input)
          : auth.api.deviceDeny(input),
      catch: () => new AgentConsentError({}),
    });

    return page(
      decision === 'approve'
        ? '<h1>Connection approved</h1><p>Return to your agent and complete the connection. You can close this page.</p>'
        : '<h1>Connection denied</h1><p>You can close this page.</p>',
    );
  },
  Effect.catchTags({
    AgentConsentError: () => Effect.succeed(failure()),
    AuthResolutionError: () => Effect.succeed(failure()),
  }),
);
