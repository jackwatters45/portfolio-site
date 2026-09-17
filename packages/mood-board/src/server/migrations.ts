import { Effect } from "effect";
import * as Migrator from "effect/unstable/sql/Migrator";
import * as SqlClient from "effect/unstable/sql/SqlClient";

const initialSchema = SqlClient.SqlClient.use((sql) =>
  Effect.gen(function* () {
    yield* sql`PRAGMA foreign_keys = ON`;

    yield* sql`
      CREATE TABLE boards (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        revision INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )
    `;

    yield* sql`
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
        PRIMARY KEY (board_id, id)
      )
    `;

    yield* sql`
      CREATE INDEX items_board_order
      ON items (board_id, order_index)
    `;

    yield* sql`
      CREATE TABLE mutations (
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        mutation_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        client_id TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (board_id, mutation_id)
      )
    `;
  }),
);

const boardTombstones = SqlClient.SqlClient.use(
  (sql) =>
    sql`
    CREATE TABLE board_tombstones (
      board_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      deleted_at INTEGER NOT NULL
    )
  `,
);

const boardBackground = SqlClient.SqlClient.use(
  (sql) => sql`ALTER TABLE boards ADD COLUMN background_color TEXT`,
);

const itemHref = SqlClient.SqlClient.use((sql) => sql`ALTER TABLE items ADD COLUMN href TEXT`);

const audioItemKinds = SqlClient.SqlClient.use((sql) =>
  Effect.gen(function* () {
    yield* sql`
      CREATE TABLE items_v5 (
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
    `;
    yield* sql`
      INSERT INTO items_v5 (
        board_id, id, kind, x, y, width, height, rotation, order_index,
        src, text, color, label, href
      )
      SELECT
        board_id, id, kind, x, y, width, height, rotation, order_index,
        src, text, color, label, href
      FROM items
    `;
    yield* sql`DROP TABLE items`;
    yield* sql`ALTER TABLE items_v5 RENAME TO items`;
    yield* sql`CREATE INDEX items_board_order ON items (board_id, order_index)`;
  }),
);

const websiteItemKind = SqlClient.SqlClient.use((sql) =>
  Effect.gen(function* () {
    yield* sql`
      CREATE TABLE items_v7 (
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
        PRIMARY KEY (board_id, id)
      )
    `;
    yield* sql`
      INSERT INTO items_v7 (
        board_id, id, kind, x, y, width, height, rotation, order_index,
        src, text, color, label, href
      )
      SELECT
        board_id, id, kind, x, y, width, height, rotation, order_index,
        src, text, color, label, href
      FROM items
    `;
    yield* sql`DROP TABLE items`;
    yield* sql`ALTER TABLE items_v7 RENAME TO items`;
    yield* sql`CREATE INDEX items_board_order ON items (board_id, order_index)`;
  }),
);

const managedMedia = SqlClient.SqlClient.use((sql) =>
  Effect.gen(function* () {
    yield* sql`
      CREATE TABLE media_assets (
        id TEXT PRIMARY KEY CHECK (length(id) = 32 AND id NOT GLOB '*[^0-9a-f]*'),
        kind TEXT NOT NULL CHECK (kind IN ('image', 'audio')),
        mime_type TEXT NOT NULL,
        byte_length INTEGER NOT NULL CHECK (byte_length > 0),
        etag TEXT NOT NULL,
        storage_key TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        ready_at INTEGER
      )
    `;
    yield* sql`
      ALTER TABLE items
      ADD COLUMN media_id TEXT REFERENCES media_assets(id)
    `;
    yield* sql`CREATE INDEX items_media_id ON items (media_id)`;
    yield* sql`CREATE INDEX media_assets_ready_at ON media_assets (ready_at)`;
  }),
);

