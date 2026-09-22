import { fileURLToPath } from 'node:url';
import mdx from '@astrojs/mdx';
import partytown from '@astrojs/partytown';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig, envField } from 'astro/config';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';

// https://astro.build/config
export default defineConfig({
  compressHTML: true,
  integrations: [
    react(),
    sitemap(),
    partytown(),
    mdx({
      shikiConfig: { theme: 'dracula' },
    }),
  ],
  vite: {
    css: {
      postcss: {
        plugins: [
          tailwindcss({
            config: fileURLToPath(
              new URL('./tailwind.config.js', import.meta.url),
            ),
          }),
          autoprefixer(),
        ],
      },
    },
  },
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
