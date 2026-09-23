import { useAtomSet, useAtomValue } from '@effect/atom-react';
import * as BrowserCrypto from '@effect/platform-browser/BrowserCrypto';
import * as BrowserKeyValueStore from '@effect/platform-browser/BrowserKeyValueStore';
import * as Context from 'effect/Context';
import * as Crypto from 'effect/Crypto';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import * as KeyValueStore from 'effect/unstable/persistence/KeyValueStore';
import {
  AsyncResult,
  Atom,
  type AtomRegistry,
} from 'effect/unstable/reactivity';
import { Ownership } from './ownership';
import { Author, BODY_LIMIT, COLORS, Mutation, NAME_LIMIT } from './protocol';

class PreferencesSchema extends Schema.Class<PreferencesSchema>(
  'CommentPreferences',
)({
  ...Author.fields,
  name: Schema.String.check(Schema.isMaxLength(NAME_LIMIT)),
  cursors: Schema.Boolean,
  markers: Schema.Boolean,
}) {}

export type Preferences = PreferencesSchema;

export class DraftSchema extends Schema.Class<DraftSchema>('CommentDraft')({
  body: Schema.String.check(Schema.isMaxLength(BODY_LIMIT)),
  request: Schema.optional(Mutation),
}) {}

export type Draft = DraftSchema;

class StorageHealth extends Context.Service<
  StorageHealth,
  SubscriptionRef.SubscriptionRef<boolean>
>()('comments/StorageHealth') {}

const storageLayer = Layer.effectContext(
  Effect.gen(function* () {
    const store = yield* KeyValueStore.KeyValueStore;
    const failed = yield* SubscriptionRef.make(false);

    const track = <A>(
      effect: Effect.Effect<A, KeyValueStore.KeyValueStoreError>,
    ) =>
      effect.pipe(
        Effect.tap(() => SubscriptionRef.set(failed, false)),
        Effect.tapError(() => SubscriptionRef.set(failed, true)),
      );

    return Context.make(StorageHealth, failed).pipe(
      Context.add(KeyValueStore.KeyValueStore, {
        ...store,
        get: (key) => track(store.get(key)),
        set: (key, value) => track(store.set(key, value)),
        remove: (key) => track(store.remove(key)),
      }),
    );
  }),
).pipe(Layer.provide(BrowserKeyValueStore.layerLocalStorage));

export const storageRuntime = Atom.runtime(
  Layer.merge(storageLayer, BrowserCrypto.layer),
);

const storageErrorAtom = storageRuntime
  .subscriptionRef(
    Effect.gen(function* () {
      return yield* StorageHealth;
    }),
  )
  .pipe(Atom.map(AsyncResult.getOrElse(() => false)));

export const preferencesAtom = Atom.kvs({
  runtime: storageRuntime,
  key: 'page-comments:preferences',
  schema: PreferencesSchema,
  defaultValue: (): Preferences =>
    new PreferencesSchema({
      id: 'pending',
      name: '',
      color: COLORS[0],
      cursors: true,
      markers: true,
    }),
});

export const ownershipAtom = Atom.family((endpoint: string) =>
  Atom.kvs({
    runtime: storageRuntime,
    key: `page-comments:ownership:${endpoint}`,
    schema: Schema.NullOr(Ownership),
    defaultValue: () => null,
  }).pipe(Atom.keepAlive),
);

const drafts = Atom.family((key: string) =>
  Atom.kvs({
    runtime: storageRuntime,
    key: `page-comments:draft:${key}`,
    schema: DraftSchema,
    defaultValue: (): Draft => new DraftSchema({ body: '' }),
  }).pipe(Atom.keepAlive),
);

const updatePreferences = storageRuntime.fn(
  (patch: Partial<Preferences>, get) =>
    Effect.gen(function* () {
      const previous = get(preferencesAtom);

      const id =
        previous.id === 'pending'
          ? yield* Crypto.Crypto.use((crypto) => crypto.randomUUIDv4)
          : previous.id;

      const color =
        previous.id === 'pending'
          ? COLORS[Number.parseInt(id.slice(0, 2), 16) % COLORS.length]
          : previous.color;

      get.set(
        preferencesAtom,
        new PreferencesSchema({ ...previous, color, ...patch, id }),
      );
    }),
);

export function usePreferences() {
  const preferences = useAtomValue(preferencesAtom);
  const storageError = useAtomValue(storageErrorAtom);
  const update = useAtomSet(updatePreferences, { mode: 'promise' });

  return { preferences, update, storageError };
}

/** The registry retains the current draft even when the storage service fails. */
export function draftStore(room: string, registry: AtomRegistry.AtomRegistry) {
  const atom = (target: string) => drafts(`${room}:${target}`);

  return {
    atom,
    get: (target: string) => registry.get(atom(target)),
  };
}
