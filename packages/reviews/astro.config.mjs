import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export function reviewSite({ url, port, configUrl }) {
  return defineConfig({
    site: url,
    srcDir: fileURLToPath(new URL('./src/', import.meta.url)),
    output: 'static',
    integrations: [react(), sitemap()],
    server: { port },
    vite: {
      ssr: { noExternal: ['@astrojs/react'] },
      resolve: { alias: { '@site': fileURLToPath(new URL('./', configUrl)) } },
      server: { strictPort: true },
    },
  });
}
