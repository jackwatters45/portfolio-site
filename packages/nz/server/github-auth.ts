import * as NodeServices from '@effect/platform-node/NodeServices';
import * as Auth from 'alchemy/Auth';
import * as GitHub from 'alchemy/GitHub';
import * as Config from 'effect/Config';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';

// Deployment and local Astro setup only. Never import this into an API route.
export const gitHubToken = Effect.flatten(GitHub.GitHubCredentials).pipe(
  Effect.map((credentials) => credentials.token),
  Effect.provide(GitHub.providers()),
);

export const localGitHubToken = (
  variables: Record<string, string | undefined>,
) =>
  Effect.gen(function* () {
    const override = yield* Config.Redacted('NZ_FEEDBACK_GITHUB_TOKEN').pipe(
      Config.withDefault(Redacted.make('')),
    );
    return Redacted.value(override).trim() ? override : yield* gitHubToken;
  }).pipe(
    Effect.provideService(Auth.AuthProviders, {}),
    Effect.provide(NodeServices.layer),
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(variables))),
    // Missing local credentials must not prevent the static pages from running.
    Effect.catchCause(() => Effect.succeed(Redacted.make(''))),
  );
