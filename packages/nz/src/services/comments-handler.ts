import * as Config from 'effect/Config';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Match from 'effect/Match';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import * as HttpClient from 'effect/unstable/http/HttpClient';
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest';
import {
  CommentError,
  CommentSubmission,
  ThreadSubmission,
} from '../lib/comments-schema';
import { Comments } from './comments';

interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface CommentsEnv {
  NZ_FEEDBACK_GITHUB_TOKEN?: string;
  COMMENT_READ_LIMIT?: RateLimit;
  COMMENT_WRITE_LIMIT?: RateLimit;
}

const ThreadId = Schema.UndefinedOr(
  Schema.String.check(Schema.isPattern(/^[1-9]\d{0,8}$/)),
);

export class CommentsHandler extends Context.Service<CommentsHandler>()(
  'nz/CommentsHandler',
  {
    make: (env: CommentsEnv) =>
      Effect.gen(function* () {
        const http = yield* HttpClient.HttpClient;
        const token = Config.Redacted('NZ_FEEDBACK_GITHUB_TOKEN').pipe(
          Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env))),
          Effect.mapError(
            () =>
              new CommentError({
                status: 503,
                message: 'Comments are not connected to GitHub yet.',
              }),
          ),
          Effect.filterOrFail(
            (value) => !!Redacted.value(value).trim(),
            () =>
              new CommentError({
                status: 503,
                message: 'Comments are not connected to GitHub yet.',
              }),
          ),
        );

        const rateLimit = Effect.fn('CommentsHandler.rateLimit')(function* (
          request: Request,
        ) {
          return yield* Option.fromNullishOr(
            request.method === 'POST'
              ? env.COMMENT_WRITE_LIMIT
              : env.COMMENT_READ_LIMIT,
          ).pipe(
            Option.match({
              onNone: () =>
                Match.value(import.meta.env.PROD).pipe(
                  Match.when(
                    true,
                    () =>
                      new CommentError({
                        status: 503,
                        message:
                          'Comments are not configured. Please contact Jack.',
                      }),
                  ),
                  Match.orElse(() => Effect.void),
                ),
              onSome: (limiter) =>
                Effect.tryPromise({
                  try: () =>
                    limiter.limit({
                      key: request.headers.get('cf-connecting-ip') ?? 'local',
                    }),
                  catch: () =>
                    new CommentError({
                      status: 503,
                      message:
                        'Comments are unavailable. Please try again later.',
                    }),
                }).pipe(
                  Effect.filterOrFail(
                    ({ success }) => success,
                    () =>
                      new CommentError({
                        status: 429,
                        message: 'Too many requests. Please wait a minute.',
                      }),
                  ),
                  Effect.asVoid,
                ),
            }),
          );
        });

        const submission = Effect.fn('CommentsHandler.submission')(function* <
          A,
        >(request: Request, schema: Schema.Codec<A, unknown>) {
          yield* Effect.succeed(
            request.headers.get('content-type')?.split(';')[0].trim(),
          ).pipe(
            Effect.filterOrFail(
              (type) => type === 'application/json',
              () =>
                new CommentError({
                  status: 415,
                  message: 'Send comments as JSON.',
                }),
            ),
          );
          yield* Effect.fromNullishOr(request.body).pipe(
            Effect.mapError(
              () =>
                new CommentError({
                  status: 400,
                  message: 'A comment is required.',
                }),
            ),
          );
          // Effect's Web Request adapter does not enforce MaxBodySize. Count
          // streamed bytes before decoding so chunked bodies cannot bypass the cap.
          const text = yield* HttpServerRequest.fromWeb(request).stream.pipe(
            Stream.mapError(
              () =>
                new CommentError({
                  status: 400,
                  message: 'Could not read this comment.',
                }),
            ),
            Stream.mapAccumEffect(
              () => 0,
              (size, chunk) =>
                Effect.succeed(size + chunk.byteLength).pipe(
                  Effect.filterOrFail(
                    (total) => total <= 16_384,
                    () =>
                      new CommentError({
                        status: 413,
                        message: 'This comment is too long.',
                      }),
                  ),
                  Effect.map((total) => [total, [chunk]] as const),
                ),
            ),
            Stream.decodeText(),
            Stream.mkString,
          );
          return yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(schema),
          )(text).pipe(
            Effect.mapError(
              () =>
                new CommentError({
                  status: 400,
                  message:
                    'Add your name, a valid target, and a comment of 2,000 characters or less.',
                }),
            ),
          );
        });

        const handle = Effect.fn('CommentsHandler.handle')(function* (
          request: Request,
          pathId?: string,
        ) {
          const id = yield* Schema.decodeUnknownEffect(ThreadId)(pathId).pipe(
            Effect.mapError(
              () =>
                new CommentError({
                  status: 404,
                  message: 'Comment thread not found.',
                }),
            ),
          );
          yield* Effect.succeed(request).pipe(
            Effect.filterOrFail(
              (request) =>
                request.headers.get('sec-fetch-site') !== 'cross-site' &&
                (request.method !== 'POST' ||
                  request.headers.get('origin') ===
                    new URL(request.url).origin),
              () =>
                new CommentError({
                  status: 403,
                  message: 'Use the comment form on the trip page.',
                }),
            ),
          );
          const credentials = yield* token;
          yield* rateLimit(request);

          return yield* Comments.use((comments) =>
            Match.value({ id, method: request.method }).pipe(
              Match.when({ id: undefined, method: 'GET' }, () =>
                comments.list(),
              ),
              Match.when({ id: undefined, method: 'POST' }, () =>
                submission(request, ThreadSubmission).pipe(
                  Effect.flatMap(comments.create),
                ),
              ),
              Match.when({ id: Match.string, method: 'GET' }, ({ id }) =>
                comments.read(id),
              ),
              Match.when({ id: Match.string, method: 'POST' }, ({ id }) =>
                submission(request, CommentSubmission).pipe(
                  Effect.flatMap((value) => comments.reply(id, value)),
                ),
              ),
              Match.orElse(
                () =>
                  new CommentError({
                    status: 405,
                    message: 'Use GET or POST.',
                  }),
              ),
            ),
          ).pipe(
            Effect.provide(Comments.layer(credentials)),
            Effect.provideService(HttpClient.HttpClient, http),
          );
        });

        return { handle };
      }),
  },
) {
  static layer(env: CommentsEnv) {
    return Layer.effect(this, this.make(env));
  }
}
