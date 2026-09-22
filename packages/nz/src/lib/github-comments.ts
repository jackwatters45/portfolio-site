import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { CommentName, CommentTarget, type CommentMessage, type CommentThread } from './comments-schema';

export const OWNER = 'jackwatters45';
export const LABEL = 'nz-feedback';
const NameMetadata = Schema.Struct({ name: CommentName });
const ThreadMetadata = Schema.Struct({
  ...NameMetadata.fields,
  ...CommentTarget.fields,
});
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

// Existing issues keep their metadata and fences. Visitor text cannot activate
// GitHub mentions, HTML, or issue commands, including when it contains backticks.
const fence = (value: string, minimum: number) =>
  '`'.repeat(
    Math.max(
      minimum,
      ...[...value.matchAll(/`+/g)].map(([run]) => run.length + 1),
    ),
  );

export function formatMessage(name: string, body: string, target?: CommentTarget) {
  const metadata = encodeURIComponent(JSON.stringify({ name, ...target }));
  const code = fence(body, 3);
  const inline = fence(name, 1);
  return [
    `<!-- nz-feedback:v1 ${metadata} -->`,
    `**From:** ${inline} ${name} ${inline}`,
    `${code}text\n${body}\n${code}`,
    ...(target
      ? [`[View on the trip page](${import.meta.env.SITE}/#comment=${target.anchor})`]
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

export function message(value: typeof GitHubComment.Type): CommentMessage {
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

export function thread(issue: typeof GitHubIssue.Type): Option.Option<CommentThread> {
  return Option.fromNullishOr(metadata(ThreadMetadata, issue.body)).pipe(
    Option.filter(() => !issue.pull_request && issue.user?.login === OWNER &&
      issue.labels.some((label) => label.name === LABEL)),
    Option.map((meta) => ({
      id: issue.number,
      anchor: meta.anchor,
      quote: meta.quote,
      closed: issue.state === 'closed',
      locked: issue.locked,
      replyCount: issue.comments,
      message: message(issue),
    })),
  );
}

