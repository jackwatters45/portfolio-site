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
      command: 'bun run build',
      outdir: 'dist',
      dev: {
        command: 'bun astro dev',
      },
      domain:
        stage === 'prod'
          ? { name: 'jackwatters.dev', aliases: ['www.jackwatters.dev'] }
          : undefined,
    });

    const tacos = yield* Cloudflare.Website.StaticSite('tacos', {
      command: 'bun run build:tacos',
      outdir: 'sites/tacos/dist',
      dev: { command: 'bun run dev:tacos' },
      domain:
        stage === 'prod'
          ? {
              name: 'tacos.jackwatters.dev',
              redirects: ['www.tacos.jackwatters.dev'],
            }
          : undefined,
      assets: { notFoundHandling: '404-page' },
    });

    return { site: site.url, tacos: tacos.url };
  }),
);
