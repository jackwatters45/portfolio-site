import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as GitHub from 'alchemy/GitHub';
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import { GitHubAuth } from './packages/nz/services/github-auth';

export default Alchemy.Stack(
  'portfolio-site',
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const ci = yield* Config.Boolean('CI').pipe(Config.withDefault(false));
    if (ci) {
      const token = yield* Config.Redacted('GITHUB_ACCESS_TOKEN').pipe(
        Config.withDefault(Redacted.make('')),
      );
      if (!Redacted.value(token).trim()) {
        return yield* Effect.die(
          new Error(
            'Set the NZ_FEEDBACK_GITHUB_TOKEN Actions secret from your gh login. The temporary Actions GITHUB_TOKEN cannot authenticate the deployed comments Worker.',
          ),
        );
      }
    }
    const { token } = yield* GitHubAuth.pipe(Effect.provide(GitHubAuth.layer));

    if (stage === 'prod') {
      // Keep the persistent credential available to future CI deployments.
      yield* GitHub.Secret('nz-feedback-github-token', {
        owner: 'jackwatters45',
        repository: 'portfolio-site',
        name: 'NZ_FEEDBACK_GITHUB_TOKEN',
        value: token,
      });
    }

    const site = yield* Cloudflare.Website.StaticSite('site', {
      // Preserve the live Worker name when recovering the pre-upgrade state.
      name:
        stage === 'prod'
          ? 'portfolio-site-worker-prod-pajru7f2ajoqabdc'
          : undefined,
      command: 'bun run build --filter=@personal-sites/portfolio',
      outdir: 'packages/portfolio/dist',
      dev: {
        command: 'bun run dev --filter=@personal-sites/portfolio',
      },
      domain:
        stage === 'prod'
          ? { name: 'jackwatters.dev', aliases: ['www.jackwatters.dev'] }
          : undefined,
    });

    const tacos = yield* Cloudflare.Website.StaticSite('tacos', {
      command: 'bun run build --filter=@personal-sites/tacos',
      outdir: 'packages/tacos/dist',
      dev: { command: 'bun run dev --filter=@personal-sites/tacos' },
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
      dev: { command: 'bun run dev --filter=@personal-sites/sangas' },
      domain:
        stage === 'prod'
          ? {
              name: 'sangas.jackwatters.dev',
              redirects: ['www.sangas.jackwatters.dev'],
            }
          : undefined,
      assets: { notFoundHandling: '404-page' },
    });

    const nz = yield* Cloudflare.Website.StaticSite('nz', {
      command: 'bun run build --filter=@personal-sites/nz',
      outdir: 'packages/nz/dist',
      main: './packages/nz/dist/_worker.js/index.js',
      env: {
        NZ_FEEDBACK_GITHUB_TOKEN: token,
        COMMENT_READ_LIMIT: Cloudflare.RateLimit('NZ_COMMENT_READ_LIMIT', {
          namespaceId: 1001,
          simple: { limit: 60, period: 60 },
        }),
        COMMENT_WRITE_LIMIT: Cloudflare.RateLimit('NZ_COMMENT_WRITE_LIMIT', {
          namespaceId: 1002,
          simple: { limit: 6, period: 60 },
        }),
      },
      dev: { command: 'bun run dev --filter=@personal-sites/nz' },
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

    return { site: site.url, tacos: tacos.url, sangas: sangas.url, nz: nz.url };
  }),
);
