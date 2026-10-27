import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://dear-dad.jackwatters.dev',
  output: 'static',
  compressHTML: true,
  integrations: [react()],
  server: { port: 4327 },
  vite: {
    ssr: { noExternal: ['@astrojs/react'] },
    optimizeDeps: { include: ['agentation'] },
    server: { strictPort: true },
  },
});
