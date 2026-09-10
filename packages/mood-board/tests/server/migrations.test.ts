import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { migrationLoader } from "../../src/server/migrations";

const Database = SqliteClient.layer({ filename: ":memory:" });

type KindRow = { readonly id: string; readonly kind: string; readonly href: string | null };
type MediaRow = { readonly id: string; readonly kind: string; readonly src: string | null };
type CountRow = { readonly count: number };
type IndexRow = { readonly name: string };
type TriggerRow = { readonly name: string };

describe("database migrations", () => {
  it.effect("upgrades a populated v4 item table without losing data or constraints", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql.unsafe("PRAGMA foreign_keys = ON");
      yield* sql.unsafe(`
        CREATE TABLE effect_sql_migrations (
          migration_id INTEGER PRIMARY KEY NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          name VARCHAR(255) NOT NULL
        )
      `);
      yield* sql.unsafe(`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES
          (1, 'initial_schema'),
          (2, 'board_tombstones'),
          (3, 'board_background'),
          (4, 'item_href')
      `);
      yield* sql.unsafe(`
        CREATE TABLE boards (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          version INTEGER NOT NULL,
          revision INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL,
          background_color TEXT
        )
      `);
      yield* sql.unsafe(`
        CREATE TABLE items (
          board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
          id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('image', 'note', 'swatch')),
          x REAL NOT NULL,
          y REAL NOT NULL,
          width REAL NOT NULL,
          height REAL NOT NULL,
          rotation REAL NOT NULL,
          order_index INTEGER NOT NULL,
          src TEXT,
          text TEXT,
          color TEXT,
          label TEXT,
          href TEXT,
          PRIMARY KEY (board_id, id)
        )
      `);
      yield* sql.unsafe("CREATE INDEX items_board_order ON items (board_id, order_index)");
      yield* sql.unsafe(`
        INSERT INTO boards (id, title, version, revision, updated_at)
        VALUES ('default', 'Legacy', 1, 3, 1)
      `);
      yield* sql.unsafe(`
        INSERT INTO items (
          board_id, id, kind, x, y, width, height, rotation, order_index,
          src, text, color, label, href
        ) VALUES
          ('default', 'image-1', 'image', 0, 0, 320, 240, 0, 1,
            'https://images.example/one.jpg', NULL, NULL, NULL, 'https://shop.example/one'),
          ('default', 'note-1', 'note', 10, 10, 320, 240, 0, 2,
            NULL, 'Legacy note', NULL, NULL, NULL),
          ('default', 'swatch-1', 'swatch', 20, 20, 320, 240, 0, 3,
            NULL, NULL, '#AABBCC', 'Cloud', NULL)
      `);

      const applied = yield* SqliteMigrator.run({ loader: migrationLoader });
      expect(applied).toEqual([
        [5, "audio_item_kinds"],
        [6, "public_publishing"],
        [7, "website_item_kind"],
        [8, "managed_media"],
        [9, "managed_media_lifecycle"],
        [10, "media_guardrails"],
        [11, "board_background_media"],
        [12, "youtube_item_kind"],
        [13, "image_annotations"],
        [14, "x_post_item_kind"],
      ]);

      const rows = yield* sql<KindRow>`
        SELECT id, kind, href FROM items ORDER BY order_index
      `;
      expect(rows).toEqual([
        { id: "image-1", kind: "image", href: "https://shop.example/one" },
        { id: "note-1", kind: "note", href: null },
        { id: "swatch-1", kind: "swatch", href: null },
      ]);

      yield* sql.unsafe(`
        INSERT INTO items (
          board_id, id, kind, x, y, width, height, rotation, order_index, src
        ) VALUES (
          'default', 'audio-1', 'audio', 0, 0, 520, 220, 0, 4,
          'https://media.example/audio.mp3'
        )
      `);
      yield* sql.unsafe(`
        INSERT INTO items (
          board_id, id, kind, x, y, width, height, rotation, order_index,
          website_url, website_title, website_site_label
        ) VALUES (
          'default', 'website-1', 'website', 0, 0, 540, 360, 0, 5,
          'https://example.com/', 'Example', 'example.com'
        )
      `);
      yield* sql.unsafe(`
        INSERT INTO items (
          board_id, id, kind, x, y, width, height, rotation, order_index, src
        ) VALUES (
          'default', 'youtube-1', 'youtube', 0, 0, 520, 400, 0, 6,
          'https://www.youtube.com/watch?v=ryig6M3rZYU'
        )
      `);
      const invalidKind = yield* sql
        .unsafe(`
        INSERT INTO items (
          board_id, id, kind, x, y, width, height, rotation, order_index
        ) VALUES ('default', 'video-1', 'video', 0, 0, 320, 240, 0, 7)
      `)
        .pipe(Effect.exit);
      expect(Exit.isFailure(invalidKind)).toBe(true);

      const indexes = yield* sql.unsafe<IndexRow>("PRAGMA index_list(items)");
      expect(indexes.some((index) => index.name === "items_board_order")).toBe(true);
      expect(indexes.some((index) => index.name === "items_media_id")).toBe(true);
      const triggers = yield* sql.unsafe<TriggerRow>(`
        SELECT name FROM sqlite_master WHERE type = 'trigger'
      `);
      expect(triggers.map((trigger) => trigger.name)).toEqual(
        expect.arrayContaining([
          "items_media_reference_insert",
          "items_media_reference_update",
          "items_media_reference_delete",
          "boards_background_media_validate_insert",
          "boards_background_media_validate_update",
          "boards_background_media_reference_insert",
          "boards_background_media_reference_update",
          "boards_background_media_reference_delete",
        ]),
      );
      yield* sql`
        INSERT INTO publisher_profile (singleton, handle, display_name, bio, updated_at)
        VALUES (1, 'studio', 'Studio', '', 1)
      `;
      yield* sql`
        INSERT INTO board_publications (board_id, public_id, published_at)
        VALUES ('default', '0123456789abcdef0123456789abcdef', 1)
      `;
      yield* sql`DELETE FROM boards WHERE id = 'default'`;
      const remaining = yield* sql<CountRow>`SELECT COUNT(*) AS count FROM items`;
      const publications = yield* sql<CountRow>`SELECT COUNT(*) AS count FROM board_publications`;
      expect(remaining[0]?.count).toBe(0);
      expect(publications[0]?.count).toBe(0);
    }).pipe(Effect.provide(Database)),
  );

  it.effect("upgrades a populated v6 audio table to website cards without data loss", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql.unsafe("PRAGMA foreign_keys = ON");
      yield* sql.unsafe(`
        CREATE TABLE effect_sql_migrations (
          migration_id INTEGER PRIMARY KEY NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          name VARCHAR(255) NOT NULL
        )
      `);
      yield* sql.unsafe(`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES
          (1, 'initial_schema'),
          (2, 'board_tombstones'),
          (3, 'board_background'),
          (4, 'item_href'),
          (5, 'audio_item_kinds'),
          (6, 'public_publishing')
      `);
      yield* sql.unsafe(`
        CREATE TABLE boards (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          version INTEGER NOT NULL,
          revision INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL,
          background_color TEXT
        )
      `);
      yield* sql.unsafe(`
        CREATE TABLE items (
          board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
          id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('image', 'note', 'swatch', 'spotify', 'audio')),
          x REAL NOT NULL,
          y REAL NOT NULL,
          width REAL NOT NULL,
          height REAL NOT NULL,
          rotation REAL NOT NULL,
          order_index INTEGER NOT NULL,
          src TEXT,
          text TEXT,
          color TEXT,
          label TEXT,
          href TEXT,
          PRIMARY KEY (board_id, id)
        )
      `);
      yield* sql.unsafe("CREATE INDEX items_board_order ON items (board_id, order_index)");
      yield* sql.unsafe(`
        INSERT INTO boards (id, title, version, revision, updated_at)
        VALUES ('default', 'Sound study', 1, 2, 1)
      `);
      yield* sql.unsafe(`
        INSERT INTO items (
          board_id, id, kind, x, y, width, height, rotation, order_index, src, label
        ) VALUES (
          'default', 'audio-1', 'audio', 0, 0, 520, 220, 0, 1,
          'https://media.example/field.mp3', 'Field recording'
        )
      `);

      expect(yield* SqliteMigrator.run({ loader: migrationLoader })).toEqual([
        [7, "website_item_kind"],
        [8, "managed_media"],
        [9, "managed_media_lifecycle"],
        [10, "media_guardrails"],
        [11, "board_background_media"],
        [12, "youtube_item_kind"],
        [13, "image_annotations"],
        [14, "x_post_item_kind"],
      ]);
      expect(yield* sql<MediaRow>`SELECT id, kind, src FROM items`).toEqual([
        {
          id: "audio-1",
          kind: "audio",
          src: "https://media.example/field.mp3",
        },
      ]);
      yield* sql.unsafe(`
        INSERT INTO items (
          board_id, id, kind, x, y, width, height, rotation, order_index,
          website_url, website_title, website_site_label
        ) VALUES (
          'default', 'website-1', 'website', 0, 0, 540, 360, 0, 2,
          'https://example.com/', 'Example', 'example.com'
        )
      `);
    }).pipe(Effect.provide(Database)),
  );

  it.effect("adds an indexed ready-image board background reference", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      expect(yield* SqliteMigrator.run({ loader: migrationLoader })).toContainEqual([
        11,
        "board_background_media",
      ]);
      const indexes = yield* sql.unsafe<IndexRow>("PRAGMA index_list(boards)");
      expect(indexes.some((index) => index.name === "boards_background_media_id")).toBe(true);

      yield* sql.unsafe(`
        INSERT INTO media_assets (
          id, kind, mime_type, byte_length, etag, storage_key, created_at,
          ready_at, unreferenced_at
        ) VALUES
          ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'image', 'image/png', 8, 'a', 'a', 1, 1, 1),
          ('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'audio', 'audio/mpeg', 8, 'b', 'b', 1, 1, 1),
          ('cccccccccccccccccccccccccccccccc', 'image', 'image/png', 8, 'c', 'c', 1, NULL, 1)
      `);
      yield* sql.unsafe(`
        INSERT INTO boards (
          id, title, version, revision, updated_at, background_media_id
        ) VALUES (
          'default', 'Ready image', 1, 0, 1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        )
      `);
      const wrongKind = yield* sql
        .unsafe(`
        UPDATE boards SET background_media_id = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        WHERE id = 'default'
      `)
        .pipe(Effect.exit);
      const pending = yield* sql
        .unsafe(`
        UPDATE boards SET background_media_id = 'cccccccccccccccccccccccccccccccc'
        WHERE id = 'default'
      `)
        .pipe(Effect.exit);
      expect(Exit.isFailure(wrongKind)).toBe(true);
      expect(Exit.isFailure(pending)).toBe(true);
    }).pipe(Effect.provide(Database)),
  );

  it.effect("upgrades populated v9 media state and backfills authoritative bytes", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql.unsafe(`
        CREATE TABLE effect_sql_migrations (
          migration_id INTEGER PRIMARY KEY NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          name VARCHAR(255) NOT NULL
        )
      `);
      yield* sql.unsafe(`
        INSERT INTO effect_sql_migrations (migration_id, name) VALUES
          (1, 'initial_schema'), (2, 'board_tombstones'), (3, 'board_background'),
          (4, 'item_href'), (5, 'audio_item_kinds'), (6, 'public_publishing'),
          (7, 'website_item_kind'), (8, 'managed_media'), (9, 'managed_media_lifecycle')
      `);
      yield* sql.unsafe(`
        CREATE TABLE boards (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          revision INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL,
          background_color TEXT
        )
      `);
      yield* sql.unsafe(`
        CREATE TABLE media_assets (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          byte_length INTEGER NOT NULL,
          etag TEXT NOT NULL,
          storage_key TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL,
          ready_at INTEGER,
          unreferenced_at INTEGER
        )
      `);
      yield* sql.unsafe(`
        CREATE TABLE items (
          board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
          id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('image', 'note', 'swatch', 'spotify', 'audio', 'website')),
          x REAL NOT NULL,
          y REAL NOT NULL,
          width REAL NOT NULL,
          height REAL NOT NULL,
          rotation REAL NOT NULL,
          order_index INTEGER NOT NULL,
          src TEXT,
          text TEXT,
          color TEXT,
          label TEXT,
          href TEXT,
          website_url TEXT,
          website_image_url TEXT,
          website_title TEXT,
          website_description TEXT,
          website_site_label TEXT,
          media_id TEXT REFERENCES media_assets(id),
          PRIMARY KEY (board_id, id)
        )
      `);
      yield* sql.unsafe("CREATE INDEX items_board_order ON items (board_id, order_index)");
      yield* sql.unsafe("CREATE INDEX items_media_id ON items (media_id)");
      yield* sql.unsafe(`
        CREATE TRIGGER items_media_reference_insert
        AFTER INSERT ON items BEGIN SELECT 1; END
      `);
      yield* sql.unsafe(`
        CREATE TRIGGER items_media_reference_update
        AFTER UPDATE OF media_id ON items BEGIN SELECT 1; END
      `);
      yield* sql.unsafe(`
        CREATE TRIGGER items_media_reference_delete
        AFTER DELETE ON items BEGIN SELECT 1; END
      `);
      yield* sql.unsafe(`
        INSERT INTO media_assets VALUES
          ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'image', 'image/png', 12, 'a', 'a', 1, 2, 2),
          ('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'audio', 'audio/mpeg', 25, 'b', 'b', 1, NULL, 1)
      `);

      expect(yield* SqliteMigrator.run({ loader: migrationLoader })).toEqual([
        [10, "media_guardrails"],
        [11, "board_background_media"],
        [12, "youtube_item_kind"],
        [13, "image_annotations"],
        [14, "x_post_item_kind"],
      ]);
      const state = yield* sql<{ readonly managed: number; readonly reserved: number }>`
        SELECT managed_bytes AS managed, reserved_bytes AS reserved
        FROM media_quota_state WHERE singleton = 1
      `;
      expect(state).toEqual([{ managed: 37, reserved: 0 }]);
      yield* sql.unsafe(`
        INSERT INTO media_assets (
          id, kind, mime_type, byte_length, etag, storage_key, created_at,
          ready_at, unreferenced_at
        ) VALUES (
          'cccccccccccccccccccccccccccccccc', 'image', 'image/png', 8, 'c', 'c', 3, 3, 3
        )
      `);
      const afterInsert = yield* sql<{ readonly managed: number }>`
        SELECT managed_bytes AS managed FROM media_quota_state WHERE singleton = 1
      `;
      expect(afterInsert[0]?.managed).toBe(45);
      yield* sql`
        DELETE FROM media_assets WHERE id = 'cccccccccccccccccccccccccccccccc'
      `;
      const afterDelete = yield* sql<{ readonly managed: number }>`
        SELECT managed_bytes AS managed FROM media_quota_state WHERE singleton = 1
      `;
      expect(afterDelete[0]?.managed).toBe(37);
    }).pipe(Effect.provide(Database)),
  );
});
