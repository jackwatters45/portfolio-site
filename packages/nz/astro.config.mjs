import { fileURLToPath } from 'node:url';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import { loadEnv } from 'vite';
import { localGitHubToken } from './server/github-auth';

export default defineConfig({
  site: 'https://nz.jackwatters.dev',
  output: 'static',
  adapter: cloudflare({ platformProxy: { enabled: false } }),
  integrations: [
    react(),
    {
      name: 'local-comments-credentials',
      hooks: {
        'astro:config:setup': async ({ command }) => {
          if (command !== 'dev') return;
          const variables = {
            ...loadEnv(
              'development',
              fileURLToPath(new URL('../..', import.meta.url)),
              'NZ_FEEDBACK_',
            ),
            ...process.env,
          };
          const token = await Effect.runPromise(localGitHubToken(variables));
          process.env.NZ_FEEDBACK_GITHUB_TOKEN = Redacted.value(token);
        },
      },
    },
  ],
  server: { port: 4325 },
  vite: { ssr: { noExternal: ['@astrojs/react'] } },
});
