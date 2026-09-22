import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import * as SchemaGetter from 'effect/SchemaGetter';
import * as SchemaIssue from 'effect/SchemaIssue';
import {
  CommentMessage,
  CommentSubmission,
  CommentThread,
  ThreadSubmission,
} from './comments-schema';

export const GitHubComment = Schema.Struct({
  id: Schema.Number,
  body: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  user: Schema.NullOr(Schema.Struct({ login: Schema.String })),
});

export const GitHubIssue = Schema.Struct({
  ...GitHubComment.fields,
  number: Schema.Number,
  state: Schema.String,
  locked: Schema.Boolean,
  comments: Schema.Number,
  labels: Schema.Array(Schema.Struct({ name: Schema.String })),
  pull_request: Schema.optionalKey(Schema.Unknown),
});

function submission<A>(schema: Schema.Codec<A, unknown>, body: string | null) {
  return Option.fromNullishOr(
    body?.match(/^(`{3,})json\n([\s\S]*?)\n\1(?:\n|$)/)?.[2],
  ).pipe(
    Option.flatMap(Schema.decodeUnknownOption(Schema.fromJsonString(schema))),
  );
}

function messageFields(owner: string, value: typeof GitHubComment.Type) {
  const author = submission(CommentSubmission, value.body).pipe(
    // Only site submissions can supply visitor names. Native GitHub replies
    // keep their GitHub author and body.
    Option.filter(() => value.user?.login === owner),
    Option.getOrElse(() => ({
      name: value.user?.login ?? 'GitHub',
      body: value.body ?? '',
    })),
  );
  return { id: value.id, ...author, createdAt: value.created_at };
}

// Read-only projections: GitHub IDs, authors, and timestamps cannot be rebuilt
// from our public models. Writes use the Comments service's message formatter.
export const GitHubMessage = (owner: string) =>
  GitHubComment.pipe(
    Schema.decodeTo(CommentMessage, {
      decode: SchemaGetter.transform((value) => messageFields(owner, value)),
      encode: SchemaGetter.forbidden(
        () => 'Comment messages cannot be encoded as GitHub responses.',
      ),
    }),
  );

export const GitHubThread = (owner: string) =>
  GitHubIssue.pipe(
    Schema.decodeTo(CommentThread, {
      decode: SchemaGetter.transformEffect((issue) =>
        submission(ThreadSubmission, issue.body).pipe(
          Option.match({
            onNone: () =>
              Effect.fail(
                new SchemaIssue.InvalidValue({
                  message: 'Missing or invalid comment submission.',
                }),
              ),
            onSome: (meta) =>
              Effect.succeed({
                id: issue.number,
                anchor: meta.target.anchor,
                quote: meta.target.quote,
                closed: issue.state === 'closed',
                locked: issue.locked,
                replyCount: issue.comments,
                message: messageFields(owner, issue),
              }),
          }),
        ),
      ),
      encode: SchemaGetter.forbidden(
        () => 'Comment threads cannot be encoded as GitHub responses.',
      ),
    }),
  );
