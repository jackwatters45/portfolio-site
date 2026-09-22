import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://nz.jackwatters.dev',
  output: 'static',
  compressHTML: true,
  adapter: cloudflare({ imageService: 'compile' }),
  integrations: [react()],
  server: { port: 4325 },
  vite: { ssr: { noExternal: ['@astrojs/react', '@personal-sites/comments'] } },
});
