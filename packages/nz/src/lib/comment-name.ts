import * as Effect from 'effect/Effect';
import * as KeyValueStore from 'effect/unstable/persistence/KeyValueStore';
import { NAME_STORAGE_KEY } from './comments';

// The lazy storage getter is evaluated only by browser-side island effects.
const browserStorage = KeyValueStore.layerStorage(() => window.localStorage);

export const loadCommentName = () =>
  Effect.runPromise(
    KeyValueStore.KeyValueStore.pipe(
      Effect.flatMap((store) => store.get(NAME_STORAGE_KEY)),
      Effect.provide(browserStorage),
      // Some browsers deny access to storage itself, not only get/set.
      Effect.catchCause(() => Effect.succeed(undefined)),
    ),
  );

export const saveCommentName = (name: string) =>
  Effect.runPromise(
    KeyValueStore.KeyValueStore.pipe(
      Effect.flatMap((store) => store.set(NAME_STORAGE_KEY, name)),
      Effect.provide(browserStorage),
      Effect.catchCause(() => Effect.void),
    ),
  );
