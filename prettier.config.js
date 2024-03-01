/** @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions} */
const config = {
	trailingComma: "all",
	tabWidth: 2,
	semi: true,
	singleQuote: false,
	useTabs: true,
	printWidth: 90,
	bracketSpacing: true,
	endOfLine: "auto",
	plugins: ["prettier-plugin-astro", "prettier-plugin-tailwindcss"],
};

export default config;
