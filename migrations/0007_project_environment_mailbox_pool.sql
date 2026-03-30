CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_enabled_name
ON projects (is_enabled, name);

CREATE TABLE IF NOT EXISTS environments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_environments_project_slug
ON environments (project_id, slug);

CREATE INDEX IF NOT EXISTS idx_environments_project_enabled_name
ON environments (project_id, is_enabled, name);

CREATE TABLE IF NOT EXISTS mailbox_pools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  environment_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mailbox_pools_environment_slug
ON mailbox_pools (environment_id, slug);

CREATE INDEX IF NOT EXISTS idx_mailbox_pools_scope_enabled_name
ON mailbox_pools (project_id, environment_id, is_enabled, name);

ALTER TABLE mailboxes ADD COLUMN project_id INTEGER;
ALTER TABLE mailboxes ADD COLUMN environment_id INTEGER;
ALTER TABLE mailboxes ADD COLUMN mailbox_pool_id INTEGER;

ALTER TABLE emails ADD COLUMN primary_mailbox_id INTEGER;
ALTER TABLE emails ADD COLUMN project_id INTEGER;
ALTER TABLE emails ADD COLUMN environment_id INTEGER;
ALTER TABLE emails ADD COLUMN mailbox_pool_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_mailboxes_scope
ON mailboxes (project_id, environment_id, mailbox_pool_id, deleted_at, is_enabled);

CREATE INDEX IF NOT EXISTS idx_emails_scope_received_at
ON emails (project_id, environment_id, mailbox_pool_id, received_at DESC);

CREATE TABLE IF NOT EXISTS email_mailbox_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_message_id TEXT NOT NULL,
  mailbox_id INTEGER NOT NULL,
  mailbox_address TEXT NOT NULL,
  project_id INTEGER,
  environment_id INTEGER,
  mailbox_pool_id INTEGER,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_mailbox_links_unique
ON email_mailbox_links (email_message_id, mailbox_id);

CREATE INDEX IF NOT EXISTS idx_email_mailbox_links_scope
ON email_mailbox_links (project_id, environment_id, mailbox_pool_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_mailbox_links_message_id
ON email_mailbox_links (email_message_id);