const managedMediaLifecycle = SqlClient.SqlClient.use((sql) =>
  Effect.gen(function* () {
    yield* sql`ALTER TABLE media_assets ADD COLUMN unreferenced_at INTEGER`;
    yield* sql`
      UPDATE media_assets
      SET unreferenced_at = CASE
        WHEN NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = media_assets.id)
          THEN COALESCE(ready_at, created_at)
        ELSE NULL
      END
    `;
    yield* sql`
      CREATE INDEX media_assets_unreferenced_at
      ON media_assets (unreferenced_at)
    `;
    yield* sql`
      CREATE TRIGGER items_media_reference_insert
      AFTER INSERT ON items
      WHEN NEW.media_id IS NOT NULL
      BEGIN
        UPDATE media_assets SET unreferenced_at = NULL WHERE id = NEW.media_id;
      END
    `;
    yield* sql`
      CREATE TRIGGER items_media_reference_update
      AFTER UPDATE OF media_id ON items
      WHEN OLD.media_id IS NOT NEW.media_id
      BEGIN
        UPDATE media_assets
        SET unreferenced_at = COALESCE(
          unreferenced_at,
          CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        )
        WHERE id = OLD.media_id
          AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = OLD.media_id);
        UPDATE media_assets SET unreferenced_at = NULL WHERE id = NEW.media_id;
      END
    `;
    yield* sql`
      CREATE TRIGGER items_media_reference_delete
      AFTER DELETE ON items
      WHEN OLD.media_id IS NOT NULL
      BEGIN
        UPDATE media_assets
        SET unreferenced_at = COALESCE(
          unreferenced_at,
          CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        )
        WHERE id = OLD.media_id
          AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = OLD.media_id);
      END
    `;
  }),
);

const mediaGuardrails = SqlClient.SqlClient.use((sql) =>
  Effect.gen(function* () {
    yield* sql`
      CREATE TABLE media_quota_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        managed_bytes INTEGER NOT NULL CHECK (managed_bytes >= 0),
        reserved_bytes INTEGER NOT NULL CHECK (reserved_bytes >= 0)
      )
    `;
    yield* sql`
      INSERT INTO media_quota_state (singleton, managed_bytes, reserved_bytes)
      SELECT 1, COALESCE(SUM(byte_length), 0), 0 FROM media_assets
    `;
    yield* sql`
      CREATE TABLE media_upload_events (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        byte_length INTEGER NOT NULL CHECK (byte_length > 0),
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('reserved', 'succeeded', 'failed', 'expired'))
      )
    `;
    yield* sql`
      CREATE INDEX media_upload_events_client_created
      ON media_upload_events (client_id, created_at)
    `;
    yield* sql`
      CREATE INDEX media_upload_events_status_expires
      ON media_upload_events (status, expires_at)
    `;
    yield* sql`ALTER TABLE media_assets ADD COLUMN cleanup_lease_until INTEGER`;
    yield* sql`
      ALTER TABLE media_assets
      ADD COLUMN cleanup_attempts INTEGER NOT NULL DEFAULT 0
    `;
    yield* sql`
      CREATE INDEX media_assets_cleanup_lease
      ON media_assets (unreferenced_at, cleanup_lease_until)
    `;
    yield* sql`
      CREATE TRIGGER media_quota_asset_insert
      AFTER INSERT ON media_assets
      BEGIN
        UPDATE media_quota_state
        SET managed_bytes = managed_bytes + NEW.byte_length
        WHERE singleton = 1;
      END
    `;
    yield* sql`
      CREATE TRIGGER media_quota_asset_delete
      AFTER DELETE ON media_assets
      BEGIN
        UPDATE media_quota_state
        SET managed_bytes = MAX(0, managed_bytes - OLD.byte_length)
        WHERE singleton = 1;
      END
    `;
  }),
);

