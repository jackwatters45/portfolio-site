import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Match from 'effect/Match';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import * as HttpClient from 'effect/unstable/http/HttpClient';
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest';
import * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse';
import { CommentError } from '../lib/comments-schema';
import { OWNER } from '../lib/github-comments';

const API = `https://api.github.com/repos/${OWNER}/portfolio-site`;

export class GitHubClient extends Context.Service<GitHubClient>()(
  "nz/GitHubClient",
  { make: (token: Redacted.Redacted<string>) => Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient;

  const request = Effect.fn('GitHubClient.request')(function* <A>(
    schema: Schema.Codec<A, unknown>,
    path: string,
    body?: Schema.Json,
  ) {
    const unavailable = () => new CommentError({
      status: 502,
      message: body
        ? 'Could not confirm the comment was saved. Refresh before trying again.'
        : 'Could not load comments. Please try again.',
    });
    const input = HttpClientRequest.make(body ? 'POST' : 'GET')(`${API}${path}`).pipe(
      HttpClientRequest.bearerToken(token),
      HttpClientRequest.setHeaders({
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'nz-trip-comments',
      }),
    );
    const response = yield* client.execute(
      body ? HttpClientRequest.bodyJsonUnsafe(input, body) : input,
    ).pipe(Effect.timeout('12 seconds'), Effect.mapError(unavailable));
    const data = yield* Match.value(response).pipe(
      Match.whenOr({ status: 429 }, { headers: { 'x-ratelimit-remaining': '0' } }, () =>
        new CommentError({ status: 429, message: 'Comments are busy. Please try again in a minute.' }),
      ),
      Match.orElse(HttpClientResponse.matchStatus({
        404: () => new CommentError({ status: 404, message: 'Comment thread not found.' }),
        '2xx': (response) => HttpClientResponse.schemaBodyJson(schema)(response).pipe(
          Effect.timeout('12 seconds'), Effect.mapError(unavailable),
        ),
        orElse: unavailable,
      })),
    );
    return { data, more: response.headers.link?.includes('rel="next"') ?? false };
  });

  const listAll = Effect.fn('GitHubClient.listAll')(function* <A>(
    schema: Schema.Codec<A, unknown>, path: string,
  ) {
    const values: A[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data, more } = yield* request(
        Schema.Array(schema), `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
      );
      values.push(...data);
      if (!more) return values;
    }
    return yield* new CommentError({status: 503, message: 'There are too many comments to load. Please contact Jack.'});
  });

  return { request, listAll };
}) },
) {
  static layer(token: Redacted.Redacted<string>) {
    return Layer.effect(this, this.make(token));
  }
}
