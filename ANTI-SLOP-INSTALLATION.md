# Anti-slop installation report

## Installation

Installed in this checkout only: `tools/oxlint/anti-slop/`.

Source: https://github.com/dmmulroy/anti-slop

Exact commit: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`.

The initial checkout was clean. No existing installation or renamed plugin reference was found. Read the pinned install skill and inspected its installer before execution. All 38 bundled files match the pinned assets byte-for-byte. Added the upstream root license and local `UPSTREAM.md`. Preserved the nested Stylistic license and provenance.

Added exact root development dependency `@oxlint/plugins@1.85.0`. Manifest, lockfile, and installed Oxlint agree on `1.85.0`. Kept `oxfmt@0.70.0` and `oxlint-tsgolint@7.0.2002`. No unrelated dependency changed.

Merged all 18 generic rules and five Effect rules at error severity into `.oxlintrc.json`. Changed native `oxc/no-accumulating-spread` from warning to error. Preserved existing plugins, rules, overrides, ignores, and type-aware mode. Root and mood-board manifests directly depend on Effect.

Added upstream's named agent-directory ignores and the vendor path to lint and format configurations. No additional project-local agent directories were found. No application source was excluded. Existing scripts and Lefthook commands still use the root configuration. No competing configuration or global skill was installed.

Added update guidance to `AGENTS.md` and `tools/oxlint/anti-slop/UPSTREAM.md`. The Effect service-import rule does not cover package or path aliases.

## Checks

| Command | Result |
| --- | --- |
| `bun run lint` before installation | Pass: zero errors, four warnings |
| `bunx turbo run typecheck` | Pass |
| `bunx tsgo --noEmit` | Pass |
| `bun run format:check` | Pass |
| `bun run lint` after installation | **Fail: 2,657 errors, four warnings** |
| `git diff --check` | Pass |

The new rules expose existing patterns in unchanged owned source. All errors come from the newly enabled plugins. The four original warnings remain. No application code changed, and no lint autofix ran. No tests, builds, pushes, PRs, or deployments ran.

## Remaining error counts

Rule names below use the `anti-slop/` prefix unless marked `anti-slop-effect/`. Rules not listed returned zero findings.

| Rule | Errors | Representative location |
| --- | ---: | --- |
| require-readable-spacing | 2,393 | `packages/mood-board/src/cloudflare/catalog-projection.ts:121:11` |
| no-conditional-empty-object-spread | 94 | `packages/mood-board/src/server/x-post-preview-parser.ts:160:5` |
| anti-slop-effect/no-manual-tagged-construction | 26 | `packages/mood-board/src/client/board/bulk-image-import.ts:362:22` |
| no-runtime-typeof | 23 | `packages/mood-board/src/lib/x-post.ts:202:7` |
| no-shape-in-symbol-names | 22 | `packages/mood-board/src/cloudflare/catalog-projection.ts:25:11` |
| no-unknown-parameters | 21 | `packages/mood-board/src/lib/x-post.ts:199:10` |
| require-safety-comment-for-type-assertion | 20 | `packages/mood-board/src/client/board/bulk-image-import.ts:356:23` |
| anti-slop-effect/prefer-effect-match | 19 | `packages/mood-board/src/lib/audio-card-layout.ts:11:3` |
| anti-slop-effect/no-manual-tag-comparison | 18 | `packages/mood-board/src/client/board/bulk-image-import.ts:375:13` |
| anti-slop-effect/no-service-constructor-imports | 8 | `packages/mood-board/src/client/board/board-catalog.ts:9:26` |
| no-known-value-widening | 8 | `packages/mood-board/src/server/x-post-preview-parser.ts:30:51` |
| no-unsafe-dictionary-type | 2 | `packages/mood-board/src/lib/type-guards.ts:1:52` |
| no-unknown-returns | 2 | `packages/mood-board/src/routes/profile.tsx:16:27` |
| no-array-filter-map | 1 | `packages/mood-board/src/lib/x-post.ts:165:19` |

Representative diagnostics:

- `catalog-projection.ts:121:11`: Expected blank line before this statement.
- `x-post-preview-parser.ts:160:5`: Conditional spread hides property omission behind an empty object.
- `bulk-image-import.ts:362:22`: Use a tagged constructor instead of a literal `_tag` object.
- `board-catalog.ts:9:26`: Do not import Effect service constructor `makeBoardRpcRuntime` into runtime code.
- `bulk-image-import.ts:356:23`: Type assertion has no `SAFETY:` justification.

Unchanged warnings:

- `packages/mood-board/src/client/board/board-sync.ts:221:52`: `typescript/no-invalid-void-type`.
- `packages/portfolio/src/components/line-graph/line-graph.tsx:560:10`: `react/jsx-no-useless-fragment`.
- `packages/mood-board/src/components/bulk-image-stager.tsx:566:23`: `react/no-array-index-key`.
- `packages/mood-board/src/server/website-preview-service.ts:188:13`: `typescript/prefer-optional-chain`.

Cleanup requires a separate request. The pre-push lint check now fails on these findings. The existing pre-commit hook retains its staged-file autofix behavior; this installation did not invoke it.
