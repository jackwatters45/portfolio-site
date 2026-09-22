import { resolve } from 'node:path';
import * as Redacted from 'effect/Redacted';
import { loadEnv, type Plugin } from 'vite';
import { type CommentsEnv, handleComments } from './comments';
import { loadGitHubToken } from './github-auth';

function localLimit(limit: number) {
  let count = 0;
  let resetAt = 0;
  return {
    async limit() {
      if (Date.now() >= resetAt) {
        count = 0;
        resetAt = Date.now() + 60_000;
      }
      return { success: ++count <= limit };
    },
  };
}

// Astro still builds static HTML. This middleware only mirrors the separate
// Worker API during `astro dev`; it is never shipped to the browser.
export function commentsDev(): Plugin {
  let env: CommentsEnv;
  return {
    name: 'nz-comments-api',
    apply: 'serve',
    async configResolved(config) {
      const variables = {
        ...loadEnv(config.mode, resolve(config.root, '../..'), 'NZ_FEEDBACK_'),
        ...loadEnv(config.mode, config.envDir, 'NZ_FEEDBACK_'),
        ...process.env,
      };
      const credential = await loadGitHubToken(variables);
      env = {
        NZ_FEEDBACK_GITHUB_TOKEN: credential ? Redacted.value(credential) : '',
        COMMENT_READ_LIMIT: localLimit(60),
        COMMENT_WRITE_LIMIT: localLimit(6),
      };
    },
    configureServer(server) {
      server.middlewares.use(async (incoming, outgoing, next) => {
        if (!incoming.url?.startsWith('/api/')) return next();
        try {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of incoming) {
            const bytes = Buffer.from(chunk);
            size += bytes.byteLength;
            if (size > 16_384) {
              outgoing.writeHead(413, { 'Content-Type': 'application/json' });
              outgoing.end(
                JSON.stringify({ error: 'This comment is too long.' }),
              );
              return;
            }
            chunks.push(bytes);
          }
          const headers = new Headers();
          for (const [key, value] of Object.entries(incoming.headers)) {
            if (value)
              headers.set(key, Array.isArray(value) ? value.join(', ') : value);
          }
          const request = new Request(
            new URL(incoming.url, `http://${incoming.headers.host}`),
            {
              method: incoming.method,
              headers,
              body: size ? Buffer.concat(chunks).toString() : undefined,
            },
          );
          const response = await handleComments(request, env);
          outgoing.writeHead(
            response.status,
            Object.fromEntries(response.headers),
          );
          outgoing.end(await response.text());
        } catch {
          outgoing.writeHead(500, { 'Content-Type': 'application/json' });
          outgoing.end(
            JSON.stringify({ error: 'The local comments API is unavailable.' }),
          );
        }
      });
    },
  };
}
