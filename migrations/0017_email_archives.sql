ALTER TABLE emails ADD COLUMN archived_at INTEGER;
ALTER TABLE emails ADD COLUMN archived_by TEXT;
ALTER TABLE emails ADD COLUMN archive_reason TEXT NOT NULL DEFAULT '';

ALTER TABLE retention_policies ADD COLUMN archive_email_hours INTEGER;

ALTER TABLE retention_job_runs ADD COLUMN archived_email_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_emails_archived_at_received_at
ON emails (archived_at, received_at DESC);
