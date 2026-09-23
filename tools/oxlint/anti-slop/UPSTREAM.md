# Source provenance

- Repository: https://github.com/dmmulroy/anti-slop
- Source commit: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`
- Source archive: https://api.github.com/repos/dmmulroy/anti-slop/tarball/c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b
- Copied `skills/install-anti-slop/assets/anti-slop/**` to this directory with the pinned `skills/install-anti-slop/scripts/install.mjs`.
- Copied the repository root `LICENSE` to `LICENSE` here.
- Entry points: `index.ts` and `effect/index.ts`.
- Preserved `vendor/eslint-stylistic/LICENSE` and `vendor/eslint-stylistic/UPSTREAM.md` without changes.
- Deviations: no source changes. Added the root license and this provenance record. The bundled assets omit upstream tests.

## Configuration and updates

The root `.oxlintrc.json` enables all 18 generic rules, all five Effect rules, and native `oxc/no-accumulating-spread` at error severity. Effect is a direct workspace dependency. The Effect service-import rule checks relative imports, not package or path aliases.

Keep `oxlint` and `@oxlint/plugins` pinned together at `1.85.0`. The existing `oxfmt` version is `0.70.0`; `oxlint-tsgolint` is `7.0.2002`.

For updates, read the incoming revision's complete install skill and `references/update.md`. Stage that revision separately. Use this commit as the pristine base for a three-way merge. Preserve local changes and both licenses. Review new rules before enabling them. Never force-copy over local changes. Update this record to identify the actual copied assets and any deviations.

Keep this snapshot excluded from lint and formatting. Do not fix owned-source findings unless a separate migration is requested.
