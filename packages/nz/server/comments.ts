import * as Config from 'effect/Config';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import * as HttpClient from 'effect/unstable/http/HttpClient';
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest';
import * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse';
import {
  CommentError,
  type CommentMessage,
  CommentName,
  CommentSubmission,
  CommentTarget,
  type CommentThread,
  ThreadSubmission,
} from '../src/lib/comments';

const OWNER = 'jackwatters45';
const LABEL = 'nz-feedback';
const API = `https://api.github.com/repos/${OWNER}/portfolio-site`;
const SITE = 'https://nz.jackwatters.dev';
const NameMetadata = Schema.Struct({ name: CommentName });
const ThreadMetadata = Schema.Struct({
  ...NameMetadata.fields,
  ...CommentTarget.fields,
});
const GitHubComment = Schema.Struct({
  id: Schema.Number,
  body: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  user: Schema.NullOr(Schema.Struct({ login: Schema.String })),
});
const GitHubIssue = Schema.Struct({
  ...GitHubComment.fields,
  number: Schema.Number,
  state: Schema.String,
  locked: Schema.Boolean,
  comments: Schema.Number,
  labels: Schema.Array(Schema.Struct({ name: Schema.String })),
  pull_request: Schema.optionalKey(Schema.Unknown),
});

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

// Existing issues keep their metadata and fences. Visitor text cannot activate
// GitHub mentions, HTML, or issue commands, including when it contains backticks.
const fence = (value: string, minimum: number) =>
  '`'.repeat(
    Math.max(
      minimum,
      ...[...value.matchAll(/`+/g)].map(([run]) => run.length + 1),
    ),
  );

function formatMessage(name: string, body: string, target?: CommentTarget) {
  const metadata = encodeURIComponent(JSON.stringify({ name, ...target }));
  const code = fence(body, 3);
  const inline = fence(name, 1);
  return [
    `<!-- nz-feedback:v1 ${metadata} -->`,
    `**From:** ${inline} ${name} ${inline}`,
    `${code}text\n${body}\n${code}`,
    ...(target
      ? [`[View on the trip page](${SITE}/#comment=${target.anchor})`]
      : []),
  ].join('\n\n');
}

function metadata<A>(schema: Schema.Codec<A, unknown>, body: string | null) {
  return Option.fromNullishOr(
    body?.match(/^<!-- nz-feedback:v1 (\S+) -->\n/)?.[1],
  ).pipe(
    Option.flatMap(Option.liftThrowable(decodeURIComponent)),
    Option.flatMap(Schema.decodeUnknownOption(Schema.fromJsonString(schema))),
    Option.getOrUndefined,
  );
}

function message(value: typeof GitHubComment.Type): CommentMessage {
  const meta = metadata(NameMetadata, value.body);
  const stored = value.body?.match(/\n\n(`{3,})text\n([\s\S]*?)\n\1(?:\n|$)/);
  const ours = value.user?.login === OWNER && meta && stored;
  return {
    id: value.id,
    name: ours ? meta.name : (value.user?.login ?? 'GitHub'),
    body: ours ? stored[2] : (value.body ?? ''),
    createdAt: value.created_at,
  };
}

function thread(issue: typeof GitHubIssue.Type): CommentThread | undefined {
  const meta = metadata(ThreadMetadata, issue.body);
  if (
    !meta ||
    issue.pull_request ||
    issue.user?.login !== OWNER ||
    !issue.labels.some((label) => label.name === LABEL)
  )
    return undefined;
  return {
    id: issue.number,
    anchor: meta.anchor,
    quote: meta.quote,
    closed: issue.state === 'closed',
    locked: issue.locked,
    replyCount: issue.comments,
    message: message(issue),
  };
}

const github = Effect.fn('comments.github')(function* <A>(
  token: Redacted.Redacted<string>,
  schema: Schema.Codec<A, unknown>,
  path: string,
  body?: Schema.Json,
) {
  const unavailable = () =>
    error(
      502,
      body
        ? 'Could not confirm the comment was saved. Refresh before trying again.'
        : 'Could not load comments. Please try again.',
    );
  const request = HttpClientRequest.make(body ? 'POST' : 'GET')(
    `${API}${path}`,
  ).pipe(
    HttpClientRequest.bearerToken(token),
    HttpClientRequest.setHeaders({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'nz-trip-comments',
    }),
  );
  const response = yield* HttpClient.execute(
    body ? HttpClientRequest.bodyJsonUnsafe(request, body) : request,
  ).pipe(Effect.timeout('12 seconds'), Effect.mapError(unavailable));
  if (
    response.status === 429 ||
    response.headers['x-ratelimit-remaining'] === '0'
  ) {
    return yield* error(
      429,
      'Comments are busy. Please try again in a minute.',
    );
  }
  if (response.status === 404)
    return yield* error(404, 'Comment thread not found.');
  if (response.status < 200 || response.status >= 300)
    return yield* unavailable();
  const data = yield* HttpClientResponse.schemaBodyJson(schema)(response).pipe(
    Effect.timeout('12 seconds'),
    Effect.mapError(unavailable),
  );
  return { data, more: response.headers.link?.includes('rel="next"') ?? false };
});

const listAll = Effect.fn('comments.pages')(function* <A>(
  token: Redacted.Redacted<string>,
  schema: Schema.Codec<A, unknown>,
  path: string,
) {
  const values: A[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, more } = yield* github(
      token,
      Schema.Array(schema),
      `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
    );
    values.push(...data);
    if (!more) return values;
  }
  return yield* error(
    503,
    'There are too many comments to load. Please contact Jack.',
  );
});

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

  if (!id && !write) {
    const issues = yield* listAll(
      token,
      GitHubIssue,
      `/issues?state=all&creator=${OWNER}&labels=${LABEL}&sort=created&direction=asc`,
    );
    return {
      threads: issues.map(thread).filter((value) => value !== undefined),
    };
  }
  if (!id) {
    const value = yield* submission(request, ThreadSubmission);
    const { data } = yield* github(token, GitHubIssue, '/issues', {
      title: `[NZ feedback] ${value.target.quote.replace(/\s+/g, ' ').slice(0, 100)}`,
      body: formatMessage(value.name.trim(), value.body.trim(), value.target),
      labels: [LABEL],
    });
    const created = thread(data);
    if (!created)
      return yield* error(
        502,
        'The issue was saved, but its feedback label is missing. Please contact Jack.',
      );
    return { thread: created };
  }

  const { data } = yield* github(token, GitHubIssue, `/issues/${id}`);
  const current = thread(data);
  // Never expose or write to unrelated repository issues.
  if (!current) return yield* error(404, 'Comment thread not found.');
  if (!write) {
    const replies = yield* listAll(
      token,
      GitHubComment,
      `/issues/${id}/comments`,
    );
    return { thread: current, replies: replies.map(message) };
  }
  if (current.closed || current.locked)
    return yield* error(
      409,
      'This thread is closed. Start a new comment instead.',
    );
  const value = yield* submission(request, CommentSubmission);
  const { data: reply } = yield* github(
    token,
    GitHubComment,
    `/issues/${id}/comments`,
    {
      body: formatMessage(value.name.trim(), value.body.trim()),
    },
  );
  return { message: message(reply) };
});
