import mdx from '@astrojs/mdx';
import partytown from '@astrojs/partytown';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import { defineConfig, envField } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  integrations: [
    react(),
    tailwind(),
    sitemap(),
    partytown(),
    mdx({
      shikiConfig: { theme: 'dracula' },
    }),
  ],
  env: {
    schema: {
      STRAVA_CLIENT_ID: envField.string({
        context: 'server',
        access: 'secret',
      }),
      STRAVA_CLIENT_SECRET: envField.string({
        context: 'server',
        access: 'secret',
      }),
      STRAVA_REFRESH_TOKEN: envField.string({
        context: 'server',
        access: 'secret',
      }),
    },
  },
  site: 'https://www.jackwatters.dev/',
  prefetch: true,
});
