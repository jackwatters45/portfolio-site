import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://tacos.jackwatters.dev',
  output: 'static',
  integrations: [react(), sitemap()],
  server: { port: 4322 },
  vite: { server: { strictPort: true } },
});
