CREATE TABLE IF NOT EXISTS outbound_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_message_id TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL,
  from_address TEXT NOT NULL,
  reply_to TEXT,
  to_addresses TEXT NOT NULL DEFAULT '[]',
  cc_addresses TEXT NOT NULL DEFAULT '[]',
  bcc_addresses TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL DEFAULT '',
  html_body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'sending',
  error_message TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outbound_emails_created_at
ON outbound_emails (created_at DESC);

INSERT OR IGNORE INTO app_settings (key, value, updated_at)
VALUES ("outbound_email_external_enabled", "1", strftime('%s', 'now') * 1000);
