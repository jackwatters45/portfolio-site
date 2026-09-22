import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { commentsDev } from './server/dev';

export default defineConfig({
  site: 'https://nz.jackwatters.dev',
  output: 'static',
  integrations: [react()],
  server: { port: 4325 },
  vite: {
    plugins: [commentsDev()],
    ssr: { noExternal: ['@astrojs/react'] },
  },
});
