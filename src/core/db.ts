import {
  buildEmailPreview,
  extractVerificationCode,
  isValidEmailAddress,
  isSqliteSchemaError,
  jsonStringify,
  normalizeEmailAddress,
  safeParseJson,
} from "../utils/utils";
import type {
  AdminRole,
  AdminUserRecord,
  AuditLogRecord,
  AuthSession,
  D1Database,
  EmailAttachmentRecord,
  EmailDetail,
  EmailSavePayload,
  EmailSearchFilters,
  EmailSummary,
  ErrorEventRecord,
  ErrorEventsPayload,
  ErrorEventSummary,
  ExportRow,
  JsonValue,
  MailboxRecord,
  NotificationEndpointRecord,
  OutboundContactRecord,
  OutboundEmailAttachmentRecord,
  OutboundEmailRecord,
  OutboundEmailSettings,
  OutboundStats,
  OutboundTemplateRecord,
  OverviewStats,
  PaginationPayload,
  RuleMatch,
  RuleRecord,
  WorkerEnv,
  WhitelistSettings,
  WhitelistRecord,
} from "../server/types";

type DbRow = Record<string, unknown>;

function stringValue(row: DbRow, key: string, fallback = ""): string {
  const value = row[key];
  return value === null || value === undefined ? fallback : String(value);
}

function numberValue(row: DbRow, key: string, fallback = 0): number {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : fallback;
}

function nullableNumberValue(row: DbRow, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolValue(row: DbRow, key: string, fallback = false): boolean {
  const value = row[key];
  if (value === null || value === undefined) return fallback;
  return value === true || value === 1 || value === "1";
}

function mapRule(row: DbRow): RuleRecord {
  return {
    created_at: numberValue(row, "created_at", Date.now()),
    id: numberValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    pattern: stringValue(row, "pattern"),
    remark: stringValue(row, "remark"),
    sender_filter: stringValue(row, "sender_filter"),
    updated_at: numberValue(row, "updated_at", numberValue(row, "created_at", Date.now())),
  };
}

function mapWhitelist(row: DbRow): WhitelistRecord {
  return {
    created_at: numberValue(row, "created_at", Date.now()),
    id: numberValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    note: stringValue(row, "note"),
    sender_pattern: stringValue(row, "sender_pattern"),
    updated_at: numberValue(row, "updated_at", numberValue(row, "created_at", Date.now())),
  };
}

function mapMailbox(row: DbRow): MailboxRecord {
  return {
    address: stringValue(row, "address"),
    created_at: numberValue(row, "created_at", Date.now()),
    created_by: stringValue(row, "created_by"),
    deleted_at: nullableNumberValue(row, "deleted_at"),
    expires_at: nullableNumberValue(row, "expires_at"),
    id: numberValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    last_received_at: nullableNumberValue(row, "last_received_at"),
    note: stringValue(row, "note"),
    receive_count: numberValue(row, "receive_count", 0),
    tags: safeParseJson<string[]>(stringValue(row, "tags", "[]"), []) || [],
    updated_at: numberValue(row, "updated_at", Date.now()),
  };
}

function mapAttachment(row: DbRow): EmailAttachmentRecord {
  return {
    content_id: stringValue(row, "content_id") || null,
    disposition: stringValue(row, "disposition") || null,
    filename: stringValue(row, "filename", "attachment"),
    id: numberValue(row, "id"),
    is_stored: boolValue(row, "is_stored", true),
    mime_type: stringValue(row, "mime_type", "application/octet-stream"),
    size_bytes: numberValue(row, "size_bytes", 0),
  };
}

function mapEmailSummary(row: DbRow): EmailSummary {
  const preview = buildEmailPreview(row.text_body, row.html_body);
  const results = safeParseJson<RuleMatch[]>(stringValue(row, "extracted_json", "[]"), []) || [];
  return {
    deleted_at: nullableNumberValue(row, "deleted_at"),
    from_address: stringValue(row, "from_address"),
    has_attachments: boolValue(row, "has_attachments", false),
    message_id: stringValue(row, "message_id"),
    note: stringValue(row, "note"),
    preview,
    received_at: numberValue(row, "received_at", Date.now()),
    result_count: Array.isArray(results) ? results.length : 0,
    subject: stringValue(row, "subject"),
    tags: safeParseJson<string[]>(stringValue(row, "tags", "[]"), []) || [],
    to_address: stringValue(row, "to_address"),
    verification_code: extractVerificationCode({
      htmlBody: row.html_body,
      preview,
      results,
      subject: row.subject,
      textBody: row.text_body,
    }),
  };
}

function mapEmailDetail(row: DbRow, attachments: EmailAttachmentRecord[]): EmailDetail {
  const preview = buildEmailPreview(row.text_body, row.html_body);
  const results = safeParseJson<EmailDetail["results"]>(stringValue(row, "extracted_json", "[]"), []) || [];
  const raw_headers =
    safeParseJson<Array<{ key: string; value: string }>>(stringValue(row, "raw_headers", "[]"), []) || [];

  return {
    attachments,
    deleted_at: nullableNumberValue(row, "deleted_at"),
    from_address: stringValue(row, "from_address"),
    has_attachments: boolValue(row, "has_attachments", false),
    html_body: stringValue(row, "html_body"),
    message_id: stringValue(row, "message_id"),
    note: stringValue(row, "note"),
    preview,
    raw_headers,
    received_at: numberValue(row, "received_at", Date.now()),
    result_count: Array.isArray(results) ? results.length : 0,
    results,
    subject: stringValue(row, "subject"),
    tags: safeParseJson<string[]>(stringValue(row, "tags", "[]"), []) || [],
    text_body: stringValue(row, "text_body"),
    to_address: stringValue(row, "to_address"),
    verification_code: extractVerificationCode({
      htmlBody: row.html_body,
      preview,
      results,
      subject: row.subject,
      textBody: row.text_body,
    }),
  };
}

function mapAdminUser(row: DbRow): AdminUserRecord {
  return {
    created_at: numberValue(row, "created_at", Date.now()),
    display_name: stringValue(row, "display_name"),
    id: stringValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    last_login_at: nullableNumberValue(row, "last_login_at"),
    role: stringValue(row, "role", "analyst") as AdminRole,
    updated_at: numberValue(row, "updated_at", Date.now()),
    username: stringValue(row, "username"),
  };
}

function mapNotification(row: DbRow): NotificationEndpointRecord {
  return {
    created_at: numberValue(row, "created_at", Date.now()),
    events: safeParseJson<string[]>(stringValue(row, "events", "[]"), []) || [],
    id: numberValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    last_error: stringValue(row, "last_error"),
    last_sent_at: nullableNumberValue(row, "last_sent_at"),
    last_status: stringValue(row, "last_status"),
    name: stringValue(row, "name"),
    secret: stringValue(row, "secret"),
    target: stringValue(row, "target"),
    type: stringValue(row, "type"),
    updated_at: numberValue(row, "updated_at", Date.now()),
  };
}

function mapOutboundEmail(row: DbRow): OutboundEmailRecord {
  return {
    attachment_count: numberValue(row, "attachment_count", 0),
    bcc_addresses: safeParseJson<string[]>(stringValue(row, "bcc_addresses", "[]"), []) || [],
    cc_addresses: safeParseJson<string[]>(stringValue(row, "cc_addresses", "[]"), []) || [],
    created_at: numberValue(row, "created_at", Date.now()),
    created_by: stringValue(row, "created_by"),
    error_message: stringValue(row, "error_message"),
    from_address: stringValue(row, "from_address"),
    from_name: stringValue(row, "from_name"),
    html_body: stringValue(row, "html_body"),
    id: numberValue(row, "id"),
    last_attempt_at: nullableNumberValue(row, "last_attempt_at"),
    provider: stringValue(row, "provider", "resend"),
    provider_message_id: stringValue(row, "provider_message_id"),
    reply_to: stringValue(row, "reply_to"),
    scheduled_at: nullableNumberValue(row, "scheduled_at"),
    sent_at: nullableNumberValue(row, "sent_at"),
    status: stringValue(row, "status", "sending") as OutboundEmailRecord["status"],
    subject: stringValue(row, "subject"),
    text_body: stringValue(row, "text_body"),
    to_addresses: safeParseJson<string[]>(stringValue(row, "to_addresses", "[]"), []) || [],
    updated_at: numberValue(row, "updated_at", Date.now()),
  };
}

function mapOutboundAttachment(row: DbRow): OutboundEmailAttachmentRecord {
  return {
    content_base64: stringValue(row, "content_base64") || undefined,
    content_type: stringValue(row, "content_type", "application/octet-stream"),
    filename: stringValue(row, "filename", "attachment"),
    id: numberValue(row, "id"),
    size_bytes: numberValue(row, "size_bytes", 0),
  };
}

function mapOutboundTemplate(row: DbRow): OutboundTemplateRecord {
  return {
    created_at: numberValue(row, "created_at", Date.now()),
    created_by: stringValue(row, "created_by"),
    html_template: stringValue(row, "html_template"),
    id: numberValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    name: stringValue(row, "name"),
    subject_template: stringValue(row, "subject_template"),
    text_template: stringValue(row, "text_template"),
    updated_at: numberValue(row, "updated_at", Date.now()),
    variables: safeParseJson<string[]>(stringValue(row, "variables_json", "[]"), []) || [],
  };
}

function mapOutboundContact(row: DbRow): OutboundContactRecord {
  return {
    created_at: numberValue(row, "created_at", Date.now()),
    email: stringValue(row, "email"),
    id: numberValue(row, "id"),
    is_favorite: boolValue(row, "is_favorite", false),
    name: stringValue(row, "name"),
    note: stringValue(row, "note"),
    tags: safeParseJson<string[]>(stringValue(row, "tags", "[]"), []) || [],
    updated_at: numberValue(row, "updated_at", Date.now()),
  };
}

export async function loadRules(db: D1Database, enabledOnly = true): Promise<RuleRecord[]> {
  const query = enabledOnly
    ? "SELECT id, remark, sender_filter, pattern, created_at, updated_at, is_enabled FROM rules WHERE is_enabled = 1 ORDER BY created_at DESC"
    : "SELECT id, remark, sender_filter, pattern, created_at, updated_at, is_enabled FROM rules ORDER BY created_at DESC";
  const result = await db.prepare(query).all<DbRow>();
  return result.results.map(mapRule);
}

export async function loadWhitelist(db: D1Database, enabledOnly = true): Promise<WhitelistRecord[]> {
  const query = enabledOnly
    ? "SELECT id, sender_pattern, note, created_at, updated_at, is_enabled FROM whitelist WHERE is_enabled = 1 ORDER BY created_at DESC"
    : "SELECT id, sender_pattern, note, created_at, updated_at, is_enabled FROM whitelist ORDER BY created_at DESC";
  const result = await db.prepare(query).all<DbRow>();
  return result.results.map(mapWhitelist);
}

async function getAppSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM app_settings WHERE key = ? LIMIT 1").bind(key).first<DbRow>();
  return row ? stringValue(row, "value") : null;
}

