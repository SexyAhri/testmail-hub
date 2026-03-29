ALTER TABLE outbound_emails ADD COLUMN scheduled_at INTEGER;
ALTER TABLE outbound_emails ADD COLUMN sent_at INTEGER;
ALTER TABLE outbound_emails ADD COLUMN last_attempt_at INTEGER;
ALTER TABLE outbound_emails ADD COLUMN attachment_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_outbound_emails_status_created_at
ON outbound_emails (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbound_emails_status_scheduled_at
ON outbound_emails (status, scheduled_at ASC);

CREATE TABLE IF NOT EXISTS outbound_email_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outbound_email_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_base64 TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outbound_email_attachments_email_id
ON outbound_email_attachments (outbound_email_id, id ASC);

CREATE TABLE IF NOT EXISTS outbound_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  text_template TEXT NOT NULL DEFAULT '',
  html_template TEXT NOT NULL DEFAULT '',
  variables_json TEXT NOT NULL DEFAULT '[]',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outbound_templates_created_at
ON outbound_templates (created_at DESC);

CREATE TABLE IF NOT EXISTS outbound_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  note TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outbound_contacts_created_at
ON outbound_contacts (created_at DESC);
