import * as BrowserStream from '@effect/platform-browser/BrowserStream';
import type * as Cause from 'effect/Cause';
import * as Context from 'effect/Context';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Predicate from 'effect/Predicate';
import * as Ref from 'effect/Ref';
import * as Schedule from 'effect/Schedule';
import type * as Scope from 'effect/Scope';
import * as Stream from 'effect/Stream';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import * as Socket from 'effect/unstable/socket/Socket';
import {
  CommentRequestError,
  decodeServer,
  validName,
  type Author,
  type ClientEvent,
  type Cursor,
  type Mutation,
  type Peer,
  type Thread,
} from './protocol';

export type Connection =
  | 'closed'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'offline';

export interface RoomState {
  readonly connection: Connection;
  readonly threads: readonly Thread[];
  readonly peers: readonly Peer[];
  readonly error: string;
}

export const initialRoom: RoomState = {
  connection: 'closed',
  threads: [],
  peers: [],
  error: '',
};

export type Presence = { cursor: Cursor | null; typing: string | null };

type Pending = {
  event: Mutation;
  result: Deferred.Deferred<string, CommentRequestError>;
};

/** One scoped session owns the socket, retry schedule, heartbeat, and pending writes. */
export class RoomClient extends Context.Service<
  RoomClient,
  {
    readonly state: SubscriptionRef.SubscriptionRef<RoomState>;
    readonly connect: (
      endpoint: string,
      author: () => Author,
    ) => Effect.Effect<
      never,
      CommentRequestError | Socket.SocketError | Cause.TimeoutError,
      Scope.Scope
    >;
    readonly submit: (
      event: Mutation,
    ) => Effect.Effect<string, CommentRequestError>;
    readonly presence: (
      patch: Partial<Presence>,
      author: Author,
    ) => Effect.Effect<void>;
  }
