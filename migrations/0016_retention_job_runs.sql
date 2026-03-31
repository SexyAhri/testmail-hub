CREATE TABLE IF NOT EXISTS retention_job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_source TEXT NOT NULL DEFAULT 'scheduled',
  status TEXT NOT NULL DEFAULT 'success',
  scanned_email_count INTEGER NOT NULL DEFAULT 0,
  purged_active_email_count INTEGER NOT NULL DEFAULT 0,
  purged_deleted_email_count INTEGER NOT NULL DEFAULT 0,
  expired_mailbox_count INTEGER NOT NULL DEFAULT 0,
  applied_policy_count INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  duration_ms INTEGER,
  error_message TEXT NOT NULL DEFAULT '',
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_retention_job_runs_created_at
ON retention_job_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_retention_job_runs_status_created_at
ON retention_job_runs (status, created_at DESC);
