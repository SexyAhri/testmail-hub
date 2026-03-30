import {
  buildEmailPreview,
  buildRuleMatchInsights,
  extractEmailExtraction,
  isValidEmailAddress,
  isSqliteSchemaError,
  jsonStringify,
  normalizeEmailAddress,
  safeParseJson,
} from "../utils/utils";
import type {
  AccessScope,
  AdminRole,
  AdminUserRecord,
  ApiTokenPermission,
  ApiTokenRecord,
  AuditLogRecord,
  DomainAssetRecord,
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
  MailboxPoolRecord,
  MailboxRecord,
  NotificationEndpointRecord,
  NotificationDeliveryRecord,
  NotificationDeliveryScope,
  NotificationDeliveryStatus,
  OutboundContactRecord,
  OutboundEmailAttachmentRecord,
  OutboundEmailRecord,
  OutboundEmailSettings,
  OutboundStats,
  OutboundTemplateRecord,
  OverviewStats,
  PaginationPayload,
  ProjectBindingRecord,
  RuleMatch,
  RuleRecord,
  WorkerEnv,
  WorkspaceCatalog,
  WorkspaceEnvironmentRecord,
  WorkspaceProjectRecord,
  WhitelistSettings,
  WhitelistRecord,
} from "../server/types";

type DbRow = Record<string, unknown>;

const DOMAIN_ASSET_SELECT_FIELDS = [
  "d.id",
  "d.domain",
  "d.provider",
  "d.zone_id",
  "d.email_worker",
  "d.note",
  "d.is_enabled",
  "d.is_primary",
  "d.catch_all_mode",
  "d.catch_all_forward_to",
  "d.project_id",
  "d.environment_id",
  "d.created_at",
  "d.updated_at",
  "COALESCE(p.name, '') as project_name",
  "COALESCE(p.slug, '') as project_slug",
  "COALESCE(e.name, '') as environment_name",
  "COALESCE(e.slug, '') as environment_slug",
].join(", ");

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

function normalizeAccessScope(value: unknown, fallback: AccessScope = "all"): AccessScope {
  return value === "bound" ? "bound" : fallback;
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

function mapWorkspaceProject(row: DbRow): WorkspaceProjectRecord {
  return {
    created_at: numberValue(row, "created_at", Date.now()),
    description: stringValue(row, "description"),
    environment_count: numberValue(row, "environment_count", 0),
    id: numberValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    mailbox_count: numberValue(row, "mailbox_count", 0),
    mailbox_pool_count: numberValue(row, "mailbox_pool_count", 0),
    name: stringValue(row, "name"),
    slug: stringValue(row, "slug"),
    updated_at: numberValue(row, "updated_at", Date.now()),
  };
}

function mapProjectBinding(row: DbRow): ProjectBindingRecord {
  return {
    id: numberValue(row, "project_id", numberValue(row, "id")),
    name: stringValue(row, "project_name", stringValue(row, "name")),
    slug: stringValue(row, "project_slug", stringValue(row, "slug")),
  };
}

function mapWorkspaceEnvironment(row: DbRow): WorkspaceEnvironmentRecord {
  return {
    created_at: numberValue(row, "created_at", Date.now()),
    description: stringValue(row, "description"),
    id: numberValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    mailbox_count: numberValue(row, "mailbox_count", 0),
    mailbox_pool_count: numberValue(row, "mailbox_pool_count", 0),
    name: stringValue(row, "name"),
    project_id: numberValue(row, "project_id"),
    project_name: stringValue(row, "project_name"),
    project_slug: stringValue(row, "project_slug"),
    slug: stringValue(row, "slug"),
    updated_at: numberValue(row, "updated_at", Date.now()),
  };
}

function mapMailboxPool(row: DbRow): MailboxPoolRecord {
  return {
    created_at: numberValue(row, "created_at", Date.now()),
    description: stringValue(row, "description"),
    environment_id: numberValue(row, "environment_id"),
    environment_name: stringValue(row, "environment_name"),
    environment_slug: stringValue(row, "environment_slug"),
    id: numberValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    mailbox_count: numberValue(row, "mailbox_count", 0),
    name: stringValue(row, "name"),
    project_id: numberValue(row, "project_id"),
    project_name: stringValue(row, "project_name"),
    project_slug: stringValue(row, "project_slug"),
    slug: stringValue(row, "slug"),
    updated_at: numberValue(row, "updated_at", Date.now()),
  };
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
    ...mapWorkspaceScope(row),
    receive_count: numberValue(row, "receive_count", 0),
    tags: safeParseJson<string[]>(stringValue(row, "tags", "[]"), []) || [],
    updated_at: numberValue(row, "updated_at", Date.now()),
  };
}

