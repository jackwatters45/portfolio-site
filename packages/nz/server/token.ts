import * as Config from 'effect/Config';
import * as Redacted from 'effect/Redacted';

// Server-only: supplied by Alchemy as a Cloudflare secret binding.
export const commentToken = Config.redacted('NZ_FEEDBACK_GITHUB_TOKEN').pipe(
  Config.withDefault(Redacted.make('')),
);
