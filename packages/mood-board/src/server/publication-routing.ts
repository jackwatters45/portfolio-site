import { Context, type Effect } from 'effect';

import type { AccountId } from '../lib/account';
import type { OwnerError, OwnerSnapshot } from '../lib/owner-api';
import type { ProfileHandle } from '../lib/public-api';

export class PublicationRouting extends Context.Service<
  PublicationRouting,
  {
    readonly claim: (
      accountId: AccountId,
      handle: ProfileHandle,
    ) => Effect.Effect<void, OwnerError>;
    readonly sync: (
      accountId: AccountId,
      state: OwnerSnapshot,
    ) => Effect.Effect<void, OwnerError>;
  }
>()('mood-board/PublicationRouting') {}
