CREATE TABLE IF NOT EXISTS domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'cloudflare',
  zone_id TEXT NOT NULL DEFAULT '',
  email_worker TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_domains_enabled_domain
ON domains (is_enabled, domain);

CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_primary_enabled
ON domains (is_primary)
WHERE is_primary = 1;
