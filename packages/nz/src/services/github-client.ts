import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import type * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import * as HttpClient from 'effect/unstable/http/HttpClient';
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest';
import * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse';
import { CommentError } from '../lib/comments-schema';
import { OWNER } from '../lib/github-comments';

const API = `https://api.github.com/repos/${OWNER}/portfolio-site`;

export class GitHubClient extends Context.Service<GitHubClient>()(
  'nz/GitHubClient',
  {
    make: (token: Redacted.Redacted<string>) => Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      const client = http.pipe(
        HttpClient.mapRequest((request) => request.pipe(
          HttpClientRequest.prependUrl(API),
          HttpClientRequest.bearerToken(token),
          HttpClientRequest.setHeaders({
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'nz-trip-comments',
          }),
        )),
        HttpClient.transform((response, request) => {
          const unavailable = () => new CommentError({
            status: 502,
            message: request.method === 'POST'
              ? 'Could not confirm the comment was saved. Refresh before trying again.'
              : 'Could not load comments. Please try again.',
          });
          return response.pipe(
            Effect.timeout('12 seconds'),
            Effect.mapError(unavailable),
            Effect.filterOrFail(
              (response) => response.status !== 429 && response.headers['x-ratelimit-remaining'] !== '0',
              () => new CommentError({ status: 429, message: 'Comments are busy. Please try again in a minute.' }),
            ),
            Effect.flatMap(HttpClientResponse.matchStatus({
              404: () => new CommentError({ status: 404, message: 'Comment thread not found.' }),
              '2xx': (response) => Effect.succeed(response),
              orElse: unavailable,
            })),
          );
        }),
      );

      const listAll = Effect.fn('GitHubClient.listAll')(<A>(schema: Schema.Codec<A, unknown>, path: string) =>
        Stream.paginate(1, (page) => Effect.gen(function* () {
          yield* Effect.succeed(page).pipe(Effect.filterOrFail(
            (value) => value <= 20,
            () => new CommentError({ status: 503, message: 'There are too many comments to load. Please contact Jack.' }),
          ));
          const response = yield* client.get(path, { urlParams: { per_page: 100, page } });
          const data = yield* HttpClientResponse.schemaBodyJson(Schema.Array(schema))(response).pipe(
            Effect.timeout('12 seconds'),
            Effect.mapError(() => new CommentError({ status: 502, message: 'Could not load comments. Please try again.' })),
          );
          const next = Option.some(page + 1).pipe(Option.filter(() => response.headers.link?.includes('rel="next"') ?? false));
          return [data, next] as const;
        })).pipe(Stream.runCollect),
      );

      return { client, listAll };
    }),
  },
) {
  static layer(token: Redacted.Redacted<string>) {
    return Layer.effect(this, this.make(token));
  }
}
