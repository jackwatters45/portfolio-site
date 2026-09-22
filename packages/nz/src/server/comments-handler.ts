import * as Config from 'effect/Config';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import * as Match from 'effect/Match';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import { Comments } from '../../services/comments';
import { CommentError, CommentSubmission, ThreadSubmission } from '../lib/comments-schema';

interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}
export interface CommentsEnv {
  NZ_FEEDBACK_GITHUB_TOKEN?: string;
  COMMENT_READ_LIMIT?: RateLimit;
  COMMENT_WRITE_LIMIT?: RateLimit;
}

const error = (status: number, message: string) =>
  new CommentError({ status, message });

const submission = Effect.fn('comments.submission')(function* <A>(
  request: Request,
  schema: Schema.Codec<A, unknown>,
) {
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  ) {
    return yield* error(415, 'Send comments as JSON.');
  }
  const body = request.body;
  if (!body) return yield* error(400, 'A comment is required.');
  let size = 0;
  const text = yield* Stream.fromReadableStream({
    evaluate: () => body,
    onError: () => error(400, 'Could not read this comment.'),
  }).pipe(
    Stream.tap((chunk) => {
      size += chunk.byteLength;
      return size > 16_384
        ? error(413, 'This comment is too long.')
        : Effect.void;
    }),
    Stream.decodeText(),
    Stream.mkString,
  );
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(
    text,
  ).pipe(
    Effect.mapError(() =>
      error(
        400,
        'Add your name, a valid target, and a comment of 2,000 characters or less.',
      ),
    ),
  );
});

export const handleComments = Effect.fn('comments.route')(function* (
  request: Request,
  id: string | undefined,
  env: CommentsEnv,
) {
  if (id && !/^[1-9]\d{0,8}$/.test(id))
    return yield* error(404, 'Comment thread not found.');
  const write = request.method === 'POST';
  if (
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (write && request.headers.get('origin') !== new URL(request.url).origin)
  ) {
    return yield* error(403, 'Use the comment form on the trip page.');
  }
  const token = yield* Config.Redacted('NZ_FEEDBACK_GITHUB_TOKEN').pipe(
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env))),
    Effect.mapError(() =>
      error(503, 'Comments are not connected to GitHub yet.'),
    ),
  );
  if (!Redacted.value(token).trim())
    return yield* error(503, 'Comments are not connected to GitHub yet.');
  const limiter = write ? env.COMMENT_WRITE_LIMIT : env.COMMENT_READ_LIMIT;
  if (limiter) {
    const { success } = yield* Effect.tryPromise({
      try: () =>
        limiter.limit({
          key: request.headers.get('cf-connecting-ip') ?? 'local',
        }),
      catch: () =>
        error(503, 'Comments are unavailable. Please try again later.'),
    });
    if (!success)
      return yield* error(429, 'Too many requests. Please wait a minute.');
  } else if (import.meta.env.PROD) {
    return yield* error(
      503,
      'Comments are not configured. Please contact Jack.',
    );
  }

  return yield* Effect.gen(function* () {
    const comments = yield* Comments;
    return yield* Match.value({ id, write }).pipe(
      Match.when({ id: undefined, write: false }, () => comments.list()),
      Match.when({ id: undefined, write: true }, () => submission(request, ThreadSubmission).pipe(
        Effect.flatMap(comments.create),
      )),
      Match.when({ id: Match.string, write: false }, ({ id }) => comments.read(id)),
      Match.when({ id: Match.string, write: true }, ({ id }) => submission(request, CommentSubmission).pipe(
        Effect.flatMap((value) => comments.reply(id, value)),
      )),
      Match.orElse(() => error(404, 'Comment thread not found.')),
    );
  }).pipe(Effect.provide(Comments.layer(token)));
});
