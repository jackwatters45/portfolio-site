# Dear Dad

A static birthday-gift journal at https://dear-dad.jackwatters.dev.

## Local preview

Run `bun run --cwd packages/dear-dad dev` from the repository root.
Open http://localhost:4327.

## Add a letter or note

Create a Markdown file in `src/content/letters/`.
The file name becomes the URL: `first-letter.md` becomes `/letters/first-letter/`.

Add frontmatter with a `title`, a `date` in YYYY-MM-DD format, and `draft: true`.
Write the letter below the frontmatter.
Use the actual letter date. Set `draft: false` when the letter is ready.

Drafts stay out of the index and generated routes, including during local development.
The index shows published letters with the newest date first.
No letters ship with this scaffold.

## Scope and publication

This site borrows the review sites' paper colors, serif type, narrow page, and ruled lists.
It does not use restaurant data, ratings, maps, comments, or mood-board features.

Alchemy configures the production domain. This scaffold has not been deployed.
Pages request no search indexing. This is not access control.
Before deployment, decide whether the letters need authentication.
