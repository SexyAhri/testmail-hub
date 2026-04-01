CREATE TABLE IF NOT EXISTS mailbox_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_source TEXT NOT NULL DEFAULT 'manual',
  requested_by TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  catch_all_enabled INTEGER NOT NULL DEFAULT 0,
  cloudflare_configured INTEGER NOT NULL DEFAULT 0,
  cloudflare_routes_total INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  observed_total INTEGER NOT NULL DEFAULT 0,
  domain_summaries_json TEXT NOT NULL DEFAULT '[]',
  error_message TEXT NOT NULL DEFAULT '',
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mailbox_sync_runs_created_at
ON mailbox_sync_runs (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_mailbox_sync_runs_status_created_at
ON mailbox_sync_runs (status, created_at DESC, id DESC);
