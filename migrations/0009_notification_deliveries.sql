CREATE TABLE IF NOT EXISTS notification_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_endpoint_id INTEGER NOT NULL,
  event TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  scope_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 4,
  last_error TEXT NOT NULL DEFAULT '',
  response_status INTEGER,
  next_retry_at INTEGER,
  last_attempt_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_endpoint_created
ON notification_deliveries (notification_endpoint_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status_retry
ON notification_deliveries (status, next_retry_at ASC);