async function setAppSetting(db: D1Database, key: string, value: string): Promise<void> {
  const now = Date.now();
  await db.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).bind(key, value, now).run();
}

export async function getWhitelistSettings(db: D1Database): Promise<WhitelistSettings> {
  const value = await getAppSetting(db, "whitelist_enabled");
  return { enabled: value === null ? true : value === "1" };
}

export async function updateWhitelistSettings(db: D1Database, enabled: boolean): Promise<WhitelistSettings> {
  await setAppSetting(db, "whitelist_enabled", enabled ? "1" : "0");
  return { enabled };
}

export async function getOutboundEmailSettings(
  db: D1Database,
  env: Pick<
    WorkerEnv,
    | "RESEND_API_KEY"
    | "RESEND_DEFAULT_FROM"
    | "RESEND_DEFAULT_FROM_NAME"
    | "RESEND_DEFAULT_REPLY_TO"
    | "RESEND_FROM_DOMAIN"
  >,
): Promise<OutboundEmailSettings> {
  const [
    storedFromName,
    storedFromAddress,
    storedReplyTo,
    storedExternalSetting,
  ] = await Promise.all([
    getAppSetting(db, "outbound_email_from_name"),
    getAppSetting(db, "outbound_email_from_address"),
    getAppSetting(db, "outbound_email_reply_to"),
    getAppSetting(db, "outbound_email_external_enabled"),
  ]);

  const from_domain = String(env.RESEND_FROM_DOMAIN || "").trim().toLowerCase().replace(/^@+/, "");
  const default_from_name = String(storedFromName || env.RESEND_DEFAULT_FROM_NAME || "").trim();
  const default_from_address = normalizeEmailAddress(storedFromAddress || env.RESEND_DEFAULT_FROM);
  const default_reply_to = normalizeEmailAddress(storedReplyTo || env.RESEND_DEFAULT_REPLY_TO);
  const api_key_configured = Boolean(String(env.RESEND_API_KEY || "").trim());
  const allow_external_recipients = storedExternalSetting === null ? true : storedExternalSetting === "1";

  return {
    allow_external_recipients,
    api_key_configured,
    configured: api_key_configured && Boolean(default_from_name) && Boolean(default_from_address) && Boolean(from_domain),
    default_from_address,
    default_from_name,
    default_reply_to,
    from_domain,
    provider: "resend",
  };
}

export async function updateOutboundEmailSettings(
  db: D1Database,
  input: {
    allow_external_recipients: boolean;
    default_from_address: string;
    default_from_name: string;
    default_reply_to: string;
  },
): Promise<void> {
  await Promise.all([
    setAppSetting(db, "outbound_email_from_name", input.default_from_name),
    setAppSetting(db, "outbound_email_from_address", input.default_from_address),
    setAppSetting(db, "outbound_email_reply_to", input.default_reply_to),
    setAppSetting(db, "outbound_email_external_enabled", input.allow_external_recipients ? "1" : "0"),
  ]);
}

