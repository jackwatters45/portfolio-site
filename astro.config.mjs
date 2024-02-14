import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";

// https://astro.build/config
export default defineConfig({
	integrations: [react(), tailwind(), mdx()],
	site: "https://vercel.com/jackwatters45/my-blog/2d1b8NdwezdjxgHyjTBTQeH6Xbbg",
	prefetch: true,
});
