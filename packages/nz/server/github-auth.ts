import * as NodeServices from '@effect/platform-node/NodeServices';
import * as Auth from 'alchemy/Auth';
import * as GitHub from 'alchemy/GitHub';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import { commentToken } from './token';

// Server-side credential resolution, shared by local development and Alchemy.
// Explicitly provide the layer: this Alchemy release does not mark
// GitHubCredentials as a service that can pass through a Stack's types.
export const gitHubToken = Effect.flatten(GitHub.GitHubCredentials).pipe(
  Effect.map((credentials) => credentials.token),
  Effect.provide(GitHub.providers()),
);

export function loadGitHubToken(variables: Record<string, string | undefined>) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const override = yield* commentToken;
      if (Redacted.value(override).trim()) return override;
      return yield* gitHubToken;
    }).pipe(
      Effect.provideService(Auth.AuthProviders, {}),
      Effect.provide(NodeServices.layer),
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromUnknown(variables)),
      ),
      // Missing local auth must not prevent the static trip page from running.
      // Do not log provider errors: they can contain credential command output.
      Effect.catchCause(() => Effect.succeed(undefined)),
    ),
  );
}