function mapDomainAsset(row: DbRow): DomainAssetRecord {
  return {
    catch_all_forward_to: stringValue(row, "catch_all_forward_to"),
    catch_all_mode: stringValue(row, "catch_all_mode", "inherit") as DomainAssetRecord["catch_all_mode"],
    created_at: numberValue(row, "created_at", Date.now()),
    domain: stringValue(row, "domain"),
    email_worker: stringValue(row, "email_worker"),
    environment_id: nullableNumberValue(row, "environment_id"),
    environment_name: stringValue(row, "environment_name"),
    environment_slug: stringValue(row, "environment_slug"),
    id: numberValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    is_primary: boolValue(row, "is_primary", false),
    note: stringValue(row, "note"),
    provider: stringValue(row, "provider", "cloudflare"),
    project_id: nullableNumberValue(row, "project_id"),
    project_name: stringValue(row, "project_name"),
    project_slug: stringValue(row, "project_slug"),
    updated_at: numberValue(row, "updated_at", Date.now()),
    zone_id: stringValue(row, "zone_id"),
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

function mapAdminUser(row: DbRow): AdminUserRecord {
  return {
    access_scope: normalizeAccessScope(row.access_scope),
    created_at: numberValue(row, "created_at", Date.now()),
    display_name: stringValue(row, "display_name"),
    id: stringValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    last_login_at: nullableNumberValue(row, "last_login_at"),
    projects: [],
    role: stringValue(row, "role", "analyst") as AdminRole,
    updated_at: numberValue(row, "updated_at", Date.now()),
    username: stringValue(row, "username"),
  };
}

function mapNotification(row: DbRow): NotificationEndpointRecord {
  return {
    access_scope: normalizeAccessScope(row.access_scope),
    created_at: numberValue(row, "created_at", Date.now()),
    events: safeParseJson<string[]>(stringValue(row, "events", "[]"), []) || [],
    id: numberValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    last_error: stringValue(row, "last_error"),
    last_sent_at: nullableNumberValue(row, "last_sent_at"),
    last_status: stringValue(row, "last_status"),
    name: stringValue(row, "name"),
    projects: [],
    secret: stringValue(row, "secret"),
    target: stringValue(row, "target"),
    type: stringValue(row, "type"),
    updated_at: numberValue(row, "updated_at", Date.now()),
  };
}

function mapNotificationDelivery(row: DbRow): NotificationDeliveryRecord {
  return {
    attempt_count: numberValue(row, "attempt_count", 0),
    created_at: numberValue(row, "created_at", Date.now()),
    event: stringValue(row, "event"),
    id: numberValue(row, "id"),
    last_attempt_at: nullableNumberValue(row, "last_attempt_at"),
    last_error: stringValue(row, "last_error"),
    max_attempts: numberValue(row, "max_attempts", 4),
    next_retry_at: nullableNumberValue(row, "next_retry_at"),
    notification_endpoint_id: numberValue(row, "notification_endpoint_id"),
    payload: safeParseJson<JsonValue>(stringValue(row, "payload_json", "{}"), {}) || {},
    response_status: nullableNumberValue(row, "response_status"),
    scope:
      safeParseJson<NotificationDeliveryScope>(stringValue(row, "scope_json", "{}"), {}) || {},
    status: stringValue(row, "status", "pending") as NotificationDeliveryStatus,
    updated_at: numberValue(row, "updated_at", Date.now()),
  };
}

function mapApiToken(row: DbRow): ApiTokenRecord {
  const token_prefix = stringValue(row, "token_prefix");
  return {
    access_scope: normalizeAccessScope(row.access_scope),
    created_at: numberValue(row, "created_at", Date.now()),
    created_by: stringValue(row, "created_by"),
    description: stringValue(row, "description"),
    expires_at: nullableNumberValue(row, "expires_at"),
    id: stringValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    last_used_at: nullableNumberValue(row, "last_used_at"),
    name: stringValue(row, "name"),
    permissions:
      safeParseJson<ApiTokenPermission[]>(stringValue(row, "permissions_json", "[]"), []) || [],
    projects: [],
    token_prefix,
    token_preview: token_prefix ? `${token_prefix}...` : "",
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

function normalizeNullableId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function buildSqlPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function toExportRow(value: unknown): ExportRow {
  return JSON.parse(JSON.stringify(value || {})) as ExportRow;
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

function buildDomainAssetScopeFilter(allowedProjectIds?: number[] | null) {
  const hasScopedProjects = allowedProjectIds !== null && allowedProjectIds !== undefined;
  const normalizedAllowedProjectIds = uniquePositiveIds(allowedProjectIds || []);
  if (!hasScopedProjects) {
    return {
      params: [] as number[],
      whereClause: "",
    };
  }

  if (normalizedAllowedProjectIds.length === 0) {
    return {
      params: [] as number[],
      whereClause: " WHERE d.project_id IS NULL",
    };
  }

  return {
    params: normalizedAllowedProjectIds,
    whereClause: ` WHERE (d.project_id IS NULL OR d.project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)}))`,
  };
}

async function getProjectBindingsMap(
  db: D1Database,
  tableName: "admin_project_bindings" | "api_token_project_bindings" | "notification_endpoint_project_bindings",
  idColumn: "admin_id" | "api_token_id" | "notification_endpoint_id",
  ids: Array<number | string>,
): Promise<Map<string, ProjectBindingRecord[]>> {
  const normalizedIds = Array.from(new Set(ids.map(item => String(item || "")).filter(Boolean)));
  if (normalizedIds.length === 0) return new Map();

  const rows = await db.prepare(
    `SELECT
      bindings.${idColumn} as binding_id,
      p.id as project_id,
      p.name as project_name,
      p.slug as project_slug
    FROM ${tableName} bindings
    LEFT JOIN projects p ON p.id = bindings.project_id
    WHERE bindings.${idColumn} IN (${buildSqlPlaceholders(normalizedIds.length)})
    ORDER BY p.name ASC, p.id ASC`,
  ).bind(...normalizedIds).all<DbRow>();

  const mapping = new Map<string, ProjectBindingRecord[]>();
  for (const row of rows.results) {
    const bindingId = stringValue(row, "binding_id");
    if (!bindingId) continue;
    const current = mapping.get(bindingId) || [];
    current.push(mapProjectBinding(row));
    mapping.set(bindingId, current);
  }
  return mapping;
}

async function getProjectRecordById(db: D1Database, id: number) {
  return db.prepare(
    "SELECT id, name, slug, description, is_enabled, created_at, updated_at FROM projects WHERE id = ? LIMIT 1",
  ).bind(id).first<DbRow>();
}

async function getEnvironmentRecordById(db: D1Database, id: number) {
  return db.prepare(
    "SELECT e.id, e.project_id, e.name, e.slug, e.description, e.is_enabled, e.created_at, e.updated_at, COALESCE(p.name, '') as project_name, COALESCE(p.slug, '') as project_slug FROM environments e LEFT JOIN projects p ON p.id = e.project_id WHERE e.id = ? LIMIT 1",
  ).bind(id).first<DbRow>();
}

async function getMailboxPoolRecordById(db: D1Database, id: number) {
  return db.prepare(
    "SELECT mp.id, mp.project_id, mp.environment_id, mp.name, mp.slug, mp.description, mp.is_enabled, mp.created_at, mp.updated_at, COALESCE(p.name, '') as project_name, COALESCE(p.slug, '') as project_slug, COALESCE(e.name, '') as environment_name, COALESCE(e.slug, '') as environment_slug FROM mailbox_pools mp LEFT JOIN projects p ON p.id = mp.project_id LEFT JOIN environments e ON e.id = mp.environment_id WHERE mp.id = ? LIMIT 1",
  ).bind(id).first<DbRow>();
}

export async function getProjectById(db: D1Database, id: number): Promise<WorkspaceProjectRecord | null> {
  const row = await getProjectRecordById(db, id);
  return row ? mapWorkspaceProject({ ...row, environment_count: 0, mailbox_count: 0, mailbox_pool_count: 0 }) : null;
}

export async function getEnvironmentById(db: D1Database, id: number): Promise<WorkspaceEnvironmentRecord | null> {
  const row = await getEnvironmentRecordById(db, id);
  return row ? mapWorkspaceEnvironment({ ...row, mailbox_count: 0, mailbox_pool_count: 0 }) : null;
}

export async function getMailboxPoolById(db: D1Database, id: number): Promise<MailboxPoolRecord | null> {
  const row = await getMailboxPoolRecordById(db, id);
  return row ? mapMailboxPool({ ...row, mailbox_count: 0 }) : null;
}

export async function getEmailProjectIds(db: D1Database, messageId: string): Promise<number[]> {
  const rows = await db.prepare(
    "SELECT DISTINCT project_id FROM email_mailbox_links WHERE email_message_id = ? AND project_id IS NOT NULL ORDER BY project_id ASC",
  ).bind(messageId).all<DbRow>();
  return rows.results
    .map(row => nullableNumberValue(row, "project_id"))
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
}

export async function getWorkspaceCatalog(
  db: D1Database,
  includeDisabled = false,
  allowedProjectIds?: number[] | null,
): Promise<WorkspaceCatalog> {
  const hasScopedProjects = allowedProjectIds !== null && allowedProjectIds !== undefined;
  const normalizedProjectIds = uniquePositiveIds(allowedProjectIds || []);
  const projectClauses: string[] = [];
  const environmentClauses: string[] = [];
  const poolClauses: string[] = [];
  const projectParams: unknown[] = [];
  const environmentParams: unknown[] = [];
  const poolParams: unknown[] = [];

  if (!includeDisabled) {
    projectClauses.push("p.is_enabled = 1");
    environmentClauses.push("e.is_enabled = 1");
    poolClauses.push("mp.is_enabled = 1");
  }

  if (hasScopedProjects && normalizedProjectIds.length === 0) {
    projectClauses.push("1 = 0");
    environmentClauses.push("1 = 0");
    poolClauses.push("1 = 0");
  } else if (normalizedProjectIds.length > 0) {
    const placeholders = buildSqlPlaceholders(normalizedProjectIds.length);
    projectClauses.push(`p.id IN (${placeholders})`);
    environmentClauses.push(`e.project_id IN (${placeholders})`);
    poolClauses.push(`mp.project_id IN (${placeholders})`);
    projectParams.push(...normalizedProjectIds);
    environmentParams.push(...normalizedProjectIds);
    poolParams.push(...normalizedProjectIds);
  }

  const projectWhere = projectClauses.length > 0 ? ` WHERE ${projectClauses.join(" AND ")}` : "";
  const environmentWhere = environmentClauses.length > 0 ? ` WHERE ${environmentClauses.join(" AND ")}` : "";
  const poolWhere = poolClauses.length > 0 ? ` WHERE ${poolClauses.join(" AND ")}` : "";

  const [projectRows, environmentRows, poolRows] = await Promise.all([
    db.prepare(
      `SELECT
        p.id,
        p.name,
        p.slug,
        p.description,
        p.is_enabled,
        p.created_at,
        p.updated_at,
        (SELECT COUNT(1) FROM environments e WHERE e.project_id = p.id) as environment_count,
        (SELECT COUNT(1) FROM mailbox_pools mp WHERE mp.project_id = p.id) as mailbox_pool_count,
        (SELECT COUNT(1) FROM mailboxes m WHERE m.deleted_at IS NULL AND m.project_id = p.id) as mailbox_count
      FROM projects p${projectWhere}
      ORDER BY p.is_enabled DESC, p.name ASC, p.id ASC`,
    ).bind(...projectParams).all<DbRow>(),
    db.prepare(
      `SELECT
        e.id,
        e.project_id,
        e.name,
        e.slug,
        e.description,
        e.is_enabled,
        e.created_at,
        e.updated_at,
        COALESCE(p.name, '') as project_name,
        COALESCE(p.slug, '') as project_slug,
        (SELECT COUNT(1) FROM mailbox_pools mp WHERE mp.environment_id = e.id) as mailbox_pool_count,
        (SELECT COUNT(1) FROM mailboxes m WHERE m.deleted_at IS NULL AND m.environment_id = e.id) as mailbox_count
      FROM environments e
      LEFT JOIN projects p ON p.id = e.project_id${environmentWhere}
      ORDER BY e.is_enabled DESC, project_name ASC, e.name ASC, e.id ASC`,
    ).bind(...environmentParams).all<DbRow>(),
    db.prepare(
      `SELECT
        mp.id,
        mp.project_id,
        mp.environment_id,
        mp.name,
        mp.slug,
        mp.description,
        mp.is_enabled,
        mp.created_at,
        mp.updated_at,
        COALESCE(p.name, '') as project_name,
        COALESCE(p.slug, '') as project_slug,
        COALESCE(e.name, '') as environment_name,
        COALESCE(e.slug, '') as environment_slug,
        (SELECT COUNT(1) FROM mailboxes m WHERE m.deleted_at IS NULL AND m.mailbox_pool_id = mp.id) as mailbox_count
      FROM mailbox_pools mp
      LEFT JOIN projects p ON p.id = mp.project_id
      LEFT JOIN environments e ON e.id = mp.environment_id${poolWhere}
      ORDER BY mp.is_enabled DESC, project_name ASC, environment_name ASC, mp.name ASC, mp.id ASC`,
    ).bind(...poolParams).all<DbRow>(),
  ]);

  return {
    environments: environmentRows.results.map(mapWorkspaceEnvironment),
    mailbox_pools: poolRows.results.map(mapMailboxPool),
    projects: projectRows.results.map(mapWorkspaceProject),
  };
}

export async function validateWorkspaceAssignment(
  db: D1Database,
  input: { environment_id?: number | null; mailbox_pool_id?: number | null; project_id?: number | null },
): Promise<{ environment_id: number | null; mailbox_pool_id: number | null; project_id: number | null }> {
  const project_id = normalizeNullableId(input.project_id);
  const environment_id = normalizeNullableId(input.environment_id);
  const mailbox_pool_id = normalizeNullableId(input.mailbox_pool_id);

  if (!project_id && (environment_id || mailbox_pool_id)) {
    throw new Error("project_id is required when environment or mailbox pool is set");
  }

  if (!environment_id && mailbox_pool_id) {
    throw new Error("environment_id is required when mailbox_pool_id is set");
  }

  if (!project_id) {
    return {
      environment_id: null,
      mailbox_pool_id: null,
      project_id: null,
    };
  }

  const project = await getProjectRecordById(db, project_id);
  if (!project) throw new Error("project not found");

  if (!environment_id) {
    return {
      environment_id: null,
      mailbox_pool_id: null,
      project_id,
    };
  }

  const environment = await getEnvironmentRecordById(db, environment_id);
  if (!environment) throw new Error("environment not found");
  if (numberValue(environment, "project_id") !== project_id) {
    throw new Error("environment does not belong to the selected project");
  }

  if (!mailbox_pool_id) {
    return {
      environment_id,
      mailbox_pool_id: null,
      project_id,
    };
  }

  const mailboxPool = await getMailboxPoolRecordById(db, mailbox_pool_id);
  if (!mailboxPool) throw new Error("mailbox pool not found");
  if (numberValue(mailboxPool, "project_id") !== project_id) {
    throw new Error("mailbox pool does not belong to the selected project");
  }
  if (numberValue(mailboxPool, "environment_id") !== environment_id) {
    throw new Error("mailbox pool does not belong to the selected environment");
  }

  return {
    environment_id,
    mailbox_pool_id,
    project_id,
  };
}

export async function createProject(
  db: D1Database,
  input: { description: string; is_enabled: boolean; name: string; slug: string },
): Promise<void> {
  const now = Date.now();
  await db.prepare(
    "INSERT INTO projects (name, slug, description, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(
    input.name,
    input.slug,
    input.description,
    input.is_enabled ? 1 : 0,
    now,
    now,
  ).run();
}

export async function updateProject(
  db: D1Database,
  id: number,
  input: { description: string; is_enabled: boolean; name: string; slug: string },
): Promise<void> {
  await db.prepare(
    "UPDATE projects SET name = ?, slug = ?, description = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.name,
    input.slug,
    input.description,
    input.is_enabled ? 1 : 0,
    Date.now(),
    id,
  ).run();
}

export async function deleteProject(db: D1Database, id: number): Promise<void> {
  const [environmentCount, poolCount, mailboxCount, linkCount] = await Promise.all([
    db.prepare("SELECT COUNT(1) as total FROM environments WHERE project_id = ?").bind(id).first<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM mailbox_pools WHERE project_id = ?").bind(id).first<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM mailboxes WHERE project_id = ?").bind(id).first<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM email_mailbox_links WHERE project_id = ?").bind(id).first<DbRow>(),
  ]);

  if (
    numberValue(environmentCount || {}, "total", 0) > 0
    || numberValue(poolCount || {}, "total", 0) > 0
    || numberValue(mailboxCount || {}, "total", 0) > 0
    || numberValue(linkCount || {}, "total", 0) > 0
  ) {
    throw new Error("project is in use and cannot be deleted");
  }

  await db.prepare("DELETE FROM projects WHERE id = ?").bind(id).run();
}

export async function createEnvironment(
  db: D1Database,
  input: { description: string; is_enabled: boolean; name: string; project_id: number; slug: string },
): Promise<void> {
  const now = Date.now();
  await db.prepare(
    "INSERT INTO environments (project_id, name, slug, description, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    input.project_id,
    input.name,
    input.slug,
    input.description,
    input.is_enabled ? 1 : 0,
    now,
    now,
  ).run();
}

export async function updateEnvironment(
  db: D1Database,
  id: number,
  input: { description: string; is_enabled: boolean; name: string; project_id: number; slug: string },
): Promise<void> {
  await db.prepare(
    "UPDATE environments SET project_id = ?, name = ?, slug = ?, description = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.project_id,
    input.name,
    input.slug,
    input.description,
    input.is_enabled ? 1 : 0,
    Date.now(),
    id,
  ).run();
}

export async function deleteEnvironment(db: D1Database, id: number): Promise<void> {
  const [poolCount, mailboxCount, linkCount] = await Promise.all([
    db.prepare("SELECT COUNT(1) as total FROM mailbox_pools WHERE environment_id = ?").bind(id).first<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM mailboxes WHERE environment_id = ?").bind(id).first<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM email_mailbox_links WHERE environment_id = ?").bind(id).first<DbRow>(),
  ]);

  if (
    numberValue(poolCount || {}, "total", 0) > 0
    || numberValue(mailboxCount || {}, "total", 0) > 0
    || numberValue(linkCount || {}, "total", 0) > 0
  ) {
    throw new Error("environment is in use and cannot be deleted");
  }

  await db.prepare("DELETE FROM environments WHERE id = ?").bind(id).run();
}

export async function createMailboxPool(
  db: D1Database,
  input: {
    description: string;
    environment_id: number;
    is_enabled: boolean;
    name: string;
    project_id: number;
    slug: string;
  },
): Promise<void> {
  const now = Date.now();
  await db.prepare(
    "INSERT INTO mailbox_pools (project_id, environment_id, name, slug, description, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    input.project_id,
    input.environment_id,
    input.name,
    input.slug,
    input.description,
    input.is_enabled ? 1 : 0,
    now,
    now,
  ).run();
}

export async function updateMailboxPool(
  db: D1Database,
  id: number,
  input: {
    description: string;
    environment_id: number;
    is_enabled: boolean;
    name: string;
    project_id: number;
    slug: string;
  },
): Promise<void> {
  await db.prepare(
    "UPDATE mailbox_pools SET project_id = ?, environment_id = ?, name = ?, slug = ?, description = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.project_id,
    input.environment_id,
    input.name,
    input.slug,
    input.description,
    input.is_enabled ? 1 : 0,
    Date.now(),
    id,
  ).run();
}

export async function deleteMailboxPool(db: D1Database, id: number): Promise<void> {
  const [mailboxCount, linkCount] = await Promise.all([
    db.prepare("SELECT COUNT(1) as total FROM mailboxes WHERE mailbox_pool_id = ?").bind(id).first<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM email_mailbox_links WHERE mailbox_pool_id = ?").bind(id).first<DbRow>(),
  ]);

  if (numberValue(mailboxCount || {}, "total", 0) > 0 || numberValue(linkCount || {}, "total", 0) > 0) {
    throw new Error("mailbox pool is in use and cannot be deleted");
  }

  await db.prepare("DELETE FROM mailbox_pools WHERE id = ?").bind(id).run();
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

export async function getLatestEmail(
  db: D1Database,
  address: string,
  allowedProjectIds?: number[] | null,
): Promise<DbRow | null> {
  const addr = normalizeEmailAddress(address);
  const normalizedProjectIds = uniquePositiveIds(allowedProjectIds || []);

  if (normalizedProjectIds.length > 0) {
    return db.prepare(
      `SELECT message_id, from_address, to_address, subject, extracted_json, received_at, text_body, html_body
      FROM emails
      WHERE deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM email_mailbox_links links
          WHERE links.email_message_id = emails.message_id
            AND links.mailbox_address = ?
            AND links.project_id IN (${buildSqlPlaceholders(normalizedProjectIds.length)})
        )
      ORDER BY received_at DESC
      LIMIT 1`,
    ).bind(addr, ...normalizedProjectIds).first<DbRow>();
  }

  return db.prepare(
    "SELECT message_id, from_address, to_address, subject, extracted_json, received_at, text_body, html_body FROM emails WHERE deleted_at IS NULL AND instr(',' || to_address || ',', ',' || ? || ',') > 0 ORDER BY received_at DESC LIMIT 1",
  ).bind(addr).first<DbRow>();
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
    clauses.push("emails.subject LIKE ?");
    params.push(`%${filters.subject.trim()}%`);
    countParams.push(`%${filters.subject.trim()}%`);
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

  let query =
    "SELECT emails.message_id, emails.from_address, emails.to_address, emails.subject, emails.extracted_json, emails.received_at, emails.text_body, emails.html_body, emails.has_attachments, emails.deleted_at, emails.note, emails.tags, emails.project_id, emails.environment_id, emails.mailbox_pool_id, COALESCE(projects.name, '') as project_name, COALESCE(projects.slug, '') as project_slug, COALESCE(environments.name, '') as environment_name, COALESCE(environments.slug, '') as environment_slug, COALESCE(mailbox_pools.name, '') as mailbox_pool_name, COALESCE(mailbox_pools.slug, '') as mailbox_pool_slug, COALESCE(mailboxes.address, '') as primary_mailbox_address FROM emails LEFT JOIN projects ON projects.id = emails.project_id LEFT JOIN environments ON environments.id = emails.environment_id LEFT JOIN mailbox_pools ON mailbox_pools.id = emails.mailbox_pool_id LEFT JOIN mailboxes ON mailboxes.id = emails.primary_mailbox_id";
  let countQuery = "SELECT COUNT(1) as total FROM emails";

  if (clauses.length > 0) {
    const whereClause = ` WHERE ${clauses.join(" AND ")}`;
    query += whereClause;
    countQuery += whereClause;
  }

  query += " ORDER BY emails.received_at DESC LIMIT ? OFFSET ?";
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
  const [row, attachmentRows] = await Promise.all([
    db.prepare(
      `SELECT emails.message_id, emails.from_address, emails.to_address, emails.subject, emails.extracted_json, emails.received_at, emails.text_body, emails.html_body, emails.raw_headers, emails.has_attachments, emails.deleted_at, emails.note, emails.tags, emails.project_id, emails.environment_id, emails.mailbox_pool_id, COALESCE(projects.name, '') as project_name, COALESCE(projects.slug, '') as project_slug, COALESCE(environments.name, '') as environment_name, COALESCE(environments.slug, '') as environment_slug, COALESCE(mailbox_pools.name, '') as mailbox_pool_name, COALESCE(mailbox_pools.slug, '') as mailbox_pool_slug, COALESCE(mailboxes.address, '') as primary_mailbox_address FROM emails LEFT JOIN projects ON projects.id = emails.project_id LEFT JOIN environments ON environments.id = emails.environment_id LEFT JOIN mailbox_pools ON mailbox_pools.id = emails.mailbox_pool_id LEFT JOIN mailboxes ON mailboxes.id = emails.primary_mailbox_id WHERE emails.message_id = ?${scopedWhere} LIMIT 1`,
    ).bind(String(messageId || ""), ...normalizedAllowedProjectIds).first<DbRow>(),
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

export async function getDomainAssetsPaged(
  db: D1Database,
  page: number,
  pageSize: number,
  allowedProjectIds?: number[] | null,
): Promise<PaginationPayload<DomainAssetRecord>> {
  const offset = (page - 1) * pageSize;
  const scope = buildDomainAssetScopeFilter(allowedProjectIds);
  const [list, countRow] = await Promise.all([
    db.prepare(
      `SELECT ${DOMAIN_ASSET_SELECT_FIELDS}
      FROM domains d
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN environments e ON e.id = d.environment_id${scope.whereClause}
      ORDER BY d.is_primary DESC, d.is_enabled DESC, d.domain ASC
      LIMIT ? OFFSET ?`,
    ).bind(...scope.params, pageSize, offset).all<DbRow>(),
    db.prepare(`SELECT COUNT(1) as total FROM domains d${scope.whereClause}`)
      .bind(...scope.params).first<DbRow>(),
  ]);

  return {
    items: list.results.map(mapDomainAsset),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllDomainAssets(
  db: D1Database,
  includeDisabled = true,
  allowedProjectIds?: number[] | null,
): Promise<DomainAssetRecord[]> {
  const scope = buildDomainAssetScopeFilter(allowedProjectIds);
  const query = includeDisabled
    ? `SELECT ${DOMAIN_ASSET_SELECT_FIELDS}
      FROM domains d
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN environments e ON e.id = d.environment_id${scope.whereClause}
      ORDER BY d.is_primary DESC, d.is_enabled DESC, d.domain ASC`
    : `SELECT ${DOMAIN_ASSET_SELECT_FIELDS}
      FROM domains d
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN environments e ON e.id = d.environment_id${scope.whereClause ? `${scope.whereClause} AND d.is_enabled = 1` : " WHERE d.is_enabled = 1"}
      ORDER BY d.is_primary DESC, d.domain ASC`;
  const rows = await db.prepare(query).bind(...scope.params).all<DbRow>();
  return rows.results.map(mapDomainAsset);
}

export async function getDomainAssetById(db: D1Database, id: number): Promise<DomainAssetRecord | null> {
  const row = await db.prepare(
    `SELECT ${DOMAIN_ASSET_SELECT_FIELDS}
    FROM domains d
    LEFT JOIN projects p ON p.id = d.project_id
    LEFT JOIN environments e ON e.id = d.environment_id
    WHERE d.id = ? LIMIT 1`,
  ).bind(id).first<DbRow>();

  return row ? mapDomainAsset(row) : null;
}

export async function getDomainAssetByName(db: D1Database, domain: string): Promise<DomainAssetRecord | null> {
  const row = await db.prepare(
    `SELECT ${DOMAIN_ASSET_SELECT_FIELDS}
    FROM domains d
    LEFT JOIN projects p ON p.id = d.project_id
    LEFT JOIN environments e ON e.id = d.environment_id
    WHERE d.domain = ? LIMIT 1`,
  ).bind(String(domain || "").trim().toLowerCase()).first<DbRow>();

  return row ? mapDomainAsset(row) : null;
}

export async function getPrimaryDomainAsset(db: D1Database): Promise<DomainAssetRecord | null> {
  const row = await db.prepare(
    `SELECT ${DOMAIN_ASSET_SELECT_FIELDS}
    FROM domains d
    LEFT JOIN projects p ON p.id = d.project_id
    LEFT JOIN environments e ON e.id = d.environment_id
    WHERE d.is_primary = 1 LIMIT 1`,
  ).first<DbRow>();

  return row ? mapDomainAsset(row) : null;
}

export async function createDomainAsset(
  db: D1Database,
  input: {
    catch_all_forward_to: string;
    catch_all_mode: DomainAssetRecord["catch_all_mode"];
    domain: string;
    email_worker: string;
    environment_id: number | null;
    is_enabled: boolean;
    is_primary: boolean;
    note: string;
    provider: string;
    project_id: number | null;
    zone_id: string;
  },
): Promise<number> {
  const now = Date.now();
  if (input.is_primary) {
    await db.prepare("UPDATE domains SET is_primary = 0, updated_at = ? WHERE is_primary = 1").bind(now).run();
  }

  const result = await db.prepare(
    "INSERT INTO domains (domain, provider, zone_id, email_worker, note, is_enabled, is_primary, catch_all_mode, catch_all_forward_to, project_id, environment_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    input.domain,
    input.provider,
    input.zone_id,
    input.email_worker,
    input.note,
    input.is_enabled ? 1 : 0,
    input.is_primary ? 1 : 0,
    input.catch_all_mode,
    input.catch_all_forward_to,
    input.project_id,
    input.environment_id,
    now,
    now,
  ).run() as { meta?: { last_row_id?: number } };

  const insertedId = Number(result?.meta?.last_row_id || 0);
  if (insertedId > 0) return insertedId;

  const row = await db.prepare(
    "SELECT id FROM domains WHERE domain = ? AND created_at = ? LIMIT 1",
  ).bind(input.domain, now).first<DbRow>();
  return numberValue(row || {}, "id", 0);
}

export async function updateDomainAsset(
  db: D1Database,
  id: number,
  input: {
    catch_all_forward_to: string;
    catch_all_mode: DomainAssetRecord["catch_all_mode"];
    domain: string;
    email_worker: string;
    environment_id: number | null;
    is_enabled: boolean;
    is_primary: boolean;
    note: string;
    provider: string;
    project_id: number | null;
    zone_id: string;
  },
): Promise<void> {
  const now = Date.now();
  if (input.is_primary) {
    await db.prepare("UPDATE domains SET is_primary = 0, updated_at = ? WHERE id <> ? AND is_primary = 1").bind(now, id).run();
  }

  await db.prepare(
    "UPDATE domains SET domain = ?, provider = ?, zone_id = ?, email_worker = ?, note = ?, is_enabled = ?, is_primary = ?, catch_all_mode = ?, catch_all_forward_to = ?, project_id = ?, environment_id = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.domain,
    input.provider,
    input.zone_id,
    input.email_worker,
    input.note,
    input.is_enabled ? 1 : 0,
    input.is_primary ? 1 : 0,
    input.catch_all_mode,
    input.catch_all_forward_to,
    input.project_id,
    input.environment_id,
    now,
    id,
  ).run();
}

export async function deleteDomainAsset(db: D1Database, id: number): Promise<void> {
  const existing = await getDomainAssetById(db, id);
  if (!existing) return;

  const [mailboxCount, emailCount] = await Promise.all([
    db.prepare("SELECT COUNT(1) as total FROM mailboxes WHERE deleted_at IS NULL AND lower(address) LIKE ?")
      .bind(`%@${existing.domain}`).first<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM emails WHERE deleted_at IS NULL AND lower(to_address) LIKE ?")
      .bind(`%@${existing.domain}%`).first<DbRow>(),
  ]);

  if (numberValue(mailboxCount || {}, "total", 0) > 0 || numberValue(emailCount || {}, "total", 0) > 0) {
    throw new Error("domain is in use and cannot be deleted");
  }

  await db.prepare("DELETE FROM domains WHERE id = ?").bind(id).run();
}

export async function getAvailableDomains(
  db: D1Database,
  allowedProjectIds?: number[] | null,
): Promise<string[]> {
  const hasScopedProjects = allowedProjectIds !== null && allowedProjectIds !== undefined;
  const normalizedAllowedProjectIds = uniquePositiveIds(allowedProjectIds || []);

  try {
    const configured = await getAllDomainAssets(
      db,
      false,
      hasScopedProjects ? normalizedAllowedProjectIds : null,
    );
    if (configured.length > 0) {
      return configured.map(item => item.domain);
    }
  } catch (error) {
    if (!isSqliteSchemaError(error)) throw error;
  }

  const emailWhere = hasScopedProjects
    ? normalizedAllowedProjectIds.length > 0
      ? ` WHERE deleted_at IS NULL AND EXISTS (
      SELECT 1
      FROM email_mailbox_links links
      WHERE links.email_message_id = emails.message_id
        AND links.project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)})
    )`
      : " WHERE 1 = 0"
    : " WHERE deleted_at IS NULL";
  const mailboxWhere = hasScopedProjects
    ? normalizedAllowedProjectIds.length > 0
      ? ` WHERE deleted_at IS NULL AND project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)})`
      : " WHERE 1 = 0"
    : " WHERE deleted_at IS NULL";

  const [emailResult, mailboxResult] = await Promise.all([
    db.prepare(`SELECT to_address FROM emails${emailWhere}`).bind(...normalizedAllowedProjectIds).all<DbRow>(),
    db.prepare(`SELECT address FROM mailboxes${mailboxWhere}`).bind(...normalizedAllowedProjectIds).all<DbRow>(),
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

export async function getDomainAssetUsageStats(
  db: D1Database,
  domains: string[],
  allowedProjectIds?: number[] | null,
): Promise<Array<{
  active_mailbox_total: number;
  domain: string;
  email_total: number;
  observed_mailbox_total: number;
}>> {
  const normalizedDomains = Array.from(
    new Set(
      (Array.isArray(domains) ? domains : [])
        .map(item => String(item || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  if (normalizedDomains.length === 0) return [];

  const hasScopedProjects = allowedProjectIds !== null && allowedProjectIds !== undefined;
  const normalizedAllowedProjectIds = uniquePositiveIds(allowedProjectIds || []);
  const mailboxWhere = hasScopedProjects
    ? normalizedAllowedProjectIds.length > 0
      ? ` WHERE deleted_at IS NULL AND is_enabled = 1 AND project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)})`
      : " WHERE 1 = 0"
    : " WHERE deleted_at IS NULL AND is_enabled = 1";
  const emailWhere = hasScopedProjects
    ? normalizedAllowedProjectIds.length > 0
      ? ` WHERE deleted_at IS NULL AND EXISTS (
      SELECT 1
      FROM email_mailbox_links links
      WHERE links.email_message_id = emails.message_id
        AND links.project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)})
    )`
      : " WHERE 1 = 0"
    : " WHERE deleted_at IS NULL";

  const [mailboxRows, emailRows] = await Promise.all([
    db.prepare(`SELECT address FROM mailboxes${mailboxWhere}`)
      .bind(...normalizedAllowedProjectIds).all<DbRow>(),
    db.prepare(`SELECT to_address FROM emails${emailWhere}`)
      .bind(...normalizedAllowedProjectIds).all<DbRow>(),
  ]);

  const statsMap = new Map<string, {
    active_mailbox_total: number;
    domain: string;
    email_total: number;
    observed_mailboxes: Set<string>;
  }>();

  for (const domain of normalizedDomains) {
    statsMap.set(domain, {
      active_mailbox_total: 0,
      domain,
      email_total: 0,
      observed_mailboxes: new Set<string>(),
    });
  }

  for (const row of mailboxRows.results) {
    const address = normalizeEmailAddress(row.address);
    const domain = address.split("@")[1] || "";
    const stats = statsMap.get(domain);
    if (!stats) continue;
    stats.active_mailbox_total += 1;
  }

  for (const row of emailRows.results) {
    const domainsInMessage = new Set<string>();
    const addresses = stringValue(row, "to_address")
      .split(",")
      .map(item => normalizeEmailAddress(item))
      .filter(isValidEmailAddress);

    for (const address of addresses) {
      const domain = address.split("@")[1] || "";
      const stats = statsMap.get(domain);
      if (!stats) continue;
      stats.observed_mailboxes.add(address);
      domainsInMessage.add(domain);
    }

    for (const domain of domainsInMessage) {
      const stats = statsMap.get(domain);
      if (!stats) continue;
      stats.email_total += 1;
    }
  }

  return normalizedDomains.map(domain => {
    const stats = statsMap.get(domain)!;
    return {
      active_mailbox_total: stats.active_mailbox_total,
      domain,
      email_total: stats.email_total,
      observed_mailbox_total: stats.observed_mailboxes.size,
    };
  });
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
  filters: {
    environment_id?: number | null;
    includeDeleted?: boolean;
    keyword?: string | null;
    mailbox_pool_id?: number | null;
    project_id?: number | null;
  } = {},
  allowedProjectIds?: number[] | null,
): Promise<PaginationPayload<MailboxRecord>> {
  const offset = (page - 1) * pageSize;
  const clauses: string[] = [];
  const params: unknown[] = [];
  const countParams: unknown[] = [];
  const normalizedAllowedProjectIds = uniquePositiveIds(allowedProjectIds || []);

  if (!filters.includeDeleted) {
    clauses.push("m.deleted_at IS NULL");
  }

  if (normalizedAllowedProjectIds.length > 0) {
    const placeholders = buildSqlPlaceholders(normalizedAllowedProjectIds.length);
    clauses.push(`m.project_id IN (${placeholders})`);
    params.push(...normalizedAllowedProjectIds);
    countParams.push(...normalizedAllowedProjectIds);
  }

  if (filters.keyword) {
    const keyword = `%${String(filters.keyword).trim()}%`;
    clauses.push("(m.address LIKE ? OR m.note LIKE ? OR m.tags LIKE ?)");
    params.push(keyword, keyword, keyword);
    countParams.push(keyword, keyword, keyword);
  }

  const project_id = normalizeNullableId(filters.project_id);
  if (project_id) {
    clauses.push("m.project_id = ?");
    params.push(project_id);
    countParams.push(project_id);
  }

  const environment_id = normalizeNullableId(filters.environment_id);
  if (environment_id) {
    clauses.push("m.environment_id = ?");
    params.push(environment_id);
    countParams.push(environment_id);
  }

  const mailbox_pool_id = normalizeNullableId(filters.mailbox_pool_id);
  if (mailbox_pool_id) {
    clauses.push("m.mailbox_pool_id = ?");
    params.push(mailbox_pool_id);
    countParams.push(mailbox_pool_id);
  }

  const whereClause = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  const [list, countRow] = await Promise.all([
    db.prepare(
      `SELECT
        m.id,
        m.address,
        m.note,
        m.is_enabled,
        m.created_at,
        m.updated_at,
        m.last_received_at,
        m.tags,
        m.expires_at,
        m.deleted_at,
        m.receive_count,
        m.created_by,
        m.project_id,
        m.environment_id,
        m.mailbox_pool_id,
        COALESCE(p.name, '') as project_name,
        COALESCE(p.slug, '') as project_slug,
        COALESCE(e.name, '') as environment_name,
        COALESCE(e.slug, '') as environment_slug,
        COALESCE(mp.name, '') as mailbox_pool_name,
        COALESCE(mp.slug, '') as mailbox_pool_slug
      FROM mailboxes m
      LEFT JOIN projects p ON p.id = m.project_id
      LEFT JOIN environments e ON e.id = m.environment_id
      LEFT JOIN mailbox_pools mp ON mp.id = m.mailbox_pool_id${whereClause}
      ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
    ).bind(...params, pageSize, offset).all<DbRow>(),
    db.prepare(`SELECT COUNT(1) as total FROM mailboxes m${whereClause}`).bind(...countParams).first<DbRow>(),
  ]);

  return {
    items: list.results.map(mapMailbox),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllMailboxes(
  db: D1Database,
  includeDeleted = false,
  allowedProjectIds?: number[] | null,
): Promise<MailboxRecord[]> {
  const normalizedAllowedProjectIds = uniquePositiveIds(allowedProjectIds || []);
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (!includeDeleted) {
    clauses.push("m.deleted_at IS NULL");
  }

  if (normalizedAllowedProjectIds.length > 0) {
    clauses.push(`m.project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)})`);
    params.push(...normalizedAllowedProjectIds);
  }

  const whereClause = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  const result = await db.prepare(
    `SELECT
      m.id,
      m.address,
      m.note,
      m.is_enabled,
      m.created_at,
      m.updated_at,
      m.last_received_at,
      m.tags,
      m.expires_at,
      m.deleted_at,
      m.receive_count,
      m.created_by,
      m.project_id,
      m.environment_id,
      m.mailbox_pool_id,
      COALESCE(p.name, '') as project_name,
      COALESCE(p.slug, '') as project_slug,
      COALESCE(e.name, '') as environment_name,
      COALESCE(e.slug, '') as environment_slug,
      COALESCE(mp.name, '') as mailbox_pool_name,
      COALESCE(mp.slug, '') as mailbox_pool_slug
    FROM mailboxes m
    LEFT JOIN projects p ON p.id = m.project_id
    LEFT JOIN environments e ON e.id = m.environment_id
    LEFT JOIN mailbox_pools mp ON mp.id = m.mailbox_pool_id${whereClause}
    ORDER BY m.created_at DESC`,
  ).bind(...params).all<DbRow>();
  return result.results.map(mapMailbox);
}

export async function getMailboxById(
  db: D1Database,
  id: number,
  allowedProjectIds?: number[] | null,
): Promise<MailboxRecord | null> {
  const normalizedAllowedProjectIds = uniquePositiveIds(allowedProjectIds || []);
  const scopedWhere = normalizedAllowedProjectIds.length > 0
    ? ` AND m.project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)})`
    : "";
  const row = await db.prepare(
    `SELECT m.id, m.address, m.note, m.is_enabled, m.created_at, m.updated_at, m.last_received_at, m.tags, m.expires_at, m.deleted_at, m.receive_count, m.created_by, m.project_id, m.environment_id, m.mailbox_pool_id, COALESCE(p.name, '') as project_name, COALESCE(p.slug, '') as project_slug, COALESCE(e.name, '') as environment_name, COALESCE(e.slug, '') as environment_slug, COALESCE(mp.name, '') as mailbox_pool_name, COALESCE(mp.slug, '') as mailbox_pool_slug FROM mailboxes m LEFT JOIN projects p ON p.id = m.project_id LEFT JOIN environments e ON e.id = m.environment_id LEFT JOIN mailbox_pools mp ON mp.id = m.mailbox_pool_id WHERE m.id = ?${scopedWhere} LIMIT 1`,
  ).bind(id, ...normalizedAllowedProjectIds).first<DbRow>();
  if (!row) return null;
  return mapMailbox(row);
}

export async function backfillMailboxWorkspaceScope(
  db: D1Database,
  mailbox: MailboxRecord,
  addresses: string[] = [mailbox.address],
): Promise<void> {
  const trackedAddresses = Array.from(
    new Set((Array.isArray(addresses) ? addresses : []).map(normalizeEmailAddress).filter(Boolean)),
  );

  if (trackedAddresses.length === 0) return;

  await db.prepare(
    "UPDATE email_mailbox_links SET mailbox_address = ?, project_id = ?, environment_id = ?, mailbox_pool_id = ? WHERE mailbox_id = ?",
  ).bind(
    mailbox.address,
    mailbox.project_id,
    mailbox.environment_id,
    mailbox.mailbox_pool_id,
    mailbox.id,
  ).run();

  await db.prepare(
    "UPDATE emails SET project_id = ?, environment_id = ?, mailbox_pool_id = ? WHERE primary_mailbox_id = ?",
  ).bind(
    mailbox.project_id,
    mailbox.environment_id,
    mailbox.mailbox_pool_id,
    mailbox.id,
  ).run();

  const whereClause = trackedAddresses.map(() => "instr(',' || to_address || ',', ',' || ? || ',') > 0").join(" OR ");
  const emailRows = await db.prepare(
    `SELECT message_id, primary_mailbox_id FROM emails WHERE ${whereClause}`,
  ).bind(...trackedAddresses).all<DbRow>();

  if (emailRows.results.length === 0) return;

  const now = Date.now();
  for (const row of emailRows.results) {
    const messageId = stringValue(row, "message_id");
    if (!messageId) continue;

    await db.prepare(
      "INSERT INTO email_mailbox_links (email_message_id, mailbox_id, mailbox_address, project_id, environment_id, mailbox_pool_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email_message_id, mailbox_id) DO UPDATE SET mailbox_address = excluded.mailbox_address, project_id = excluded.project_id, environment_id = excluded.environment_id, mailbox_pool_id = excluded.mailbox_pool_id",
    ).bind(
      messageId,
      mailbox.id,
      mailbox.address,
      mailbox.project_id,
      mailbox.environment_id,
      mailbox.mailbox_pool_id,
      now,
    ).run();

    if (nullableNumberValue(row, "primary_mailbox_id") === null) {
      await db.prepare(
        "UPDATE emails SET primary_mailbox_id = ?, project_id = ?, environment_id = ?, mailbox_pool_id = ? WHERE message_id = ?",
      ).bind(
        mailbox.id,
        mailbox.project_id,
        mailbox.environment_id,
        mailbox.mailbox_pool_id,
        messageId,
      ).run();
    }
  }
}

export async function createMailbox(
  db: D1Database,
  input: {
    address: string;
    created_by: string;
    environment_id: number | null;
    expires_at: number | null;
    is_enabled: boolean;
    mailbox_pool_id: number | null;
    note: string;
    project_id: number | null;
    tags: string[];
  },
): Promise<MailboxRecord> {
  const now = Date.now();
  const result = await db.prepare(
    "INSERT INTO mailboxes (address, note, is_enabled, created_at, updated_at, last_received_at, tags, expires_at, deleted_at, receive_count, created_by, project_id, environment_id, mailbox_pool_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?)",
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
    input.project_id,
    input.environment_id,
    input.mailbox_pool_id,
  ).run() as { meta?: { last_row_id?: number } };

  const insertedId = Number(result?.meta?.last_row_id || 0);
  const mailbox = insertedId > 0 ? await getMailboxById(db, insertedId) : await db.prepare(
    "SELECT id FROM mailboxes WHERE address = ? ORDER BY id DESC LIMIT 1",
  ).bind(normalizeEmailAddress(input.address)).first<DbRow>().then(row => row ? getMailboxById(db, numberValue(row, "id")) : null);

  if (!mailbox) {
    throw new Error("failed to load newly created mailbox");
  }

  return mailbox;
}

export async function updateMailbox(
  db: D1Database,
  id: number,
  input: {
    address: string;
    environment_id: number | null;
    expires_at: number | null;
    is_enabled: boolean;
    mailbox_pool_id: number | null;
    note: string;
    project_id: number | null;
    tags: string[];
  },
): Promise<MailboxRecord> {
  await db.prepare(
    "UPDATE mailboxes SET address = ?, note = ?, is_enabled = ?, tags = ?, expires_at = ?, project_id = ?, environment_id = ?, mailbox_pool_id = ?, updated_at = ? WHERE id = ?",
  ).bind(
    normalizeEmailAddress(input.address),
    input.note || null,
    input.is_enabled ? 1 : 0,
    jsonStringify(input.tags, "[]"),
    input.expires_at,
    input.project_id,
    input.environment_id,
    input.mailbox_pool_id,
    Date.now(),
    id,
  ).run();

  const mailbox = await getMailboxById(db, id);
  if (!mailbox) {
    throw new Error("mailbox not found");
  }

  return mailbox;
}

export async function deleteMailbox(db: D1Database, id: number): Promise<void> {
  await db.prepare("UPDATE mailboxes SET deleted_at = ?, is_enabled = 0, updated_at = ? WHERE id = ?")
    .bind(Date.now(), Date.now(), id).run();
}

export async function getObservedMailboxStats(
  db: D1Database,
  mailboxDomains: string[] | string = "",
): Promise<Array<{ address: string; last_received_at: number | null; receive_count: number }>> {
  const result = await db.prepare(
    "SELECT to_address, received_at FROM emails WHERE deleted_at IS NULL ORDER BY received_at DESC",
  ).all<DbRow>();

  const normalizedDomains = Array.from(
    new Set(
      (Array.isArray(mailboxDomains) ? mailboxDomains : [mailboxDomains])
        .map(item => String(item || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  const addresses = new Map<string, { address: string; last_received_at: number | null; receive_count: number }>();

  for (const row of result.results) {
    const receivedAt = numberValue(row, "received_at", 0);
    const rawAddresses = stringValue(row, "to_address")
      .split(",")
      .map(item => normalizeEmailAddress(item))
      .filter(isValidEmailAddress);

    for (const address of rawAddresses) {
      if (
        normalizedDomains.length > 0
        && !normalizedDomains.some(domain => address.endsWith(`@${domain}`))
      ) {
        continue;
      }

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
      "INSERT INTO mailboxes (address, note, is_enabled, created_at, updated_at, last_received_at, tags, expires_at, deleted_at, receive_count, created_by, project_id, environment_id, mailbox_pool_id) VALUES (?, NULL, ?, ?, ?, ?, '[]', NULL, NULL, ?, ?, NULL, NULL, NULL)",
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
    "SELECT m.id, m.address, m.note, m.is_enabled, m.created_at, m.updated_at, m.last_received_at, m.tags, m.expires_at, m.deleted_at, m.receive_count, m.created_by, m.project_id, m.environment_id, m.mailbox_pool_id, COALESCE(p.name, '') as project_name, COALESCE(p.slug, '') as project_slug, COALESCE(e.name, '') as environment_name, COALESCE(e.slug, '') as environment_slug, COALESCE(mp.name, '') as mailbox_pool_name, COALESCE(mp.slug, '') as mailbox_pool_slug FROM mailboxes m LEFT JOIN projects p ON p.id = m.project_id LEFT JOIN environments e ON e.id = m.environment_id LEFT JOIN mailbox_pools mp ON mp.id = m.mailbox_pool_id WHERE m.deleted_at IS NULL AND m.is_enabled = 1 AND m.expires_at IS NOT NULL AND m.expires_at <= ?",
  ).bind(now).all<DbRow>();

  if (expired.results.length === 0) return [];

  await db.prepare(
    "UPDATE mailboxes SET is_enabled = 0, updated_at = ? WHERE deleted_at IS NULL AND is_enabled = 1 AND expires_at IS NOT NULL AND expires_at <= ?",
  ).bind(now, now).run();

  return expired.results.map(mapMailbox);
}

async function replaceProjectBindings(
  db: D1Database,
  tableName: "admin_project_bindings" | "api_token_project_bindings" | "notification_endpoint_project_bindings",
  idColumn: "admin_id" | "api_token_id" | "notification_endpoint_id",
  id: string | number,
  projectIds: number[],
): Promise<void> {
  await db.prepare(`DELETE FROM ${tableName} WHERE ${idColumn} = ?`).bind(id).run();

  const normalizedProjectIds = uniquePositiveIds(projectIds);
  if (normalizedProjectIds.length === 0) return;

  const now = Date.now();
  for (const projectId of normalizedProjectIds) {
    await db.prepare(
      `INSERT INTO ${tableName} (${idColumn}, project_id, created_at) VALUES (?, ?, ?)`,
    ).bind(id, projectId, now).run();
  }
}

export async function findAdminUserByUsername(
  db: D1Database,
  username: string,
): Promise<(AdminUserRecord & { password_hash: string; password_salt: string }) | null> {
  const row = await db.prepare(
    "SELECT id, username, display_name, role, access_scope, password_hash, password_salt, is_enabled, created_at, updated_at, last_login_at FROM admin_users WHERE username = ? LIMIT 1",
  ).bind(username).first<DbRow>();

  if (!row) return null;
  const base = mapAdminUser(row);
  const projectBindings = await getProjectBindingsMap(db, "admin_project_bindings", "admin_id", [base.id]);
  return {
    ...base,
    password_hash: stringValue(row, "password_hash"),
    password_salt: stringValue(row, "password_salt"),
    projects: projectBindings.get(base.id) || [],
  };
}

export async function getAdminAccessContext(
  db: D1Database,
  adminId: string,
): Promise<{
  access_scope: AccessScope;
  display_name: string;
  is_enabled: boolean;
  project_ids: number[];
  role: AdminRole;
  username: string;
} | null> {
  const row = await db.prepare(
    "SELECT id, username, display_name, role, access_scope, is_enabled FROM admin_users WHERE id = ? LIMIT 1",
  ).bind(adminId).first<DbRow>();

  if (!row) return null;

  const bindings = await getProjectBindingsMap(db, "admin_project_bindings", "admin_id", [adminId]);
  return {
    access_scope: normalizeAccessScope(row.access_scope),
    display_name: stringValue(row, "display_name"),
    is_enabled: boolValue(row, "is_enabled", true),
    project_ids: (bindings.get(String(adminId)) || []).map(item => item.id),
    role: stringValue(row, "role", "analyst") as AdminRole,
    username: stringValue(row, "username"),
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
      "SELECT id, username, display_name, role, access_scope, is_enabled, created_at, updated_at, last_login_at FROM admin_users ORDER BY created_at DESC LIMIT ? OFFSET ?",
    ).bind(pageSize, offset).all<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM admin_users").first<DbRow>(),
  ]);

  const items = list.results.map(mapAdminUser);
  const projectBindings = await getProjectBindingsMap(db, "admin_project_bindings", "admin_id", items.map(item => item.id));

  return {
    items: items.map(item => ({ ...item, projects: projectBindings.get(item.id) || [] })),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllAdminUsers(db: D1Database): Promise<AdminUserRecord[]> {
  const result = await db.prepare(
    "SELECT id, username, display_name, role, access_scope, is_enabled, created_at, updated_at, last_login_at FROM admin_users ORDER BY created_at DESC",
  ).all<DbRow>();
  const items = result.results.map(mapAdminUser);
  const projectBindings = await getProjectBindingsMap(db, "admin_project_bindings", "admin_id", items.map(item => item.id));
  return items.map(item => ({ ...item, projects: projectBindings.get(item.id) || [] }));
}

export async function createAdminUser(
  db: D1Database,
  input: {
    access_scope: AccessScope;
    display_name: string;
    is_enabled: boolean;
    password_hash: string;
    password_salt: string;
    project_ids: number[];
    role: AdminRole;
    username: string;
  },
): Promise<AdminUserRecord> {
  const now = Date.now();
  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO admin_users (id, username, display_name, role, access_scope, password_hash, password_salt, is_enabled, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)",
  ).bind(
    id,
    input.username,
    input.display_name,
    input.role,
    input.access_scope,
    input.password_hash,
    input.password_salt,
    input.is_enabled ? 1 : 0,
    now,
    now,
  ).run();

  await replaceProjectBindings(db, "admin_project_bindings", "admin_id", id, input.access_scope === "bound" ? input.project_ids : []);

  return {
    access_scope: input.access_scope,
    created_at: now,
    display_name: input.display_name,
    id,
    is_enabled: input.is_enabled,
    last_login_at: null,
    projects: (await getProjectBindingsMap(db, "admin_project_bindings", "admin_id", [id])).get(id) || [],
    role: input.role,
    updated_at: now,
    username: input.username,
  };
}

export async function updateAdminUser(
  db: D1Database,
  id: string,
  input: {
    access_scope: AccessScope;
    display_name: string;
    is_enabled: boolean;
    password_hash?: string;
    password_salt?: string;
    project_ids: number[];
    role: AdminRole;
  },
): Promise<void> {
  if (input.password_hash && input.password_salt) {
    await db.prepare(
      "UPDATE admin_users SET display_name = ?, role = ?, access_scope = ?, is_enabled = ?, password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?",
    ).bind(
      input.display_name,
      input.role,
      input.access_scope,
      input.is_enabled ? 1 : 0,
      input.password_hash,
      input.password_salt,
      Date.now(),
      id,
    ).run();
  } else {
    await db.prepare(
      "UPDATE admin_users SET display_name = ?, role = ?, access_scope = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
    ).bind(input.display_name, input.role, input.access_scope, input.is_enabled ? 1 : 0, Date.now(), id).run();
  }

  await replaceProjectBindings(db, "admin_project_bindings", "admin_id", id, input.access_scope === "bound" ? input.project_ids : []);
}

export async function touchAdminUserLogin(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE admin_users SET last_login_at = ?, updated_at = ? WHERE id = ?")
    .bind(Date.now(), Date.now(), id).run();
}

export async function getNotificationEndpointsPaged(
  db: D1Database,
  page: number,
  pageSize: number,
  allowedProjectIds?: number[] | null,
): Promise<PaginationPayload<NotificationEndpointRecord>> {
  const offset = (page - 1) * pageSize;
  const normalizedProjectIds = uniquePositiveIds(allowedProjectIds || []);
  const clauses: string[] = [];
  const params: unknown[] = [];
  const countParams: unknown[] = [];

  if (normalizedProjectIds.length > 0) {
    const placeholders = buildSqlPlaceholders(normalizedProjectIds.length);
    clauses.push("n.access_scope = 'bound'");
    clauses.push(
      `EXISTS (SELECT 1 FROM notification_endpoint_project_bindings bindings WHERE bindings.notification_endpoint_id = n.id AND bindings.project_id IN (${placeholders}))`,
    );
    params.push(...normalizedProjectIds);
    countParams.push(...normalizedProjectIds);
  }

  const whereClause = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  const [list, countRow] = await Promise.all([
    db.prepare(
      `SELECT id, name, type, target, secret, events, access_scope, is_enabled, created_at, updated_at, last_status, last_error, last_sent_at FROM notification_endpoints n${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).bind(...params, pageSize, offset).all<DbRow>(),
    db.prepare(`SELECT COUNT(1) as total FROM notification_endpoints n${whereClause}`).bind(...countParams).first<DbRow>(),
  ]);

  const items = list.results.map(mapNotification);
  const projectBindings = await getProjectBindingsMap(
    db,
    "notification_endpoint_project_bindings",
    "notification_endpoint_id",
    items.map(item => item.id),
  );

  return {
    items: items.map(item => ({ ...item, projects: projectBindings.get(String(item.id)) || [] })),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllNotificationEndpoints(db: D1Database): Promise<NotificationEndpointRecord[]> {
  const result = await db.prepare(
    "SELECT id, name, type, target, secret, events, access_scope, is_enabled, created_at, updated_at, last_status, last_error, last_sent_at FROM notification_endpoints ORDER BY created_at DESC",
  ).all<DbRow>();
  const items = result.results.map(mapNotification);
  const projectBindings = await getProjectBindingsMap(
    db,
    "notification_endpoint_project_bindings",
    "notification_endpoint_id",
    items.map(item => item.id),
  );
  return items.map(item => ({ ...item, projects: projectBindings.get(String(item.id)) || [] }));
}

export async function getNotificationEndpointById(
  db: D1Database,
  id: number,
): Promise<NotificationEndpointRecord | null> {
  const row = await db.prepare(
    "SELECT id, name, type, target, secret, events, access_scope, is_enabled, created_at, updated_at, last_status, last_error, last_sent_at FROM notification_endpoints WHERE id = ? LIMIT 1",
  ).bind(id).first<DbRow>();

  if (!row) return null;
  const base = mapNotification(row);
  const projectBindings = await getProjectBindingsMap(
    db,
    "notification_endpoint_project_bindings",
    "notification_endpoint_id",
    [id],
  );
  return { ...base, projects: projectBindings.get(String(id)) || [] };
}

export async function createNotificationEndpoint(
  db: D1Database,
  input: {
    access_scope: AccessScope;
    events: string[];
    is_enabled: boolean;
    name: string;
    project_ids: number[];
    secret: string;
    target: string;
    type: string;
  },
): Promise<number> {
  const now = Date.now();
  const result = await db.prepare(
    "INSERT INTO notification_endpoints (name, type, target, secret, events, access_scope, is_enabled, created_at, updated_at, last_status, last_error, last_sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', NULL)",
  ).bind(
    input.name,
    input.type,
    input.target,
    input.secret || null,
    jsonStringify(input.events, "[]"),
    input.access_scope,
    input.is_enabled ? 1 : 0,
    now,
    now,
  ).run() as { meta?: { last_row_id?: number } };

  const insertedId = Number(result?.meta?.last_row_id || 0);
  const row = insertedId > 0
    ? { id: insertedId }
    : await db.prepare(
        "SELECT id FROM notification_endpoints WHERE name = ? AND target = ? AND created_at = ? ORDER BY id DESC LIMIT 1",
      ).bind(input.name, input.target, now).first<DbRow>();
  const id = numberValue(row || {}, "id", 0);
  if (id > 0) {
    await replaceProjectBindings(
      db,
      "notification_endpoint_project_bindings",
      "notification_endpoint_id",
      id,
      input.access_scope === "bound" ? input.project_ids : [],
    );
  }

  return id;
}

export async function updateNotificationEndpoint(
  db: D1Database,
  id: number,
  input: {
    access_scope: AccessScope;
    events: string[];
    is_enabled: boolean;
    name: string;
    project_ids: number[];
    secret: string;
    target: string;
    type: string;
  },
): Promise<void> {
  await db.prepare(
    "UPDATE notification_endpoints SET name = ?, type = ?, target = ?, secret = ?, events = ?, access_scope = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.name,
    input.type,
    input.target,
    input.secret || null,
    jsonStringify(input.events, "[]"),
    input.access_scope,
    input.is_enabled ? 1 : 0,
    Date.now(),
    id,
  ).run();

  await replaceProjectBindings(
    db,
    "notification_endpoint_project_bindings",
    "notification_endpoint_id",
    id,
    input.access_scope === "bound" ? input.project_ids : [],
  );
}

export async function createNotificationDeliveryRecord(
  db: D1Database,
  input: {
    event: string;
    max_attempts?: number;
    notification_endpoint_id: number;
    payload: JsonValue;
    scope: NotificationDeliveryScope;
    status?: NotificationDeliveryStatus;
  },
): Promise<NotificationDeliveryRecord> {
  const now = Date.now();
  const result = await db.prepare(
    "INSERT INTO notification_deliveries (notification_endpoint_id, event, payload_json, scope_json, status, attempt_count, max_attempts, last_error, response_status, next_retry_at, last_attempt_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, '', NULL, ?, NULL, ?, ?)",
  ).bind(
    input.notification_endpoint_id,
    input.event,
    jsonStringify(input.payload, "{}"),
    jsonStringify(input.scope as JsonValue, "{}"),
    input.status || "pending",
    input.max_attempts || 4,
    now,
    now,
    now,
  ).run() as { meta?: { last_row_id?: number } };

  const insertedId = Number(result?.meta?.last_row_id || 0);
  const row = insertedId > 0
    ? await db.prepare(
        "SELECT id, notification_endpoint_id, event, payload_json, scope_json, status, attempt_count, max_attempts, last_error, response_status, next_retry_at, last_attempt_at, created_at, updated_at FROM notification_deliveries WHERE id = ? LIMIT 1",
      ).bind(insertedId).first<DbRow>()
    : await db.prepare(
        "SELECT id, notification_endpoint_id, event, payload_json, scope_json, status, attempt_count, max_attempts, last_error, response_status, next_retry_at, last_attempt_at, created_at, updated_at FROM notification_deliveries WHERE notification_endpoint_id = ? AND event = ? AND created_at = ? ORDER BY id DESC LIMIT 1",
      ).bind(input.notification_endpoint_id, input.event, now).first<DbRow>();

  if (!row) {
    throw new Error("notification delivery could not be created");
  }

  return mapNotificationDelivery(row);
}

export async function getNotificationDeliveriesPaged(
  db: D1Database,
  page: number,
  pageSize: number,
  notification_endpoint_id: number,
): Promise<PaginationPayload<NotificationDeliveryRecord>> {
  const offset = (page - 1) * pageSize;
  const [list, countRow] = await Promise.all([
    db.prepare(
      "SELECT id, notification_endpoint_id, event, payload_json, scope_json, status, attempt_count, max_attempts, last_error, response_status, next_retry_at, last_attempt_at, created_at, updated_at FROM notification_deliveries WHERE notification_endpoint_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
    ).bind(notification_endpoint_id, pageSize, offset).all<DbRow>(),
    db.prepare(
      "SELECT COUNT(1) as total FROM notification_deliveries WHERE notification_endpoint_id = ?",
    ).bind(notification_endpoint_id).first<DbRow>(),
  ]);

  return {
    items: list.results.map(mapNotificationDelivery),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getNotificationDeliveryById(
  db: D1Database,
  id: number,
): Promise<NotificationDeliveryRecord | null> {
  const row = await db.prepare(
    "SELECT id, notification_endpoint_id, event, payload_json, scope_json, status, attempt_count, max_attempts, last_error, response_status, next_retry_at, last_attempt_at, created_at, updated_at FROM notification_deliveries WHERE id = ? LIMIT 1",
  ).bind(id).first<DbRow>();

  return row ? mapNotificationDelivery(row) : null;
}

export async function getDueNotificationDeliveries(
  db: D1Database,
  limit = 20,
): Promise<NotificationDeliveryRecord[]> {
  const rows = await db.prepare(
    "SELECT id, notification_endpoint_id, event, payload_json, scope_json, status, attempt_count, max_attempts, last_error, response_status, next_retry_at, last_attempt_at, created_at, updated_at FROM notification_deliveries WHERE status IN ('pending', 'retrying') AND next_retry_at IS NOT NULL AND next_retry_at <= ? ORDER BY next_retry_at ASC, id ASC LIMIT ?",
  ).bind(Date.now(), limit).all<DbRow>();

  return rows.results.map(mapNotificationDelivery);
}

export async function updateNotificationDeliveryRecord(
  db: D1Database,
  id: number,
  input: {
    attempt_count: number;
    last_attempt_at: number | null;
    last_error: string;
    next_retry_at: number | null;
    response_status: number | null;
    status: NotificationDeliveryStatus;
  },
): Promise<void> {
  await db.prepare(
    "UPDATE notification_deliveries SET status = ?, attempt_count = ?, last_error = ?, response_status = ?, next_retry_at = ?, last_attempt_at = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.status,
    input.attempt_count,
    input.last_error,
    input.response_status,
    input.next_retry_at,
    input.last_attempt_at,
    Date.now(),
    id,
  ).run();
}

export async function deleteNotificationEndpoint(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM notification_deliveries WHERE notification_endpoint_id = ?").bind(id).run();
  await db.prepare("DELETE FROM notification_endpoint_project_bindings WHERE notification_endpoint_id = ?").bind(id).run();
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

export async function getApiTokensPaged(
  db: D1Database,
  page: number,
  pageSize: number,
  allowedProjectIds?: number[] | null,
): Promise<PaginationPayload<ApiTokenRecord>> {
  const offset = (page - 1) * pageSize;
  const normalizedProjectIds = uniquePositiveIds(allowedProjectIds || []);
  const clauses: string[] = [];
  const params: unknown[] = [];
  const countParams: unknown[] = [];

  if (normalizedProjectIds.length > 0) {
    const placeholders = buildSqlPlaceholders(normalizedProjectIds.length);
    clauses.push("t.access_scope = 'bound'");
    clauses.push(
      `EXISTS (SELECT 1 FROM api_token_project_bindings bindings WHERE bindings.api_token_id = t.id AND bindings.project_id IN (${placeholders}))`,
    );
    params.push(...normalizedProjectIds);
    countParams.push(...normalizedProjectIds);
  }

  const whereClause = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  const [list, countRow] = await Promise.all([
    db.prepare(
      `SELECT id, name, description, token_prefix, permissions_json, access_scope, is_enabled, created_by, last_used_at, expires_at, created_at, updated_at FROM api_tokens t${whereClause} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    ).bind(...params, pageSize, offset).all<DbRow>(),
    db.prepare(`SELECT COUNT(1) as total FROM api_tokens t${whereClause}`).bind(...countParams).first<DbRow>(),
  ]);

  const items = list.results.map(mapApiToken);
  const projectBindings = await getProjectBindingsMap(db, "api_token_project_bindings", "api_token_id", items.map(item => item.id));

  return {
    items: items.map(item => ({ ...item, projects: projectBindings.get(item.id) || [] })),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllApiTokens(db: D1Database): Promise<ApiTokenRecord[]> {
  const result = await db.prepare(
    "SELECT id, name, description, token_prefix, permissions_json, access_scope, is_enabled, created_by, last_used_at, expires_at, created_at, updated_at FROM api_tokens ORDER BY updated_at DESC",
  ).all<DbRow>();
  const items = result.results.map(mapApiToken);
  const projectBindings = await getProjectBindingsMap(db, "api_token_project_bindings", "api_token_id", items.map(item => item.id));
  return items.map(item => ({ ...item, projects: projectBindings.get(item.id) || [] }));
}

export async function getApiTokenById(db: D1Database, id: string): Promise<ApiTokenRecord | null> {
  const row = await db.prepare(
    "SELECT id, name, description, token_prefix, permissions_json, access_scope, is_enabled, created_by, last_used_at, expires_at, created_at, updated_at FROM api_tokens WHERE id = ? LIMIT 1",
  ).bind(id).first<DbRow>();

  if (!row) return null;
  const base = mapApiToken(row);
  const projectBindings = await getProjectBindingsMap(db, "api_token_project_bindings", "api_token_id", [id]);
  return {
    ...base,
    projects: projectBindings.get(id) || [],
  };
}

export async function getActiveApiTokenById(
  db: D1Database,
  id: string,
): Promise<(ApiTokenRecord & { token_hash: string }) | null> {
  const row = await db.prepare(
    "SELECT id, name, description, token_prefix, token_hash, permissions_json, access_scope, is_enabled, created_by, last_used_at, expires_at, created_at, updated_at FROM api_tokens WHERE id = ? AND is_enabled = 1 AND (expires_at IS NULL OR expires_at > ?) LIMIT 1",
  ).bind(id, Date.now()).first<DbRow>();

  if (!row) return null;
  const base = mapApiToken(row);
  const projectBindings = await getProjectBindingsMap(db, "api_token_project_bindings", "api_token_id", [id]);
  return {
    ...base,
    projects: projectBindings.get(id) || [],
    token_hash: stringValue(row, "token_hash"),
  };
}

export async function createApiToken(
  db: D1Database,
  input: {
    access_scope: AccessScope;
    created_by: string;
    description: string;
    expires_at: number | null;
    id?: string;
    is_enabled: boolean;
    name: string;
    permissions: ApiTokenPermission[];
    project_ids: number[];
    token_hash: string;
    token_prefix: string;
  },
): Promise<ApiTokenRecord> {
  const now = Date.now();
  const id = String(input.id || crypto.randomUUID());
  await db.prepare(
    "INSERT INTO api_tokens (id, name, description, token_prefix, token_hash, permissions_json, access_scope, is_enabled, created_by, last_used_at, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)",
  ).bind(
    id,
    input.name,
    input.description,
    input.token_prefix,
    input.token_hash,
    jsonStringify(input.permissions, "[]"),
    input.access_scope,
    input.is_enabled ? 1 : 0,
    input.created_by,
    input.expires_at,
    now,
    now,
  ).run();

  await replaceProjectBindings(db, "api_token_project_bindings", "api_token_id", id, input.access_scope === "bound" ? input.project_ids : []);

  return {
    access_scope: input.access_scope,
    created_at: now,
    created_by: input.created_by,
    description: input.description,
    expires_at: input.expires_at,
    id,
    is_enabled: input.is_enabled,
    last_used_at: null,
    name: input.name,
    permissions: [...input.permissions],
    projects: (await getProjectBindingsMap(db, "api_token_project_bindings", "api_token_id", [id])).get(id) || [],
    token_prefix: input.token_prefix,
    token_preview: `${input.token_prefix}...`,
    updated_at: now,
  };
}

export async function updateApiToken(
  db: D1Database,
  id: string,
  input: {
    access_scope: AccessScope;
    description: string;
    expires_at: number | null;
    is_enabled: boolean;
    name: string;
    permissions: ApiTokenPermission[];
    project_ids: number[];
  },
): Promise<void> {
  await db.prepare(
    "UPDATE api_tokens SET name = ?, description = ?, permissions_json = ?, access_scope = ?, is_enabled = ?, expires_at = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.name,
    input.description,
    jsonStringify(input.permissions, "[]"),
    input.access_scope,
    input.is_enabled ? 1 : 0,
    input.expires_at,
    Date.now(),
    id,
  ).run();

  await replaceProjectBindings(db, "api_token_project_bindings", "api_token_id", id, input.access_scope === "bound" ? input.project_ids : []);
}

export async function deleteApiToken(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM api_token_project_bindings WHERE api_token_id = ?").bind(id).run();
  await db.prepare("DELETE FROM api_tokens WHERE id = ?").bind(id).run();
}

export async function touchApiTokenLastUsed(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE api_tokens SET last_used_at = ?, updated_at = ? WHERE id = ?")
    .bind(Date.now(), Date.now(), id).run();
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

export async function getOverviewStats(
  db: D1Database,
  allowedProjectIds?: number[] | null,
): Promise<OverviewStats> {
  const normalizedAllowedProjectIds = uniquePositiveIds(allowedProjectIds || []);
  const emailScopeWhere = normalizedAllowedProjectIds.length > 0
    ? ` WHERE EXISTS (
      SELECT 1
      FROM email_mailbox_links links
      WHERE links.email_message_id = emails.message_id
        AND links.project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)})
    )`
    : "";
  const activeMailboxWhere = normalizedAllowedProjectIds.length > 0
    ? ` WHERE deleted_at IS NULL AND is_enabled = 1 AND project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)})`
    : " WHERE deleted_at IS NULL AND is_enabled = 1";
  const projectWhere = normalizedAllowedProjectIds.length > 0
    ? ` WHERE id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)})`
    : "";
  const environmentWhere = normalizedAllowedProjectIds.length > 0
    ? ` WHERE project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)})`
    : "";
  const mailboxPoolWhere = normalizedAllowedProjectIds.length > 0
    ? ` WHERE project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)})`
    : "";

  const [
    emailTotalRow,
    deletedEmailTotalRow,
    matchedTotalRow,
    attachmentTotalRow,
    activeMailboxTotalRow,
    projectTotalRow,
    environmentTotalRow,
    mailboxPoolTotalRow,
    errorTotalRow,
    topSenderRows,
    topDomainRows,
    dailyRows,
  ] = await Promise.all([
    db.prepare(`SELECT COUNT(1) as total FROM emails${emailScopeWhere}${emailScopeWhere ? " AND" : " WHERE"} deleted_at IS NULL`)
      .bind(...normalizedAllowedProjectIds).first<DbRow>(),
    db.prepare(`SELECT COUNT(1) as total FROM emails${emailScopeWhere}${emailScopeWhere ? " AND" : " WHERE"} deleted_at IS NOT NULL`)
      .bind(...normalizedAllowedProjectIds).first<DbRow>(),
    db.prepare(`SELECT COUNT(1) as total FROM emails${emailScopeWhere}${emailScopeWhere ? " AND" : " WHERE"} deleted_at IS NULL AND extracted_json <> '[]'`)
      .bind(...normalizedAllowedProjectIds).first<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM email_attachments").first<DbRow>(),
    db.prepare(`SELECT COUNT(1) as total FROM mailboxes${activeMailboxWhere}`)
      .bind(...normalizedAllowedProjectIds).first<DbRow>(),
    db.prepare(`SELECT COUNT(1) as total FROM projects${projectWhere}`)
      .bind(...normalizedAllowedProjectIds).first<DbRow>(),
    db.prepare(`SELECT COUNT(1) as total FROM environments${environmentWhere}`)
      .bind(...normalizedAllowedProjectIds).first<DbRow>(),
    db.prepare(`SELECT COUNT(1) as total FROM mailbox_pools${mailboxPoolWhere}`)
      .bind(...normalizedAllowedProjectIds).first<DbRow>(),
    normalizedAllowedProjectIds.length > 0
      ? Promise.resolve({ total: 0 } as DbRow)
      : db.prepare("SELECT COUNT(1) as total FROM error_events").first<DbRow>(),
    db.prepare(
      `SELECT from_address as label, COUNT(1) as total FROM emails${emailScopeWhere}${emailScopeWhere ? " AND" : " WHERE"} deleted_at IS NULL GROUP BY from_address ORDER BY total DESC LIMIT 5`,
    ).bind(...normalizedAllowedProjectIds).all<DbRow>(),
    db.prepare(
      `SELECT substr(from_address, instr(from_address, '@') + 1) as label, COUNT(1) as total FROM emails${emailScopeWhere}${emailScopeWhere ? " AND" : " WHERE"} deleted_at IS NULL AND instr(from_address, '@') > 0 GROUP BY label ORDER BY total DESC LIMIT 5`,
    ).bind(...normalizedAllowedProjectIds).all<DbRow>(),
    db.prepare(
      `SELECT strftime('%Y-%m-%d', received_at / 1000, 'unixepoch') as day, COUNT(1) as total FROM emails${emailScopeWhere}${emailScopeWhere ? " AND" : " WHERE"} deleted_at IS NULL AND received_at >= ? GROUP BY day ORDER BY day ASC`,
    ).bind(...normalizedAllowedProjectIds, Date.now() - 7 * 24 * 60 * 60 * 1000).all<DbRow>(),
  ]);

  return {
    active_mailboxes: numberValue(activeMailboxTotalRow || {}, "total", 0),
    attachment_total: numberValue(attachmentTotalRow || {}, "total", 0),
    deleted_email_total: numberValue(deletedEmailTotalRow || {}, "total", 0),
    email_total: numberValue(emailTotalRow || {}, "total", 0),
    environment_total: numberValue(environmentTotalRow || {}, "total", 0),
    error_total: numberValue(errorTotalRow || {}, "total", 0),
    mailbox_pool_total: numberValue(mailboxPoolTotalRow || {}, "total", 0),
    matched_email_total: numberValue(matchedTotalRow || {}, "total", 0),
    project_total: numberValue(projectTotalRow || {}, "total", 0),
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

async function findManagedMailboxContextsByAddresses(db: D1Database, addresses: string[]) {
  const normalizedAddresses = Array.from(
    new Set((Array.isArray(addresses) ? addresses : []).map(normalizeEmailAddress).filter(Boolean)),
  );

  if (normalizedAddresses.length === 0) return [];

  const placeholders = normalizedAddresses.map(() => "?").join(", ");
  const rows = await db.prepare(
    `SELECT
      m.id as mailbox_id,
      m.address as mailbox_address,
      m.project_id,
      m.environment_id,
      m.mailbox_pool_id
    FROM mailboxes m
    WHERE m.deleted_at IS NULL AND m.address IN (${placeholders})
    ORDER BY m.id ASC`,
  ).bind(...normalizedAddresses).all<DbRow>();

  const contexts = new Map<string, {
    environment_id: number | null;
    mailbox_address: string;
    mailbox_id: number;
    mailbox_pool_id: number | null;
    project_id: number | null;
  }>();

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

  await db.prepare(
    "INSERT INTO emails (message_id, from_address, to_address, subject, extracted_json, received_at, text_body, html_body, raw_headers, has_attachments, size_bytes, deleted_at, deleted_by, matched_rule_ids, primary_mailbox_id, project_id, environment_id, mailbox_pool_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)",
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
    primaryMailbox?.mailbox_id || null,
    primaryMailbox?.project_id || null,
    primaryMailbox?.environment_id || null,
    primaryMailbox?.mailbox_pool_id || null,
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

  for (const mailbox of mailboxContexts) {
    await db.prepare(
      "INSERT INTO email_mailbox_links (email_message_id, mailbox_id, mailbox_address, project_id, environment_id, mailbox_pool_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email_message_id, mailbox_id) DO UPDATE SET mailbox_address = excluded.mailbox_address, project_id = excluded.project_id, environment_id = excluded.environment_id, mailbox_pool_id = excluded.mailbox_pool_id",
    ).bind(
      messageId,
      mailbox.mailbox_id,
      mailbox.mailbox_address,
      mailbox.project_id,
      mailbox.environment_id,
      mailbox.mailbox_pool_id,
      receivedAt,
    ).run();
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
  allowedProjectIds?: number[] | null,
): Promise<ExportRow[]> {
  if (resource === "emails") {
    const result = await getEmails(db, 1, 10_000, { deleted: "exclude" }, allowedProjectIds);
    return result.items.map(item => toExportRow(item));
  }
  if (resource === "trash") {
    const result = await getEmails(db, 1, 10_000, { deleted: "only" }, allowedProjectIds);
    return result.items.map(item => toExportRow(item));
  }
  if (resource === "rules") return (await getAllRules(db)).map(item => toExportRow(item));
  if (resource === "whitelist") return (await getAllWhitelist(db)).map(item => toExportRow(item));
  if (resource === "mailboxes") return (await getAllMailboxes(db, true, allowedProjectIds)).map(item => toExportRow(item));
  if (resource === "admins") return (await getAllAdminUsers(db)).map(item => toExportRow(item));
  if (resource === "notifications") {
    if (uniquePositiveIds(allowedProjectIds || []).length > 0) {
      return (
        await getNotificationEndpointsPaged(db, 1, 10_000, allowedProjectIds)
      ).items.map(item => toExportRow(item));
    }
    return (await getAllNotificationEndpoints(db)).map(item => toExportRow(item));
  }
  return (await getAllAuditLogs(db)).map(item => toExportRow(item));
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
