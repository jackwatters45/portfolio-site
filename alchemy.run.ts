import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Config, Redacted } from 'effect';
import * as Effect from 'effect/Effect';
import type { WorkspaceDurableObject } from './packages/mood-board/src/cloudflare/worker';

const isAlchemyDev = ['true', '1', 'yes', 'on'].includes(
  (process.env.ALCHEMY_DEV ?? '').trim().toLowerCase(),
);
const moodBoardDomain = 'moodboard.jackwatters.dev';
const moodBoardOrigin = isAlchemyDev
  ? 'http://localhost:8787'
  : `https://${moodBoardDomain}`;

export default Alchemy.Stack(
  'portfolio-site',
  {
    providers: Cloudflare.providers(),
    state: isAlchemyDev ? Alchemy.localState() : Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;

    const site = yield* Cloudflare.Website.StaticSite('site', {
      // Preserve the live Worker name when recovering the pre-upgrade state.
      name:
        stage === 'prod'
          ? 'portfolio-site-worker-prod-pajru7f2ajoqabdc'
          : undefined,
      command: 'bun run build --filter=@personal-sites/portfolio',
      outdir: 'packages/portfolio/dist',
      dev: {
        command: 'bun run --cwd packages/portfolio dev',
      },
      domain:
        stage === 'prod'
          ? { name: 'jackwatters.dev', aliases: ['www.jackwatters.dev'] }
          : undefined,
    });

    const tacos = yield* Cloudflare.Website.StaticSite('tacos', {
      command: 'bun run build --filter=@personal-sites/tacos',
      outdir: 'packages/tacos/dist',
      dev: { command: 'bun run --cwd packages/tacos dev' },
      domain:
        stage === 'prod'
          ? {
              name: 'tacos.jackwatters.dev',
              redirects: ['www.tacos.jackwatters.dev'],
            }
          : undefined,
      assets: { notFoundHandling: '404-page' },
    });

    const sangas = yield* Cloudflare.Website.StaticSite('sangas', {
      command: 'bun run build --filter=@personal-sites/sangas',
      outdir: 'packages/sangas/dist',
      dev: { command: 'bun run --cwd packages/sangas dev' },
      domain:
        stage === 'prod'
          ? {
              name: 'sangas.jackwatters.dev',
              redirects: ['www.sangas.jackwatters.dev'],
            }
          : undefined,
      assets: { notFoundHandling: '404-page' },
    });

    const catalog = yield* Cloudflare.D1.Database('mood-board-catalog', {
      migrations: 'packages/mood-board/src/cloudflare/d1-migrations',
    });
    const media = yield* Cloudflare.R2.Bucket('mood-board-media', {
      domains: [],
      cors: [],
    });
    const authRateLimit = Cloudflare.RateLimit('mood-board-auth-rate-limit', {
      namespaceId: 1001,
      simple: { limit: 5, period: 60 },
    });
    const workspaces = Cloudflare.DurableObject<WorkspaceDurableObject>(
      'mood-board-workspaces',
      { className: 'WorkspaceDurableObject' },
    );
    const moodBoard = yield* Cloudflare.Website.Vite('mood-board', {
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
          ? Config.redacted('BETTER_AUTH_SECRET').pipe(
              Config.withDefault(
                Redacted.make('mood-board-local-development-secret'),
              ),
            )
          : Config.redacted('BETTER_AUTH_SECRET'),
        BETTER_AUTH_URL: moodBoardOrigin,
        TRUSTED_ORIGINS:
          process.env.TRUSTED_ORIGINS?.trim() ||
          [
            moodBoardOrigin,
            'http://localhost:5173',
            'http://localhost:8787',
          ].join(','),
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
        GOOGLE_CLIENT_SECRET: Config.redacted('GOOGLE_CLIENT_SECRET').pipe(
          Config.withDefault(Redacted.make('')),
        ),
        RESEND_API_KEY: Config.redacted('RESEND_API_KEY').pipe(
          Config.withDefault(Redacted.make('')),
        ),
        EMAIL_SENDER: process.env.EMAIL_SENDER ?? '',
        IS_LOCAL: isAlchemyDev ? 'true' : '',
        LEGACY_WORKSPACE_OWNER_ID:
          process.env.LEGACY_WORKSPACE_OWNER_ID?.trim() ?? '',
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
      domain: stage === 'prod' ? moodBoardDomain : undefined,
      workersDev: { enabled: false, previewsEnabled: false },
      memo: {
        include: [
          '../../alchemy.run.ts',
          'index.html',
          'package.json',
          'public/**',
          'src/**',
          'tsconfig*.json',
          'vite.config.ts',
        ],
        lockfile: true,
      },
    });

    return {
      site: site.url,
      tacos: tacos.url,
      sangas: sangas.url,
      moodBoard: moodBoard.url,
    };
  }),
);
