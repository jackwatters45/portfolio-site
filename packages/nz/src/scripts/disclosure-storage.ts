import * as BrowserKeyValueStore from '@effect/platform-browser/BrowserKeyValueStore';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import * as KeyValueStore from 'effect/unstable/persistence/KeyValueStore';

Effect.gen(function* () {
  const storage = KeyValueStore.toSchemaStore(
    yield* KeyValueStore.KeyValueStore,
    Schema.Boolean,
  );

  for (const details of document.querySelectorAll<HTMLDetailsElement>(
    'details[data-disclosure-key]',
  )) {
    const key = `nz:disclosure:${details.dataset.disclosureKey}`;
    details.addEventListener('toggle', () => {
      storage.set(key, details.open).pipe(
        // Storage can be unavailable; the accordion must still work.
        Effect.catchTag(
          ['KeyValueStoreError', 'SchemaError'],
          () => Effect.void,
        ),
        Effect.runSync,
      );
    });
  }
}).pipe(Effect.provide(BrowserKeyValueStore.layerLocalStorage), Effect.runSync);
