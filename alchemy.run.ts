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

    return yield* Cloudflare.Website.StaticSite('site', {
      command: 'bun run build',
      outdir: 'dist',
      url: true,
      domain:
        stage === 'prod'
          ? ['jackwatters.dev', 'www.jackwatters.dev']
          : undefined,
    });
  }),
);
