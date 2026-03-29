ALTER TABLE emails ADD COLUMN text_body TEXT NOT NULL DEFAULT '';
ALTER TABLE emails ADD COLUMN html_body TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_message_id ON emails (message_id);

CREATE TABLE IF NOT EXISTS mailboxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  note TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_received_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mailboxes_address ON mailboxes (address);
