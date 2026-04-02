import {
  buildEmailPreview,
  buildRuleMatchInsights,
  extractEmailExtraction,
  isValidEmailAddress,
  jsonStringify,
  normalizeEmailAddress,
  safeParseJson,
} from "../utils/utils";
import type {
  D1Database,
  EmailAttachmentRecord,
  EmailDetail,
  EmailSavePayload,
  EmailSearchFilters,
  EmailSummary,
  PaginationPayload,
  ResolvedRetentionPolicy,
  RuleMatch,
} from "../server/types";
import {
  attachResolvedRetentionToRecord,
  getAllRetentionPolicies,
} from "./db-retention-policies";

type DbRow = Record<string, unknown>;

const EMAIL_SUMMARY_SELECT_FIELDS = `
  emails.message_id,
  emails.from_address,
  emails.to_address,
  emails.subject,
  emails.extracted_json,
  emails.received_at,
  emails.text_body,
  emails.html_body,
  emails.has_attachments,
  emails.archived_at,
  emails.archived_by,
  emails.archive_reason,
  emails.deleted_at,
  emails.note,
  emails.tags,
  emails.project_id,
  emails.environment_id,
  emails.mailbox_pool_id,
  COALESCE(projects.name, '') as project_name,
  COALESCE(projects.slug, '') as project_slug,
  COALESCE(environments.name, '') as environment_name,
  COALESCE(environments.slug, '') as environment_slug,
  COALESCE(mailbox_pools.name, '') as mailbox_pool_name,
  COALESCE(mailbox_pools.slug, '') as mailbox_pool_slug,
  COALESCE(mailboxes.address, '') as primary_mailbox_address
`;

const EMAIL_DETAIL_SELECT_FIELDS = `
  emails.message_id,
  emails.from_address,
  emails.to_address,
  emails.subject,
  emails.extracted_json,
  emails.received_at,
  emails.text_body,
  emails.html_body,
  emails.raw_headers,
  emails.has_attachments,
  emails.archived_at,
  emails.archived_by,
  emails.archive_reason,
  emails.deleted_at,
  emails.note,
  emails.tags,
  emails.project_id,
  emails.environment_id,
  emails.mailbox_pool_id,
  COALESCE(projects.name, '') as project_name,
  COALESCE(projects.slug, '') as project_slug,
  COALESCE(environments.name, '') as environment_name,
  COALESCE(environments.slug, '') as environment_slug,
  COALESCE(mailbox_pools.name, '') as mailbox_pool_name,
  COALESCE(mailbox_pools.slug, '') as mailbox_pool_slug,
  COALESCE(mailboxes.address, '') as primary_mailbox_address
`;

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

function normalizeNullableId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function buildSqlPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function uniquePositiveIds(values: unknown[]): number[] {
  return Array.from(
    new Set(
      values
        .map(value => Number(value))
        .filter(value => Number.isFinite(value) && value > 0)
        .map(value => Math.floor(value)),
    ),
  );
}

function mapWorkspaceScope(row: DbRow) {
  return {
    environment_id: nullableNumberValue(row, "environment_id"),
    environment_name: stringValue(row, "environment_name"),
    environment_slug: stringValue(row, "environment_slug"),
    mailbox_pool_id: nullableNumberValue(row, "mailbox_pool_id"),
    mailbox_pool_name: stringValue(row, "mailbox_pool_name"),
    mailbox_pool_slug: stringValue(row, "mailbox_pool_slug"),
    project_id: nullableNumberValue(row, "project_id"),
    project_name: stringValue(row, "project_name"),
    project_slug: stringValue(row, "project_slug"),
  };
}