const boardBackgroundMedia = SqlClient.SqlClient.use((sql) =>
  Effect.gen(function* () {
    yield* sql`
      ALTER TABLE boards
      ADD COLUMN background_media_id TEXT REFERENCES media_assets(id)
    `;
    yield* sql`
      CREATE INDEX boards_background_media_id
      ON boards (background_media_id)
    `;
    yield* sql`DROP TRIGGER items_media_reference_insert`;
    yield* sql`DROP TRIGGER items_media_reference_update`;
    yield* sql`DROP TRIGGER items_media_reference_delete`;
    yield* sql`
      UPDATE media_assets
      SET unreferenced_at = CASE
        WHEN NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = media_assets.id)
          AND NOT EXISTS (
            SELECT 1 FROM boards b WHERE b.background_media_id = media_assets.id
          )
          THEN COALESCE(unreferenced_at, ready_at, created_at)
        ELSE NULL
      END
    `;
    yield* sql`
      CREATE TRIGGER items_media_reference_insert
      AFTER INSERT ON items
      WHEN NEW.media_id IS NOT NULL
      BEGIN
        UPDATE media_assets SET unreferenced_at = NULL WHERE id = NEW.media_id;
      END
    `;
    yield* sql`
      CREATE TRIGGER items_media_reference_update
      AFTER UPDATE OF media_id ON items
      WHEN OLD.media_id IS NOT NEW.media_id
      BEGIN
        UPDATE media_assets
        SET unreferenced_at = COALESCE(
          unreferenced_at,
          CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        )
        WHERE id = OLD.media_id
          AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = OLD.media_id)
          AND NOT EXISTS (
            SELECT 1 FROM boards b WHERE b.background_media_id = OLD.media_id
          );
        UPDATE media_assets SET unreferenced_at = NULL WHERE id = NEW.media_id;
      END
    `;
    yield* sql`
      CREATE TRIGGER items_media_reference_delete
      AFTER DELETE ON items
      WHEN OLD.media_id IS NOT NULL
      BEGIN
        UPDATE media_assets
        SET unreferenced_at = COALESCE(
          unreferenced_at,
          CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        )
        WHERE id = OLD.media_id
          AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = OLD.media_id)
          AND NOT EXISTS (
            SELECT 1 FROM boards b WHERE b.background_media_id = OLD.media_id
          );
      END
    `;
    yield* sql`
      CREATE TRIGGER boards_background_media_validate_insert
      BEFORE INSERT ON boards
      WHEN NEW.background_media_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM media_assets m
          WHERE m.id = NEW.background_media_id
            AND m.kind = 'image'
            AND m.ready_at IS NOT NULL
        )
      BEGIN
        SELECT RAISE(ABORT, 'invalid board background media');
      END
    `;
    yield* sql`
      CREATE TRIGGER boards_background_media_validate_update
      BEFORE UPDATE OF background_media_id ON boards
      WHEN NEW.background_media_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM media_assets m
          WHERE m.id = NEW.background_media_id
            AND m.kind = 'image'
            AND m.ready_at IS NOT NULL
        )
      BEGIN
        SELECT RAISE(ABORT, 'invalid board background media');
      END
    `;
    yield* sql`
      CREATE TRIGGER boards_background_media_reference_insert
      AFTER INSERT ON boards
      WHEN NEW.background_media_id IS NOT NULL
      BEGIN
        UPDATE media_assets SET unreferenced_at = NULL
        WHERE id = NEW.background_media_id;
      END
    `;
    yield* sql`
      CREATE TRIGGER boards_background_media_reference_update
      AFTER UPDATE OF background_media_id ON boards
      WHEN OLD.background_media_id IS NOT NEW.background_media_id
      BEGIN
        UPDATE media_assets
        SET unreferenced_at = COALESCE(
          unreferenced_at,
          CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        )
        WHERE id = OLD.background_media_id
          AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = OLD.background_media_id)
          AND NOT EXISTS (
            SELECT 1 FROM boards b WHERE b.background_media_id = OLD.background_media_id
          );
        UPDATE media_assets SET unreferenced_at = NULL
        WHERE id = NEW.background_media_id;
      END
    `;
    yield* sql`
      CREATE TRIGGER boards_background_media_reference_delete
      AFTER DELETE ON boards
      WHEN OLD.background_media_id IS NOT NULL
      BEGIN
        UPDATE media_assets
        SET unreferenced_at = COALESCE(
          unreferenced_at,
          CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        )
        WHERE id = OLD.background_media_id
          AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = OLD.background_media_id)
          AND NOT EXISTS (
            SELECT 1 FROM boards b WHERE b.background_media_id = OLD.background_media_id
          );
      END
    `;
  }),
);

