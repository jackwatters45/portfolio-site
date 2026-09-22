import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
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
} from '../lib/comments-schema';

const ErrorResponse = Schema.Struct({ error: Schema.String });

const readError = () =>
  new CommentError({
    status: 502,
    message: 'Comments are unavailable. Please try again later.',
  });

const writeError = () =>
  new CommentError({
    status: 502,
    message:
      'Could not confirm the comment was saved. Refresh before trying again.',
  });

export class CommentsApi extends Context.Service<CommentsApi>()(
  'nz/CommentsApi',
  {
    make: Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      const client = http.pipe(
        HttpClient.mapRequest(HttpClientRequest.prependUrl('/api/comments')),
        HttpClient.transform((response, request) => {
          const unavailable =
            request.method === 'POST' ? writeError : readError;
          return response.pipe(
            Effect.timeout('30 seconds'),
            Effect.mapError(unavailable),
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                '2xx': (response) => Effect.succeed(response),
                orElse: (response) =>
                  HttpClientResponse.schemaBodyJson(ErrorResponse)(
                    response,
                  ).pipe(
                    Effect.mapError(unavailable),
                    Effect.flatMap(
                      ({ error }) =>
                        new CommentError({
                          status: response.status,
                          message: error,
                        }),
                    ),
                  ),
              }),
            ),
          );
        }),
      );

      const list = Effect.fn('CommentsApi.list')(function* () {
        const response = yield* client.get('');
        return yield* HttpClientResponse.schemaBodyJson(ThreadList)(
          response,
        ).pipe(Effect.mapError(readError));
      });

      const read = Effect.fn('CommentsApi.read')(function* (id: number) {
        const response = yield* client.get(`/${id}`);
        return yield* HttpClientResponse.schemaBodyJson(ThreadDetail)(
          response,
        ).pipe(Effect.mapError(readError));
      });

      const create = Effect.fn('CommentsApi.create')(function* (
        value: typeof ThreadSubmission.Type,
      ) {
        const request = yield* HttpClientRequest.post('').pipe(
          HttpClientRequest.bodyJson(value),
          Effect.mapError(writeError),
        );
        const response = yield* client.execute(request);
        return yield* HttpClientResponse.schemaBodyJson(CreatedThread)(
          response,
        ).pipe(Effect.mapError(writeError));
      });

      const reply = Effect.fn('CommentsApi.reply')(function* (
        id: number,
        value: typeof CommentSubmission.Type,
      ) {
        const request = yield* HttpClientRequest.post(`/${id}`).pipe(
          HttpClientRequest.bodyJson(value),
          Effect.mapError(writeError),
        );
        const response = yield* client.execute(request);
        return yield* HttpClientResponse.schemaBodyJson(CreatedReply)(
          response,
        ).pipe(Effect.mapError(writeError));
      });

      return { list, read, create, reply };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(FetchHttpClient.layer),
  );
}
