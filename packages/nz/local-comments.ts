import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import { loadEnv } from 'vite';
import { GitHubAuth } from './src/services/github-auth';

export function localComments(): AstroIntegration {
  return {
    name: 'local-comments-credentials',
    hooks: {
      'astro:config:setup': async ({ command, updateConfig }) => {
        if (command !== 'dev') return;
        const variables = {
          ...loadEnv(
            'development',
            fileURLToPath(new URL('../..', import.meta.url)),
            'NZ_FEEDBACK_',
          ),
          ...process.env,
        };
        const { token } = await Effect.runPromise(
          GitHubAuth.pipe(Effect.provide(GitHubAuth.localLayer(variables))),
        );
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'local-comments-token',
                configEnvironment(name) {
                  if (name !== 'ssr') return;
                  return {
                    define: {
                      'process.env.NZ_FEEDBACK_GITHUB_TOKEN': JSON.stringify(
                        Redacted.value(token),
                      ),
                    },
                  };
                },
              },
            ],
          },
        });
      },
    },
  };
}
