import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { localComments } from './integrations/local-comments';

export default defineConfig({
  site: 'https://nz.jackwatters.dev',
  output: 'static',
  adapter: cloudflare({ platformProxy: { enabled: false } }),
  integrations: [react(), localComments()],
  server: { port: 4325 },
  vite: { ssr: { noExternal: ['@astrojs/react'] } },
});
