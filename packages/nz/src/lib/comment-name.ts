import * as Effect from 'effect/Effect';
import * as KeyValueStore from 'effect/unstable/persistence/KeyValueStore';
import { NAME_STORAGE_KEY } from './comments-schema';

const browserStorage = KeyValueStore.layerStorage(() => window.localStorage);

export const loadCommentName = Effect.gen(function* () {
  const store = yield* KeyValueStore.KeyValueStore;
  return yield* store.get(NAME_STORAGE_KEY);
}).pipe(
  Effect.provide(browserStorage),
  // Browsers can deny access to storage itself, not only get/set operations.
  Effect.catchCause(() => Effect.succeed(undefined)),
);

export const saveCommentName = Effect.fn('comments.saveName')(
  function* (name: string) {
    const store = yield* KeyValueStore.KeyValueStore;
    yield* store.set(NAME_STORAGE_KEY, name);
  },
  Effect.provide(browserStorage),
  Effect.catchCause(() => Effect.void),
);