>()('comments/RoomClient') {
  static readonly layer = Layer.effect(
    RoomClient,
    Effect.gen(function* () {
      const state = yield* SubscriptionRef.make(initialRoom);
      const pending = yield* Ref.make(new Map<string, Pending>());

      const presence = yield* Ref.make<Presence>({
        cursor: null,
        typing: null,
      });

      const writer = yield* Ref.make<Option.Option<Socket.Writer>>(
        Option.none(),
      );

      const set = (patch: Partial<RoomState>) =>
        SubscriptionRef.update(state, (value) => ({ ...value, ...patch }));

      const send = Effect.fn('RoomClient.send')((event: ClientEvent) =>
        Effect.gen(function* () {
          const out = yield* Ref.get(writer);

          if (Option.isNone(out)) return;
          yield* out.value.write(JSON.stringify(event));
        }),
      );

      const announce = Effect.fn('RoomClient.announce')((author: Author) =>
        Effect.gen(function* () {
          if (!validName(author.name)) return;
          const current = yield* Ref.get(presence);

          if ((yield* SubscriptionRef.get(state)).connection !== 'live') return;
          yield* send({
            type: 'presence',
            name: author.name,
            color: author.color,
            ...current,
          }).pipe(
            Effect.timeout('1 second'),
            Effect.catchTags({
              SocketError: () => Effect.void,
              TimeoutError: () => Effect.void,
            }),
          );
        }),
      );

      const updatePresence = Effect.fn('RoomClient.presence')(
        (patch: Partial<Presence>, author: Author) =>
          Effect.gen(function* () {
            yield* Ref.update(presence, (value) => ({ ...value, ...patch }));
            yield* announce(author);
          }),
      );

      const submit = Effect.fn('RoomClient.submit')((event: Mutation) =>
        Effect.gen(function* () {
          if (!validName(event.author.name))
            return yield* new CommentRequestError({
              message: 'Enter your name before commenting.',
            });

          if ((yield* SubscriptionRef.get(state)).connection !== 'live')
            return yield* new CommentRequestError({
              message: 'You are offline. You can keep writing.',
            });
          const result = yield* Deferred.make<string, CommentRequestError>();
          yield* Ref.update(pending, (requests) =>
            new Map(requests).set(event.requestId, { event, result }),
          );

          return yield* Effect.gen(function* () {
            // A failed send is not proof that the server did not commit. Keep the
            // stable request until its acknowledgement or timeout, including retries.
            yield* send(event).pipe(
              Effect.catchTag('SocketError', () => Effect.void),
            );

            return yield* Deferred.await(result);
          }).pipe(
            Effect.timeout('20 seconds'),
            Effect.catchTag(
              'TimeoutError',
              () =>
                new CommentRequestError({
                  message: 'Save not confirmed. Retry safely when connected.',
                }),
            ),
            Effect.ensuring(
              Ref.update(pending, (requests) => {
                const next = new Map(requests);
                next.delete(event.requestId);

                return next;
              }),
            ),
          );
        }),
      );

      const connect = Effect.fn('RoomClient.connect')(
        (endpoint: string, author: () => Author) =>
          Effect.gen(function* () {
            const url = new URL(endpoint, location.href);
            url.protocol =
              url.protocol === 'https:' || url.protocol === 'wss:'
                ? 'wss:'
                : 'ws:';

            const socket = yield* Socket.makeWebSocket(url.href, {
              openTimeout: '10 seconds',
            });

            const out = yield* socket.writer;
            yield* Ref.set(writer, Option.some(out));
            yield* Effect.addFinalizer(() =>
              Effect.gen(function* () {
                yield* Ref.set(writer, Option.none());
                yield* Ref.set(presence, { cursor: null, typing: null });
                yield* set({ connection: 'closed', peers: [] });

                for (const request of (yield* Ref.get(pending)).values())
                  yield* Deferred.fail(
                    request.result,
                    new CommentRequestError({
                      message:
                        'Connection closed. Your draft remains available.',
                    }),
                  );
              }),
            );
            yield* BrowserStream.fromEventListenerWindow('offline').pipe(
              Stream.runForEach(() =>
                set({ connection: 'offline', peers: [] }),
              ),
              Effect.forkScoped,
            );

            const cycle = Effect.gen(function* () {
              if (!navigator.onLine) {
                yield* set({ connection: 'offline', peers: [] });
                yield* Stream.runHead(
                  BrowserStream.fromEventListenerWindow('online'),
                );
              }

              yield* set({ connection: 'connecting' });
              const reader = yield* socket.reader;
              yield* send({ type: 'ping' }).pipe(
                Effect.repeat(Schedule.spaced('15 seconds')),
                Effect.forkScoped,
              );
              let selfId = '';
              let ready = false;

              while (true) {
                const frames = yield* reader.pull.pipe(
                  Effect.timeout(ready ? '45 seconds' : '10 seconds'),
                );

                for (const frame of frames) {
                  const decoded = decodeServer(
                    Predicate.isString(frame)
                      ? frame
                      : new TextDecoder().decode(frame),
                  );

                  if (Option.isNone(decoded))
                    return yield* new CommentRequestError({
                      message: 'The comment server sent invalid data.',
                    });
                  const event = decoded.value;

                  switch (event.type) {
                    case 'snapshot':
                      ready = true;
                      selfId = event.selfId;
                      yield* set({
                        threads: event.threads,
                        peers: event.peers.filter((peer) => peer.id !== selfId),
                        connection: 'live',
                        error: '',
                      });
                      yield* announce(author());

                      for (const request of (yield* Ref.get(pending)).values())
                        yield* send(request.event);
                      break;
                    case 'thread':
                      yield* SubscriptionRef.update(state, (value) => ({
                        ...value,
                        threads: !event.thread.messages.length
                          ? value.threads.filter(
                              (thread) => thread.id !== event.thread.id,
                            )
                          : value.threads.some(
                                (thread) => thread.id === event.thread.id,
                              )
                            ? value.threads.map((thread) =>
                                thread.id === event.thread.id
                                  ? event.thread
                                  : thread,
                              )
                            : [...value.threads, event.thread],
                      }));
                      break;
                    case 'presence':
                      yield* set({
                        peers: event.peers.filter((peer) => peer.id !== selfId),
                      });
                      break;
                    case 'ack': {
                      const request = (yield* Ref.get(pending)).get(
                        event.requestId,
                      );

                      if (request)
                        yield* Deferred.succeed(request.result, event.threadId);
                      break;
                    }

                    case 'error': {
                      const request = event.requestId
                        ? (yield* Ref.get(pending)).get(event.requestId)
                        : undefined;

                      if (request)
                        yield* Deferred.fail(
                          request.result,
                          new CommentRequestError({ message: event.message }),
                        );
                      else yield* set({ error: event.message });
                      break;
                    }
                  }
                }
              }
            }).pipe(
              Effect.scoped,
              Effect.tapError((error) =>
                set({
                  connection: navigator.onLine ? 'reconnecting' : 'offline',
                  peers: [],
                  error: Predicate.isTagged(error, 'CommentRequestError')
                    ? error.message
                    : '',
                }),
              ),
            );

            return yield* cycle.pipe(
              Effect.retry({
                schedule: Schedule.min([
                  Schedule.exponential('750 millis'),
                  Schedule.spaced('5 seconds'),
                ]).pipe(Schedule.jittered),
              }),
            );
          }),
        Effect.provide(Socket.layerWebSocketConstructorGlobal),
      );

      return { state, connect, submit, presence: updatePresence };
    }),
  );
}
