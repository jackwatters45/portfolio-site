import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import * as FetchHttpClient from 'effect/unstable/http/FetchHttpClient';
import * as HttpClient from 'effect/unstable/http/HttpClient';
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest';
import * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse';
import {
  CommentError,
  type CommentSubmission,
  CreatedReply,
  CreatedThread,
  ThreadDetail,
  ThreadList,
  type ThreadSubmission,
} from './comments';

const ErrorResponse = Schema.Struct({ error: Schema.String });

const request = Effect.fn('comments.api')(function* <A>(
  schema: Schema.Codec<A, unknown>,
  path: string,
  body?: unknown,
) {
  const unavailable = () =>
    new CommentError({
      status: 502,
      message: body
        ? 'Could not confirm the comment was saved. Refresh before trying again.'
        : 'Comments are unavailable. Please try again later.',
    });
  const base = HttpClientRequest.make(body ? 'POST' : 'GET')(
    `/api/comments${path}`,
  );
  const input = body
    ? yield* HttpClientRequest.bodyJson(base, body).pipe(
        Effect.mapError(unavailable),
      )
    : base;
  const response = yield* HttpClient.execute(input).pipe(
    Effect.timeout('30 seconds'),
    Effect.mapError(unavailable),
  );
  if (response.status < 200 || response.status >= 300) {
    const value = yield* HttpClientResponse.schemaBodyJson(ErrorResponse)(
      response,
    ).pipe(Effect.mapError(unavailable));
    return yield* new CommentError({
      status: response.status,
      message: value.error,
    });
  }
  return yield* HttpClientResponse.schemaBodyJson(schema)(response).pipe(
    Effect.mapError(unavailable),
  );
}, Effect.provide(FetchHttpClient.layer));

export const listComments = request(ThreadList, '');
export const readThread = (id: number) => request(ThreadDetail, `/${id}`);
export const createThread = (value: typeof ThreadSubmission.Type) =>
  request(CreatedThread, '', value);
export const createReply = (id: number, value: typeof CommentSubmission.Type) =>
  request(CreatedReply, `/${id}`, value);
