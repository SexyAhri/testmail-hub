ALTER TABLE notification_deliveries ADD COLUMN is_dead_letter INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_deliveries ADD COLUMN dead_letter_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE notification_deliveries ADD COLUMN resolved_at INTEGER;
ALTER TABLE notification_deliveries ADD COLUMN resolved_by TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_delivery_id INTEGER NOT NULL,
  notification_endpoint_id INTEGER NOT NULL,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'failed',
  response_status INTEGER,
  error_message TEXT NOT NULL DEFAULT '',
  next_retry_at INTEGER,
  attempted_at INTEGER NOT NULL,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_attempts_delivery_attempted
ON notification_delivery_attempts (notification_delivery_id, attempted_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_dead_letter
ON notification_deliveries (notification_endpoint_id, is_dead_letter, created_at DESC);
