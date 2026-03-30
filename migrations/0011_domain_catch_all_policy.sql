ALTER TABLE domains
ADD COLUMN catch_all_mode TEXT NOT NULL DEFAULT 'inherit';

ALTER TABLE domains
ADD COLUMN catch_all_forward_to TEXT NOT NULL DEFAULT '';