const youtubeItemKind = SqlClient.SqlClient.use((sql) =>
  Effect.gen(function* () {
    yield* sql`DROP TRIGGER items_media_reference_insert`;
    yield* sql`DROP TRIGGER items_media_reference_update`;
    yield* sql`DROP TRIGGER items_media_reference_delete`;
    yield* sql`DROP TRIGGER boards_background_media_validate_insert`;
    yield* sql`DROP TRIGGER boards_background_media_validate_update`;
    yield* sql`DROP TRIGGER boards_background_media_reference_insert`;
    yield* sql`DROP TRIGGER boards_background_media_reference_update`;
    yield* sql`DROP TRIGGER boards_background_media_reference_delete`;
    yield* sql`
      CREATE TABLE items_v12 (
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('image', 'note', 'swatch', 'spotify', 'youtube', 'audio', 'website')),
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
    `;
    yield* sql`
      INSERT INTO items_v12 (
        board_id, id, kind, x, y, width, height, rotation, order_index,
        src, text, color, label, href, website_url, website_image_url,
        website_title, website_description, website_site_label, media_id
      )
      SELECT
        board_id, id, kind, x, y, width, height, rotation, order_index,
        src, text, color, label, href, website_url, website_image_url,
        website_title, website_description, website_site_label, media_id
      FROM items
    `;
    yield* sql`DROP TABLE items`;
    yield* sql`ALTER TABLE items_v12 RENAME TO items`;
    yield* sql`CREATE INDEX items_board_order ON items (board_id, order_index)`;
    yield* sql`CREATE INDEX items_media_id ON items (media_id)`;
    yield* sql`
      CREATE TRIGGER items_media_reference_insert
      AFTER INSERT ON items
      WHEN NEW.media_id IS NOT NULL
      BEGIN
        UPDATE media_assets SET unreferenced_at = NULL WHERE id = NEW.media_id;
      END
    `;
    yield* sql`
      CREATE TRIGGER items_media_reference_update
      AFTER UPDATE OF media_id ON items
      WHEN OLD.media_id IS NOT NEW.media_id
      BEGIN
        UPDATE media_assets
        SET unreferenced_at = COALESCE(
          unreferenced_at,
          CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        )
        WHERE id = OLD.media_id
          AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = OLD.media_id)
          AND NOT EXISTS (
            SELECT 1 FROM boards b WHERE b.background_media_id = OLD.media_id
          );
        UPDATE media_assets SET unreferenced_at = NULL WHERE id = NEW.media_id;
      END
    `;
    yield* sql`
      CREATE TRIGGER items_media_reference_delete
      AFTER DELETE ON items
      WHEN OLD.media_id IS NOT NULL
      BEGIN
        UPDATE media_assets
        SET unreferenced_at = COALESCE(
          unreferenced_at,
          CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        )
        WHERE id = OLD.media_id
          AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = OLD.media_id)
          AND NOT EXISTS (
            SELECT 1 FROM boards b WHERE b.background_media_id = OLD.media_id
          );
      END
    `;
    yield* sql`
      CREATE TRIGGER boards_background_media_validate_insert
      BEFORE INSERT ON boards
      WHEN NEW.background_media_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM media_assets m
          WHERE m.id = NEW.background_media_id
            AND m.kind = 'image'
            AND m.ready_at IS NOT NULL
        )
      BEGIN
        SELECT RAISE(ABORT, 'invalid board background media');
      END
    `;
    yield* sql`
      CREATE TRIGGER boards_background_media_validate_update
      BEFORE UPDATE OF background_media_id ON boards
      WHEN NEW.background_media_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM media_assets m
          WHERE m.id = NEW.background_media_id
            AND m.kind = 'image'
            AND m.ready_at IS NOT NULL
        )
      BEGIN
        SELECT RAISE(ABORT, 'invalid board background media');
      END
    `;
    yield* sql`
      CREATE TRIGGER boards_background_media_reference_insert
      AFTER INSERT ON boards
      WHEN NEW.background_media_id IS NOT NULL
      BEGIN
        UPDATE media_assets SET unreferenced_at = NULL
        WHERE id = NEW.background_media_id;
      END
    `;
    yield* sql`
      CREATE TRIGGER boards_background_media_reference_update
      AFTER UPDATE OF background_media_id ON boards
      WHEN OLD.background_media_id IS NOT NEW.background_media_id
      BEGIN
        UPDATE media_assets
        SET unreferenced_at = COALESCE(
          unreferenced_at,
          CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        )
        WHERE id = OLD.background_media_id
          AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = OLD.background_media_id)
          AND NOT EXISTS (
            SELECT 1 FROM boards b WHERE b.background_media_id = OLD.background_media_id
          );
        UPDATE media_assets SET unreferenced_at = NULL
        WHERE id = NEW.background_media_id;
      END
    `;
    yield* sql`
      CREATE TRIGGER boards_background_media_reference_delete
      AFTER DELETE ON boards
      WHEN OLD.background_media_id IS NOT NULL
      BEGIN
        UPDATE media_assets
        SET unreferenced_at = COALESCE(
          unreferenced_at,
          CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        )
        WHERE id = OLD.background_media_id
          AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = OLD.background_media_id)
          AND NOT EXISTS (
            SELECT 1 FROM boards b WHERE b.background_media_id = OLD.background_media_id
          );
      END
    `;
  }),
);

