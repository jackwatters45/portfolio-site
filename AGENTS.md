# Agent Guidelines

## Commands
- **Dev**: `bun dev` or `npm run dev`
- **Build**: `bun run build` (runs `astro check && astro build`)
- **Type check**: `astro check`
- **Lint/Format**: `npx biome check --apply` (runs on pre-commit via lefthook)

## Code Style
- **Formatting**: Tabs for indentation (indentWidth: 1), imports auto-organized via Biome
- **TypeScript**: Strict mode enabled, `@/` path alias for `src/`, prefer explicit types, no unused parameters
- **React**: Use `React.forwardRef` for component refs, CVA for variant-based styling, shadcn/ui patterns
- **Astro**: Frontmatter imports at top, kebab-case for file names (e.g., `list-link.astro`)
- **Naming**: kebab-case for files, PascalCase for components, camelCase for variables
- **Imports**: Use `@/` alias (`@/lib/utils`, `@/components/*`), organize automatically via Biome
- **Styling**: Tailwind CSS with `cn()` utility from `@/lib/utils`, use `text-muted-foreground` for secondary text
- **UI Components**: Located in `src/components/ui/`, follow shadcn/ui patterns with CVA variants
- **No comments**: DO NOT ADD COMMENTS unless explicitly requested
