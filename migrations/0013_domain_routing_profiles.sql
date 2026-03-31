CREATE TABLE IF NOT EXISTS domain_routing_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'cloudflare',
  catch_all_mode TEXT NOT NULL DEFAULT 'inherit',
  catch_all_forward_to TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  project_id INTEGER,
  environment_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_domain_routing_profiles_project_id
ON domain_routing_profiles (project_id);

CREATE INDEX IF NOT EXISTS idx_domain_routing_profiles_environment_id
ON domain_routing_profiles (environment_id);

CREATE INDEX IF NOT EXISTS idx_domain_routing_profiles_enabled_slug
ON domain_routing_profiles (is_enabled, slug);

ALTER TABLE domains
ADD COLUMN routing_profile_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_domains_routing_profile_id
ON domains (routing_profile_id);
