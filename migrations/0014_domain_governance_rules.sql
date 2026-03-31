ALTER TABLE domains ADD COLUMN allow_new_mailboxes INTEGER NOT NULL DEFAULT 1;
ALTER TABLE domains ADD COLUMN allow_mailbox_route_sync INTEGER NOT NULL DEFAULT 1;

UPDATE domains
SET
  allow_new_mailboxes = COALESCE(allow_new_mailboxes, 1),
  allow_mailbox_route_sync = COALESCE(allow_mailbox_route_sync, 1);