const imageAnnotations = SqlClient.SqlClient.use((sql) =>
  Effect.gen(function* () {
    yield* sql`ALTER TABLE items ADD COLUMN annotation_title TEXT`;
    yield* sql`ALTER TABLE items ADD COLUMN annotation_description TEXT`;
  }),
);

const xPostItemKind = SqlClient.SqlClient.use((sql) =>
  Effect.gen(function* () {
    yield* sql`DROP TRIGGER items_media_reference_insert`;
    yield* sql`DROP TRIGGER items_media_reference_update`;
    yield* sql`DROP TRIGGER items_media_reference_delete`;
    yield* sql`DROP TRIGGER boards_background_media_validate_insert`;
    yield* sql`DROP TRIGGER boards_background_media_validate_update`;
    yield* sql`DROP TRIGGER boards_background_media_reference_insert`;
    yield* sql`DROP TRIGGER boards_background_media_reference_update`;
    yield* sql`DROP TRIGGER boards_background_media_reference_delete`;
    yield* sql`
      CREATE TABLE items_v14 (
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('image', 'note', 'swatch', 'spotify', 'youtube', 'audio', 'website', 'x')),
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
        annotation_title TEXT,
        annotation_description TEXT,
        x_display TEXT CHECK (x_display IN ('post', 'media')),
        x_theme TEXT CHECK (x_theme IN ('automatic', 'light', 'dark')),
        x_hide_thread INTEGER CHECK (x_hide_thread IN (0, 1)),
        x_author_name TEXT,
        x_author_handle TEXT,
        x_post_text TEXT,
        x_post_date TEXT,
        PRIMARY KEY (board_id, id)
      )
    `;
    yield* sql`
      INSERT INTO items_v14 (
        board_id, id, kind, x, y, width, height, rotation, order_index,
        src, text, color, label, href, website_url, website_image_url,
        website_title, website_description, website_site_label, media_id,
        annotation_title, annotation_description
      )
      SELECT
        board_id, id, kind, x, y, width, height, rotation, order_index,
        src, text, color, label, href, website_url, website_image_url,
        website_title, website_description, website_site_label, media_id,
        annotation_title, annotation_description
      FROM items
    `;
    yield* sql`DROP TABLE items`;
    yield* sql`ALTER TABLE items_v14 RENAME TO items`;
    yield* sql`CREATE INDEX items_board_order ON items (board_id, order_index)`;
    yield* sql`CREATE INDEX items_media_id ON items (media_id)`;
    yield* sql`
      CREATE TRIGGER items_media_reference_insert
      AFTER INSERT ON items
      WHEN NEW.media_id IS NOT NULL
      BEGIN
        UPDATE media_assets SET unreferenced_at = NULL WHERE id = NEW.media_id;
      END
    `;
    yield* sql`
      CREATE TRIGGER items_media_reference_update
      AFTER UPDATE OF media_id ON items
      WHEN OLD.media_id IS NOT NEW.media_id
      BEGIN
        UPDATE media_assets
        SET unreferenced_at = COALESCE(
          unreferenced_at,
          CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        )
        WHERE id = OLD.media_id
          AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = OLD.media_id)
          AND NOT EXISTS (
            SELECT 1 FROM boards b WHERE b.background_media_id = OLD.media_id
          );
        UPDATE media_assets SET unreferenced_at = NULL WHERE id = NEW.media_id;
      END
    `;
    yield* sql`
      CREATE TRIGGER items_media_reference_delete
      AFTER DELETE ON items
      WHEN OLD.media_id IS NOT NULL
      BEGIN
        UPDATE media_assets
        SET unreferenced_at = COALESCE(
          unreferenced_at,
          CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        )
        WHERE id = OLD.media_id
          AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = OLD.media_id)
          AND NOT EXISTS (
            SELECT 1 FROM boards b WHERE b.background_media_id = OLD.media_id
          );
      END
    `;
    yield* sql`
      CREATE TRIGGER boards_background_media_validate_insert
      BEFORE INSERT ON boards
      WHEN NEW.background_media_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM media_assets m
          WHERE m.id = NEW.background_media_id
            AND m.kind = 'image'
            AND m.ready_at IS NOT NULL
        )
      BEGIN
        SELECT RAISE(ABORT, 'invalid board background media');
      END
    `;
    yield* sql`
      CREATE TRIGGER boards_background_media_validate_update
      BEFORE UPDATE OF background_media_id ON boards
      WHEN NEW.background_media_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM media_assets m
          WHERE m.id = NEW.background_media_id
            AND m.kind = 'image'
            AND m.ready_at IS NOT NULL
        )
      BEGIN
        SELECT RAISE(ABORT, 'invalid board background media');
      END
    `;
    yield* sql`
      CREATE TRIGGER boards_background_media_reference_insert
      AFTER INSERT ON boards
      WHEN NEW.background_media_id IS NOT NULL
      BEGIN
        UPDATE media_assets SET unreferenced_at = NULL
        WHERE id = NEW.background_media_id;
      END
    `;
    yield* sql`
      CREATE TRIGGER boards_background_media_reference_update
      AFTER UPDATE OF background_media_id ON boards
      WHEN OLD.background_media_id IS NOT NEW.background_media_id
      BEGIN
        UPDATE media_assets
        SET unreferenced_at = COALESCE(
          unreferenced_at,
          CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        )
        WHERE id = OLD.background_media_id
          AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = OLD.background_media_id)
          AND NOT EXISTS (
            SELECT 1 FROM boards b WHERE b.background_media_id = OLD.background_media_id
          );
        UPDATE media_assets SET unreferenced_at = NULL
        WHERE id = NEW.background_media_id;
      END
    `;
    yield* sql`
      CREATE TRIGGER boards_background_media_reference_delete
      AFTER DELETE ON boards
      WHEN OLD.background_media_id IS NOT NULL
      BEGIN
        UPDATE media_assets
        SET unreferenced_at = COALESCE(
          unreferenced_at,
          CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        )
        WHERE id = OLD.background_media_id
          AND NOT EXISTS (SELECT 1 FROM items i WHERE i.media_id = OLD.background_media_id)
          AND NOT EXISTS (
            SELECT 1 FROM boards b WHERE b.background_media_id = OLD.background_media_id
          );
      END
    `;
  }),
);

