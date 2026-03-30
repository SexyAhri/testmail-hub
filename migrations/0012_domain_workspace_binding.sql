ALTER TABLE domains
ADD COLUMN project_id INTEGER;

ALTER TABLE domains
ADD COLUMN environment_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_domains_project_id
ON domains (project_id);

CREATE INDEX IF NOT EXISTS idx_domains_environment_id
ON domains (environment_id);
