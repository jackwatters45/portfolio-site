import * as Array from 'effect/Array';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Match from 'effect/Match';
import * as Option from 'effect/Option';
import type * as Redacted from 'effect/Redacted';
import {
  CommentError,
  type CommentSubmission,
  type ThreadSubmission,
} from '../lib/comments-schema';
import { GitHubClient } from './github-client';
import {
  GitHubComment,
  GitHubIssue,
  LABEL,
  OWNER,
  formatMessage,
  message,
  thread,
} from '../lib/github-comments';

export class Comments extends Context.Service<Comments>()(
  "nz/Comments",
  { make: Effect.gen(function* () {
  const github = yield* GitHubClient;

  const findThread = Effect.fn('Comments.findThread')(function* (id: string) {
    const { data } = yield* github.request(GitHubIssue, `/issues/${id}`);
    // Never expose or write to unrelated repository issues.
    return yield* Option.match(thread(data), {
      onNone: () => new CommentError({ status: 404, message: 'Comment thread not found.' }),
      onSome: Effect.succeed,
    });
  });

  const list = Effect.fn('Comments.list')(function* () {
    const issues = yield* github.listAll(
      GitHubIssue,
      `/issues?state=all&creator=${OWNER}&labels=${LABEL}&sort=created&direction=asc`,
    );
    return { threads: Array.filterMap(issues, thread) };
  });

  const create = Effect.fn('Comments.create')(function* (value: typeof ThreadSubmission.Type) {
    const { data } = yield* github.request(GitHubIssue, '/issues', {
      title: `[NZ feedback] ${value.target.quote.replace(/\s+/g, ' ').slice(0, 100)}`,
      body: formatMessage(value.name.trim(), value.body.trim(), value.target),
      labels: [LABEL],
    });
    const created = yield* Option.match(thread(data), {
      onNone: () => new CommentError({
        status: 502,
        message: 'The issue was saved, but its feedback label is missing. Please contact Jack.',
      }),
      onSome: Effect.succeed,
    });
    return { thread: created };
  });

  const read = Effect.fn('Comments.read')(function* (id: string) {
    const current = yield* findThread(id);
    const replies = yield* github.listAll(GitHubComment, `/issues/${id}/comments`);
    return { thread: current, replies: replies.map(message) };
  });

  const reply = Effect.fn('Comments.reply')(function* (
    id: string,
    value: typeof CommentSubmission.Type,
  ) {
    yield* findThread(id).pipe(
      Effect.flatMap((current) => Match.value(current).pipe(
        Match.whenOr({ closed: true }, { locked: true }, () => new CommentError({
          status: 409,
          message: 'This thread is closed. Start a new comment instead.',
        })),
        Match.orElse(() => Effect.void),
      )),
    );
    const { data } = yield* github.request(GitHubComment, `/issues/${id}/comments`, {
      body: formatMessage(value.name.trim(), value.body.trim()),
    });
    return { message: message(data) };
  });

  return { list, create, read, reply };
}) },
) {
  static layer(token: Redacted.Redacted<string>) {
    return Layer.effect(this, this.make).pipe(Layer.provide(GitHubClient.layer(token)));
  }
}
