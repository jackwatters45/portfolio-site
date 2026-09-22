import type { APIRoute } from 'astro';
import * as Effect from 'effect/Effect';
import * as FetchHttpClient from 'effect/unstable/http/FetchHttpClient';
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse';
import { CommentsHandler } from '../../../services/comments-handler';

export const prerender = false;

const route: APIRoute = ({ request, params, locals }) =>
  Effect.runPromise(
    Effect.flatMap(CommentsHandler, (handler) =>
      handler.handle(request, params.id),
    ).pipe(
      Effect.flatMap((value) =>
        HttpServerResponse.json(value, {
          status: request.method === 'POST' ? 201 : 200,
        }),
      ),
      Effect.catchTag('CommentError', (error) =>
        HttpServerResponse.json(
          { error: error.message },
          { status: error.status },
        ),
      ),
      // Do not expose upstream responses or credential errors to visitors.
      Effect.catchCause(() =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: 'Comments are unavailable. Please try again later.' },
            { status: 500 },
          ),
        ),
      ),
      Effect.map((response) =>
        response.pipe(
          HttpServerResponse.setHeaders({
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            ...(response.status === 429 ? { 'Retry-After': '60' } : {}),
          }),
          HttpServerResponse.toWeb,
        ),
      ),
      Effect.provide(
        CommentsHandler.layer(
          import.meta.env.DEV ? process.env : locals.runtime.env,
        ),
      ),
      Effect.provide(FetchHttpClient.layer),
    ),
    { signal: request.signal },
  );

export const GET = route;
export const POST = route;
export const ALL: APIRoute = () =>
  HttpServerResponse.empty({
    status: 405,
    headers: { Allow: 'GET, POST' },
  }).pipe(HttpServerResponse.toWeb);