export async function getOutboundEmailsPaged(
  db: D1Database,
  page: number,
  pageSize: number,
  filters: { keyword?: string | null; statuses?: OutboundEmailRecord["status"][] } = {},
): Promise<PaginationPayload<OutboundEmailRecord>> {
  const offset = (page - 1) * pageSize;
  const clauses: string[] = [];
  const params: unknown[] = [];
  const countParams: unknown[] = [];

  if (filters.statuses && filters.statuses.length > 0) {
    const placeholders = filters.statuses.map(() => "?").join(", ");
    clauses.push(`status IN (${placeholders})`);
    params.push(...filters.statuses);
    countParams.push(...filters.statuses);
  }

  if (filters.keyword) {
    clauses.push("(subject LIKE ? OR from_address LIKE ? OR to_addresses LIKE ?)");
    params.push(`%${filters.keyword}%`, `%${filters.keyword}%`, `%${filters.keyword}%`);
    countParams.push(`%${filters.keyword}%`, `%${filters.keyword}%`, `%${filters.keyword}%`);
  }

  let query =
    "SELECT id, provider, provider_message_id, from_name, from_address, reply_to, to_addresses, cc_addresses, bcc_addresses, subject, text_body, html_body, status, error_message, created_by, created_at, updated_at, scheduled_at, sent_at, last_attempt_at, attachment_count FROM outbound_emails";
  let countQuery = "SELECT COUNT(1) as total FROM outbound_emails";

  if (clauses.length > 0) {
    const whereClause = ` WHERE ${clauses.join(" AND ")}`;
    query += whereClause;
    countQuery += whereClause;
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(pageSize, offset);

  const [list, countRow] = await Promise.all([
    db.prepare(query).bind(...params).all<DbRow>(),
    db.prepare(countQuery).bind(...countParams).first<DbRow>(),
  ]);

  return {
    items: list.results.map(mapOutboundEmail),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getOutboundEmailById(db: D1Database, id: number): Promise<OutboundEmailRecord | null> {
  const [row, attachmentRows] = await Promise.all([
    db.prepare(
      "SELECT id, provider, provider_message_id, from_name, from_address, reply_to, to_addresses, cc_addresses, bcc_addresses, subject, text_body, html_body, status, error_message, created_by, created_at, updated_at, scheduled_at, sent_at, last_attempt_at, attachment_count FROM outbound_emails WHERE id = ? LIMIT 1",
    ).bind(id).first<DbRow>(),
    db.prepare(
      "SELECT id, filename, content_type, content_base64, size_bytes FROM outbound_email_attachments WHERE outbound_email_id = ? ORDER BY id ASC",
    ).bind(id).all<DbRow>(),
  ]);

  if (!row) return null;
  return {
    ...mapOutboundEmail(row),
    attachments: attachmentRows.results.map(mapOutboundAttachment),
  };
}

export async function createOutboundEmailRecord(
  db: D1Database,
  input: {
    attachment_count: number;
    attachments: Array<{ content_base64: string; content_type: string; filename: string; size_bytes: number }>;
    bcc_addresses: string[];
    cc_addresses: string[];
    created_by: string;
    from_address: string;
    from_name: string;
    html_body: string;
    last_attempt_at?: number | null;
    provider: string;
    reply_to: string;
    scheduled_at?: number | null;
    sent_at?: number | null;
    status: OutboundEmailRecord["status"];
    subject: string;
    text_body: string;
    to_addresses: string[];
  },
): Promise<number> {
  const now = Date.now();
  const result = await db.prepare(
    "INSERT INTO outbound_emails (provider, provider_message_id, from_name, from_address, reply_to, to_addresses, cc_addresses, bcc_addresses, subject, text_body, html_body, status, error_message, created_by, created_at, updated_at, scheduled_at, sent_at, last_attempt_at, attachment_count) VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    input.provider,
    input.from_name,
    input.from_address,
    input.reply_to || null,
    jsonStringify(input.to_addresses, "[]"),
    jsonStringify(input.cc_addresses, "[]"),
    jsonStringify(input.bcc_addresses, "[]"),
    input.subject,
    input.text_body,
    input.html_body,
    input.status,
    input.created_by,
    now,
    now,
    input.scheduled_at || null,
    input.sent_at || null,
    input.last_attempt_at || null,
    input.attachment_count,
  ).run() as { meta?: { last_row_id?: number } };

  const insertedId = Number(result?.meta?.last_row_id || 0);
  const fallbackRow = insertedId > 0
    ? null
    : await db.prepare(
        "SELECT id FROM outbound_emails WHERE created_by = ? AND subject = ? AND created_at = ? ORDER BY id DESC LIMIT 1",
      ).bind(input.created_by, input.subject, now).first<DbRow>();
  const finalId = insertedId > 0 ? insertedId : numberValue(fallbackRow || {}, "id", 0);

  if (finalId > 0 && input.attachments.length > 0) {
    await replaceOutboundEmailAttachments(db, finalId, input.attachments);
  }

  return finalId;
}

export async function updateOutboundEmailRecord(
  db: D1Database,
  id: number,
  input: {
    attachment_count: number;
    attachments: Array<{ content_base64: string; content_type: string; filename: string; size_bytes: number }>;
    bcc_addresses: string[];
    cc_addresses: string[];
    from_address: string;
    from_name: string;
    html_body: string;
    provider: string;
    reply_to: string;
    scheduled_at?: number | null;
    status: OutboundEmailRecord["status"];
    subject: string;
    text_body: string;
    to_addresses: string[];
  },
): Promise<void> {
  await db.prepare(
    "UPDATE outbound_emails SET provider = ?, from_name = ?, from_address = ?, reply_to = ?, to_addresses = ?, cc_addresses = ?, bcc_addresses = ?, subject = ?, text_body = ?, html_body = ?, status = ?, scheduled_at = ?, attachment_count = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.provider,
    input.from_name,
    input.from_address,
    input.reply_to || null,
    jsonStringify(input.to_addresses, "[]"),
    jsonStringify(input.cc_addresses, "[]"),
    jsonStringify(input.bcc_addresses, "[]"),
    input.subject,
    input.text_body,
    input.html_body,
    input.status,
    input.scheduled_at || null,
    input.attachment_count,
    Date.now(),
    id,
  ).run();

  await replaceOutboundEmailAttachments(db, id, input.attachments);
}

export async function deleteOutboundEmailRecord(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM outbound_email_attachments WHERE outbound_email_id = ?").bind(id).run();
  await db.prepare("DELETE FROM outbound_emails WHERE id = ?").bind(id).run();
}

export async function updateOutboundEmailDelivery(
  db: D1Database,
  id: number,
  input: {
    error_message: string;
    last_attempt_at?: number | null;
    provider_message_id?: string;
    sent_at?: number | null;
    status: OutboundEmailRecord["status"];
  },
): Promise<void> {
  await db.prepare(
    "UPDATE outbound_emails SET provider_message_id = ?, status = ?, error_message = ?, last_attempt_at = ?, sent_at = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.provider_message_id ?? "",
    input.status,
    input.error_message || "",
    input.last_attempt_at ?? null,
    input.sent_at ?? null,
    Date.now(),
    id,
  ).run();
}

export async function getDueScheduledOutboundEmails(
  db: D1Database,
  limit = 10,
): Promise<OutboundEmailRecord[]> {
  const rows = await db.prepare(
    "SELECT id, provider, provider_message_id, from_name, from_address, reply_to, to_addresses, cc_addresses, bcc_addresses, subject, text_body, html_body, status, error_message, created_by, created_at, updated_at, scheduled_at, sent_at, last_attempt_at, attachment_count FROM outbound_emails WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT ?",
  ).bind(Date.now(), limit).all<DbRow>();

  return Promise.all(rows.results.map(row => getOutboundEmailById(db, numberValue(row, "id"))))
    .then(items => items.filter((item): item is OutboundEmailRecord => Boolean(item)));
}

export async function getOutboundTemplates(db: D1Database): Promise<OutboundTemplateRecord[]> {
  const result = await db.prepare(
    "SELECT id, name, subject_template, text_template, html_template, variables_json, is_enabled, created_by, created_at, updated_at FROM outbound_templates ORDER BY updated_at DESC",
  ).all<DbRow>();
  return result.results.map(mapOutboundTemplate);
}

export async function createOutboundTemplate(
  db: D1Database,
  input: {
    created_by: string;
    html_template: string;
    is_enabled: boolean;
    name: string;
    subject_template: string;
    text_template: string;
    variables: string[];
  },
): Promise<void> {
  const now = Date.now();
  await db.prepare(
    "INSERT INTO outbound_templates (name, subject_template, text_template, html_template, variables_json, is_enabled, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    input.name,
    input.subject_template,
    input.text_template,
    input.html_template,
    jsonStringify(input.variables, "[]"),
    input.is_enabled ? 1 : 0,
    input.created_by,
    now,
    now,
  ).run();
}

export async function updateOutboundTemplate(
  db: D1Database,
  id: number,
  input: {
    html_template: string;
    is_enabled: boolean;
    name: string;
    subject_template: string;
    text_template: string;
    variables: string[];
  },
): Promise<void> {
  await db.prepare(
    "UPDATE outbound_templates SET name = ?, subject_template = ?, text_template = ?, html_template = ?, variables_json = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.name,
    input.subject_template,
    input.text_template,
    input.html_template,
    jsonStringify(input.variables, "[]"),
    input.is_enabled ? 1 : 0,
    Date.now(),
    id,
  ).run();
}

export async function deleteOutboundTemplate(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM outbound_templates WHERE id = ?").bind(id).run();
}

export async function getOutboundContacts(db: D1Database): Promise<OutboundContactRecord[]> {
  const result = await db.prepare(
    "SELECT id, name, email, note, tags, is_favorite, created_at, updated_at FROM outbound_contacts ORDER BY is_favorite DESC, updated_at DESC",
  ).all<DbRow>();
  return result.results.map(mapOutboundContact);
}

export async function createOutboundContact(
  db: D1Database,
  input: {
    email: string;
    is_favorite: boolean;
    name: string;
    note: string;
    tags: string[];
  },
): Promise<void> {
  const now = Date.now();
  await db.prepare(
    "INSERT INTO outbound_contacts (name, email, note, tags, is_favorite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    input.name,
    normalizeEmailAddress(input.email),
    input.note,
    jsonStringify(input.tags, "[]"),
    input.is_favorite ? 1 : 0,
    now,
    now,
  ).run();
}

export async function updateOutboundContact(
  db: D1Database,
  id: number,
  input: {
    email: string;
    is_favorite: boolean;
    name: string;
    note: string;
    tags: string[];
  },
): Promise<void> {
  await db.prepare(
    "UPDATE outbound_contacts SET name = ?, email = ?, note = ?, tags = ?, is_favorite = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.name,
    normalizeEmailAddress(input.email),
    input.note,
    jsonStringify(input.tags, "[]"),
    input.is_favorite ? 1 : 0,
    Date.now(),
    id,
  ).run();
}

export async function deleteOutboundContact(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM outbound_contacts WHERE id = ?").bind(id).run();
}

export async function getOutboundStats(db: D1Database): Promise<OutboundStats> {
  const [statusRows, dailyRows, topDomainRows] = await Promise.all([
    db.prepare(
      "SELECT status, COUNT(1) as total FROM outbound_emails GROUP BY status",
    ).all<DbRow>(),
    db.prepare(
      "SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') as day, SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed, SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled FROM outbound_emails WHERE created_at >= ? GROUP BY day ORDER BY day ASC",
    ).bind(Date.now() - 7 * 24 * 60 * 60 * 1000).all<DbRow>(),
    db.prepare(
      "SELECT substr(value, instr(value, '@') + 1) as label, COUNT(1) as total FROM outbound_emails, json_each(outbound_emails.to_addresses) WHERE status IN ('sent', 'scheduled', 'failed', 'sending') AND instr(value, '@') > 0 GROUP BY label ORDER BY total DESC LIMIT 5",
    ).all<DbRow>(),
  ]);

  const totals = new Map(statusRows.results.map(row => [stringValue(row, "status"), numberValue(row, "total", 0)]));

  return {
    recent_daily: dailyRows.results.map(row => ({
      day: stringValue(row, "day"),
      failed: numberValue(row, "failed", 0),
      scheduled: numberValue(row, "scheduled", 0),
      sent: numberValue(row, "sent", 0),
    })),
    top_recipient_domains: topDomainRows.results.map(row => ({
      label: stringValue(row, "label"),
      value: numberValue(row, "total", 0),
    })),
    total_drafts: totals.get("draft") || 0,
    total_failed: totals.get("failed") || 0,
    total_scheduled: totals.get("scheduled") || 0,
    total_sent: totals.get("sent") || 0,
  };
}

async function replaceOutboundEmailAttachments(
  db: D1Database,
  outboundEmailId: number,
  attachments: Array<{ content_base64: string; content_type: string; filename: string; size_bytes: number }>,
): Promise<void> {
  await db.prepare("DELETE FROM outbound_email_attachments WHERE outbound_email_id = ?").bind(outboundEmailId).run();

  if (attachments.length === 0) return;

  const now = Date.now();
  for (const attachment of attachments) {
    await db.prepare(
      "INSERT INTO outbound_email_attachments (outbound_email_id, filename, content_type, content_base64, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      outboundEmailId,
      attachment.filename,
      attachment.content_type,
      attachment.content_base64,
      attachment.size_bytes,
      now,
    ).run();
  }
}

export async function getLatestEmail(db: D1Database, address: string): Promise<DbRow | null> {
  const addr = normalizeEmailAddress(address);
  return db.prepare(
    "SELECT message_id, from_address, to_address, subject, extracted_json, received_at, text_body, html_body FROM emails WHERE deleted_at IS NULL AND instr(',' || to_address || ',', ',' || ? || ',') > 0 ORDER BY received_at DESC LIMIT 1",
  ).bind(addr).first<DbRow>();
}

export async function getEmails(
  db: D1Database,
  page: number,
  pageSize: number,
  filters: EmailSearchFilters = {},
): Promise<PaginationPayload<EmailSummary>> {
  const offset = (page - 1) * pageSize;
  const clauses: string[] = [];
  const params: unknown[] = [];
  const countParams: unknown[] = [];

  if (filters.deleted === "only") {
    clauses.push("deleted_at IS NOT NULL");
  } else if (filters.deleted !== "include") {
    clauses.push("deleted_at IS NULL");
  }

  if (filters.domain) {
    clauses.push("to_address LIKE ?");
    params.push(`%@${filters.domain}%`);
    countParams.push(`%@${filters.domain}%`);
  }

  if (filters.address) {
    const normalized = normalizeEmailAddress(filters.address);
    clauses.push("instr(',' || to_address || ',', ',' || ? || ',') > 0");
    params.push(normalized);
    countParams.push(normalized);
  }

  if (filters.sender) {
    clauses.push("from_address LIKE ?");
    params.push(`%${normalizeEmailAddress(filters.sender)}%`);
    countParams.push(`%${normalizeEmailAddress(filters.sender)}%`);
  }

  if (filters.subject) {
    clauses.push("subject LIKE ?");
    params.push(`%${filters.subject.trim()}%`);
    countParams.push(`%${filters.subject.trim()}%`);
  }

  if (filters.has_matches !== null && filters.has_matches !== undefined) {
    clauses.push(filters.has_matches ? "extracted_json <> '[]'" : "extracted_json = '[]'");
  }

  if (filters.has_attachments !== null && filters.has_attachments !== undefined) {
    clauses.push(filters.has_attachments ? "has_attachments = 1" : "has_attachments = 0");
  }

  if (filters.date_from) {
    clauses.push("received_at >= ?");
    params.push(filters.date_from);
    countParams.push(filters.date_from);
  }

  if (filters.date_to) {
    clauses.push("received_at <= ?");
    params.push(filters.date_to);
    countParams.push(filters.date_to);
  }

  let query = "SELECT message_id, from_address, to_address, subject, extracted_json, received_at, text_body, html_body, has_attachments, deleted_at, note, tags FROM emails";
  let countQuery = "SELECT COUNT(1) as total FROM emails";

  if (clauses.length > 0) {
    const whereClause = ` WHERE ${clauses.join(" AND ")}`;
    query += whereClause;
    countQuery += whereClause;
  }

  query += " ORDER BY received_at DESC LIMIT ? OFFSET ?";
  params.push(pageSize, offset);

  const [list, countRow] = await Promise.all([
    db.prepare(query).bind(...params).all<DbRow>(),
    db.prepare(countQuery).bind(...countParams).first<DbRow>(),
  ]);

  return {
    items: list.results.map(mapEmailSummary),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getEmailByMessageId(db: D1Database, messageId: string): Promise<EmailDetail | null> {
  const [row, attachmentRows] = await Promise.all([
    db.prepare(
      "SELECT message_id, from_address, to_address, subject, extracted_json, received_at, text_body, html_body, raw_headers, has_attachments, deleted_at, note, tags FROM emails WHERE message_id = ? LIMIT 1",
    ).bind(String(messageId || "")).first<DbRow>(),
    db.prepare(
      "SELECT id, filename, mime_type, disposition, content_id, size_bytes, is_stored FROM email_attachments WHERE email_message_id = ? ORDER BY id ASC",
    ).bind(String(messageId || "")).all<DbRow>(),
  ]);

  return row ? mapEmailDetail(row, attachmentRows.results.map(mapAttachment)) : null;
}

export async function updateEmailMetadata(
  db: D1Database,
  messageId: string,
  input: { note: string; tags: string[] },
): Promise<EmailDetail | null> {
  await db.prepare(
    "UPDATE emails SET note = ?, tags = ? WHERE message_id = ?",
  ).bind(input.note || null, jsonStringify(input.tags, "[]"), messageId).run();

  return getEmailByMessageId(db, messageId);
}

export async function getAttachmentContent(
  db: D1Database,
  messageId: string,
  attachmentId: number,
): Promise<(EmailAttachmentRecord & { content_base64: string }) | null> {
  const row = await db.prepare(
    "SELECT id, filename, mime_type, disposition, content_id, size_bytes, is_stored, content_base64 FROM email_attachments WHERE email_message_id = ? AND id = ? LIMIT 1",
  ).bind(messageId, attachmentId).first<DbRow>();

  if (!row) return null;
  return { ...mapAttachment(row), content_base64: stringValue(row, "content_base64") };
}

export async function softDeleteEmail(db: D1Database, messageId: string, deletedBy: string): Promise<void> {
  await db.prepare(
    "UPDATE emails SET deleted_at = ?, deleted_by = ? WHERE message_id = ? AND deleted_at IS NULL",
  ).bind(Date.now(), deletedBy, messageId).run();
}

export async function restoreEmail(db: D1Database, messageId: string): Promise<void> {
  await db.prepare(
    "UPDATE emails SET deleted_at = NULL, deleted_by = NULL WHERE message_id = ?",
  ).bind(messageId).run();
}

export async function purgeEmail(db: D1Database, messageId: string): Promise<void> {
  await db.prepare("DELETE FROM email_attachments WHERE email_message_id = ?").bind(messageId).run();
  await db.prepare("DELETE FROM emails WHERE message_id = ?").bind(messageId).run();
}

export async function getAvailableDomains(db: D1Database): Promise<string[]> {
  const [emailResult, mailboxResult] = await Promise.all([
    db.prepare("SELECT to_address FROM emails WHERE deleted_at IS NULL").all<DbRow>(),
    db.prepare("SELECT address FROM mailboxes WHERE deleted_at IS NULL").all<DbRow>(),
  ]);

  const domains = new Set<string>();
  for (const row of emailResult.results) {
    for (const addr of stringValue(row, "to_address").split(",")) {
      const parts = normalizeEmailAddress(addr).split("@");
      if (parts.length === 2 && parts[1]) domains.add(parts[1]);
    }
  }

  for (const row of mailboxResult.results) {
    const parts = normalizeEmailAddress(row.address).split("@");
    if (parts.length === 2 && parts[1]) domains.add(parts[1]);
  }

  return Array.from(domains).sort();
}

export async function getRulesPaged(
  db: D1Database,
  page: number,
  pageSize: number,
): Promise<PaginationPayload<RuleRecord>> {
  const offset = (page - 1) * pageSize;
  const [list, countRow] = await Promise.all([
    db.prepare(
      "SELECT id, remark, sender_filter, pattern, created_at, updated_at, is_enabled FROM rules ORDER BY created_at DESC LIMIT ? OFFSET ?",
    ).bind(pageSize, offset).all<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM rules").first<DbRow>(),
  ]);

  return {
    items: list.results.map(mapRule),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllRules(db: D1Database): Promise<RuleRecord[]> {
  const result = await db.prepare(
    "SELECT id, remark, sender_filter, pattern, created_at, updated_at, is_enabled FROM rules ORDER BY created_at DESC",
  ).all<DbRow>();
  return result.results.map(mapRule);
}

export async function createRule(
  db: D1Database,
  input: Pick<RuleRecord, "remark" | "sender_filter" | "pattern" | "is_enabled">,
): Promise<void> {
  const now = Date.now();
  await db.prepare(
    "INSERT INTO rules (remark, sender_filter, pattern, created_at, updated_at, is_enabled) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(
    input.remark || null,
    input.sender_filter || null,
    input.pattern,
    now,
    now,
    input.is_enabled ? 1 : 0,
  ).run();
}

export async function updateRule(
  db: D1Database,
  id: number,
  input: Pick<RuleRecord, "remark" | "sender_filter" | "pattern" | "is_enabled">,
): Promise<void> {
  await db.prepare(
    "UPDATE rules SET remark = ?, sender_filter = ?, pattern = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.remark || null,
    input.sender_filter || null,
    input.pattern,
    input.is_enabled ? 1 : 0,
    Date.now(),
    id,
  ).run();
}

export async function deleteRule(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM rules WHERE id = ?").bind(id).run();
}

export async function getWhitelistPaged(
  db: D1Database,
  page: number,
  pageSize: number,
): Promise<PaginationPayload<WhitelistRecord>> {
  const offset = (page - 1) * pageSize;
  const [list, countRow] = await Promise.all([
    db.prepare(
      "SELECT id, sender_pattern, note, created_at, updated_at, is_enabled FROM whitelist ORDER BY created_at DESC LIMIT ? OFFSET ?",
    ).bind(pageSize, offset).all<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM whitelist").first<DbRow>(),
  ]);

  return {
    items: list.results.map(mapWhitelist),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllWhitelist(db: D1Database): Promise<WhitelistRecord[]> {
  const result = await db.prepare(
    "SELECT id, sender_pattern, note, created_at, updated_at, is_enabled FROM whitelist ORDER BY created_at DESC",
  ).all<DbRow>();
  return result.results.map(mapWhitelist);
}

export async function createWhitelistEntry(
  db: D1Database,
  input: Pick<WhitelistRecord, "sender_pattern" | "note" | "is_enabled">,
): Promise<void> {
  const now = Date.now();
  await db.prepare(
    "INSERT INTO whitelist (sender_pattern, note, created_at, updated_at, is_enabled) VALUES (?, ?, ?, ?, ?)",
  ).bind(
    input.sender_pattern,
    input.note || null,
    now,
    now,
    input.is_enabled ? 1 : 0,
  ).run();
}

export async function updateWhitelistEntry(
  db: D1Database,
  id: number,
  input: Pick<WhitelistRecord, "sender_pattern" | "note" | "is_enabled">,
): Promise<void> {
  await db.prepare(
    "UPDATE whitelist SET sender_pattern = ?, note = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
  ).bind(input.sender_pattern, input.note || null, input.is_enabled ? 1 : 0, Date.now(), id).run();
}

export async function deleteWhitelistEntry(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM whitelist WHERE id = ?").bind(id).run();
}

export async function getMailboxesPaged(
  db: D1Database,
  page: number,
  pageSize: number,
  includeDeleted = false,
): Promise<PaginationPayload<MailboxRecord>> {
  const offset = (page - 1) * pageSize;
  const whereClause = includeDeleted ? "" : " WHERE deleted_at IS NULL";
  const [list, countRow] = await Promise.all([
    db.prepare(
      `SELECT id, address, note, is_enabled, created_at, updated_at, last_received_at, tags, expires_at, deleted_at, receive_count, created_by FROM mailboxes${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).bind(pageSize, offset).all<DbRow>(),
    db.prepare(`SELECT COUNT(1) as total FROM mailboxes${whereClause}`).first<DbRow>(),
  ]);

  return {
    items: list.results.map(mapMailbox),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllMailboxes(db: D1Database, includeDeleted = false): Promise<MailboxRecord[]> {
  const whereClause = includeDeleted ? "" : " WHERE deleted_at IS NULL";
  const result = await db.prepare(
    `SELECT id, address, note, is_enabled, created_at, updated_at, last_received_at, tags, expires_at, deleted_at, receive_count, created_by FROM mailboxes${whereClause} ORDER BY created_at DESC`,
  ).all<DbRow>();
  return result.results.map(mapMailbox);
}

export async function getMailboxById(db: D1Database, id: number): Promise<MailboxRecord | null> {
  const row = await db.prepare(
    "SELECT id, address, note, is_enabled, created_at, updated_at, last_received_at, tags, expires_at, deleted_at, receive_count, created_by FROM mailboxes WHERE id = ? LIMIT 1",
  ).bind(id).first<DbRow>();
  if (!row) return null;
  return mapMailbox(row);
}

export async function createMailbox(
  db: D1Database,
  input: {
    address: string;
    created_by: string;
    expires_at: number | null;
    is_enabled: boolean;
    note: string;
    tags: string[];
  },
): Promise<void> {
  const now = Date.now();
  await db.prepare(
    "INSERT INTO mailboxes (address, note, is_enabled, created_at, updated_at, last_received_at, tags, expires_at, deleted_at, receive_count, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)",
  ).bind(
    normalizeEmailAddress(input.address),
    input.note || null,
    input.is_enabled ? 1 : 0,
    now,
    now,
    null,
    jsonStringify(input.tags, "[]"),
    input.expires_at,
    input.created_by,
  ).run();
}

export async function updateMailbox(
  db: D1Database,
  id: number,
  input: {
    address: string;
    expires_at: number | null;
    is_enabled: boolean;
    note: string;
    tags: string[];
  },
): Promise<void> {
  await db.prepare(
    "UPDATE mailboxes SET address = ?, note = ?, is_enabled = ?, tags = ?, expires_at = ?, updated_at = ? WHERE id = ?",
  ).bind(
    normalizeEmailAddress(input.address),
    input.note || null,
    input.is_enabled ? 1 : 0,
    jsonStringify(input.tags, "[]"),
    input.expires_at,
    Date.now(),
    id,
  ).run();
}

export async function deleteMailbox(db: D1Database, id: number): Promise<void> {
  await db.prepare("UPDATE mailboxes SET deleted_at = ?, is_enabled = 0, updated_at = ? WHERE id = ?")
    .bind(Date.now(), Date.now(), id).run();
}

export async function getObservedMailboxStats(
  db: D1Database,
  mailboxDomain = "",
): Promise<Array<{ address: string; last_received_at: number | null; receive_count: number }>> {
  const result = await db.prepare(
    "SELECT to_address, received_at FROM emails WHERE deleted_at IS NULL ORDER BY received_at DESC",
  ).all<DbRow>();

  const normalizedDomain = String(mailboxDomain || "").trim().toLowerCase();
  const addresses = new Map<string, { address: string; last_received_at: number | null; receive_count: number }>();

  for (const row of result.results) {
    const receivedAt = numberValue(row, "received_at", 0);
    const rawAddresses = stringValue(row, "to_address")
      .split(",")
      .map(item => normalizeEmailAddress(item))
      .filter(isValidEmailAddress);

    for (const address of rawAddresses) {
      if (normalizedDomain && !address.endsWith(`@${normalizedDomain}`)) continue;

      const current = addresses.get(address) || {
        address,
        last_received_at: null,
        receive_count: 0,
      };
      current.receive_count += 1;
      current.last_received_at = Math.max(current.last_received_at || 0, receivedAt) || null;
      addresses.set(address, current);
    }
  }

  return Array.from(addresses.values()).sort((left, right) => left.address.localeCompare(right.address));
}

export async function applyMailboxSyncCandidate(
  db: D1Database,
  input: {
    address: string;
    created_by: string;
    is_enabled: boolean;
    last_received_at: number | null;
    receive_count: number;
  },
): Promise<"created" | "skipped" | "updated"> {
  const address = normalizeEmailAddress(input.address);
  const existing = await db.prepare(
    "SELECT id, deleted_at, last_received_at, receive_count, is_enabled FROM mailboxes WHERE address = ? LIMIT 1",
  ).bind(address).first<DbRow>();

  if (!existing) {
    const now = Date.now();
    await db.prepare(
      "INSERT INTO mailboxes (address, note, is_enabled, created_at, updated_at, last_received_at, tags, expires_at, deleted_at, receive_count, created_by) VALUES (?, NULL, ?, ?, ?, ?, '[]', NULL, NULL, ?, ?)",
    ).bind(
      address,
      input.is_enabled ? 1 : 0,
      now,
      now,
      input.last_received_at,
      Math.max(0, Math.floor(input.receive_count || 0)),
      input.created_by,
    ).run();
    return "created";
  }

  if (nullableNumberValue(existing, "deleted_at") !== null) {
    return "skipped";
  }

  const nextLastReceivedAt = Math.max(
    nullableNumberValue(existing, "last_received_at") || 0,
    input.last_received_at || 0,
  ) || null;
  const nextReceiveCount = Math.max(numberValue(existing, "receive_count", 0), Math.floor(input.receive_count || 0));
  const nextEnabled = input.is_enabled;
  const currentEnabled = boolValue(existing, "is_enabled", true);

  if (
    nextLastReceivedAt === (nullableNumberValue(existing, "last_received_at") || null) &&
    nextReceiveCount === numberValue(existing, "receive_count", 0) &&
    nextEnabled === currentEnabled
  ) {
    return "skipped";
  }

  await db.prepare(
    "UPDATE mailboxes SET is_enabled = ?, last_received_at = ?, receive_count = ?, updated_at = ? WHERE id = ?",
  ).bind(
    nextEnabled ? 1 : 0,
    nextLastReceivedAt,
    nextReceiveCount,
    Date.now(),
    numberValue(existing, "id"),
  ).run();

  return "updated";
}

export async function disableExpiredMailboxes(db: D1Database): Promise<MailboxRecord[]> {
  const now = Date.now();
  const expired = await db.prepare(
    "SELECT id, address, note, is_enabled, created_at, updated_at, last_received_at, tags, expires_at, deleted_at, receive_count, created_by FROM mailboxes WHERE deleted_at IS NULL AND is_enabled = 1 AND expires_at IS NOT NULL AND expires_at <= ?",
  ).bind(now).all<DbRow>();

  if (expired.results.length === 0) return [];

  await db.prepare(
    "UPDATE mailboxes SET is_enabled = 0, updated_at = ? WHERE deleted_at IS NULL AND is_enabled = 1 AND expires_at IS NOT NULL AND expires_at <= ?",
  ).bind(now, now).run();

  return expired.results.map(mapMailbox);
}

export async function findAdminUserByUsername(
  db: D1Database,
  username: string,
): Promise<(AdminUserRecord & { password_hash: string; password_salt: string }) | null> {
  const row = await db.prepare(
    "SELECT id, username, display_name, role, password_hash, password_salt, is_enabled, created_at, updated_at, last_login_at FROM admin_users WHERE username = ? LIMIT 1",
  ).bind(username).first<DbRow>();

  if (!row) return null;
  return {
    ...mapAdminUser(row),
    password_hash: stringValue(row, "password_hash"),
    password_salt: stringValue(row, "password_salt"),
  };
}

export async function getAdminUsersPaged(
  db: D1Database,
  page: number,
  pageSize: number,
): Promise<PaginationPayload<AdminUserRecord>> {
  const offset = (page - 1) * pageSize;
  const [list, countRow] = await Promise.all([
    db.prepare(
      "SELECT id, username, display_name, role, is_enabled, created_at, updated_at, last_login_at FROM admin_users ORDER BY created_at DESC LIMIT ? OFFSET ?",
    ).bind(pageSize, offset).all<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM admin_users").first<DbRow>(),
  ]);

  return {
    items: list.results.map(mapAdminUser),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllAdminUsers(db: D1Database): Promise<AdminUserRecord[]> {
  const result = await db.prepare(
    "SELECT id, username, display_name, role, is_enabled, created_at, updated_at, last_login_at FROM admin_users ORDER BY created_at DESC",
  ).all<DbRow>();
  return result.results.map(mapAdminUser);
}

export async function createAdminUser(
  db: D1Database,
  input: {
    display_name: string;
    is_enabled: boolean;
    password_hash: string;
    password_salt: string;
    role: AdminRole;
    username: string;
  },
): Promise<AdminUserRecord> {
  const now = Date.now();
  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO admin_users (id, username, display_name, role, password_hash, password_salt, is_enabled, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)",
  ).bind(
    id,
    input.username,
    input.display_name,
    input.role,
    input.password_hash,
    input.password_salt,
    input.is_enabled ? 1 : 0,
    now,
    now,
  ).run();

  return {
    created_at: now,
    display_name: input.display_name,
    id,
    is_enabled: input.is_enabled,
    last_login_at: null,
    role: input.role,
    updated_at: now,
    username: input.username,
  };
}

export async function updateAdminUser(
  db: D1Database,
  id: string,
  input: {
    display_name: string;
    is_enabled: boolean;
    password_hash?: string;
    password_salt?: string;
    role: AdminRole;
  },
): Promise<void> {
  if (input.password_hash && input.password_salt) {
    await db.prepare(
      "UPDATE admin_users SET display_name = ?, role = ?, is_enabled = ?, password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?",
    ).bind(
      input.display_name,
      input.role,
      input.is_enabled ? 1 : 0,
      input.password_hash,
      input.password_salt,
      Date.now(),
      id,
    ).run();
    return;
  }

  await db.prepare(
    "UPDATE admin_users SET display_name = ?, role = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
  ).bind(input.display_name, input.role, input.is_enabled ? 1 : 0, Date.now(), id).run();
}

export async function touchAdminUserLogin(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE admin_users SET last_login_at = ?, updated_at = ? WHERE id = ?")
    .bind(Date.now(), Date.now(), id).run();
}

export async function getNotificationEndpointsPaged(
  db: D1Database,
  page: number,
  pageSize: number,
): Promise<PaginationPayload<NotificationEndpointRecord>> {
  const offset = (page - 1) * pageSize;
  const [list, countRow] = await Promise.all([
    db.prepare(
      "SELECT id, name, type, target, secret, events, is_enabled, created_at, updated_at, last_status, last_error, last_sent_at FROM notification_endpoints ORDER BY created_at DESC LIMIT ? OFFSET ?",
    ).bind(pageSize, offset).all<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM notification_endpoints").first<DbRow>(),
  ]);

  return {
    items: list.results.map(mapNotification),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllNotificationEndpoints(db: D1Database): Promise<NotificationEndpointRecord[]> {
  const result = await db.prepare(
    "SELECT id, name, type, target, secret, events, is_enabled, created_at, updated_at, last_status, last_error, last_sent_at FROM notification_endpoints ORDER BY created_at DESC",
  ).all<DbRow>();
  return result.results.map(mapNotification);
}

export async function createNotificationEndpoint(
  db: D1Database,
  input: {
    events: string[];
    is_enabled: boolean;
    name: string;
    secret: string;
    target: string;
    type: string;
  },
): Promise<void> {
  const now = Date.now();
  await db.prepare(
    "INSERT INTO notification_endpoints (name, type, target, secret, events, is_enabled, created_at, updated_at, last_status, last_error, last_sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', NULL)",
  ).bind(
    input.name,
    input.type,
    input.target,
    input.secret || null,
    jsonStringify(input.events, "[]"),
    input.is_enabled ? 1 : 0,
    now,
    now,
  ).run();
}

export async function updateNotificationEndpoint(
  db: D1Database,
  id: number,
  input: {
    events: string[];
    is_enabled: boolean;
    name: string;
    secret: string;
    target: string;
    type: string;
  },
): Promise<void> {
  await db.prepare(
    "UPDATE notification_endpoints SET name = ?, type = ?, target = ?, secret = ?, events = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.name,
    input.type,
    input.target,
    input.secret || null,
    jsonStringify(input.events, "[]"),
    input.is_enabled ? 1 : 0,
    Date.now(),
    id,
  ).run();
}

export async function deleteNotificationEndpoint(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM notification_endpoints WHERE id = ?").bind(id).run();
}

export async function updateNotificationDelivery(
  db: D1Database,
  id: number,
  status: string,
  error = "",
): Promise<void> {
  await db.prepare(
    "UPDATE notification_endpoints SET last_status = ?, last_error = ?, last_sent_at = ?, updated_at = ? WHERE id = ?",
  ).bind(status, error, Date.now(), Date.now(), id).run();
}

function mapAuditLog(row: DbRow): AuditLogRecord {
  return {
    action: stringValue(row, "action"),
    actor_id: stringValue(row, "actor_id"),
    actor_name: stringValue(row, "actor_name"),
    actor_role: stringValue(row, "actor_role"),
    created_at: numberValue(row, "created_at", Date.now()),
    detail_json: safeParseJson<JsonValue>(stringValue(row, "detail_json", "{}"), {}) || {},
    entity_id: stringValue(row, "entity_id"),
    entity_type: stringValue(row, "entity_type"),
    id: numberValue(row, "id"),
  };
}

function mapErrorEvent(row: DbRow): ErrorEventRecord {
  return {
    context_json: safeParseJson<JsonValue>(stringValue(row, "context_json", "{}"), {}) || {},
    created_at: numberValue(row, "created_at", Date.now()),
    id: numberValue(row, "id"),
    message: stringValue(row, "message"),
    source: stringValue(row, "source"),
    stack: stringValue(row, "stack"),
  };
}

function mapErrorEventSummary(row: DbRow): ErrorEventSummary {
  return {
    admin_total: numberValue(row, "admin_total", 0),
    auth_total: numberValue(row, "auth_total", 0),
    latest_created_at: nullableNumberValue(row, "latest_created_at"),
    outbound_total: numberValue(row, "outbound_total", 0),
    recent_24h_total: numberValue(row, "recent_24h_total", 0),
    sync_total: numberValue(row, "sync_total", 0),
    total: numberValue(row, "total", 0),
    unique_sources: numberValue(row, "unique_sources", 0),
  };
}

function buildErrorEventFilters(filters: { keyword?: string | null; source?: string | null } = {}) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.source) {
    clauses.push("source = ?");
    params.push(filters.source);
  }

  if (filters.keyword) {
    const pattern = `%${filters.keyword}%`;
    clauses.push("(source LIKE ? OR message LIKE ? OR context_json LIKE ? OR stack LIKE ?)");
    params.push(pattern, pattern, pattern, pattern);
  }

  return {
    params,
    whereClause: clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "",
  };
}

export async function addAuditLog(
  db: D1Database,
  input: {
    action: string;
    actor: Pick<AuthSession, "display_name" | "role" | "user_id">;
    detail: JsonValue;
    entity_id?: string;
    entity_type: string;
  },
): Promise<void> {
  try {
    await db.prepare(
      "INSERT INTO audit_logs (actor_id, actor_name, actor_role, action, entity_type, entity_id, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      input.actor.user_id,
      input.actor.display_name,
      input.actor.role,
      input.action,
      input.entity_type,
      input.entity_id || null,
      jsonStringify(input.detail, "{}"),
      Date.now(),
    ).run();
  } catch (error) {
    if (isSqliteSchemaError(error)) {
      console.warn("[audit-log] skipped because schema is outdated:", error);
      return;
    }
    throw error;
  }
}

export async function getAuditLogsPaged(
  db: D1Database,
  page: number,
  pageSize: number,
): Promise<PaginationPayload<AuditLogRecord>> {
  const offset = (page - 1) * pageSize;
  const [list, countRow] = await Promise.all([
    db.prepare(
      "SELECT id, actor_id, actor_name, actor_role, action, entity_type, entity_id, detail_json, created_at FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?",
    ).bind(pageSize, offset).all<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM audit_logs").first<DbRow>(),
  ]);

  return {
    items: list.results.map(mapAuditLog),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllAuditLogs(db: D1Database): Promise<AuditLogRecord[]> {
  const result = await db.prepare(
    "SELECT id, actor_id, actor_name, actor_role, action, entity_type, entity_id, detail_json, created_at FROM audit_logs ORDER BY created_at DESC",
  ).all<DbRow>();
  return result.results.map(mapAuditLog);
}

export async function addErrorEvent(
  db: D1Database,
  input: { context: JsonValue; message: string; source: string; stack?: string },
): Promise<void> {
  try {
    await db.prepare(
      "INSERT INTO error_events (source, message, stack, context_json, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(
      input.source,
      input.message,
      input.stack || null,
      jsonStringify(input.context, "{}"),
      Date.now(),
    ).run();
  } catch (error) {
    if (isSqliteSchemaError(error)) {
      console.warn("[error-log] skipped because schema is outdated:", error);
      return;
    }
    throw error;
  }
}

export async function getErrorEventsPaged(
  db: D1Database,
  page: number,
  pageSize: number,
  filters: { keyword?: string | null; source?: string | null } = {},
): Promise<ErrorEventsPayload> {
  const offset = (page - 1) * pageSize;
  const { params, whereClause } = buildErrorEventFilters(filters);
  const summaryParams = [...params];
  const listParams = [...params, pageSize, offset];
  const recent24hThreshold = Date.now() - 24 * 60 * 60 * 1000;

  const [list, summaryRow, sourceRows] = await Promise.all([
    db.prepare(
      `SELECT id, source, message, stack, context_json, created_at FROM error_events${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).bind(...listParams).all<DbRow>(),
    db.prepare(
      `SELECT
        COUNT(1) as total,
        COUNT(DISTINCT source) as unique_sources,
        MAX(created_at) as latest_created_at,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as recent_24h_total,
        SUM(CASE WHEN source LIKE 'auth.%' THEN 1 ELSE 0 END) as auth_total,
        SUM(CASE WHEN source LIKE 'admin.%' THEN 1 ELSE 0 END) as admin_total,
        SUM(CASE WHEN source LIKE 'mailbox.%' OR source LIKE 'cloudflare.%' THEN 1 ELSE 0 END) as sync_total,
        SUM(CASE WHEN source LIKE 'outbound.%' THEN 1 ELSE 0 END) as outbound_total
      FROM error_events${whereClause}`,
    ).bind(recent24hThreshold, ...summaryParams).first<DbRow>(),
    db.prepare(
      "SELECT source, MAX(created_at) as latest_created_at FROM error_events GROUP BY source ORDER BY latest_created_at DESC, source ASC",
    ).all<DbRow>(),
  ]);

  return {
    items: list.results.map(mapErrorEvent),
    page,
    pageSize,
    source_options: sourceRows.results.map(row => stringValue(row, "source")).filter(Boolean),
    summary: mapErrorEventSummary(summaryRow || {}),
    total: numberValue(summaryRow || {}, "total", 0),
  };
}

export async function getOverviewStats(db: D1Database): Promise<OverviewStats> {
  const [
    emailTotalRow,
    deletedEmailTotalRow,
    matchedTotalRow,
    attachmentTotalRow,
    activeMailboxTotalRow,
    errorTotalRow,
    topSenderRows,
    topDomainRows,
    dailyRows,
  ] = await Promise.all([
    db.prepare("SELECT COUNT(1) as total FROM emails WHERE deleted_at IS NULL").first<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM emails WHERE deleted_at IS NOT NULL").first<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM emails WHERE deleted_at IS NULL AND extracted_json <> '[]'").first<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM email_attachments").first<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM mailboxes WHERE deleted_at IS NULL AND is_enabled = 1").first<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM error_events").first<DbRow>(),
    db.prepare(
      "SELECT from_address as label, COUNT(1) as total FROM emails WHERE deleted_at IS NULL GROUP BY from_address ORDER BY total DESC LIMIT 5",
    ).all<DbRow>(),
    db.prepare(
      "SELECT substr(from_address, instr(from_address, '@') + 1) as label, COUNT(1) as total FROM emails WHERE deleted_at IS NULL AND instr(from_address, '@') > 0 GROUP BY label ORDER BY total DESC LIMIT 5",
    ).all<DbRow>(),
    db.prepare(
      "SELECT strftime('%Y-%m-%d', received_at / 1000, 'unixepoch') as day, COUNT(1) as total FROM emails WHERE deleted_at IS NULL AND received_at >= ? GROUP BY day ORDER BY day ASC",
    ).bind(Date.now() - 7 * 24 * 60 * 60 * 1000).all<DbRow>(),
  ]);

  return {
    active_mailboxes: numberValue(activeMailboxTotalRow || {}, "total", 0),
    attachment_total: numberValue(attachmentTotalRow || {}, "total", 0),
    deleted_email_total: numberValue(deletedEmailTotalRow || {}, "total", 0),
    email_total: numberValue(emailTotalRow || {}, "total", 0),
    error_total: numberValue(errorTotalRow || {}, "total", 0),
    matched_email_total: numberValue(matchedTotalRow || {}, "total", 0),
    recent_daily: dailyRows.results.map(row => ({
      day: stringValue(row, "day"),
      value: numberValue(row, "total", 0),
    })),
    top_domains: topDomainRows.results.map(row => ({
      label: stringValue(row, "label"),
      value: numberValue(row, "total", 0),
    })),
    top_senders: topSenderRows.results.map(row => ({
      label: stringValue(row, "label"),
      value: numberValue(row, "total", 0),
    })),
  };
}

export async function saveEmail(db: D1Database, data: EmailSavePayload): Promise<{ messageId: string; receivedAt: number }> {
  const receivedAt = Date.now();
  const messageId = crypto.randomUUID();

  await db.prepare(
    "INSERT INTO emails (message_id, from_address, to_address, subject, extracted_json, received_at, text_body, html_body, raw_headers, has_attachments, size_bytes, deleted_at, deleted_by, matched_rule_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)",
  ).bind(
    messageId,
    normalizeEmailAddress(data.from),
    data.to.map(normalizeEmailAddress).join(","),
    data.subject,
    jsonStringify(
      data.matches.map(item => ({ remark: item.remark, rule_id: item.rule_id, value: item.value })),
      "[]",
    ),
    receivedAt,
    String(data.text || ""),
    String(data.html || ""),
    jsonStringify(data.headers, "[]"),
    data.attachments.length > 0 ? 1 : 0,
    byteLengthOfEmail(data.text, data.html),
    jsonStringify(data.matches.map(item => item.rule_id), "[]"),
  ).run();

  for (const attachment of data.attachments) {
    await db.prepare(
      "INSERT INTO email_attachments (email_message_id, filename, mime_type, disposition, content_id, size_bytes, is_stored, content_base64, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      messageId,
      attachment.filename || null,
      attachment.mime_type,
      attachment.disposition || null,
      attachment.content_id || null,
      attachment.size_bytes,
      attachment.is_stored ? 1 : 0,
      attachment.content_base64 || "",
      receivedAt,
    ).run();
  }

  await touchMailboxes(db, data.to, receivedAt);
  return { messageId, receivedAt };
}

export async function clearExpiredEmails(db: D1Database, maxHours: number): Promise<void> {
  const threshold = Date.now() - maxHours * 60 * 60 * 1000;
  const result = await db.prepare(
    "SELECT message_id FROM emails WHERE deleted_at IS NULL AND received_at < ?",
  ).bind(threshold).all<DbRow>();

  for (const row of result.results) {
    await purgeEmail(db, stringValue(row, "message_id"));
  }
}

export async function purgeDeletedEmails(db: D1Database, maxHours: number): Promise<void> {
  const threshold = Date.now() - maxHours * 60 * 60 * 1000;
  const result = await db.prepare(
    "SELECT message_id FROM emails WHERE deleted_at IS NOT NULL AND deleted_at < ?",
  ).bind(threshold).all<DbRow>();

  for (const row of result.results) {
    await purgeEmail(db, stringValue(row, "message_id"));
  }
}

export async function getExportRows(
  db: D1Database,
  resource: "admins" | "audit" | "emails" | "mailboxes" | "notifications" | "rules" | "trash" | "whitelist",
): Promise<ExportRow[]> {
  if (resource === "emails") {
    const result = await getEmails(db, 1, 10_000, { deleted: "exclude" });
    return result.items.map(item => ({ ...item }));
  }
  if (resource === "trash") {
    const result = await getEmails(db, 1, 10_000, { deleted: "only" });
    return result.items.map(item => ({ ...item }));
  }
  if (resource === "rules") return (await getAllRules(db)).map(item => ({ ...item }));
  if (resource === "whitelist") return (await getAllWhitelist(db)).map(item => ({ ...item }));
  if (resource === "mailboxes") return (await getAllMailboxes(db, true)).map(item => ({ ...item }));
  if (resource === "admins") return (await getAllAdminUsers(db)).map(item => ({ ...item }));
  if (resource === "notifications") return (await getAllNotificationEndpoints(db)).map(item => ({ ...item }));
  return (await getAllAuditLogs(db)).map(item => ({ ...item }));
}

async function touchMailboxes(db: D1Database, addresses: string[], receivedAt: number): Promise<void> {
  const normalizedAddresses = Array.from(
    new Set((Array.isArray(addresses) ? addresses : []).map(normalizeEmailAddress).filter(Boolean)),
  );

  if (normalizedAddresses.length === 0) return;

  const placeholders = normalizedAddresses.map(() => "?").join(", ");
  await db.prepare(
    `UPDATE mailboxes SET last_received_at = ?, updated_at = ?, receive_count = receive_count + 1 WHERE deleted_at IS NULL AND address IN (${placeholders})`,
  ).bind(receivedAt, receivedAt, ...normalizedAddresses).run();
}

function byteLengthOfEmail(textBody: string, htmlBody: string): number {
  return encoder.encode(`${textBody || ""}${htmlBody || ""}`).byteLength;
}

const encoder = new TextEncoder();
