ALTER TABLE emails ADD COLUMN note TEXT;
ALTER TABLE emails ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO app_settings (key, value, updated_at)
VALUES ("whitelist_enabled", "1", strftime('%s', 'now') * 1000);