const publicPublishing = SqlClient.SqlClient.use((sql) =>
  Effect.gen(function* () {
    yield* sql`
      CREATE TABLE publisher_profile (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        bio TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
      )
    `;
    yield* sql`
      CREATE TABLE board_publications (
        board_id TEXT PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
        public_id TEXT NOT NULL UNIQUE,
        published_at INTEGER NOT NULL
      )
    `;
    yield* sql`
      CREATE INDEX board_publications_published_at
      ON board_publications (published_at DESC, board_id ASC)
    `;
  }),
);

export const migrationLoader = Migrator.fromRecord({
  "1_initial_schema": initialSchema,
  "2_board_tombstones": boardTombstones,
  "3_board_background": boardBackground,
  "4_item_href": itemHref,
  "5_audio_item_kinds": audioItemKinds,
  "6_public_publishing": publicPublishing,
  "7_website_item_kind": websiteItemKind,
  "8_managed_media": managedMedia,
  "9_managed_media_lifecycle": managedMediaLifecycle,
  "10_media_guardrails": mediaGuardrails,
  "11_board_background_media": boardBackgroundMedia,
  "12_youtube_item_kind": youtubeItemKind,
  "13_image_annotations": imageAnnotations,
  "14_x_post_item_kind": xPostItemKind,
});
