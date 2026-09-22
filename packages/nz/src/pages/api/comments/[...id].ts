import type { APIRoute } from 'astro';
import * as Effect from 'effect/Effect';
import * as FetchHttpClient from 'effect/unstable/http/FetchHttpClient';
import { handleComments } from '../../../server/comments-handler';

export const prerender = false;

function json(value: unknown, status: number) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(status === 429 ? { 'Retry-After': '60' } : {}),
    },
  });
}

const route: APIRoute = ({ request, params, locals }) =>
  Effect.runPromise(
    handleComments(
      request,
      params.id,
      import.meta.env.DEV ? process.env : locals.runtime.env,
    ).pipe(
      Effect.map((value) => json(value, request.method === 'POST' ? 201 : 200)),
      Effect.catchTag('CommentError', (error) =>
        Effect.succeed(json({ error: error.message }, error.status)),
      ),
      // Do not expose upstream responses or credential errors to visitors.
      Effect.catchCause(() =>
        Effect.succeed(
          json(
            { error: 'Comments are unavailable. Please try again later.' },
            500,
          ),
        ),
      ),
      Effect.provide(FetchHttpClient.layer),
    ),
    { signal: request.signal },
  );

export const GET = route;
export const POST = route;
export const ALL: APIRoute = () =>
  new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
