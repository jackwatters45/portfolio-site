import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://nz.jackwatters.dev',
  output: 'static',
  integrations: [react()],
  server: { port: 4325 },
  vite: {
    ssr: { noExternal: ['@astrojs/react'] },
  },
});
