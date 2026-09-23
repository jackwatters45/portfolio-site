import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { moodBoard } from './packages/mood-board/alchemy.run';

export default Alchemy.Stack(
  'portfolio-site',
  {
    providers: Cloudflare.providers(),
    state: Layer.unwrap(
      Effect.map(Alchemy.AlchemyContext, ({ dev }) =>
        dev ? Alchemy.localState() : Cloudflare.state(),
      ),
    ),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const commentsPort = 4340;
    const comments = yield* Cloudflare.Worker('comments', {
      main: './packages/comments/src/worker.ts',
      compatibility: { date: '2026-01-14' },
      dev: { port: commentsPort, strictPort: true },
      workersDev: false,
      env: {
        COMMENT_ROOMS: 'nz-trip',
        COMMENT_ORIGINS:
          stage === 'prod'
            ? 'https://nz.jackwatters.dev'
            : 'http://localhost:4325,http://localhost:4326,http://localhost:4335,http://127.0.0.1:4325',
        COMMENT_ROOMS_STORE: Cloudflare.DurableObject('CommentRoom'),
        COMMENT_CONNECT_LIMIT: Cloudflare.RateLimit('COMMENT_CONNECT_LIMIT', {
          namespaceId: 1001,
          simple: { limit: 30, period: 60 },
        }),
      },
    });

    const site = yield* Cloudflare.Website.StaticSite('site', {
      // Preserve the live Worker name when recovering the pre-upgrade state.
      name:
        stage === 'prod'
          ? 'portfolio-site-worker-prod-pajru7f2ajoqabdc'
          : undefined,
      command: 'bun run build --filter=@personal-sites/portfolio',
      outdir: 'packages/portfolio/dist',
      dev: {
        command: 'bun run dev',
        cwd: 'packages/portfolio',
      },
      domain:
        stage === 'prod'
          ? { name: 'jackwatters.dev', aliases: ['www.jackwatters.dev'] }
          : undefined,
    });

    const tacos = yield* Cloudflare.Website.StaticSite('tacos', {
      command: 'bun run build --filter=@personal-sites/tacos',
      outdir: 'packages/tacos/dist',
      dev: { command: 'bun run dev', cwd: 'packages/tacos' },
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
      dev: { command: 'bun run dev', cwd: 'packages/sangas' },
      domain:
        stage === 'prod'
          ? {
              name: 'sangas.jackwatters.dev',
              redirects: ['www.sangas.jackwatters.dev'],
            }
          : undefined,
      assets: { notFoundHandling: '404-page' },
    });

    const moodBoardSite = yield* moodBoard;

    const nz = yield* Cloudflare.Website.StaticSite('nz', {
      command: 'bun run build --filter=@personal-sites/nz',
      outdir: 'packages/nz/dist/client',
      main: './packages/nz/dist/server/entry.mjs',
      env: { COMMENTS: comments },
      dev: {
        command: 'bun run dev',
        cwd: 'packages/nz',
        // Astro must retain dev mode when Alchemy starts the subprocess.
        env: {
          NODE_ENV: 'development',
          COMMENTS_DEV_URL: `http://localhost:${commentsPort}`,
        },
        url: 'http://localhost:4325',
      },
      domain:
        stage === 'prod'
          ? {
              name: 'nz.jackwatters.dev',
              redirects: ['www.nz.jackwatters.dev'],
            }
          : undefined,
      assets: {
        notFoundHandling: '404-page',
        runWorkerFirst: ['/api/*'],
      },
    });

    return {
      site: site.url,
      tacos: tacos.url,
      sangas: sangas.url,
      nz: nz.url,
      moodBoard: moodBoardSite.url,
    };
  }),
);
