import { DurableObject } from 'cloudflare:workers';
import * as WebCrypto from '@effect/platform-browser/BrowserCrypto';
import * as Crypto from 'effect/Crypto';
import * as Effect from 'effect/Effect';
import * as Encoding from 'effect/Encoding';
import * as Layer from 'effect/Layer';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { COLORS, decodeClient, Peer, type ServerEvent } from './protocol';
import { RoomStore, type CommentStorageError } from './room-store';

export interface CommentsEnv {
  COMMENT_ROOMS_STORE: DurableObjectNamespace;
  COMMENT_CONNECT_LIMIT: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
  COMMENT_ROOMS: string;
  COMMENT_ORIGINS: string;
}

class Session extends Schema.Class<Session>('CommentSession')({
  peer: Peer,
  identified: Schema.Boolean,
  ip: Schema.String,
  seenAt: Schema.Number,
  window: Schema.Number,
  count: Schema.Number,
}) {}
const decodeSession = Schema.decodeUnknownOption(Session);
const SESSION_TTL = 70_000;

class CommentGatewayError extends Schema.TaggedError<CommentGatewayError>()(
  'CommentGatewayError',
  { cause: Schema.Defect() },
) {}
const unavailable = Effect.fn('Comments.unavailable')((error: unknown) =>
  Effect.logError(error).pipe(
    Effect.as(new Response('Comments are unavailable', { status: 503 })),
  ),
);
const route = Effect.fn('CommentsGateway.fetch')(
  function* (request: Request, env: CommentsEnv) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/comments/'))
      return new Response('Not found', { status: 404 });
    const room = url.pathname.slice('/api/comments/'.length);
    if (!env.COMMENT_ROOMS.split(',').includes(room))
      return new Response('Not found', { status: 404 });
    if (
      request.method !== 'GET' ||
      request.headers.get('upgrade')?.toLowerCase() !== 'websocket'
    )
      return new Response('WebSocket required', { status: 426 });
    const origin = request.headers.get('origin');
    if (!origin || !env.COMMENT_ORIGINS.split(',').includes(origin))
      return new Response('Origin not allowed', { status: 403 });
    if (!env.COMMENT_CONNECT_LIMIT)
      return new Response('Comments are not configured', { status: 503 });
    const ip = request.headers.get('cf-connecting-ip') ?? 'local';
    const budget = yield* Effect.tryPromise({
      try: () => env.COMMENT_CONNECT_LIMIT.limit({ key: ip }),
      catch: (cause) => new CommentGatewayError({ cause }),
    });
    if (!budget.success)
      return new Response('Too many connections', { status: 429 });
    const digest = yield* Crypto.Crypto.use((crypto) =>
      crypto.digest('SHA-256', new TextEncoder().encode(ip)),
    );
    const forwarded = new Request(request);
    forwarded.headers.set('x-comments-client', Encoding.encodeHex(digest));
    return yield* Effect.tryPromise({
      try: () => env.COMMENT_ROOMS_STORE.getByName(room).fetch(forwarded),
      catch: (cause) => new CommentGatewayError({ cause }),
    });
  },
  Effect.provide(WebCrypto.layer),
  Effect.catchTags({
    CommentGatewayError: unavailable,
    PlatformError: unavailable,
  }),
);

/** The host route and Durable Object callbacks are the only runtime boundaries. */
export default {
  fetch: (request: Request, env: CommentsEnv) =>
    Effect.runPromise(route(request, env)),
};

export class CommentRoom extends DurableObject<CommentsEnv> {
  private readonly runtime: ManagedRuntime.ManagedRuntime<
    RoomStore | Crypto.Crypto,
    CommentStorageError
  >;

  constructor(ctx: DurableObjectState, env: CommentsEnv) {
    super(ctx, env);
    // No external connections or resources: this runtime is rebuilt on wake.
    this.runtime = ManagedRuntime.make(
      Layer.merge(RoomStore.layer(ctx.storage), WebCrypto.layer),
    );
  }

  private send(socket: WebSocket, event: ServerEvent) {
    try {
      socket.send(JSON.stringify(event));
    } catch {
      socket.close(1011, 'Connection lost');
    }
  }

  private session(socket: WebSocket): Session | null {
    // Decode the platform attachment again after hibernation.
    return Option.getOrNull(decodeSession(socket.deserializeAttachment()));
  }

  private sockets() {
    const now = Date.now();
    return this.ctx.getWebSockets().filter((socket) => {
      if (socket.readyState !== 1) return false;
      const session = this.session(socket);
      if (!session || now - session.seenAt > SESSION_TTL) {
        socket.close(1001, 'Session expired');
        return false;
      }
      return true;
    });
  }

  private peers(): Peer[] {
    const now = Date.now();
    return this.sockets().flatMap((socket) => {
      const session = this.session(socket);
      if (!session?.identified) return [];
      const peer = session.peer;
      return [
        {
          ...peer,
          cursor: now - peer.updatedAt < 10_000 ? peer.cursor : null,
          typing: now - peer.updatedAt < 6_000 ? peer.typing : null,
        },
      ];
    });
  }

