CREATE TABLE IF NOT EXISTS retention_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  scope_key TEXT NOT NULL UNIQUE,
  project_id INTEGER,
  environment_id INTEGER,
  mailbox_pool_id INTEGER,
  mailbox_ttl_hours INTEGER,
  email_retention_hours INTEGER,
  deleted_email_retention_hours INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_retention_policies_scope_enabled
ON retention_policies (project_id, environment_id, mailbox_pool_id, is_enabled, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_retention_policies_scope_key
ON retention_policies (scope_key);

INSERT OR IGNORE INTO retention_policies (
  name,
  description,
  is_enabled,
  scope_key,
  project_id,
  environment_id,
  mailbox_pool_id,
  mailbox_ttl_hours,
  email_retention_hours,
  deleted_email_retention_hours,
  created_at,
  updated_at
)
VALUES (
  '默认全局策略',
  '系统初始化的默认邮件保留策略',
  1,
  'global',
  NULL,
  NULL,
  NULL,
  NULL,
  48,
  720,
  strftime('%s', 'now') * 1000,
  strftime('%s', 'now') * 1000
);
