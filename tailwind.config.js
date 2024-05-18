/** @type {import('tailwindcss').Config} */
export default {
	content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
	theme: {
		extend: {
			fontFamily: {
				bebas: ["Bebas Neue", "sans-serif"],
				inconsolata: ["Inconsolata", "monospace"],
				"roboto-mono": ["Roboto Mono", "monospace"],
				"rubik-scribble": ["Rubik Scribble", "sans-serif"],
				roboto: ["Roboto", "sans-serif"],
			},
		},
	},
	plugins: [require("@tailwindcss/typography")],
};
