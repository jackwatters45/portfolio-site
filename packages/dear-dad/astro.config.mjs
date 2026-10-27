import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://dear-dad.jackwatters.dev',
  output: 'static',
  compressHTML: true,
  server: { port: 4327 },
  vite: { server: { strictPort: true } },
});
