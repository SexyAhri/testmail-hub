ALTER TABLE notification_endpoints
ADD COLUMN alert_config_json TEXT NOT NULL DEFAULT '{}';
