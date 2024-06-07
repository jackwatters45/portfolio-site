import { defineConfig } from "astro/config";

import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import partytown from "@astrojs/partytown";

// https://astro.build/config
export default defineConfig({
	integrations: [
		react(),
		tailwind(),
		sitemap(),
		partytown(),
		mdx({
			shikiConfig: { theme: "dracula" },
		}),
	],
	site: "https://www.jackwatters.dev/",
	prefetch: true,
});
