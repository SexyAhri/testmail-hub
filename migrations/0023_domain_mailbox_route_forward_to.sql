ALTER TABLE domains
ADD COLUMN mailbox_route_forward_to TEXT NOT NULL DEFAULT '';
