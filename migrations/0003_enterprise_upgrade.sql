ALTER TABLE emails ADD COLUMN raw_headers TEXT NOT NULL DEFAULT '[]';
ALTER TABLE emails ADD COLUMN has_attachments INTEGER NOT NULL DEFAULT 0;
ALTER TABLE emails ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE emails ADD COLUMN deleted_at INTEGER;
ALTER TABLE emails ADD COLUMN deleted_by TEXT;
ALTER TABLE emails ADD COLUMN matched_rule_ids TEXT NOT NULL DEFAULT '[]';

ALTER TABLE rules ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE rules ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

ALTER TABLE whitelist ADD COLUMN note TEXT;
ALTER TABLE whitelist ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE whitelist ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

ALTER TABLE mailboxes ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE mailboxes ADD COLUMN expires_at INTEGER;
ALTER TABLE mailboxes ADD COLUMN deleted_at INTEGER;
ALTER TABLE mailboxes ADD COLUMN receive_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mailboxes ADD COLUMN created_by TEXT;

CREATE TABLE IF NOT EXISTS email_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_message_id TEXT NOT NULL,
  filename TEXT,
  mime_type TEXT NOT NULL,
  disposition TEXT,
  content_id TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  is_stored INTEGER NOT NULL DEFAULT 1,
  content_base64 TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_message_id
  ON email_attachments (email_message_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS notification_endpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  target TEXT NOT NULL,
  secret TEXT,
  events TEXT NOT NULL DEFAULT '[]',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_status TEXT,
  last_error TEXT,
  last_sent_at INTEGER
);

CREATE TABLE IF NOT EXISTS error_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  context_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_error_events_created_at
  ON error_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_emails_deleted_at
  ON emails (deleted_at, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_mailboxes_deleted_at
  ON mailboxes (deleted_at, is_enabled);
