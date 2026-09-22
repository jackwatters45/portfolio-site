import * as NodeServices from '@effect/platform-node/NodeServices';
import * as Auth from 'alchemy/Auth';
import * as GitHub from 'alchemy/GitHub';
import * as Config from 'effect/Config';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Match from 'effect/Match';
import * as Redacted from 'effect/Redacted';

// Deployment and local Astro setup only. Never import this into an API route.
export class GitHubAuth extends Context.Service<GitHubAuth>()('nz/GitHubAuth', {
  make: Effect.gen(function* () {
    const credentials = yield* Effect.flatten(GitHub.GitHubCredentials);
    return { token: credentials.token };
  }).pipe(Effect.provide(GitHub.providers())),
}) {
  static readonly layer = Layer.effect(this, this.make);

  static localLayer(variables: Record<string, string | undefined>) {
    return Layer.effect(this, Effect.gen(function* () {
      const token = yield* Config.Redacted('NZ_FEEDBACK_GITHUB_TOKEN').pipe(
        Config.withDefault(Redacted.make('')),
      );
      return yield* Match.value(Redacted.value(token).trim()).pipe(
        Match.when('', () => GitHubAuth.make),
        Match.orElse(() => Effect.succeed({ token })),
      );
    }).pipe(
      Effect.provideService(Auth.AuthProviders, {}),
      Effect.provide(NodeServices.layer),
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(variables))),
      // Missing local credentials must not prevent static pages from running.
      Effect.catchCause(() => Effect.succeed({ token: Redacted.make('') })),
    ));
  }
}
