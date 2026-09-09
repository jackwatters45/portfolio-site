import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';

export default Alchemy.Stack(
  'portfolio-site',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
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

    return { site: site.url, tacos: tacos.url, sangas: sangas.url };
  }),
);
