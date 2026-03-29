import type { AdminRole } from "../server/types";

export const PAGE_SIZE = 20;
export const RULES_PAGE_SIZE = 12;
export const MAILBOX_PAGE_SIZE = 20;
export const AUDIT_PAGE_SIZE = 25;
export const ADMIN_PAGE_SIZE = 25;
export const TRASH_PAGE_SIZE = 20;
export const OUTBOUND_EMAIL_PAGE_SIZE = 20;
export const OUTBOUND_TEMPLATE_PAGE_SIZE = 20;
export const OUTBOUND_CONTACT_PAGE_SIZE = 30;

export const SESSION_TTL_SECONDS = 60 * 60 * 12;
export const SESSION_COOKIE_NAME = "admin_session";
export const MAX_MATCH_CONTENT_CHARS = 20000;
export const MAX_RULE_PATTERN_LENGTH = 2000;
export const MAX_SENDER_PATTERN_LENGTH = 500;
export const MAX_SENDER_FILTER_LENGTH = 2000;
export const MAX_RULE_REMARK_LENGTH = 200;
export const MAX_MAILBOX_ADDRESS_LENGTH = 320;
export const MAX_MAILBOX_NOTE_LENGTH = 200;
export const MAX_MAILBOX_TAGS = 20;
export const MAX_MAILBOX_TAG_LENGTH = 32;
export const MAX_EMAIL_NOTE_LENGTH = 500;
export const MAX_OUTBOUND_BODY_LENGTH = 100_000;
export const MAX_OUTBOUND_ATTACHMENTS = 10;
export const MAX_OUTBOUND_ATTACHMENT_TOTAL_BYTES = 5 * 1024 * 1024;
export const MAX_OUTBOUND_FROM_NAME_LENGTH = 120;
export const MAX_OUTBOUND_RECIPIENTS = 50;
export const MAX_OUTBOUND_SUBJECT_LENGTH = 200;
export const MAX_OUTBOUND_TEMPLATE_NAME_LENGTH = 120;
export const MAX_OUTBOUND_CONTACT_NOTE_LENGTH = 200;
export const MAX_ATTACHMENT_STORAGE_BYTES = 2 * 1024 * 1024;
export const EMAIL_PREVIEW_LENGTH = 180;
export const PURGE_DELETED_EMAILS_AFTER_HOURS = 24 * 30;
export const EXPIRED_EMAIL_RETENTION_HOURS = 48;

export const API_CORS_METHODS = "GET, OPTIONS";
export const API_CORS_HEADERS = "Authorization, Content-Type";

export const NOTIFICATION_EVENTS = [
  "email.received",
  "email.matched",
  "email.deleted",
  "email.restored",
  "mailbox.expired",
  "admin.login",
  "rule.updated",
  "error.raised",
  "email.sent",
  "email.send_failed",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const ADMIN_ROLE_ORDER: AdminRole[] = ["owner", "admin", "analyst"];

export type AdminPermission =
  | "admins:read"
  | "admins:write"
  | "emails:delete"
  | "emails:read"
  | "emails:restore"
  | "emails:write"
  | "exports:read"
  | "mailboxes:read"
  | "mailboxes:write"
  | "notifications:read"
  | "notifications:write"
  | "outbound:read"
  | "outbound:write"
  | "rules:read"
  | "rules:test"
  | "rules:write"
  | "system:audit"
  | "system:errors"
  | "whitelist:read"
  | "whitelist:write";

export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  admin: [
    "emails:read",
    "emails:delete",
    "emails:restore",
    "emails:write",
    "exports:read",
    "mailboxes:read",
    "mailboxes:write",
    "notifications:read",
    "notifications:write",
    "outbound:read",
    "outbound:write",
    "rules:read",
    "rules:test",
    "rules:write",
    "system:audit",
    "system:errors",
    "whitelist:read",
    "whitelist:write",
  ],
  analyst: [
    "emails:read",
    "exports:read",
    "emails:write",
    "mailboxes:read",
    "notifications:read",
    "outbound:read",
    "rules:read",
    "rules:test",
    "whitelist:read",
  ],
  owner: [
    "admins:read",
    "admins:write",
    "emails:read",
    "emails:delete",
    "emails:restore",
    "emails:write",
    "exports:read",
    "mailboxes:read",
    "mailboxes:write",
    "notifications:read",
    "notifications:write",
    "outbound:read",
    "outbound:write",
    "rules:read",
    "rules:test",
    "rules:write",
    "system:audit",
    "system:errors",
    "whitelist:read",
    "whitelist:write",
  ],
};
