ALTER TABLE notification_endpoints
ADD COLUMN custom_headers_json TEXT NOT NULL DEFAULT '[]';
