import type { DurableObjectStorage } from '@cloudflare/workers-types';
import * as WebCrypto from '@effect/platform-browser/BrowserCrypto';
import * as SqliteClient from '@effect/sql-sqlite-do/SqliteClient';
import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Crypto from 'effect/Crypto';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';
import { Author, Message, Thread, type Mutation } from './protocol';

export class CommentRejected extends Schema.TaggedError<CommentRejected>()(
  'CommentRejected',
  { message: Schema.String },
) {}
export class CommentStorageError extends Schema.TaggedError<CommentStorageError>()(
  'CommentStorageError',
  { cause: Schema.Defect() },
) {}
const decodeThread = Schema.decodeUnknownEffect(Schema.fromJsonString(Thread));
const MAX_THREADS = 250;
const MAX_MESSAGES = 1000;
type Row = { id: string; data: string };

/** Effect SQL owns the connection, parameter binding, and DO storage transaction. */
export class RoomStore extends Context.Service<
  RoomStore,
  {
    readonly list: () => Effect.Effect<
      ReadonlyArray<Thread>,
      CommentStorageError
    >;
    readonly write: (
      event: Mutation,
      ip: string,
    ) => Effect.Effect<Thread, CommentRejected | CommentStorageError>;
  }
>()('comments/RoomStore') {
  static layer(storage: DurableObjectStorage) {
    return Layer.effect(
      RoomStore,
      Effect.gen(function* () {
        const sql = yield* SqliteClient.SqliteClient;
        const crypto = yield* Crypto.Crypto;
        yield* sql`CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, data TEXT NOT NULL)`;
        yield* sql`CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, payload TEXT NOT NULL, thread_id TEXT NOT NULL)`;
        yield* sql`CREATE TABLE IF NOT EXISTS budgets (ip TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL)`;
        const list = Effect.fn('RoomStore.list')(
          function* () {
            const rows =
              yield* sql<Row>`SELECT id, data FROM threads ORDER BY rowid`;
            return yield* Effect.forEach(rows, (row) => decodeThread(row.data));
          },
          Effect.mapError((cause) => new CommentStorageError({ cause })),
        );
        const write = Effect.fn('RoomStore.write')(
          (event: Mutation, ip: string) =>
            Effect.gen(function* () {
              const payload = JSON.stringify(event);
              const previous = (yield* sql<{
                payload: string;
                thread_id: string;
              }>`SELECT payload, thread_id FROM requests WHERE id = ${event.requestId}`)[0];
              if (previous) {
                if (previous.payload !== payload)
                  return yield* new CommentRejected({
                    message:
                      'This request was already used. Start a new comment.',
                  });
                const row =
                  (yield* sql<Row>`SELECT id, data FROM threads WHERE id = ${previous.thread_id}`)[0];
                if (!row)
                  return yield* new CommentStorageError({
                    cause: 'A saved request references a missing thread.',
                  });
                return yield* decodeThread(row.data);
              }
              const now = yield* Clock.currentTimeMillis;
              const budget = (yield* sql<{
                window: number;
                count: number;
              }>`SELECT window, count FROM budgets WHERE ip = ${ip}`)[0];
              if (budget && now - budget.window < 60_000 && budget.count >= 30)
                return yield* new CommentRejected({
                  message: 'Too many comments. Please wait a minute.',
                });
              const threads = yield* list();
              if (
                threads.reduce(
                  (total, thread) => total + thread.messages.length,
                  0,
                ) >= MAX_MESSAGES
              )
                return yield* new CommentRejected({
                  message: 'This room has reached its comment limit.',
                });
              const message = new Message({
                id: event.requestId,
                author: new Author({
                  ...event.author,
                  name: event.author.name.trim(),
                }),
                body: event.body.trim(),
                createdAt: new Date(now).toISOString(),
              });
              let thread: Thread;
              if (event.type === 'reply') {
                const existing = threads.find(
                  (thread) => thread.id === event.threadId,
                );
                if (!existing)
                  return yield* new CommentRejected({
                    message: 'This conversation no longer exists.',
                  });
                thread = new Thread({
                  ...existing,
                  messages: [...existing.messages, message],
                });
              } else {
                if (threads.length >= MAX_THREADS)
                  return yield* new CommentRejected({
                    message: 'This room has reached its conversation limit.',
                  });
                thread = new Thread({
                  id: yield* crypto.randomUUIDv4,
                  target: event.target,
                  messages: [message],
                });
              }
              yield* sql`INSERT INTO threads (id, data) VALUES (${thread.id}, ${JSON.stringify(thread)}) ON CONFLICT(id) DO UPDATE SET data = excluded.data`;
              yield* sql`INSERT INTO requests (id, payload, thread_id) VALUES (${event.requestId}, ${payload}, ${thread.id})`;
              yield* sql`DELETE FROM budgets WHERE window <= ${now - 60_000}`;
              yield* sql`INSERT INTO budgets (ip, window, count) VALUES (${ip}, ${now}, 1) ON CONFLICT(ip) DO UPDATE SET count = count + 1`;
              return thread;
            }).pipe(
              sql.withTransaction,
              Effect.catchTags({
                SqlError: (cause) => new CommentStorageError({ cause }),
                SchemaError: (cause) => new CommentStorageError({ cause }),
                PlatformError: (cause) => new CommentStorageError({ cause }),
              }),
            ),
        );
        return { list, write };
      }).pipe(Effect.mapError((cause) => new CommentStorageError({ cause }))),
    ).pipe(
      Layer.provide(
        Layer.merge(SqliteClient.layer({ storage }), WebCrypto.layer),
      ),
    );
  }
}