  private broadcast(event: ServerEvent) {
    for (const socket of this.sockets()) this.send(socket, event);
  }

  private presence() {
    this.broadcast({ type: 'presence', peers: this.peers() });
  }

  fetch(request: Request): Promise<Response> {
    // A snapshot and its connection join are one ordered operation. No update
    // can slip between the snapshot read and socket acceptance.
    return this.ctx.blockConcurrencyWhile(() =>
      this.runtime.runPromise(
        Effect.gen(function* () {
          const store = yield* RoomStore;
          const crypto = yield* Crypto.Crypto;
          return {
            threads: yield* store.list(),
            id: yield* crypto.randomUUIDv4,
          };
        }).pipe(
          Effect.map(({ threads, id }) => {
            const ip = request.headers.get('x-comments-client') ?? 'local';
            const sockets = this.sockets();
            if (
              sockets.length >= 50 ||
              sockets.filter((socket) => this.session(socket)?.ip === ip)
                .length >= 10
            )
              return new Response('This room is full. Try again later.', {
                status: 429,
              });
            const { 0: client, 1: server } = new WebSocketPair();
            const now = Date.now();
            this.ctx.acceptWebSocket(server);
            server.serializeAttachment(
              new Session({
                peer: new Peer({
                  id,
                  name: 'Guest',
                  color: COLORS[sockets.length % COLORS.length],
                  cursor: null,
                  typing: null,
                  updatedAt: now,
                }),
                ip,
                identified: false,
                seenAt: now,
                window: now,
                count: 0,
              }),
            );
            this.send(server, {
              type: 'snapshot',
              selfId: id,
              threads,
              peers: this.peers(),
            });
            this.presence();
            return new Response(null, { status: 101, webSocket: client });
          }),
          Effect.catchTags({
            CommentStorageError: unavailable,
            PlatformError: unavailable,
          }),
        ),
      ),
    );
  }

  webSocketMessage(
    socket: WebSocket,
    raw: string | ArrayBuffer,
  ): void | Promise<void> {
    if (
      typeof raw !== 'string' ||
      new TextEncoder().encode(raw).byteLength > 16_384
    ) {
      socket.close(1009, 'Message too large');
      return;
    }
    const previous = this.session(socket);
    if (!previous) {
      socket.close(1008, 'Invalid session');
      return;
    }
    const now = Date.now();
    const reset = now - previous.window >= 1000;
    const session = new Session({
      ...previous,
      window: reset ? now : previous.window,
      count: reset ? 1 : previous.count + 1,
      seenAt: now,
    });
    socket.serializeAttachment(session);
    if (session.count > 30) {
      socket.close(1008, 'Too many messages');
      return;
    }
    const decoded = decodeClient(raw);
    if (Option.isNone(decoded)) {
      this.send(socket, { type: 'error', message: 'Invalid comment data.' });
      return;
    }
    const event = decoded.value;
    if (event.type === 'ping') {
      this.send(socket, { type: 'pong' });
      this.presence();
      return;
    }
    if (event.type === 'presence') {
      const next = new Session({
        ...session,
        identified: true,
        peer: new Peer({
          id: session.peer.id,
          name: event.name.trim(),
          color: event.color,
          cursor: event.cursor,
          typing: event.typing,
          updatedAt: now,
        }),
      });
      // Cloudflare caps attachments at 2 KiB. Leave room for serialization overhead.
      if (new TextEncoder().encode(JSON.stringify(next)).byteLength > 1500) {
        this.send(socket, {
          type: 'error',
          message: 'This target is too complex to share live.',
        });
        return;
      }
      socket.serializeAttachment(next);
      this.presence();
      return;
    }
    // Keep write + broadcast + acknowledgement ordered across concurrent writers.
    return this.ctx.blockConcurrencyWhile(() =>
      this.runtime.runPromise(
        RoomStore.use((store) => store.write(event, session.ip)).pipe(
          Effect.tap((thread) =>
            Effect.sync(() => {
              this.broadcast({ type: 'thread', thread });
              this.send(socket, {
                type: 'ack',
                requestId: event.requestId,
                threadId: thread.id,
              });
            }),
          ),
          Effect.asVoid,
          Effect.catchTags({
            CommentRejected: (error) =>
              Effect.sync(() =>
                this.send(socket, {
                  type: 'error',
                  requestId: event.requestId,
                  message: error.message,
                }),
              ),
            CommentStorageError: (error) =>
              Effect.logError(error).pipe(
                Effect.andThen(
                  Effect.sync(() =>
                    this.send(socket, {
                      type: 'error',
                      requestId: event.requestId,
                      message:
                        'Could not confirm the comment was saved. Retry to check safely.',
                    }),
                  ),
                ),
              ),
          }),
        ),
      ),
    );
  }

  webSocketClose(socket: WebSocket, code: number) {
    socket.close([1005, 1006, 1015].includes(code) ? 1000 : code);
    this.presence();
  }

  webSocketError(socket: WebSocket) {
    socket.close(1011, 'Connection lost');
    this.presence();
  }
}
