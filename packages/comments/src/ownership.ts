import * as Crypto from 'effect/Crypto';
import * as Effect from 'effect/Effect';
import * as Encoding from 'effect/Encoding';
import * as Schema from 'effect/Schema';
import { OwnershipCredential } from './protocol';

export class Ownership extends Schema.Class<Ownership>('CommentOwnership')({
  credential: OwnershipCredential,
  id: OwnershipCredential,
}) {}

// Only this one-way fingerprint may appear in public comment data.
export const ownershipId = Effect.fn('Comments.ownershipId')(
  (credential: string) =>
    Crypto.Crypto.use((crypto) =>
      crypto
        .digest('SHA-256', new TextEncoder().encode(credential))
        .pipe(Effect.map(Encoding.encodeHex)),
    ),
);

export const generateOwnership = Effect.fn('Comments.generateOwnership')(
  function* () {
    const crypto = yield* Crypto.Crypto;
    const credential = Encoding.encodeHex(yield* crypto.randomBytes(32));

    return new Ownership({ credential, id: yield* ownershipId(credential) });
  },
);