function createEmptyResolvedRetentionPolicy(): ResolvedRetentionPolicy {
  return {
    archive_email_hours: null,
    archive_email_source: null,
    deleted_email_retention_hours: null,
    deleted_email_retention_source: null,
    email_retention_hours: null,
    email_retention_source: null,
    mailbox_ttl_hours: null,
    mailbox_ttl_source: null,
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
  const extraction = extractEmailExtraction({
    fromAddress: row.from_address,
    htmlBody: row.html_body,
    preview,
    results,
    subject: row.subject,
    textBody: row.text_body,
  });

  return {
    archive_reason: stringValue(row, "archive_reason"),
    archived_at: nullableNumberValue(row, "archived_at"),
    archived_by: stringValue(row, "archived_by"),
    deleted_at: nullableNumberValue(row, "deleted_at"),
    extraction,
    from_address: stringValue(row, "from_address"),
    has_attachments: boolValue(row, "has_attachments", false),
    message_id: stringValue(row, "message_id"),
    note: stringValue(row, "note"),
    ...mapWorkspaceScope(row),
    primary_mailbox_address: stringValue(row, "primary_mailbox_address"),
    preview,
    received_at: numberValue(row, "received_at", Date.now()),
    resolved_retention: createEmptyResolvedRetentionPolicy(),
    result_count: Array.isArray(results) ? results.length : 0,
    subject: stringValue(row, "subject"),
    tags: safeParseJson<string[]>(stringValue(row, "tags", "[]"), []) || [],
    to_address: stringValue(row, "to_address"),
    verification_code: extraction.verification_code,
  };
}

function mapEmailDetail(row: DbRow, attachments: EmailAttachmentRecord[]): EmailDetail {
  const preview = buildEmailPreview(row.text_body, row.html_body);
  const results = safeParseJson<EmailDetail["results"]>(stringValue(row, "extracted_json", "[]"), []) || [];
  const raw_headers =
    safeParseJson<Array<{ key: string; value: string }>>(stringValue(row, "raw_headers", "[]"), []) || [];
  const extraction = extractEmailExtraction({
    fromAddress: row.from_address,
    htmlBody: row.html_body,
    preview,
    results,
    subject: row.subject,
    textBody: row.text_body,
  });

  return {
    attachments,
    archive_reason: stringValue(row, "archive_reason"),
    archived_at: nullableNumberValue(row, "archived_at"),
    archived_by: stringValue(row, "archived_by"),
    deleted_at: nullableNumberValue(row, "deleted_at"),
    extraction,
    from_address: stringValue(row, "from_address"),
    has_attachments: boolValue(row, "has_attachments", false),
    html_body: stringValue(row, "html_body"),
    message_id: stringValue(row, "message_id"),
    note: stringValue(row, "note"),
    ...mapWorkspaceScope(row),
    primary_mailbox_address: stringValue(row, "primary_mailbox_address"),
    preview,
    raw_headers,
    received_at: numberValue(row, "received_at", Date.now()),
    resolved_retention: createEmptyResolvedRetentionPolicy(),
    result_insights: buildRuleMatchInsights(results, extraction),
    result_count: Array.isArray(results) ? results.length : 0,
    results,
    subject: stringValue(row, "subject"),
    tags: safeParseJson<string[]>(stringValue(row, "tags", "[]"), []) || [],
    text_body: stringValue(row, "text_body"),
    to_address: stringValue(row, "to_address"),
    verification_code: extraction.verification_code,
  };
}

export async function getEmailProjectIds(db: D1Database, messageId: string): Promise<number[]> {
  const rows = await db
    .prepare(
      "SELECT DISTINCT project_id FROM email_mailbox_links WHERE email_message_id = ? AND project_id IS NOT NULL ORDER BY project_id ASC",
    )
    .bind(messageId)
    .all<DbRow>();
  return rows.results
    .map(row => nullableNumberValue(row, "project_id"))
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
}

export async function getLatestEmail(
  db: D1Database,
  address: string,
  allowedProjectIds?: number[] | null,
): Promise<DbRow | null> {
  const addr = normalizeEmailAddress(address);
  const normalizedProjectIds = uniquePositiveIds(allowedProjectIds || []);

  if (normalizedProjectIds.length > 0) {
    return db
      .prepare(
        `SELECT message_id, from_address, to_address, subject, extracted_json, received_at, text_body, html_body
        FROM emails
        WHERE deleted_at IS NULL
          AND archived_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM email_mailbox_links links
            WHERE links.email_message_id = emails.message_id
              AND links.mailbox_address = ?
              AND links.project_id IN (${buildSqlPlaceholders(normalizedProjectIds.length)})
          )
        ORDER BY received_at DESC
        LIMIT 1`,
      )
      .bind(addr, ...normalizedProjectIds)
      .first<DbRow>();
  }

  return db
    .prepare(
      "SELECT message_id, from_address, to_address, subject, extracted_json, received_at, text_body, html_body FROM emails WHERE deleted_at IS NULL AND archived_at IS NULL AND instr(',' || to_address || ',', ',' || ? || ',') > 0 ORDER BY received_at DESC LIMIT 1",
    )
    .bind(addr)
    .first<DbRow>();
}

export async function getEmails(
  db: D1Database,
  page: number,
  pageSize: number,
  filters: EmailSearchFilters = {},
  allowedProjectIds?: number[] | null,
): Promise<PaginationPayload<EmailSummary>> {
  const offset = (page - 1) * pageSize;
  const clauses: string[] = [];
  const params: unknown[] = [];
  const countParams: unknown[] = [];
  const normalizedAllowedProjectIds = uniquePositiveIds(allowedProjectIds || []);

  if (filters.archived === "only") {
    clauses.push("emails.archived_at IS NOT NULL");
  } else if (filters.archived !== "include") {
    clauses.push("emails.archived_at IS NULL");
  }

  if (filters.deleted === "only") {
    clauses.push("emails.deleted_at IS NOT NULL");
  } else if (filters.deleted !== "include") {
    clauses.push("emails.deleted_at IS NULL");
  }

  if (normalizedAllowedProjectIds.length > 0) {
    const placeholders = buildSqlPlaceholders(normalizedAllowedProjectIds.length);
    clauses.push(
      `EXISTS (SELECT 1 FROM email_mailbox_links links WHERE links.email_message_id = emails.message_id AND links.project_id IN (${placeholders}))`,
    );
    params.push(...normalizedAllowedProjectIds);
    countParams.push(...normalizedAllowedProjectIds);
  }

  if (filters.domain) {
    clauses.push("emails.to_address LIKE ?");
    params.push(`%@${filters.domain}%`);
    countParams.push(`%@${filters.domain}%`);
  }

  const project_id = normalizeNullableId(filters.project_id);
  if (project_id) {
    clauses.push(
      "EXISTS (SELECT 1 FROM email_mailbox_links links WHERE links.email_message_id = emails.message_id AND links.project_id = ?)",
    );
    params.push(project_id);
    countParams.push(project_id);
  }

  const environment_id = normalizeNullableId(filters.environment_id);
  if (environment_id) {
    clauses.push(
      "EXISTS (SELECT 1 FROM email_mailbox_links links WHERE links.email_message_id = emails.message_id AND links.environment_id = ?)",
    );
    params.push(environment_id);
    countParams.push(environment_id);
  }

  const mailbox_pool_id = normalizeNullableId(filters.mailbox_pool_id);
  if (mailbox_pool_id) {
    clauses.push(
      "EXISTS (SELECT 1 FROM email_mailbox_links links WHERE links.email_message_id = emails.message_id AND links.mailbox_pool_id = ?)",
    );
    params.push(mailbox_pool_id);
    countParams.push(mailbox_pool_id);
  }

  if (filters.address) {
    const normalized = normalizeEmailAddress(filters.address);
    clauses.push("instr(',' || emails.to_address || ',', ',' || ? || ',') > 0");
    params.push(normalized);
    countParams.push(normalized);
  }

  if (filters.sender) {
    clauses.push("emails.from_address LIKE ?");
    params.push(`%${normalizeEmailAddress(filters.sender)}%`);
    countParams.push(`%${normalizeEmailAddress(filters.sender)}%`);
  }

  if (filters.subject) {
    const subjectKeyword = `%${filters.subject.trim()}%`;
    clauses.push("emails.subject LIKE ?");
    params.push(subjectKeyword);
    countParams.push(subjectKeyword);
  }

  if (filters.has_matches !== null && filters.has_matches !== undefined) {
    clauses.push(filters.has_matches ? "emails.extracted_json <> '[]'" : "emails.extracted_json = '[]'");
  }

  if (filters.has_attachments !== null && filters.has_attachments !== undefined) {
    clauses.push(filters.has_attachments ? "emails.has_attachments = 1" : "emails.has_attachments = 0");
  }

  if (filters.date_from) {
    clauses.push("emails.received_at >= ?");
    params.push(filters.date_from);
    countParams.push(filters.date_from);
  }

  if (filters.date_to) {
    clauses.push("emails.received_at <= ?");
    params.push(filters.date_to);
    countParams.push(filters.date_to);
  }

  let query = `SELECT ${EMAIL_SUMMARY_SELECT_FIELDS}
    FROM emails
    LEFT JOIN projects ON projects.id = emails.project_id
    LEFT JOIN environments ON environments.id = emails.environment_id
    LEFT JOIN mailbox_pools ON mailbox_pools.id = emails.mailbox_pool_id
    LEFT JOIN mailboxes ON mailboxes.id = emails.primary_mailbox_id`;
  let countQuery = "SELECT COUNT(1) as total FROM emails";

  if (clauses.length > 0) {
    const whereClause = ` WHERE ${clauses.join(" AND ")}`;
    query += whereClause;
    countQuery += whereClause;
  }

  query += " ORDER BY emails.received_at DESC LIMIT ? OFFSET ?";
  params.push(pageSize, offset);

  const [list, countRow, policies] = await Promise.all([
    db.prepare(query).bind(...params).all<DbRow>(),
    db.prepare(countQuery).bind(...countParams).first<DbRow>(),
    getAllRetentionPolicies(db, { enabledOnly: true }, allowedProjectIds),
  ]);

  return {
    items: list.results.map(row => attachResolvedRetentionToRecord(mapEmailSummary(row), policies)),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getEmailByMessageId(
  db: D1Database,
  messageId: string,
): Promise<EmailDetail | null> {
  return getEmailByMessageIdScoped(db, messageId, null);
}

export async function getEmailByMessageIdScoped(
  db: D1Database,
  messageId: string,
  allowedProjectIds?: number[] | null,
): Promise<EmailDetail | null> {
  const normalizedAllowedProjectIds = uniquePositiveIds(allowedProjectIds || []);
  const scopedWhere = normalizedAllowedProjectIds.length > 0
    ? ` AND EXISTS (SELECT 1 FROM email_mailbox_links links WHERE links.email_message_id = emails.message_id AND links.project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)}))`
    : "";
  const [row, attachmentRows, policies] = await Promise.all([
    db
      .prepare(
        `SELECT ${EMAIL_DETAIL_SELECT_FIELDS}
        FROM emails
        LEFT JOIN projects ON projects.id = emails.project_id
        LEFT JOIN environments ON environments.id = emails.environment_id
        LEFT JOIN mailbox_pools ON mailbox_pools.id = emails.mailbox_pool_id
        LEFT JOIN mailboxes ON mailboxes.id = emails.primary_mailbox_id
        WHERE emails.message_id = ?${scopedWhere}
        LIMIT 1`,
      )
      .bind(String(messageId || ""), ...normalizedAllowedProjectIds)
      .first<DbRow>(),
    db
      .prepare(
        "SELECT id, filename, mime_type, disposition, content_id, size_bytes, is_stored FROM email_attachments WHERE email_message_id = ? ORDER BY id ASC",
      )
      .bind(String(messageId || ""))
      .all<DbRow>(),
    getAllRetentionPolicies(db, { enabledOnly: true }, allowedProjectIds),
  ]);

  return row
    ? attachResolvedRetentionToRecord(
        mapEmailDetail(row, attachmentRows.results.map(mapAttachment)),
        policies,
      )
    : null;
}

export async function updateEmailMetadata(
  db: D1Database,
  messageId: string,
  input: { note: string; tags: string[] },
): Promise<EmailDetail | null> {
  await db
    .prepare("UPDATE emails SET note = ?, tags = ? WHERE message_id = ?")
    .bind(input.note || null, jsonStringify(input.tags, "[]"), messageId)
    .run();

  return getEmailByMessageId(db, messageId);
}

export async function getAttachmentContent(
  db: D1Database,
  messageId: string,
  attachmentId: number,
): Promise<(EmailAttachmentRecord & { content_base64: string }) | null> {
  const row = await db
    .prepare(
      "SELECT id, filename, mime_type, disposition, content_id, size_bytes, is_stored, content_base64 FROM email_attachments WHERE email_message_id = ? AND id = ? LIMIT 1",
    )
    .bind(messageId, attachmentId)
    .first<DbRow>();

  if (!row) return null;
  return { ...mapAttachment(row), content_base64: stringValue(row, "content_base64") };
}

export async function softDeleteEmail(
  db: D1Database,
  messageId: string,
  deletedBy: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE emails SET deleted_at = ?, deleted_by = ? WHERE message_id = ? AND deleted_at IS NULL",
    )
    .bind(Date.now(), deletedBy, messageId)
    .run();
}

export async function archiveEmail(
  db: D1Database,
  messageId: string,
  input: { archive_reason?: string | null; archived_by: string },
): Promise<void> {
  await db
    .prepare(
      "UPDATE emails SET archived_at = ?, archived_by = ?, archive_reason = ? WHERE message_id = ? AND deleted_at IS NULL AND archived_at IS NULL",
    )
    .bind(
      Date.now(),
      input.archived_by,
      String(input.archive_reason || "manual"),
      messageId,
    )
    .run();
}

export async function unarchiveEmail(db: D1Database, messageId: string): Promise<void> {
  await db
    .prepare(
      "UPDATE emails SET archived_at = NULL, archived_by = NULL, archive_reason = '' WHERE message_id = ? AND archived_at IS NOT NULL",
    )
    .bind(messageId)
    .run();
}

export async function restoreEmail(db: D1Database, messageId: string): Promise<void> {
  await db
    .prepare("UPDATE emails SET deleted_at = NULL, deleted_by = NULL WHERE message_id = ?")
    .bind(messageId)
    .run();
}

export async function purgeEmail(db: D1Database, messageId: string): Promise<void> {
  await db.prepare("DELETE FROM email_attachments WHERE email_message_id = ?").bind(messageId).run();
  await db.prepare("DELETE FROM emails WHERE message_id = ?").bind(messageId).run();
}

async function findManagedMailboxContextsByAddresses(db: D1Database, addresses: string[]) {
  const normalizedAddresses = Array.from(
    new Set((Array.isArray(addresses) ? addresses : []).map(normalizeEmailAddress).filter(Boolean)),
  );

  if (normalizedAddresses.length === 0) return [];

  const placeholders = normalizedAddresses.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT
        m.id as mailbox_id,
        m.address as mailbox_address,
        m.project_id,
        m.environment_id,
        m.mailbox_pool_id
      FROM mailboxes m
      WHERE m.deleted_at IS NULL AND m.address IN (${placeholders})
      ORDER BY m.id ASC`,
    )
    .bind(...normalizedAddresses)
    .all<DbRow>();

  const contexts = new Map<
    string,
    {
      environment_id: number | null;
      mailbox_address: string;
      mailbox_id: number;
      mailbox_pool_id: number | null;
      project_id: number | null;
    }
  >();

  for (const row of rows.results) {
    const mailbox_address = normalizeEmailAddress(row.mailbox_address);
    if (!mailbox_address) continue;

    contexts.set(mailbox_address, {
      environment_id: nullableNumberValue(row, "environment_id"),
      mailbox_address,
      mailbox_id: numberValue(row, "mailbox_id"),
      mailbox_pool_id: nullableNumberValue(row, "mailbox_pool_id"),
      project_id: nullableNumberValue(row, "project_id"),
    });
  }

  return normalizedAddresses
    .map(address => contexts.get(address))
    .filter((item): item is {
      environment_id: number | null;
      mailbox_address: string;
      mailbox_id: number;
      mailbox_pool_id: number | null;
      project_id: number | null;
    } => Boolean(item));
}

export async function saveEmail(
  db: D1Database,
  data: EmailSavePayload,
): Promise<{
  environment_id: number | null;
  mailbox_pool_id: number | null;
  messageId: string;
  project_id: number | null;
  project_ids: number[];
  receivedAt: number;
}> {
  const receivedAt = Date.now();
  const messageId = crypto.randomUUID();
  const mailboxContexts = await findManagedMailboxContextsByAddresses(db, data.to);
  const primaryMailbox = mailboxContexts[0] || null;

  await db
    .prepare(
      "INSERT INTO emails (message_id, from_address, to_address, subject, extracted_json, received_at, text_body, html_body, raw_headers, has_attachments, size_bytes, deleted_at, deleted_by, matched_rule_ids, primary_mailbox_id, project_id, environment_id, mailbox_pool_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)",
    )
    .bind(
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
      primaryMailbox?.mailbox_id || null,
      primaryMailbox?.project_id || null,
      primaryMailbox?.environment_id || null,
      primaryMailbox?.mailbox_pool_id || null,
    )
    .run();

  for (const attachment of data.attachments) {
    await db
      .prepare(
        "INSERT INTO email_attachments (email_message_id, filename, mime_type, disposition, content_id, size_bytes, is_stored, content_base64, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        messageId,
        attachment.filename || null,
        attachment.mime_type,
        attachment.disposition || null,
        attachment.content_id || null,
        attachment.size_bytes,
        attachment.is_stored ? 1 : 0,
        attachment.content_base64 || "",
        receivedAt,
      )
      .run();
  }

  for (const mailbox of mailboxContexts) {
    await db
      .prepare(
        "INSERT INTO email_mailbox_links (email_message_id, mailbox_id, mailbox_address, project_id, environment_id, mailbox_pool_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email_message_id, mailbox_id) DO UPDATE SET mailbox_address = excluded.mailbox_address, project_id = excluded.project_id, environment_id = excluded.environment_id, mailbox_pool_id = excluded.mailbox_pool_id",
      )
      .bind(
        messageId,
        mailbox.mailbox_id,
        mailbox.mailbox_address,
        mailbox.project_id,
        mailbox.environment_id,
        mailbox.mailbox_pool_id,
        receivedAt,
      )
      .run();
  }

  await touchMailboxes(db, data.to, receivedAt);
  return {
    environment_id: primaryMailbox?.environment_id || null,
    mailbox_pool_id: primaryMailbox?.mailbox_pool_id || null,
    messageId,
    project_id: primaryMailbox?.project_id || null,
    project_ids: uniquePositiveIds(mailboxContexts.map(item => item.project_id)),
    receivedAt,
  };
}

export async function clearExpiredEmails(db: D1Database, maxHours: number): Promise<void> {
  const threshold = Date.now() - maxHours * 60 * 60 * 1000;
  const result = await db
    .prepare(
      "SELECT message_id FROM emails WHERE deleted_at IS NULL AND archived_at IS NULL AND received_at < ?",
    )
    .bind(threshold)
    .all<DbRow>();

  for (const row of result.results) {
    await purgeEmail(db, stringValue(row, "message_id"));
  }
}

export async function purgeDeletedEmails(db: D1Database, maxHours: number): Promise<void> {
  const threshold = Date.now() - maxHours * 60 * 60 * 1000;
  const result = await db
    .prepare("SELECT message_id FROM emails WHERE deleted_at IS NOT NULL AND deleted_at < ?")
    .bind(threshold)
    .all<DbRow>();

  for (const row of result.results) {
    await purgeEmail(db, stringValue(row, "message_id"));
  }
}

async function touchMailboxes(db: D1Database, addresses: string[], receivedAt: number): Promise<void> {
  const normalizedAddresses = Array.from(
    new Set((Array.isArray(addresses) ? addresses : []).map(normalizeEmailAddress).filter(Boolean)),
  );

  if (normalizedAddresses.length === 0) return;

  const placeholders = normalizedAddresses.map(() => "?").join(", ");
  await db
    .prepare(
      `UPDATE mailboxes SET last_received_at = ?, updated_at = ?, receive_count = receive_count + 1 WHERE deleted_at IS NULL AND address IN (${placeholders})`,
    )
    .bind(receivedAt, receivedAt, ...normalizedAddresses)
    .run();
}

function byteLengthOfEmail(textBody: string, htmlBody: string): number {
  return encoder.encode(`${textBody || ""}${htmlBody || ""}`).byteLength;
}

const encoder = new TextEncoder();
