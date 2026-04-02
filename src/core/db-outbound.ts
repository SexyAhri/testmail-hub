import { jsonStringify, normalizeEmailAddress, safeParseJson } from "../utils/utils";
import type {
  D1Database,
  OutboundContactRecord,
  OutboundEmailAttachmentRecord,
  OutboundEmailRecord,
  OutboundEmailSettings,
  OutboundStats,
  OutboundTemplateRecord,
  PaginationPayload,
  WorkerEnv,
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

function mapOutboundEmail(row: DbRow): OutboundEmailRecord {
  return {
    attachment_count: numberValue(row, "attachment_count", 0),
    bcc_addresses:
      safeParseJson<string[]>(stringValue(row, "bcc_addresses", "[]"), [])
      || [],
    cc_addresses:
      safeParseJson<string[]>(stringValue(row, "cc_addresses", "[]"), [])
      || [],
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
    to_addresses:
      safeParseJson<string[]>(stringValue(row, "to_addresses", "[]"), [])
      || [],
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
    variables:
      safeParseJson<string[]>(stringValue(row, "variables_json", "[]"), [])
      || [],
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

async function getAppSetting(
  db: D1Database,
  key: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE key = ? LIMIT 1")
    .bind(key)
    .first<DbRow>();
  return row ? stringValue(row, "value") : null;
}

async function setAppSetting(
  db: D1Database,
  key: string,
  value: string,
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(key, value, now)
    .run();
}

async function replaceOutboundEmailAttachments(
  db: D1Database,
  outboundEmailId: number,
  attachments: Array<{
    content_base64: string;
    content_type: string;
    filename: string;
    size_bytes: number;
  }>,
): Promise<void> {
  await db
    .prepare(
      "DELETE FROM outbound_email_attachments WHERE outbound_email_id = ?",
    )
    .bind(outboundEmailId)
    .run();

  if (attachments.length === 0) return;

  const now = Date.now();
  for (const attachment of attachments) {
    await db
      .prepare(
        "INSERT INTO outbound_email_attachments (outbound_email_id, filename, content_type, content_base64, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        outboundEmailId,
        attachment.filename,
        attachment.content_type,
        attachment.content_base64,
        attachment.size_bytes,
        now,
      )
      .run();
  }
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

  const from_domain = String(env.RESEND_FROM_DOMAIN || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
  const default_from_name = String(
    storedFromName || env.RESEND_DEFAULT_FROM_NAME || "",
  ).trim();
  const default_from_address = normalizeEmailAddress(
    storedFromAddress || env.RESEND_DEFAULT_FROM,
  );
  const default_reply_to = normalizeEmailAddress(
    storedReplyTo || env.RESEND_DEFAULT_REPLY_TO,
  );
  const api_key_configured = Boolean(String(env.RESEND_API_KEY || "").trim());
  const allow_external_recipients =
    storedExternalSetting === null ? true : storedExternalSetting === "1";

  return {
    allow_external_recipients,
    api_key_configured,
    configured:
      api_key_configured
      && Boolean(default_from_name)
      && Boolean(default_from_address)
      && Boolean(from_domain),
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
    setAppSetting(
      db,
      "outbound_email_external_enabled",
      input.allow_external_recipients ? "1" : "0",
    ),
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
    params.push(
      `%${filters.keyword}%`,
      `%${filters.keyword}%`,
      `%${filters.keyword}%`,
    );
    countParams.push(
      `%${filters.keyword}%`,
      `%${filters.keyword}%`,
      `%${filters.keyword}%`,
    );
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

export async function getOutboundEmailById(
  db: D1Database,
  id: number,
): Promise<OutboundEmailRecord | null> {
  const [row, attachmentRows] = await Promise.all([
    db
      .prepare(
        "SELECT id, provider, provider_message_id, from_name, from_address, reply_to, to_addresses, cc_addresses, bcc_addresses, subject, text_body, html_body, status, error_message, created_by, created_at, updated_at, scheduled_at, sent_at, last_attempt_at, attachment_count FROM outbound_emails WHERE id = ? LIMIT 1",
      )
      .bind(id)
      .first<DbRow>(),
    db
      .prepare(
        "SELECT id, filename, content_type, content_base64, size_bytes FROM outbound_email_attachments WHERE outbound_email_id = ? ORDER BY id ASC",
      )
      .bind(id)
      .all<DbRow>(),
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
    attachments: Array<{
      content_base64: string;
      content_type: string;
      filename: string;
      size_bytes: number;
    }>;
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
  const result = (await db
    .prepare(
      "INSERT INTO outbound_emails (provider, provider_message_id, from_name, from_address, reply_to, to_addresses, cc_addresses, bcc_addresses, subject, text_body, html_body, status, error_message, created_by, created_at, updated_at, scheduled_at, sent_at, last_attempt_at, attachment_count) VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
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
    )
    .run()) as { meta?: { last_row_id?: number } };

  const insertedId = Number(result?.meta?.last_row_id || 0);
  const fallbackRow =
    insertedId > 0
      ? null
      : await db
          .prepare(
            "SELECT id FROM outbound_emails WHERE created_by = ? AND subject = ? AND created_at = ? ORDER BY id DESC LIMIT 1",
          )
          .bind(input.created_by, input.subject, now)
          .first<DbRow>();
  const finalId =
    insertedId > 0 ? insertedId : numberValue(fallbackRow || {}, "id", 0);

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
    attachments: Array<{
      content_base64: string;
      content_type: string;
      filename: string;
      size_bytes: number;
    }>;
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
  await db
    .prepare(
      "UPDATE outbound_emails SET provider = ?, from_name = ?, from_address = ?, reply_to = ?, to_addresses = ?, cc_addresses = ?, bcc_addresses = ?, subject = ?, text_body = ?, html_body = ?, status = ?, scheduled_at = ?, attachment_count = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
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
    )
    .run();

  await replaceOutboundEmailAttachments(db, id, input.attachments);
}

export async function deleteOutboundEmailRecord(
  db: D1Database,
  id: number,
): Promise<void> {
  await db
    .prepare("DELETE FROM outbound_email_attachments WHERE outbound_email_id = ?")
    .bind(id)
    .run();
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
  await db
    .prepare(
      "UPDATE outbound_emails SET provider_message_id = ?, status = ?, error_message = ?, last_attempt_at = ?, sent_at = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      input.provider_message_id ?? "",
      input.status,
      input.error_message || "",
      input.last_attempt_at ?? null,
      input.sent_at ?? null,
      Date.now(),
      id,
    )
    .run();
}

export async function getDueScheduledOutboundEmails(
  db: D1Database,
  limit = 10,
): Promise<OutboundEmailRecord[]> {
  const rows = await db
    .prepare(
      "SELECT id, provider, provider_message_id, from_name, from_address, reply_to, to_addresses, cc_addresses, bcc_addresses, subject, text_body, html_body, status, error_message, created_by, created_at, updated_at, scheduled_at, sent_at, last_attempt_at, attachment_count FROM outbound_emails WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT ?",
    )
    .bind(Date.now(), limit)
    .all<DbRow>();

  return Promise.all(
    rows.results.map(row => getOutboundEmailById(db, numberValue(row, "id"))),
  ).then(items => items.filter((item): item is OutboundEmailRecord => Boolean(item)));
}

export async function getOutboundTemplates(
  db: D1Database,
): Promise<OutboundTemplateRecord[]> {
  const result = await db
    .prepare(
      "SELECT id, name, subject_template, text_template, html_template, variables_json, is_enabled, created_by, created_at, updated_at FROM outbound_templates ORDER BY updated_at DESC",
    )
    .all<DbRow>();
  return result.results.map(mapOutboundTemplate);
}

export async function getOutboundTemplateById(
  db: D1Database,
  id: number,
): Promise<OutboundTemplateRecord | null> {
  const row = await db
    .prepare(
      "SELECT id, name, subject_template, text_template, html_template, variables_json, is_enabled, created_by, created_at, updated_at FROM outbound_templates WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .first<DbRow>();

  if (!row) return null;
  return mapOutboundTemplate(row);
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
  await db
    .prepare(
      "INSERT INTO outbound_templates (name, subject_template, text_template, html_template, variables_json, is_enabled, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      input.name,
      input.subject_template,
      input.text_template,
      input.html_template,
      jsonStringify(input.variables, "[]"),
      input.is_enabled ? 1 : 0,
      input.created_by,
      now,
      now,
    )
    .run();
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
  await db
    .prepare(
      "UPDATE outbound_templates SET name = ?, subject_template = ?, text_template = ?, html_template = ?, variables_json = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      input.name,
      input.subject_template,
      input.text_template,
      input.html_template,
      jsonStringify(input.variables, "[]"),
      input.is_enabled ? 1 : 0,
      Date.now(),
      id,
    )
    .run();
}

export async function deleteOutboundTemplate(
  db: D1Database,
  id: number,
): Promise<void> {
  await db.prepare("DELETE FROM outbound_templates WHERE id = ?").bind(id).run();
}

export async function getOutboundContacts(
  db: D1Database,
): Promise<OutboundContactRecord[]> {
  const result = await db
    .prepare(
      "SELECT id, name, email, note, tags, is_favorite, created_at, updated_at FROM outbound_contacts ORDER BY is_favorite DESC, updated_at DESC",
    )
    .all<DbRow>();
  return result.results.map(mapOutboundContact);
}

export async function getOutboundContactById(
  db: D1Database,
  id: number,
): Promise<OutboundContactRecord | null> {
  const row = await db
    .prepare(
      "SELECT id, name, email, note, tags, is_favorite, created_at, updated_at FROM outbound_contacts WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .first<DbRow>();

  if (!row) return null;
  return mapOutboundContact(row);
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
  await db
    .prepare(
      "INSERT INTO outbound_contacts (name, email, note, tags, is_favorite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      input.name,
      normalizeEmailAddress(input.email),
      input.note,
      jsonStringify(input.tags, "[]"),
      input.is_favorite ? 1 : 0,
      now,
      now,
    )
    .run();
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
  await db
    .prepare(
      "UPDATE outbound_contacts SET name = ?, email = ?, note = ?, tags = ?, is_favorite = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      input.name,
      normalizeEmailAddress(input.email),
      input.note,
      jsonStringify(input.tags, "[]"),
      input.is_favorite ? 1 : 0,
      Date.now(),
      id,
    )
    .run();
}

export async function deleteOutboundContact(
  db: D1Database,
  id: number,
): Promise<void> {
  await db.prepare("DELETE FROM outbound_contacts WHERE id = ?").bind(id).run();
}

export async function getOutboundStats(db: D1Database): Promise<OutboundStats> {
  const [statusRows, dailyRows, topDomainRows] = await Promise.all([
    db.prepare("SELECT status, COUNT(1) as total FROM outbound_emails GROUP BY status").all<DbRow>(),
    db
      .prepare(
        "SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') as day, SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed, SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled FROM outbound_emails WHERE created_at >= ? GROUP BY day ORDER BY day ASC",
      )
      .bind(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .all<DbRow>(),
    db
      .prepare(
        "SELECT substr(value, instr(value, '@') + 1) as label, COUNT(1) as total FROM outbound_emails, json_each(outbound_emails.to_addresses) WHERE status IN ('sent', 'scheduled', 'failed', 'sending') AND instr(value, '@') > 0 GROUP BY label ORDER BY total DESC LIMIT 5",
      )
      .all<DbRow>(),
  ]);

  const totals = new Map(
    statusRows.results.map(row => [stringValue(row, "status"), numberValue(row, "total", 0)]),
  );

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
