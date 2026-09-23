import { useAtomMount, useAtomSet, useAtomValue } from '@effect/atom-react';
import * as BrowserCrypto from '@effect/platform-browser/BrowserCrypto';
import * as Crypto from 'effect/Crypto';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';
import { useMemo } from 'react';
import { generateOwnership } from './ownership';
import {
  CommentRequestError,
  Mutation,
  SetLike,
  type EditComment,
  type DeleteComment,
  validName,
  type Author,
  type Target,
} from './protocol';
import { initialRoom, RoomClient, type Presence } from './room-client';
import {
  DraftSchema,
  ownershipAtom,
  preferencesAtom,
  type Draft,
} from './use-preferences';

export type { Connection } from './room-client';

interface Submission {
  body: string;
  previous?: Mutation;
  threadId?: string;
  target: Target;
  draft: Atom.Writable<Draft, Draft>;
}

const rooms = Atom.family((endpoint: string) => {
  const runtime = Atom.runtime(
    Layer.merge(RoomClient.layer, BrowserCrypto.layer),
  );

  return {
    connection: runtime
      .atom((get) =>
        RoomClient.use((room) =>
          room.connect(endpoint, () => get.once(preferencesAtom)),
        ),
      )
      .pipe(Atom.setIdleTTL(0)),
    author: runtime.atom((get) =>
      RoomClient.use((room) => room.presence({}, get(preferencesAtom))),
    ),
    state: runtime
      .subscriptionRef(RoomClient.use((room) => Effect.succeed(room.state)))
      .pipe(Atom.map(AsyncResult.getOrElse(() => initialRoom))),
    submit: runtime.fn((input: Submission, get) =>
      Effect.gen(function* () {
        const preferences = get(preferencesAtom);

        const ownership =
          get(ownershipAtom(endpoint)) ?? (yield* generateOwnership());

        get.set(ownershipAtom(endpoint), ownership);

        const author = {
          id: preferences.id,
          name: preferences.name,
          color: preferences.color,
        };

        const requestId =
          input.previous?.requestId ??
          (yield* Crypto.Crypto.use((crypto) => crypto.randomUUIDv4));

        const event = yield* Schema.decodeUnknownEffect(Mutation)(
          input.previous ??
            (input.threadId
              ? {
                  type: 'reply',
                  credential: ownership.credential,
                  requestId,
                  threadId: input.threadId,
                  author,
                  body: input.body,
                }
              : {
                  type: 'create',
                  credential: ownership.credential,
                  requestId,
                  target: input.target,
                  author,
                  body: input.body,
                }),
        );

        get.set(
          input.draft,
          new DraftSchema({ body: input.body, request: event }),
        );
        const threadId = yield* RoomClient.use((room) => room.submit(event));
        get.set(input.draft, new DraftSchema({ body: '' }));

        return threadId;
      }).pipe(
        Effect.catchTags({
          PlatformError: (error) =>
            new CommentRequestError({ message: error.message }),
          SchemaError: () =>
            new CommentRequestError({
              message: 'Check your name and comment.',
            }),
        }),
      ),
    ),
    change: runtime.fn(
      (
        input: {
          change:
            | Omit<EditComment, 'author' | 'credential' | 'requestId'>
            | Omit<DeleteComment, 'author' | 'credential' | 'requestId'>;
          draft: Atom.Writable<Draft, Draft>;
        },
        get,
      ) =>
        Effect.gen(function* () {
          const ownership = get(ownershipAtom(endpoint));

          if (!ownership)
            return yield* new CommentRequestError({
              message: 'The original browser key is unavailable.',
            });
          const previous = get(input.draft).request;

          const event = yield* Schema.decodeUnknownEffect(Mutation)(
            previous ?? {
              ...input.change,
              author: get(preferencesAtom),
              credential: ownership.credential,
              requestId: yield* Crypto.Crypto.use(
                (crypto) => crypto.randomUUIDv4,
              ),
            },
          );

          get.set(
            input.draft,
            new DraftSchema({
              body: input.change.type === 'edit' ? input.change.body : '',
              request: event,
            }),
          );
          const threadId = yield* RoomClient.use((room) => room.submit(event));
          get.set(input.draft, new DraftSchema({ body: '' }));

          return threadId;
        }).pipe(
          Effect.catchTags({
            PlatformError: (error) =>
              new CommentRequestError({ message: error.message }),
            SchemaError: () =>
              new CommentRequestError({
                message: 'Check your name and comment.',
              }),
          }),
        ),
    ),
    like: runtime.fn(
      (input: { threadId: string; messageId: string; liked: boolean }, get) =>
        Effect.gen(function* () {
          const preferences = get(preferencesAtom);

          const requestId = yield* Crypto.Crypto.use(
            (crypto) => crypto.randomUUIDv4,
          );

          return yield* RoomClient.use((room) =>
            room.submit(
              new SetLike({
                ...input,
                type: 'like',
                requestId,
                author: {
                  id: preferences.id,
                  name: preferences.name,
                  color: preferences.color,
                },
              }),
            ),
          );
        }).pipe(
          Effect.catchTag(
            'PlatformError',
            (error) => new CommentRequestError({ message: error.message }),
          ),
        ),
    ),
    presence: runtime.fn(
      ({ patch, author }: { patch: Partial<Presence>; author: Author }) =>
        RoomClient.use((room) => room.presence(patch, author)),
    ),
    typing: runtime.fn(
      ({ typing, author }: { typing: string | null; author: Author }) =>
        Effect.gen(function* () {
          const room = yield* RoomClient;
          yield* room.presence({ typing }, author);

          if (typing) {
            yield* Effect.sleep('3500 millis');
            yield* room.presence({ typing: null }, author);
          }
        }),
    ),
  };
});

/** React only subscribes. Effect owns the session and its resource lifetime. */
export function useRoom(endpoint: string, author: Author) {
  const atoms = useMemo(() => rooms(endpoint), [endpoint]);
  useAtomMount(atoms.connection);
  useAtomMount(atoms.author);
  const state = useAtomValue(atoms.state);
  const ownership = useAtomValue(ownershipAtom(endpoint));
  const change = useAtomSet(atoms.change, { mode: 'promise' });
  const changing = useAtomValue(atoms.change);
  const submission = useAtomValue(atoms.submit);
  const submit = useAtomSet(atoms.submit, { mode: 'promise' });
  const like = useAtomSet(atoms.like, { mode: 'promise' });
  const liking = useAtomValue(atoms.like);
  const presence = useAtomSet(atoms.presence);
  const typing = useAtomSet(atoms.typing);

  return {
    ...state,
    ownerId: ownership?.id,
    change,
    changing: changing.waiting,
    submit,
    like,
    liking: liking.waiting,
    sending: submission.waiting,
    updatePresence: (patch: Partial<Presence>) => {
      if (!validName(author.name)) return;

      if ('typing' in patch) typing({ typing: patch.typing ?? null, author });

      if ('cursor' in patch)
        presence({ patch: { cursor: patch.cursor }, author });
    },
  };
}
