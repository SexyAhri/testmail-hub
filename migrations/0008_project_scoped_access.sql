ALTER TABLE admin_users ADD COLUMN access_scope TEXT NOT NULL DEFAULT 'all';

CREATE TABLE IF NOT EXISTS admin_project_bindings (
  admin_id TEXT NOT NULL,
  project_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (admin_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_project_bindings_project
ON admin_project_bindings (project_id, admin_id);

ALTER TABLE notification_endpoints ADD COLUMN access_scope TEXT NOT NULL DEFAULT 'all';

CREATE TABLE IF NOT EXISTS notification_endpoint_project_bindings (
  notification_endpoint_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (notification_endpoint_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_project_bindings_project
ON notification_endpoint_project_bindings (project_id, notification_endpoint_id);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  permissions_json TEXT NOT NULL DEFAULT '[]',
  access_scope TEXT NOT NULL DEFAULT 'all',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL DEFAULT '',
  last_used_at INTEGER,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_enabled_updated
ON api_tokens (is_enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS api_token_project_bindings (
  api_token_id TEXT NOT NULL,
  project_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (api_token_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_api_token_project_bindings_project
ON api_token_project_bindings (project_id, api_token_id);
