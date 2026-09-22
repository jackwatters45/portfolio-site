import * as Array from 'effect/Array';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Match from 'effect/Match';
import * as Option from 'effect/Option';
import type * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import * as HttpBody from 'effect/unstable/http/HttpBody';
import * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse';
import {
  CommentError,
  type CommentSubmission,
  type CommentTarget,
  type ThreadSubmission,
} from '../lib/comments-schema';
import {
  GitHubIssue,
  GitHubMessage,
  GitHubThread,
} from '../lib/github-comments-schema';
import { GitHubClient } from './github-client';

export class Comments extends Context.Service<Comments>()('nz/Comments', {
  make: Effect.gen(function* () {
    const github = yield* GitHubClient;
    const label = 'nz-feedback';
    const messageSchema = GitHubMessage(github.owner);
    const decodeThread = Schema.decodeUnknownOption(GitHubThread(github.owner));
    const feedbackThread = (issue: typeof GitHubIssue.Type) =>
      Option.some(issue).pipe(
        Option.filter(
          (value) =>
            !value.pull_request &&
            value.user?.login === github.owner &&
            value.labels.some((value) => value.name === label),
        ),
        Option.flatMap(decodeThread),
      );

    // Store submissions as fenced JSON so visitor text cannot activate
    // GitHub mentions, HTML, or commands.
    const formatMessage = (
      name: string,
      body: string,
      target?: CommentTarget,
    ) => {
      const content = JSON.stringify(
        { name, body, ...(target ? { target } : {}) },
        null,
        2,
      );
      const code = '`'.repeat(
        Math.max(
          3,
          ...[...content.matchAll(/`+/g)].map(([run]) => run.length + 1),
        ),
      );
      return [
        `${code}json\n${content}\n${code}`,
        ...(target
          ? [
              `[View on the trip page](${import.meta.env.SITE}/#comment=${target.anchor})`,
            ]
          : []),
      ].join('\n\n');
    };

    const readError = () =>
      new CommentError({
        status: 502,
        message: 'Could not load comments. Please try again.',
      });
    const writeError = () =>
      new CommentError({
        status: 502,
        message:
          'Could not confirm the comment was saved. Refresh before trying again.',
      });

    const findThread = Effect.fn('Comments.findThread')(function* (id: string) {
      const response = yield* github.client.get(`/issues/${id}`);
      const data = yield* HttpClientResponse.schemaBodyJson(GitHubIssue)(
        response,
      ).pipe(Effect.timeout('12 seconds'), Effect.mapError(readError));
      // Never expose or write to unrelated repository issues.
      return yield* Option.match(feedbackThread(data), {
        onNone: () =>
          new CommentError({
            status: 404,
            message: 'Comment thread not found.',
          }),
        onSome: Effect.succeed,
      });
    });

    const list = Effect.fn('Comments.list')(function* () {
      const issues = yield* github.listAll(
        GitHubIssue,
        `/issues?state=all&creator=${github.owner}&labels=${label}&sort=created&direction=asc`,
      );
      return { threads: Array.getSomes(issues.map(feedbackThread)) };
    });

    const create = Effect.fn('Comments.create')(function* (
      value: typeof ThreadSubmission.Type,
    ) {
      const response = yield* github.client.post('/issues', {
        body: HttpBody.jsonUnsafe({
          title: `[NZ feedback] ${value.target.quote.replace(/\s+/g, ' ').slice(0, 100)}`,
          body: formatMessage(
            value.name.trim(),
            value.body.trim(),
            value.target,
          ),
          labels: [label],
        }),
      });
      const data = yield* HttpClientResponse.schemaBodyJson(GitHubIssue)(
        response,
      ).pipe(Effect.timeout('12 seconds'), Effect.mapError(writeError));
      const created = yield* Option.match(feedbackThread(data), {
        onNone: () =>
          new CommentError({
            status: 502,
            message:
              'The issue was saved, but its feedback label is missing. Please contact Jack.',
          }),
        onSome: Effect.succeed,
      });
      return { thread: created };
    });

    const read = Effect.fn('Comments.read')(function* (id: string) {
      const current = yield* findThread(id);
      const replies = yield* github.listAll(
        messageSchema,
        `/issues/${id}/comments`,
      );
      return { thread: current, replies };
    });

    const reply = Effect.fn('Comments.reply')(function* (
      id: string,
      value: typeof CommentSubmission.Type,
    ) {
      yield* findThread(id).pipe(
        Effect.flatMap((current) =>
          Match.value(current).pipe(
            Match.whenOr(
              { closed: true },
              { locked: true },
              () =>
                new CommentError({
                  status: 409,
                  message:
                    'This thread is closed. Start a new comment instead.',
                }),
            ),
            Match.orElse(() => Effect.void),
          ),
        ),
      );
      const response = yield* github.client.post(`/issues/${id}/comments`, {
        body: HttpBody.jsonUnsafe({
          body: formatMessage(value.name.trim(), value.body.trim()),
        }),
      });
      const data = yield* HttpClientResponse.schemaBodyJson(messageSchema)(
        response,
      ).pipe(Effect.timeout('12 seconds'), Effect.mapError(writeError));
      return { message: data };
    });

    return { list, create, read, reply };
  }),
}) {
  static layer(token: Redacted.Redacted<string>) {
    return Layer.effect(this, this.make).pipe(
      Layer.provide(GitHubClient.layer(token)),
    );
  }
}
