ALTER TABLE domains
ADD COLUMN cloudflare_api_token TEXT NOT NULL DEFAULT '';
