import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Config, Effect, Redacted, Schema } from 'effect';

import type { WorkspaceDurableObject } from './src/cloudflare/worker';

const localAuthSecret = 'mood-board-local-development-secret';

const productionAuthSecret = Schema.Redacted(Schema.String).check(
  Schema.makeFilter(
    (secret) =>
      Redacted.value(secret).length >= 32 &&
      Redacted.value(secret) !== localAuthSecret,
    { message: 'Use a production auth secret of at least 32 characters.' },
  ),
);

export const moodBoard = Effect.gen(function* () {
  const stage = yield* Alchemy.Stage;
  const { dev: isAlchemyDev } = yield* Alchemy.AlchemyContext;
  const domain = 'moodboard.jackwatters.dev';
  const origin = isAlchemyDev ? 'http://localhost:8787' : `https://${domain}`;

  const catalog = yield* Cloudflare.D1.Database('mood-board-catalog', {
    migrations: 'packages/mood-board/src/cloudflare/d1-migrations',
  });

  const media = yield* Cloudflare.R2.Bucket('mood-board-media', {
    domains: [],
    cors: [],
  });

  const authRateLimit = Cloudflare.RateLimit('mood-board-auth-rate-limit', {
    namespaceId: 1002,
    simple: { limit: 5, period: 60 },
  });

  const workspaces = Cloudflare.DurableObject<WorkspaceDurableObject>(
    'mood-board-workspaces',
    { className: 'WorkspaceDurableObject' },
  );

  return yield* Cloudflare.Website.Vite('mood-board', {
    rootDir: 'packages/mood-board',
    main: 'src/cloudflare/worker.ts',
    compatibility: {
      date: isAlchemyDev ? '2026-07-11' : '2026-07-28',
      flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    },
    assets: {
      // Vite's module-runner WebSocket must bypass the SPA asset fallback.
      runWorkerFirst: isAlchemyDev
        ? true
        : [
            '/',
            '/rpc',
            '/rpc/*',
            '/api/*',
            '/boards/*',
            '/demo',
            '/demo/*',
            '/profile*',
            '/media/*',
            '/_internal/*',
            '/health',
          ],
      notFoundHandling: 'single-page-application',
    },
    env: {
      CATALOG: catalog,
      MEDIA: media,
      WORKSPACES: workspaces,
      AUTH_RATE_LIMIT: authRateLimit,
      BETTER_AUTH_SECRET: isAlchemyDev
        ? Config.Redacted('BETTER_AUTH_SECRET').pipe(
            Config.withDefault(Redacted.make(localAuthSecret)),
          )
        : Config.schema(productionAuthSecret, 'BETTER_AUTH_SECRET'),
      BETTER_AUTH_URL: origin,
      TRUSTED_ORIGINS:
        process.env.TRUSTED_ORIGINS?.trim() ||
        [origin, 'http://localhost:5173', 'http://localhost:8787'].join(','),
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
      GOOGLE_CLIENT_SECRET: Config.Redacted('GOOGLE_CLIENT_SECRET').pipe(
        Config.withDefault(Redacted.make('')),
      ),
      RESEND_API_KEY: Config.Redacted('RESEND_API_KEY').pipe(
        Config.withDefault(Redacted.make('')),
      ),
      EMAIL_SENDER: process.env.EMAIL_SENDER ?? '',
      IS_LOCAL: isAlchemyDev ? 'true' : '',
      MEDIA_UPLOADS_PER_HOUR: process.env.MEDIA_UPLOADS_PER_HOUR ?? '180',
      MEDIA_UPLOAD_BYTES_PER_DAY:
        process.env.MEDIA_UPLOAD_BYTES_PER_DAY ?? '268435456',
      MEDIA_STORAGE_BYTES: process.env.MEDIA_STORAGE_BYTES ?? '1073741824',
      MEDIA_RESERVATION_TTL_MS:
        process.env.MEDIA_RESERVATION_TTL_MS ?? '600000',
      VITE_RPC_TRANSPORT: 'http',
    },
    crons: ['17 3 * * *'],
    dev: { host: '127.0.0.1', port: 8787, strictPort: true },
    domain: stage === 'prod' ? domain : undefined,
    workersDev: { enabled: false, previewsEnabled: false },
    memo: {
      include: [
        '../../alchemy.run.ts',
        'alchemy.run.ts',
        'index.html',
        'package.json',
        'public/**',
        'src/**',
        'tsconfig.json',
        'vite.config.ts',
      ],
      lockfile: true,
    },
  });
});
