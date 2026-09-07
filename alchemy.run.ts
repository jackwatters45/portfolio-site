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
      command: 'bun run build',
      outdir: 'dist',
      dev: {
        command: 'bun astro dev',
      },
      url: true,
      domain:
        stage === 'prod'
          ? ['jackwatters.dev', 'www.jackwatters.dev']
          : undefined,
    });

    const tacos = yield* Cloudflare.Website.StaticSite('tacos', {
      command: 'bun run build:tacos',
      outdir: 'sites/tacos/dist',
      dev: { command: 'bun run dev:tacos' },
      url: true,
      domain: stage === 'prod' ? 'tacos.jackwatters.dev' : undefined,
      assets: { notFoundHandling: '404-page' },
    });

    return { site: site.url, tacos: tacos.url };
  }),
);
