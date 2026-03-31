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
import { normalizeAdminRole, normalizeNotificationAlertConfig } from "../utils/constants";
import type {
  AccessScope,
  AdminRole,
  AdminUserRecord,
  ApiTokenPermission,
  ApiTokenRecord,
  AuditLogRecord,
  DomainAssetRecord,
  DomainRoutingProfileRecord,
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
  NotificationAlertConfig,
  NotificationDeliveriesPayload,
  NotificationDeliveryRecord,
  NotificationDeliveryAttemptRecord,
  NotificationSummaryAlert,
  NotificationDeliverySummary,
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
  RetentionJobRunRecord,
  ResolvedRetentionPolicy,
  RetentionPolicyRecord,
  RetentionPolicyScopeLevel,
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
  "d.allow_new_mailboxes",
  "d.allow_mailbox_route_sync",
  "d.zone_id",
  "d.email_worker",
  "d.note",
  "d.is_enabled",
  "d.is_primary",
  "d.catch_all_mode",
  "d.catch_all_forward_to",
  "d.routing_profile_id",
  "d.project_id",
  "d.environment_id",
  "d.created_at",
  "d.updated_at",
  "COALESCE(rp.name, '') as routing_profile_name",
  "COALESCE(rp.slug, '') as routing_profile_slug",
  "COALESCE(rp.catch_all_mode, 'inherit') as routing_profile_catch_all_mode",
  "COALESCE(rp.catch_all_forward_to, '') as routing_profile_catch_all_forward_to",
  "COALESCE(rp.is_enabled, 0) as routing_profile_enabled",
  "COALESCE(p.name, '') as project_name",
  "COALESCE(p.slug, '') as project_slug",
  "COALESCE(e.name, '') as environment_name",
  "COALESCE(e.slug, '') as environment_slug",
].join(", ");

const DOMAIN_ROUTING_PROFILE_SELECT_FIELDS = [
  "rp.id",
  "rp.name",
  "rp.slug",
  "rp.provider",
  "rp.note",
  "rp.is_enabled",
  "rp.catch_all_mode",
  "rp.catch_all_forward_to",
  "rp.project_id",
  "rp.environment_id",
  "rp.created_at",
  "rp.updated_at",
  "COALESCE(p.name, '') as project_name",
  "COALESCE(p.slug, '') as project_slug",
  "COALESCE(e.name, '') as environment_name",
  "COALESCE(e.slug, '') as environment_slug",
  "COALESCE(dc.linked_domain_count, 0) as linked_domain_count",
].join(", ");

const RETENTION_POLICY_SELECT_FIELDS = [
  "rp.id",
  "rp.name",
  "rp.description",
  "rp.is_enabled",
  "rp.scope_key",
  "rp.project_id",
  "rp.environment_id",
  "rp.mailbox_pool_id",
  "rp.archive_email_hours",
  "rp.mailbox_ttl_hours",
  "rp.email_retention_hours",
  "rp.deleted_email_retention_hours",
  "rp.created_at",
  "rp.updated_at",
  "COALESCE(p.name, '') as project_name",
  "COALESCE(p.slug, '') as project_slug",
  "COALESCE(e.name, '') as environment_name",
  "COALESCE(e.slug, '') as environment_slug",
  "COALESCE(mp.name, '') as mailbox_pool_name",
  "COALESCE(mp.slug, '') as mailbox_pool_slug",
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

function getRetentionPolicyScopeLevel(
  row: Pick<RetentionPolicyRecord, "environment_id" | "mailbox_pool_id" | "project_id"> | DbRow,
): RetentionPolicyScopeLevel {
  const mailboxPoolId = normalizeNullableId((row as { mailbox_pool_id?: unknown }).mailbox_pool_id);
  const environmentId = normalizeNullableId((row as { environment_id?: unknown }).environment_id);
  const projectId = normalizeNullableId((row as { project_id?: unknown }).project_id);
  if (mailboxPoolId) return "mailbox_pool";
  if (environmentId) return "environment";
  if (projectId) return "project";
  return "global";
}

function mapRetentionPolicy(row: DbRow): RetentionPolicyRecord {
  return {
    archive_email_hours: nullableNumberValue(row, "archive_email_hours"),
    created_at: numberValue(row, "created_at", Date.now()),
    deleted_email_retention_hours: nullableNumberValue(row, "deleted_email_retention_hours"),
    description: stringValue(row, "description"),
    email_retention_hours: nullableNumberValue(row, "email_retention_hours"),
    id: numberValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    mailbox_ttl_hours: nullableNumberValue(row, "mailbox_ttl_hours"),
    name: stringValue(row, "name"),
    scope_key: stringValue(row, "scope_key"),
    scope_level: getRetentionPolicyScopeLevel(row),
    updated_at: numberValue(row, "updated_at", Date.now()),
    ...mapWorkspaceScope(row),
  };
}

function mapRetentionJobRun(row: DbRow): RetentionJobRunRecord {
  return {
    archived_email_count: numberValue(row, "archived_email_count", 0),
    applied_policy_count: numberValue(row, "applied_policy_count", 0),
    created_at: numberValue(row, "created_at", Date.now()),
    detail_json: safeParseJson<JsonValue>(stringValue(row, "detail_json", "{}"), {}) || {},
    duration_ms: nullableNumberValue(row, "duration_ms"),
    error_message: stringValue(row, "error_message"),
    expired_mailbox_count: numberValue(row, "expired_mailbox_count", 0),
    finished_at: nullableNumberValue(row, "finished_at"),
    id: numberValue(row, "id"),
    purged_active_email_count: numberValue(row, "purged_active_email_count", 0),
    purged_deleted_email_count: numberValue(row, "purged_deleted_email_count", 0),
    scanned_email_count: numberValue(row, "scanned_email_count", 0),
    started_at: numberValue(row, "started_at", Date.now()),
    status: stringValue(row, "status", "success") as RetentionJobRunRecord["status"],
    trigger_source: stringValue(row, "trigger_source", "scheduled"),
  };
}

function mapDomainAsset(row: DbRow): DomainAssetRecord {
  return {
    allow_mailbox_route_sync: boolValue(row, "allow_mailbox_route_sync", true),
    allow_new_mailboxes: boolValue(row, "allow_new_mailboxes", true),
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
    routing_profile_catch_all_forward_to: stringValue(row, "routing_profile_catch_all_forward_to"),
    routing_profile_catch_all_mode: stringValue(row, "routing_profile_catch_all_mode", "inherit") as DomainAssetRecord["routing_profile_catch_all_mode"],
    routing_profile_enabled: boolValue(row, "routing_profile_enabled", false),
    routing_profile_id: nullableNumberValue(row, "routing_profile_id"),
    routing_profile_name: stringValue(row, "routing_profile_name"),
    routing_profile_slug: stringValue(row, "routing_profile_slug"),
    updated_at: numberValue(row, "updated_at", Date.now()),
    zone_id: stringValue(row, "zone_id"),
  };
}

function mapDomainRoutingProfile(row: DbRow): DomainRoutingProfileRecord {
  return {
    catch_all_forward_to: stringValue(row, "catch_all_forward_to"),
    catch_all_mode: stringValue(row, "catch_all_mode", "inherit") as DomainRoutingProfileRecord["catch_all_mode"],
    created_at: numberValue(row, "created_at", Date.now()),
    environment_id: nullableNumberValue(row, "environment_id"),
    environment_name: stringValue(row, "environment_name"),
    environment_slug: stringValue(row, "environment_slug"),
    id: numberValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    linked_domain_count: numberValue(row, "linked_domain_count", 0),
    name: stringValue(row, "name"),
    note: stringValue(row, "note"),
    project_id: nullableNumberValue(row, "project_id"),
    project_name: stringValue(row, "project_name"),
    project_slug: stringValue(row, "project_slug"),
    provider: stringValue(row, "provider", "cloudflare"),
    slug: stringValue(row, "slug"),
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
  const access_scope = normalizeAccessScope(row.access_scope);
  return {
    access_scope,
    created_at: numberValue(row, "created_at", Date.now()),
    display_name: stringValue(row, "display_name"),
    id: stringValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    last_login_at: nullableNumberValue(row, "last_login_at"),
    last_modified_action: stringValue(row, "last_modified_action"),
    last_modified_at: nullableNumberValue(row, "last_modified_at"),
    last_modified_by: stringValue(row, "last_modified_by"),
    note: stringValue(row, "note"),
    projects: [],
    role: normalizeAdminRole(stringValue(row, "role", "viewer"), access_scope) || "viewer",
    updated_at: numberValue(row, "updated_at", Date.now()),
    username: stringValue(row, "username"),
  };
}

function mapNotification(row: DbRow): NotificationEndpointRecord {
  return {
    access_scope: normalizeAccessScope(row.access_scope),
    alert_config: normalizeNotificationAlertConfig(
      safeParseJson<Record<string, unknown>>(stringValue(row, "alert_config_json", "{}"), {}) || {},
    ),
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
    dead_letter_reason: stringValue(row, "dead_letter_reason"),
    event: stringValue(row, "event"),
    id: numberValue(row, "id"),
    is_dead_letter: boolValue(row, "is_dead_letter", false),
    last_attempt_at: nullableNumberValue(row, "last_attempt_at"),
    last_error: stringValue(row, "last_error"),
    max_attempts: numberValue(row, "max_attempts", 4),
    next_retry_at: nullableNumberValue(row, "next_retry_at"),
    notification_endpoint_id: numberValue(row, "notification_endpoint_id"),
    payload: safeParseJson<JsonValue>(stringValue(row, "payload_json", "{}"), {}) || {},
    response_status: nullableNumberValue(row, "response_status"),
    resolved_at: nullableNumberValue(row, "resolved_at"),
    resolved_by: stringValue(row, "resolved_by"),
    scope:
      safeParseJson<NotificationDeliveryScope>(stringValue(row, "scope_json", "{}"), {}) || {},
    status: stringValue(row, "status", "pending") as NotificationDeliveryStatus,
    updated_at: numberValue(row, "updated_at", Date.now()),
  };
}

function mapNotificationDeliveryAttempt(row: DbRow): NotificationDeliveryAttemptRecord {
  return {
    attempt_number: numberValue(row, "attempt_number", 0),
    attempted_at: numberValue(row, "attempted_at", Date.now()),
    created_at: numberValue(row, "created_at", Date.now()),
    duration_ms: nullableNumberValue(row, "duration_ms"),
    error_message: stringValue(row, "error_message"),
    id: numberValue(row, "id"),
    next_retry_at: nullableNumberValue(row, "next_retry_at"),
    notification_delivery_id: numberValue(row, "notification_delivery_id"),
    notification_endpoint_id: numberValue(row, "notification_endpoint_id"),
    response_status: nullableNumberValue(row, "response_status"),
    status: stringValue(row, "status", "failed") as NotificationDeliveryStatus,
    updated_at: numberValue(row, "updated_at", Date.now()),
  };
}

function mapNotificationDeliverySummary(
  row: DbRow,
  alertConfig: NotificationAlertConfig,
): NotificationDeliverySummary {
  const now = Date.now();
  const recent_attempts_24h = numberValue(row, "recent_attempts_24h", 0);
  const recent_success_attempts_24h = numberValue(row, "recent_success_attempts_24h", 0);
  const recent_failed_attempts_24h = numberValue(row, "recent_failed_attempts_24h", 0);
  const success_rate_24h =
    recent_attempts_24h > 0
      ? Math.round((recent_success_attempts_24h / recent_attempts_24h) * 1000) / 10
      : 0;
  const dead_letter_total = numberValue(row, "dead_letter_total", 0);
  const retrying_total = numberValue(row, "retrying_total", 0);
  const last_attempt_at = nullableNumberValue(row, "last_attempt_at");
  const hasDeadLetterCritical =
    dead_letter_total > 0 && dead_letter_total >= alertConfig.dead_letter_critical_threshold;
  const hasDeadLetterWarning =
    dead_letter_total > 0 && dead_letter_total >= alertConfig.dead_letter_warning_threshold;
  const hasRetryingCritical =
    retrying_total > 0 && retrying_total >= alertConfig.retrying_critical_threshold;
  const hasRetryingWarning =
    retrying_total > 0 && retrying_total >= alertConfig.retrying_warning_threshold;
  const hasEnoughAttempts =
    recent_attempts_24h > 0 && recent_attempts_24h >= alertConfig.min_attempts_24h;
  const isInactive = alertConfig.inactivity_hours > 0
    && (last_attempt_at === null || last_attempt_at <= now - alertConfig.inactivity_hours * 60 * 60 * 1000);
  const health_status: NotificationDeliverySummary["health_status"] =
    hasDeadLetterCritical
      || hasRetryingCritical
      || (hasEnoughAttempts && success_rate_24h <= alertConfig.success_rate_critical_threshold)
      ? "critical"
      : hasDeadLetterWarning
        || hasRetryingWarning
        || (hasEnoughAttempts && success_rate_24h <= alertConfig.success_rate_warning_threshold)
        || (recent_attempts_24h > 0 && recent_failed_attempts_24h > 0)
      ? "warning"
      : recent_attempts_24h > 0
      ? "healthy"
      : isInactive
      ? "warning"
      : "idle";

  const summary: NotificationDeliverySummary = {
    alerts: [],
    avg_duration_ms_24h: nullableNumberValue(row, "avg_duration_ms_24h"),
    dead_letter_total,
    failed_total: numberValue(row, "failed_total", 0),
    health_status,
    last_attempt_at,
    last_failure_at: nullableNumberValue(row, "last_failure_at"),
    last_success_at: nullableNumberValue(row, "last_success_at"),
    pending_total: numberValue(row, "pending_total", 0),
    recent_attempts_24h,
    recent_failed_attempts_24h,
    recent_success_attempts_24h,
    resolved_dead_letter_total: numberValue(row, "resolved_dead_letter_total", 0),
    retrying_total,
    success_total: numberValue(row, "success_total", 0),
    success_rate_24h,
    total_attempts: numberValue(row, "total_attempts", 0),
    total_deliveries: numberValue(row, "total_deliveries", 0),
  };

  summary.alerts = buildNotificationSummaryAlerts(summary, alertConfig);
  return summary;
}

function buildNotificationSummaryAlerts(
  summary: NotificationDeliverySummary,
  alertConfig: NotificationAlertConfig,
): NotificationSummaryAlert[] {
  const alerts: NotificationSummaryAlert[] = [];

  if (
    summary.dead_letter_total > 0
    && summary.dead_letter_total >= alertConfig.dead_letter_warning_threshold
  ) {
    alerts.push({
      code: "dead_letter_backlog",
      description: `当前仍有 ${summary.dead_letter_total} 条投递停留在死信箱，建议优先处理。`,
      severity:
        summary.dead_letter_total >= alertConfig.dead_letter_critical_threshold
          ? "critical"
          : "warning",
      title: "存在待处理死信",
    });
  }

  if (
    summary.retrying_total > 0
    && summary.retrying_total >= alertConfig.retrying_warning_threshold
  ) {
    alerts.push({
      code: "retry_queue_active",
      description: `当前有 ${summary.retrying_total} 条投递仍在自动重试中，需要关注目标端点稳定性。`,
      severity:
        summary.retrying_total >= alertConfig.retrying_critical_threshold
          ? "critical"
          : "warning",
      title: "存在重试中的投递",
    });
  }

  if (
    summary.recent_attempts_24h > 0
    && summary.recent_attempts_24h >= alertConfig.min_attempts_24h
    && summary.success_rate_24h <= alertConfig.success_rate_warning_threshold
  ) {
    alerts.push({
      code: "low_success_rate_24h",
      description: `近 24 小时成功率为 ${summary.success_rate_24h}% ，低于健康阈值。`,
      severity:
        summary.success_rate_24h <= alertConfig.success_rate_critical_threshold
          ? "critical"
          : "warning",
      title: "24 小时成功率偏低",
    });
  }

  if (alertConfig.inactivity_hours > 0 && summary.recent_attempts_24h === 0) {
    alerts.push({
      code: "inactive_24h",
      description: `近 ${alertConfig.inactivity_hours} 小时没有新的投递尝试，若该端点应持续工作，请检查流量或触发链路。`,
      severity: "info",
      title: `近 ${alertConfig.inactivity_hours} 小时无投递活动`,
    });
  }

  return alerts;
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

type RetentionPolicyConfigInput = {
  archive_email_hours?: number | null;
  deleted_email_retention_hours?: number | null;
  email_retention_hours?: number | null;
  mailbox_ttl_hours?: number | null;
};

export interface RetentionAffectedEmailRecord {
  deleted_at: number | null;
  environment_id: number | null;
  mailbox_pool_id: number | null;
  message_id: string;
  project_id: number | null;
  received_at: number;
}

export interface RetentionScopeSummaryRecord {
  archived_email_count: number;
  environment_id: number | null;
  mailbox_pool_id: number | null;
  project_id: number | null;
  purged_active_email_count: number;
  purged_deleted_email_count: number;
}

export interface RetentionPurgeSummary {
  affected_project_ids: number[];
  archived_emails: RetentionAffectedEmailRecord[];
  archived_email_count: number;
  applied_policy_count: number;
  purged_active_emails: RetentionAffectedEmailRecord[];
  purged_active_email_count: number;
  purged_deleted_emails: RetentionAffectedEmailRecord[];
  purged_deleted_email_count: number;
  scanned_email_count: number;
  scope_summaries: RetentionScopeSummaryRecord[];
}

const RETENTION_POLICY_SCOPE_ORDER: Record<RetentionPolicyScopeLevel, number> = {
  environment: 2,
  global: 0,
  mailbox_pool: 3,
  project: 1,
};

function toRetentionAffectedEmailRecord(row: DbRow): RetentionAffectedEmailRecord {
  return {
    deleted_at: nullableNumberValue(row, "deleted_at"),
    environment_id: nullableNumberValue(row, "environment_id"),
    mailbox_pool_id: nullableNumberValue(row, "mailbox_pool_id"),
    message_id: stringValue(row, "message_id"),
    project_id: nullableNumberValue(row, "project_id"),
    received_at: numberValue(row, "received_at", Date.now()),
  };
}

function buildRetentionScopeSummaryKey(record: Pick<RetentionAffectedEmailRecord, "environment_id" | "mailbox_pool_id" | "project_id">): string {
  return [
    record.project_id ?? "global",
    record.environment_id ?? "env",
    record.mailbox_pool_id ?? "pool",
  ].join(":");
}

function ensureRetentionScopeSummary(
  summaries: Map<string, RetentionScopeSummaryRecord>,
  record: Pick<RetentionAffectedEmailRecord, "environment_id" | "mailbox_pool_id" | "project_id">,
): RetentionScopeSummaryRecord {
  const key = buildRetentionScopeSummaryKey(record);
  const existing = summaries.get(key);
  if (existing) return existing;

  const created: RetentionScopeSummaryRecord = {
    archived_email_count: 0,
    environment_id: record.environment_id,
    mailbox_pool_id: record.mailbox_pool_id,
    project_id: record.project_id,
    purged_active_email_count: 0,
    purged_deleted_email_count: 0,
  };
  summaries.set(key, created);
  return created;
}

export function buildRetentionPolicyScopeKey(input: {
  environment_id?: number | null;
  mailbox_pool_id?: number | null;
  project_id?: number | null;
}): string {
  const projectId = normalizeNullableId(input.project_id);
  const environmentId = normalizeNullableId(input.environment_id);
  const mailboxPoolId = normalizeNullableId(input.mailbox_pool_id);

  if (mailboxPoolId && environmentId && projectId) {
    return `mailbox_pool:${projectId}:${environmentId}:${mailboxPoolId}`;
  }
  if (environmentId && projectId) {
    return `environment:${projectId}:${environmentId}`;
  }
  if (projectId) {
    return `project:${projectId}`;
  }
  return "global";
}

function matchesRetentionPolicyScope(
  policy: Pick<RetentionPolicyRecord, "environment_id" | "mailbox_pool_id" | "project_id" | "scope_level">,
  scope: { environment_id?: number | null; mailbox_pool_id?: number | null; project_id?: number | null },
): boolean {
  const projectId = normalizeNullableId(scope.project_id);
  const environmentId = normalizeNullableId(scope.environment_id);
  const mailboxPoolId = normalizeNullableId(scope.mailbox_pool_id);

  if (policy.scope_level === "global") return true;
  if (policy.scope_level === "project") return policy.project_id === projectId;
  if (policy.scope_level === "environment") {
    return policy.project_id === projectId && policy.environment_id === environmentId;
  }
  return (
    policy.project_id === projectId
    && policy.environment_id === environmentId
    && policy.mailbox_pool_id === mailboxPoolId
  );
}

export function resolveRetentionPolicyConfigFromRecords(
  policies: Array<Pick<RetentionPolicyRecord, "archive_email_hours" | "deleted_email_retention_hours" | "email_retention_hours" | "environment_id" | "is_enabled" | "mailbox_pool_id" | "mailbox_ttl_hours" | "project_id" | "scope_level">>,
  scope: { environment_id?: number | null; mailbox_pool_id?: number | null; project_id?: number | null },
  fallback: RetentionPolicyConfigInput = {},
): ResolvedRetentionPolicy {
  const resolved: ResolvedRetentionPolicy = {
    archive_email_hours: fallback.archive_email_hours ?? null,
    archive_email_source:
      fallback.archive_email_hours === null || fallback.archive_email_hours === undefined
        ? null
        : "default",
    deleted_email_retention_hours: fallback.deleted_email_retention_hours ?? null,
    deleted_email_retention_source:
      fallback.deleted_email_retention_hours === null || fallback.deleted_email_retention_hours === undefined
        ? null
        : "default",
    email_retention_hours: fallback.email_retention_hours ?? null,
    email_retention_source:
      fallback.email_retention_hours === null || fallback.email_retention_hours === undefined
        ? null
        : "default",
    mailbox_ttl_hours: fallback.mailbox_ttl_hours ?? null,
    mailbox_ttl_source:
      fallback.mailbox_ttl_hours === null || fallback.mailbox_ttl_hours === undefined
        ? null
        : "default",
  };

  const applicablePolicies = policies
    .filter(policy => policy.is_enabled && matchesRetentionPolicyScope(policy, scope))
    .sort(
      (left, right) =>
        RETENTION_POLICY_SCOPE_ORDER[left.scope_level] - RETENTION_POLICY_SCOPE_ORDER[right.scope_level],
    );

  for (const policy of applicablePolicies) {
    if (policy.archive_email_hours !== null && policy.archive_email_hours !== undefined) {
      resolved.archive_email_hours = policy.archive_email_hours;
      resolved.archive_email_source = policy.scope_level;
    }
    if (policy.mailbox_ttl_hours !== null && policy.mailbox_ttl_hours !== undefined) {
      resolved.mailbox_ttl_hours = policy.mailbox_ttl_hours;
      resolved.mailbox_ttl_source = policy.scope_level;
    }
    if (policy.email_retention_hours !== null && policy.email_retention_hours !== undefined) {
      resolved.email_retention_hours = policy.email_retention_hours;
      resolved.email_retention_source = policy.scope_level;
    }
    if (
      policy.deleted_email_retention_hours !== null
      && policy.deleted_email_retention_hours !== undefined
    ) {
      resolved.deleted_email_retention_hours = policy.deleted_email_retention_hours;
      resolved.deleted_email_retention_source = policy.scope_level;
    }
  }

  return resolved;
}

export function resolveMailboxExpirationTimestamp(
  requestedExpiresAt: number | null | undefined,
  resolvedPolicy: Pick<ResolvedRetentionPolicy, "mailbox_ttl_hours">,
  now = Date.now(),
): number | null {
  if (requestedExpiresAt !== null && requestedExpiresAt !== undefined) {
    return requestedExpiresAt;
  }
  if (!resolvedPolicy.mailbox_ttl_hours || resolvedPolicy.mailbox_ttl_hours <= 0) {
    return null;
  }
  return now + resolvedPolicy.mailbox_ttl_hours * 60 * 60 * 1000;
}

function buildProjectScopedFilter(
  tableAlias: string,
  allowedProjectIds?: number[] | null,
) {
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
      whereClause: ` WHERE ${tableAlias}.project_id IS NULL`,
    };
  }

  return {
    params: normalizedAllowedProjectIds,
    whereClause: ` WHERE (${tableAlias}.project_id IS NULL OR ${tableAlias}.project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)}))`,
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

function buildRetentionPolicyVisibilityFilter(allowedProjectIds?: number[] | null) {
  const hasScopedProjects = allowedProjectIds !== null && allowedProjectIds !== undefined;
  const normalizedAllowedProjectIds = uniquePositiveIds(allowedProjectIds || []);

  if (!hasScopedProjects) {
    return { clause: "", params: [] as number[] };
  }

  if (normalizedAllowedProjectIds.length === 0) {
    return {
      clause: " WHERE rp.project_id IS NULL",
      params: [] as number[],
    };
  }

  return {
    clause: ` WHERE (rp.project_id IS NULL OR rp.project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)}))`,
    params: normalizedAllowedProjectIds,
  };
}

export async function getRetentionPoliciesPaged(
  db: D1Database,
  page: number,
  pageSize: number,
  filters: {
    environment_id?: number | null;
    is_enabled?: boolean | null;
    keyword?: string | null;
    mailbox_pool_id?: number | null;
    project_id?: number | null;
  } = {},
  allowedProjectIds?: number[] | null,
): Promise<PaginationPayload<RetentionPolicyRecord>> {
  const offset = (page - 1) * pageSize;
  const visibility = buildRetentionPolicyVisibilityFilter(allowedProjectIds);
  const clauses: string[] = [];
  const params: unknown[] = [...visibility.params];
  const countParams: unknown[] = [...visibility.params];

  if (filters.project_id) {
    clauses.push("rp.project_id = ?");
    params.push(filters.project_id);
    countParams.push(filters.project_id);
  }

  if (filters.environment_id) {
    clauses.push("rp.environment_id = ?");
    params.push(filters.environment_id);
    countParams.push(filters.environment_id);
  }

  if (filters.mailbox_pool_id) {
    clauses.push("rp.mailbox_pool_id = ?");
    params.push(filters.mailbox_pool_id);
    countParams.push(filters.mailbox_pool_id);
  }

  if (filters.is_enabled !== null && filters.is_enabled !== undefined) {
    clauses.push("rp.is_enabled = ?");
    params.push(filters.is_enabled ? 1 : 0);
    countParams.push(filters.is_enabled ? 1 : 0);
  }

  if (filters.keyword) {
    clauses.push("(rp.name LIKE ? OR rp.description LIKE ?)");
    params.push(`%${filters.keyword}%`, `%${filters.keyword}%`);
    countParams.push(`%${filters.keyword}%`, `%${filters.keyword}%`);
  }

  let query = `SELECT ${RETENTION_POLICY_SELECT_FIELDS} FROM retention_policies rp LEFT JOIN projects p ON p.id = rp.project_id LEFT JOIN environments e ON e.id = rp.environment_id LEFT JOIN mailbox_pools mp ON mp.id = rp.mailbox_pool_id`;
  let countQuery = "SELECT COUNT(1) as total FROM retention_policies rp";
  const whereParts = [visibility.clause.replace(/^ WHERE /, ""), ...clauses].filter(Boolean);
  if (whereParts.length > 0) {
    const whereClause = ` WHERE ${whereParts.join(" AND ")}`;
    query += whereClause;
    countQuery += whereClause;
  }

  query += " ORDER BY CASE WHEN rp.mailbox_pool_id IS NOT NULL THEN 4 WHEN rp.environment_id IS NOT NULL THEN 3 WHEN rp.project_id IS NOT NULL THEN 2 ELSE 1 END DESC, rp.updated_at DESC LIMIT ? OFFSET ?";
  params.push(pageSize, offset);

  const [list, countRow] = await Promise.all([
    db.prepare(query).bind(...params).all<DbRow>(),
    db.prepare(countQuery).bind(...countParams).first<DbRow>(),
  ]);

  return {
    items: list.results.map(mapRetentionPolicy),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllRetentionPolicies(
  db: D1Database,
  options: { enabledOnly?: boolean } = {},
  allowedProjectIds?: number[] | null,
): Promise<RetentionPolicyRecord[]> {
  const visibility = buildRetentionPolicyVisibilityFilter(allowedProjectIds);
  const params: unknown[] = [...visibility.params];
  const whereParts = [visibility.clause.replace(/^ WHERE /, "")].filter(Boolean);

  if (options.enabledOnly) {
    whereParts.push("rp.is_enabled = 1");
  }

  let query = `SELECT ${RETENTION_POLICY_SELECT_FIELDS} FROM retention_policies rp LEFT JOIN projects p ON p.id = rp.project_id LEFT JOIN environments e ON e.id = rp.environment_id LEFT JOIN mailbox_pools mp ON mp.id = rp.mailbox_pool_id`;
  if (whereParts.length > 0) {
    query += ` WHERE ${whereParts.join(" AND ")}`;
  }
  query += " ORDER BY CASE WHEN rp.mailbox_pool_id IS NOT NULL THEN 4 WHEN rp.environment_id IS NOT NULL THEN 3 WHEN rp.project_id IS NOT NULL THEN 2 ELSE 1 END ASC, rp.updated_at DESC";

  const result = await db.prepare(query).bind(...params).all<DbRow>();
  return result.results.map(mapRetentionPolicy);
}

export async function getRetentionPolicyById(
  db: D1Database,
  id: number,
  allowedProjectIds?: number[] | null,
): Promise<RetentionPolicyRecord | null> {
  const visibility = buildRetentionPolicyVisibilityFilter(allowedProjectIds);
  const whereParts = ["rp.id = ?", visibility.clause.replace(/^ WHERE /, "")].filter(Boolean);
  const row = await db.prepare(
    `SELECT ${RETENTION_POLICY_SELECT_FIELDS}
    FROM retention_policies rp
    LEFT JOIN projects p ON p.id = rp.project_id
    LEFT JOIN environments e ON e.id = rp.environment_id
    LEFT JOIN mailbox_pools mp ON mp.id = rp.mailbox_pool_id
    WHERE ${whereParts.join(" AND ")}
    LIMIT 1`,
  ).bind(id, ...visibility.params).first<DbRow>();

  return row ? mapRetentionPolicy(row) : null;
}

export async function createRetentionPolicy(
  db: D1Database,
  input: {
    archive_email_hours: number | null;
    deleted_email_retention_hours: number | null;
    description: string;
    email_retention_hours: number | null;
    environment_id: number | null;
    is_enabled: boolean;
    mailbox_pool_id: number | null;
    mailbox_ttl_hours: number | null;
    name: string;
    project_id: number | null;
    scope_key: string;
  },
): Promise<RetentionPolicyRecord> {
  const now = Date.now();
  const result = await db.prepare(
    "INSERT INTO retention_policies (name, description, is_enabled, scope_key, project_id, environment_id, mailbox_pool_id, archive_email_hours, mailbox_ttl_hours, email_retention_hours, deleted_email_retention_hours, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    input.name,
    input.description,
    input.is_enabled ? 1 : 0,
    input.scope_key,
    input.project_id,
    input.environment_id,
    input.mailbox_pool_id,
    input.archive_email_hours,
    input.mailbox_ttl_hours,
    input.email_retention_hours,
    input.deleted_email_retention_hours,
    now,
    now,
  ).run() as { meta?: { last_row_id?: number } };

  const insertedId = Number(result?.meta?.last_row_id || 0);
  const policy = insertedId > 0 ? await getRetentionPolicyById(db, insertedId) : null;
  if (!policy) {
    throw new Error("failed to load newly created retention policy");
  }
  return policy;
}

export async function updateRetentionPolicy(
  db: D1Database,
  id: number,
  input: {
    archive_email_hours: number | null;
    deleted_email_retention_hours: number | null;
    description: string;
    email_retention_hours: number | null;
    environment_id: number | null;
    is_enabled: boolean;
    mailbox_pool_id: number | null;
    mailbox_ttl_hours: number | null;
    name: string;
    project_id: number | null;
    scope_key: string;
  },
): Promise<RetentionPolicyRecord> {
  await db.prepare(
    "UPDATE retention_policies SET name = ?, description = ?, is_enabled = ?, scope_key = ?, project_id = ?, environment_id = ?, mailbox_pool_id = ?, archive_email_hours = ?, mailbox_ttl_hours = ?, email_retention_hours = ?, deleted_email_retention_hours = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.name,
    input.description,
    input.is_enabled ? 1 : 0,
    input.scope_key,
    input.project_id,
    input.environment_id,
    input.mailbox_pool_id,
    input.archive_email_hours,
    input.mailbox_ttl_hours,
    input.email_retention_hours,
    input.deleted_email_retention_hours,
    Date.now(),
    id,
  ).run();

  const policy = await getRetentionPolicyById(db, id);
  if (!policy) {
    throw new Error("retention policy not found");
  }
  return policy;
}

export async function deleteRetentionPolicy(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM retention_policies WHERE id = ?").bind(id).run();
}

export async function resolveRetentionPolicyConfig(
  db: D1Database,
  scope: { environment_id?: number | null; mailbox_pool_id?: number | null; project_id?: number | null },
  fallback: RetentionPolicyConfigInput = {},
): Promise<ResolvedRetentionPolicy> {
  const policies = await getAllRetentionPolicies(db, { enabledOnly: true });
  return resolveRetentionPolicyConfigFromRecords(policies, scope, fallback);
}

export async function applyRetentionPoliciesPurge(
  db: D1Database,
  fallback: RetentionPolicyConfigInput = {},
): Promise<RetentionPurgeSummary> {
  const [policies, emailRows] = await Promise.all([
    getAllRetentionPolicies(db, { enabledOnly: true }),
    db.prepare(
      "SELECT message_id, received_at, deleted_at, archived_at, project_id, environment_id, mailbox_pool_id FROM emails",
    ).all<DbRow>(),
  ]);
  const hourInMs = 60 * 60 * 1000;
  const now = Date.now();
  const affectedProjectIds = new Set<number>();
  const archived_emails: RetentionAffectedEmailRecord[] = [];
  let archived_email_count = 0;
  const purged_active_emails: RetentionAffectedEmailRecord[] = [];
  let purged_active_email_count = 0;
  const purged_deleted_emails: RetentionAffectedEmailRecord[] = [];
  let purged_deleted_email_count = 0;
  const scopeSummaries = new Map<string, RetentionScopeSummaryRecord>();

  for (const row of emailRows.results) {
    const messageId = stringValue(row, "message_id");
    if (!messageId) continue;

    const record = toRetentionAffectedEmailRecord(row);
    const resolved = resolveRetentionPolicyConfigFromRecords(
      policies,
      {
        environment_id: record.environment_id,
        mailbox_pool_id: record.mailbox_pool_id,
        project_id: record.project_id,
      },
      fallback,
    );

    const deletedAt = record.deleted_at;
    if (deletedAt !== null) {
      const maxHours = resolved.deleted_email_retention_hours;
      if (maxHours !== null && deletedAt <= now - maxHours * hourInMs) {
        await purgeEmail(db, messageId);
        purged_deleted_emails.push(record);
        if (record.project_id) affectedProjectIds.add(record.project_id);
        ensureRetentionScopeSummary(scopeSummaries, record).purged_deleted_email_count += 1;
        purged_deleted_email_count += 1;
      }
      continue;
    }

    const maxHours = resolved.email_retention_hours;
    if (maxHours !== null && record.received_at <= now - maxHours * hourInMs) {
      await purgeEmail(db, messageId);
      purged_active_emails.push(record);
      if (record.project_id) affectedProjectIds.add(record.project_id);
      ensureRetentionScopeSummary(scopeSummaries, record).purged_active_email_count += 1;
      purged_active_email_count += 1;
      continue;
    }

    const archivedAt = nullableNumberValue(row, "archived_at");
    const archiveHours = resolved.archive_email_hours;
    if (archivedAt === null && archiveHours !== null && record.received_at <= now - archiveHours * hourInMs) {
      await archiveEmail(db, messageId, {
        archive_reason: "retention_policy",
        archived_by: "system",
      });
      archived_emails.push(record);
      if (record.project_id) affectedProjectIds.add(record.project_id);
      ensureRetentionScopeSummary(scopeSummaries, record).archived_email_count += 1;
      archived_email_count += 1;
    }
  }

  return {
    affected_project_ids: Array.from(affectedProjectIds).sort((left, right) => left - right),
    archived_emails,
    archived_email_count,
    applied_policy_count: policies.length,
    purged_active_emails,
    purged_active_email_count,
    purged_deleted_emails,
    purged_deleted_email_count,
    scanned_email_count: emailRows.results.length,
    scope_summaries: Array.from(scopeSummaries.values()).sort((left, right) => {
      if ((left.project_id || 0) !== (right.project_id || 0)) {
        return (left.project_id || 0) - (right.project_id || 0);
      }
      if ((left.environment_id || 0) !== (right.environment_id || 0)) {
        return (left.environment_id || 0) - (right.environment_id || 0);
      }
      return (left.mailbox_pool_id || 0) - (right.mailbox_pool_id || 0);
    }),
  };
}

export async function createRetentionJobRun(
  db: D1Database,
  input: {
    archived_email_count: number;
    applied_policy_count: number;
    detail_json: JsonValue;
    duration_ms: number | null;
    error_message: string;
    expired_mailbox_count: number;
    finished_at: number | null;
    purged_active_email_count: number;
    purged_deleted_email_count: number;
    scanned_email_count: number;
    started_at: number;
    status: RetentionJobRunRecord["status"];
    trigger_source: string;
  },
): Promise<number> {
  const result = await db.prepare(
    "INSERT INTO retention_job_runs (trigger_source, status, scanned_email_count, archived_email_count, purged_active_email_count, purged_deleted_email_count, expired_mailbox_count, applied_policy_count, started_at, finished_at, duration_ms, error_message, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    input.trigger_source,
    input.status,
    input.scanned_email_count,
    input.archived_email_count,
    input.purged_active_email_count,
    input.purged_deleted_email_count,
    input.expired_mailbox_count,
    input.applied_policy_count,
    input.started_at,
    input.finished_at,
    input.duration_ms,
    input.error_message,
    jsonStringify(input.detail_json, "{}"),
    input.finished_at || input.started_at,
  ).run() as { meta?: { last_row_id?: number } };

  const insertedId = Number(result?.meta?.last_row_id || 0);
  if (insertedId > 0) return insertedId;

  const row = await db.prepare(
    "SELECT id FROM retention_job_runs WHERE trigger_source = ? AND started_at = ? ORDER BY id DESC LIMIT 1",
  ).bind(input.trigger_source, input.started_at).first<DbRow>();
  return numberValue(row || {}, "id", 0);
}

export async function getRetentionJobRunsPaged(
  db: D1Database,
  page: number,
  pageSize: number,
  filters: {
    status?: RetentionJobRunRecord["status"] | null;
    trigger_source?: string | null;
  } = {},
): Promise<PaginationPayload<RetentionJobRunRecord>> {
  const offset = (page - 1) * pageSize;
  const clauses: string[] = [];
  const params: unknown[] = [];
  const countParams: unknown[] = [];

  if (filters.status) {
    clauses.push("status = ?");
    params.push(filters.status);
    countParams.push(filters.status);
  }
  if (filters.trigger_source) {
    clauses.push("trigger_source = ?");
    params.push(filters.trigger_source);
    countParams.push(filters.trigger_source);
  }

  let query = "SELECT id, trigger_source, status, scanned_email_count, archived_email_count, purged_active_email_count, purged_deleted_email_count, expired_mailbox_count, applied_policy_count, started_at, finished_at, duration_ms, error_message, detail_json, created_at FROM retention_job_runs";
  let countQuery = "SELECT COUNT(1) as total FROM retention_job_runs";

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
    items: list.results.map(mapRetentionJobRun),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
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
    ).bind(addr, ...normalizedProjectIds).first<DbRow>();
  }

  return db.prepare(
    "SELECT message_id, from_address, to_address, subject, extracted_json, received_at, text_body, html_body FROM emails WHERE deleted_at IS NULL AND archived_at IS NULL AND instr(',' || to_address || ',', ',' || ? || ',') > 0 ORDER BY received_at DESC LIMIT 1",
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
    "SELECT emails.message_id, emails.from_address, emails.to_address, emails.subject, emails.extracted_json, emails.received_at, emails.text_body, emails.html_body, emails.has_attachments, emails.archived_at, emails.archived_by, emails.archive_reason, emails.deleted_at, emails.note, emails.tags, emails.project_id, emails.environment_id, emails.mailbox_pool_id, COALESCE(projects.name, '') as project_name, COALESCE(projects.slug, '') as project_slug, COALESCE(environments.name, '') as environment_name, COALESCE(environments.slug, '') as environment_slug, COALESCE(mailbox_pools.name, '') as mailbox_pool_name, COALESCE(mailbox_pools.slug, '') as mailbox_pool_slug, COALESCE(mailboxes.address, '') as primary_mailbox_address FROM emails LEFT JOIN projects ON projects.id = emails.project_id LEFT JOIN environments ON environments.id = emails.environment_id LEFT JOIN mailbox_pools ON mailbox_pools.id = emails.mailbox_pool_id LEFT JOIN mailboxes ON mailboxes.id = emails.primary_mailbox_id";
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
      `SELECT emails.message_id, emails.from_address, emails.to_address, emails.subject, emails.extracted_json, emails.received_at, emails.text_body, emails.html_body, emails.raw_headers, emails.has_attachments, emails.archived_at, emails.archived_by, emails.archive_reason, emails.deleted_at, emails.note, emails.tags, emails.project_id, emails.environment_id, emails.mailbox_pool_id, COALESCE(projects.name, '') as project_name, COALESCE(projects.slug, '') as project_slug, COALESCE(environments.name, '') as environment_name, COALESCE(environments.slug, '') as environment_slug, COALESCE(mailbox_pools.name, '') as mailbox_pool_name, COALESCE(mailbox_pools.slug, '') as mailbox_pool_slug, COALESCE(mailboxes.address, '') as primary_mailbox_address FROM emails LEFT JOIN projects ON projects.id = emails.project_id LEFT JOIN environments ON environments.id = emails.environment_id LEFT JOIN mailbox_pools ON mailbox_pools.id = emails.mailbox_pool_id LEFT JOIN mailboxes ON mailboxes.id = emails.primary_mailbox_id WHERE emails.message_id = ?${scopedWhere} LIMIT 1`,
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

export async function archiveEmail(
  db: D1Database,
  messageId: string,
  input: { archive_reason?: string | null; archived_by: string },
): Promise<void> {
  await db.prepare(
    "UPDATE emails SET archived_at = ?, archived_by = ?, archive_reason = ? WHERE message_id = ? AND deleted_at IS NULL AND archived_at IS NULL",
  ).bind(
    Date.now(),
    input.archived_by,
    String(input.archive_reason || "manual"),
    messageId,
  ).run();
}

export async function unarchiveEmail(db: D1Database, messageId: string): Promise<void> {
  await db.prepare(
    "UPDATE emails SET archived_at = NULL, archived_by = NULL, archive_reason = '' WHERE message_id = ? AND archived_at IS NOT NULL",
  ).bind(messageId).run();
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
  const scope = buildProjectScopedFilter("d", allowedProjectIds);
  const [list, countRow] = await Promise.all([
    db.prepare(
      `SELECT ${DOMAIN_ASSET_SELECT_FIELDS}
      FROM domains d
      LEFT JOIN domain_routing_profiles rp ON rp.id = d.routing_profile_id
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
  const scope = buildProjectScopedFilter("d", allowedProjectIds);
  const query = includeDisabled
    ? `SELECT ${DOMAIN_ASSET_SELECT_FIELDS}
      FROM domains d
      LEFT JOIN domain_routing_profiles rp ON rp.id = d.routing_profile_id
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN environments e ON e.id = d.environment_id${scope.whereClause}
      ORDER BY d.is_primary DESC, d.is_enabled DESC, d.domain ASC`
    : `SELECT ${DOMAIN_ASSET_SELECT_FIELDS}
      FROM domains d
      LEFT JOIN domain_routing_profiles rp ON rp.id = d.routing_profile_id
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
    LEFT JOIN domain_routing_profiles rp ON rp.id = d.routing_profile_id
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
    LEFT JOIN domain_routing_profiles rp ON rp.id = d.routing_profile_id
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
    LEFT JOIN domain_routing_profiles rp ON rp.id = d.routing_profile_id
    LEFT JOIN projects p ON p.id = d.project_id
    LEFT JOIN environments e ON e.id = d.environment_id
    WHERE d.is_primary = 1 LIMIT 1`,
  ).first<DbRow>();

  return row ? mapDomainAsset(row) : null;
}

export async function createDomainAsset(
  db: D1Database,
  input: {
    allow_mailbox_route_sync: boolean;
    allow_new_mailboxes: boolean;
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
    routing_profile_id: number | null;
    zone_id: string;
  },
): Promise<number> {
  const now = Date.now();
  if (input.is_primary) {
    await db.prepare("UPDATE domains SET is_primary = 0, updated_at = ? WHERE is_primary = 1").bind(now).run();
  }

  const result = await db.prepare(
    "INSERT INTO domains (domain, provider, allow_new_mailboxes, allow_mailbox_route_sync, zone_id, email_worker, note, is_enabled, is_primary, catch_all_mode, catch_all_forward_to, routing_profile_id, project_id, environment_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    input.domain,
    input.provider,
    input.allow_new_mailboxes ? 1 : 0,
    input.allow_mailbox_route_sync ? 1 : 0,
    input.zone_id,
    input.email_worker,
    input.note,
    input.is_enabled ? 1 : 0,
    input.is_primary ? 1 : 0,
    input.catch_all_mode,
    input.catch_all_forward_to,
    input.routing_profile_id,
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
    allow_mailbox_route_sync: boolean;
    allow_new_mailboxes: boolean;
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
    routing_profile_id: number | null;
    zone_id: string;
  },
): Promise<void> {
  const now = Date.now();
  if (input.is_primary) {
    await db.prepare("UPDATE domains SET is_primary = 0, updated_at = ? WHERE id <> ? AND is_primary = 1").bind(now, id).run();
  }

  await db.prepare(
    "UPDATE domains SET domain = ?, provider = ?, allow_new_mailboxes = ?, allow_mailbox_route_sync = ?, zone_id = ?, email_worker = ?, note = ?, is_enabled = ?, is_primary = ?, catch_all_mode = ?, catch_all_forward_to = ?, routing_profile_id = ?, project_id = ?, environment_id = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.domain,
    input.provider,
    input.allow_new_mailboxes ? 1 : 0,
    input.allow_mailbox_route_sync ? 1 : 0,
    input.zone_id,
    input.email_worker,
    input.note,
    input.is_enabled ? 1 : 0,
    input.is_primary ? 1 : 0,
    input.catch_all_mode,
    input.catch_all_forward_to,
    input.routing_profile_id,
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

export async function getDomainRoutingProfilesPaged(
  db: D1Database,
  page: number,
  pageSize: number,
  allowedProjectIds?: number[] | null,
): Promise<PaginationPayload<DomainRoutingProfileRecord>> {
  const offset = (page - 1) * pageSize;
  const scope = buildProjectScopedFilter("rp", allowedProjectIds);
  const profileJoins = `
    FROM domain_routing_profiles rp
    LEFT JOIN projects p ON p.id = rp.project_id
    LEFT JOIN environments e ON e.id = rp.environment_id
    LEFT JOIN (
      SELECT routing_profile_id, COUNT(1) as linked_domain_count
      FROM domains
      WHERE routing_profile_id IS NOT NULL
      GROUP BY routing_profile_id
    ) dc ON dc.routing_profile_id = rp.id
  `;
  const [list, countRow] = await Promise.all([
    db.prepare(
      `SELECT ${DOMAIN_ROUTING_PROFILE_SELECT_FIELDS}
      ${profileJoins}${scope.whereClause}
      ORDER BY rp.is_enabled DESC, rp.name ASC
      LIMIT ? OFFSET ?`,
    ).bind(...scope.params, pageSize, offset).all<DbRow>(),
    db.prepare(`SELECT COUNT(1) as total FROM domain_routing_profiles rp${scope.whereClause}`)
      .bind(...scope.params).first<DbRow>(),
  ]);

  return {
    items: list.results.map(mapDomainRoutingProfile),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllDomainRoutingProfiles(
  db: D1Database,
  includeDisabled = true,
  allowedProjectIds?: number[] | null,
): Promise<DomainRoutingProfileRecord[]> {
  const scope = buildProjectScopedFilter("rp", allowedProjectIds);
  const whereClause = includeDisabled
    ? scope.whereClause
    : scope.whereClause
      ? `${scope.whereClause} AND rp.is_enabled = 1`
      : " WHERE rp.is_enabled = 1";
  const rows = await db.prepare(
    `SELECT ${DOMAIN_ROUTING_PROFILE_SELECT_FIELDS}
    FROM domain_routing_profiles rp
    LEFT JOIN projects p ON p.id = rp.project_id
    LEFT JOIN environments e ON e.id = rp.environment_id
    LEFT JOIN (
      SELECT routing_profile_id, COUNT(1) as linked_domain_count
      FROM domains
      WHERE routing_profile_id IS NOT NULL
      GROUP BY routing_profile_id
    ) dc ON dc.routing_profile_id = rp.id${whereClause}
    ORDER BY rp.is_enabled DESC, rp.name ASC`,
  ).bind(...scope.params).all<DbRow>();

  return rows.results.map(mapDomainRoutingProfile);
}

export async function getDomainRoutingProfileById(
  db: D1Database,
  id: number,
): Promise<DomainRoutingProfileRecord | null> {
  const row = await db.prepare(
    `SELECT ${DOMAIN_ROUTING_PROFILE_SELECT_FIELDS}
    FROM domain_routing_profiles rp
    LEFT JOIN projects p ON p.id = rp.project_id
    LEFT JOIN environments e ON e.id = rp.environment_id
    LEFT JOIN (
      SELECT routing_profile_id, COUNT(1) as linked_domain_count
      FROM domains
      WHERE routing_profile_id IS NOT NULL
      GROUP BY routing_profile_id
    ) dc ON dc.routing_profile_id = rp.id
    WHERE rp.id = ? LIMIT 1`,
  ).bind(id).first<DbRow>();

  return row ? mapDomainRoutingProfile(row) : null;
}

export async function createDomainRoutingProfile(
  db: D1Database,
  input: {
    catch_all_forward_to: string;
    catch_all_mode: DomainRoutingProfileRecord["catch_all_mode"];
    environment_id: number | null;
    is_enabled: boolean;
    name: string;
    note: string;
    project_id: number | null;
    provider: string;
    slug: string;
  },
): Promise<number> {
  const now = Date.now();
  const result = await db.prepare(
    "INSERT INTO domain_routing_profiles (name, slug, provider, catch_all_mode, catch_all_forward_to, note, is_enabled, project_id, environment_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    input.name,
    input.slug,
    input.provider,
    input.catch_all_mode,
    input.catch_all_forward_to,
    input.note,
    input.is_enabled ? 1 : 0,
    input.project_id,
    input.environment_id,
    now,
    now,
  ).run() as { meta?: { last_row_id?: number } };

  const insertedId = Number(result?.meta?.last_row_id || 0);
  if (insertedId > 0) return insertedId;

  const row = await db.prepare(
    "SELECT id FROM domain_routing_profiles WHERE slug = ? LIMIT 1",
  ).bind(input.slug).first<DbRow>();
  return numberValue(row || {}, "id", 0);
}

export async function updateDomainRoutingProfile(
  db: D1Database,
  id: number,
  input: {
    catch_all_forward_to: string;
    catch_all_mode: DomainRoutingProfileRecord["catch_all_mode"];
    environment_id: number | null;
    is_enabled: boolean;
    name: string;
    note: string;
    project_id: number | null;
    provider: string;
    slug: string;
  },
): Promise<void> {
  await db.prepare(
    "UPDATE domain_routing_profiles SET name = ?, slug = ?, provider = ?, catch_all_mode = ?, catch_all_forward_to = ?, note = ?, is_enabled = ?, project_id = ?, environment_id = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.name,
    input.slug,
    input.provider,
    input.catch_all_mode,
    input.catch_all_forward_to,
    input.note,
    input.is_enabled ? 1 : 0,
    input.project_id,
    input.environment_id,
    Date.now(),
    id,
  ).run();
}

export async function deleteDomainRoutingProfile(db: D1Database, id: number): Promise<void> {
  const existing = await getDomainRoutingProfileById(db, id);
  if (!existing) return;
  if (existing.linked_domain_count > 0) {
    throw new Error("routing profile is in use and cannot be deleted");
  }
  await db.prepare("DELETE FROM domain_routing_profiles WHERE id = ?").bind(id).run();
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
    "SELECT id, username, display_name, role, access_scope, note, password_hash, password_salt, is_enabled, created_at, updated_at, last_login_at FROM admin_users WHERE username = ? LIMIT 1",
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
  note: string;
  project_ids: number[];
  role: AdminRole;
  username: string;
} | null> {
  const row = await db.prepare(
    "SELECT id, username, display_name, role, access_scope, note, is_enabled FROM admin_users WHERE id = ? LIMIT 1",
  ).bind(adminId).first<DbRow>();

  if (!row) return null;

  const bindings = await getProjectBindingsMap(db, "admin_project_bindings", "admin_id", [adminId]);
  const access_scope = normalizeAccessScope(row.access_scope);
  return {
    access_scope,
    display_name: stringValue(row, "display_name"),
    is_enabled: boolValue(row, "is_enabled", true),
    note: stringValue(row, "note"),
    project_ids: (bindings.get(String(adminId)) || []).map(item => item.id),
    role: normalizeAdminRole(stringValue(row, "role", "viewer"), access_scope) || "viewer",
    username: stringValue(row, "username"),
  };
}

interface AdminUserPageFilters {
  access_scope?: AccessScope | null;
  is_enabled?: boolean | null;
  keyword?: string | null;
  project_id?: number | null;
  role?: AdminRole | null;
}

export async function getAdminUsersPaged(
  db: D1Database,
  page: number,
  pageSize: number,
  filters: AdminUserPageFilters = {},
  allowedProjectIds?: number[] | null,
): Promise<PaginationPayload<AdminUserRecord>> {
  const offset = (page - 1) * pageSize;
  const normalizedProjectIds = uniquePositiveIds(allowedProjectIds || []);
  const normalizedKeyword = String(filters.keyword || "").trim();
  const normalizedAccessScope =
    filters.access_scope === "all" || filters.access_scope === "bound"
      ? filters.access_scope
      : null;
  const normalizedRole = filters.role
    ? normalizeAdminRole(filters.role, normalizedAccessScope || "all")
    : null;
  const normalizedProjectId = uniquePositiveIds([filters.project_id || 0])[0] || null;
  const clauses: string[] = [];
  const params: unknown[] = [];
  const countParams: unknown[] = [];

  if (normalizedKeyword) {
    const pattern = `%${normalizedKeyword}%`;
    clauses.push(`(
      admin_users.username LIKE ?
      OR admin_users.display_name LIKE ?
      OR admin_users.note LIKE ?
      OR EXISTS (
        SELECT 1
        FROM admin_project_bindings bindings
        JOIN projects project ON project.id = bindings.project_id
        WHERE bindings.admin_id = admin_users.id
          AND (project.name LIKE ? OR project.slug LIKE ?)
      )
    )`);
    params.push(pattern, pattern, pattern, pattern, pattern);
    countParams.push(pattern, pattern, pattern, pattern, pattern);
  }

  if (normalizedRole) {
    clauses.push("admin_users.role = ?");
    params.push(normalizedRole);
    countParams.push(normalizedRole);
  }

  if (normalizedAccessScope) {
    clauses.push("admin_users.access_scope = ?");
    params.push(normalizedAccessScope);
    countParams.push(normalizedAccessScope);
  }

  if (typeof filters.is_enabled === "boolean") {
    clauses.push("admin_users.is_enabled = ?");
    params.push(filters.is_enabled ? 1 : 0);
    countParams.push(filters.is_enabled ? 1 : 0);
  }

  if (normalizedProjectId) {
    clauses.push(
      "EXISTS (SELECT 1 FROM admin_project_bindings bindings WHERE bindings.admin_id = admin_users.id AND bindings.project_id = ?)",
    );
    params.push(normalizedProjectId);
    countParams.push(normalizedProjectId);
  }

  if (normalizedProjectIds.length > 0) {
    const placeholders = buildSqlPlaceholders(normalizedProjectIds.length);
    clauses.push("admin_users.access_scope = 'bound'");
    clauses.push(
      `EXISTS (SELECT 1 FROM admin_project_bindings bindings WHERE bindings.admin_id = admin_users.id AND bindings.project_id IN (${placeholders}))`,
    );
    clauses.push(
      `NOT EXISTS (SELECT 1 FROM admin_project_bindings bindings WHERE bindings.admin_id = admin_users.id AND bindings.project_id NOT IN (${placeholders}))`,
    );
    params.push(...normalizedProjectIds, ...normalizedProjectIds);
    countParams.push(...normalizedProjectIds, ...normalizedProjectIds);
  }

  const whereClause = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";

  const [list, countRow] = await Promise.all([
    db.prepare(
      `SELECT
        id,
        username,
        display_name,
        role,
        access_scope,
        note,
        is_enabled,
        created_at,
        updated_at,
        last_login_at,
        (
          SELECT audit.created_at
          FROM audit_logs audit
          WHERE audit.entity_type = 'admin_user'
            AND audit.entity_id = admin_users.id
            AND audit.action IN ('admin.create', 'admin.update')
          ORDER BY audit.created_at DESC
          LIMIT 1
        ) AS last_modified_at,
        (
          SELECT audit.actor_name
          FROM audit_logs audit
          WHERE audit.entity_type = 'admin_user'
            AND audit.entity_id = admin_users.id
            AND audit.action IN ('admin.create', 'admin.update')
          ORDER BY audit.created_at DESC
          LIMIT 1
        ) AS last_modified_by,
        (
          SELECT audit.action
          FROM audit_logs audit
          WHERE audit.entity_type = 'admin_user'
            AND audit.entity_id = admin_users.id
            AND audit.action IN ('admin.create', 'admin.update')
          ORDER BY audit.created_at DESC
          LIMIT 1
        ) AS last_modified_action
      FROM admin_users${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).bind(...params, pageSize, offset).all<DbRow>(),
    db.prepare(`SELECT COUNT(1) as total FROM admin_users${whereClause}`).bind(...countParams).first<DbRow>(),
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
    `SELECT
      id,
      username,
      display_name,
      role,
      access_scope,
      note,
      is_enabled,
      created_at,
      updated_at,
      last_login_at,
      (
        SELECT audit.created_at
        FROM audit_logs audit
        WHERE audit.entity_type = 'admin_user'
          AND audit.entity_id = admin_users.id
          AND audit.action IN ('admin.create', 'admin.update')
        ORDER BY audit.created_at DESC
        LIMIT 1
      ) AS last_modified_at,
      (
        SELECT audit.actor_name
        FROM audit_logs audit
        WHERE audit.entity_type = 'admin_user'
          AND audit.entity_id = admin_users.id
          AND audit.action IN ('admin.create', 'admin.update')
        ORDER BY audit.created_at DESC
        LIMIT 1
      ) AS last_modified_by,
      (
        SELECT audit.action
        FROM audit_logs audit
        WHERE audit.entity_type = 'admin_user'
          AND audit.entity_id = admin_users.id
          AND audit.action IN ('admin.create', 'admin.update')
        ORDER BY audit.created_at DESC
        LIMIT 1
      ) AS last_modified_action
    FROM admin_users ORDER BY created_at DESC`,
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
    note: string;
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
    "INSERT INTO admin_users (id, username, display_name, role, access_scope, note, password_hash, password_salt, is_enabled, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)",
  ).bind(
    id,
    input.username,
    input.display_name,
    input.role,
    input.access_scope,
    input.note,
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
    last_modified_action: "",
    last_modified_at: null,
    last_modified_by: "",
    note: input.note,
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
    note: string;
    password_hash?: string;
    password_salt?: string;
    project_ids: number[];
    role: AdminRole;
  },
): Promise<void> {
  if (input.password_hash && input.password_salt) {
    await db.prepare(
      "UPDATE admin_users SET display_name = ?, role = ?, access_scope = ?, is_enabled = ?, note = ?, password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?",
    ).bind(
      input.display_name,
      input.role,
      input.access_scope,
      input.is_enabled ? 1 : 0,
      input.note,
      input.password_hash,
      input.password_salt,
      Date.now(),
      id,
    ).run();
  } else {
    await db.prepare(
      "UPDATE admin_users SET display_name = ?, role = ?, access_scope = ?, is_enabled = ?, note = ?, updated_at = ? WHERE id = ?",
    ).bind(
      input.display_name,
      input.role,
      input.access_scope,
      input.is_enabled ? 1 : 0,
      input.note,
      Date.now(),
      id,
    ).run();
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
      `SELECT id, name, type, target, secret, events, alert_config_json, access_scope, is_enabled, created_at, updated_at, last_status, last_error, last_sent_at FROM notification_endpoints n${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
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
    "SELECT id, name, type, target, secret, events, alert_config_json, access_scope, is_enabled, created_at, updated_at, last_status, last_error, last_sent_at FROM notification_endpoints ORDER BY created_at DESC",
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
    "SELECT id, name, type, target, secret, events, alert_config_json, access_scope, is_enabled, created_at, updated_at, last_status, last_error, last_sent_at FROM notification_endpoints WHERE id = ? LIMIT 1",
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
    alert_config: NotificationAlertConfig;
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
    "INSERT INTO notification_endpoints (name, type, target, secret, events, alert_config_json, access_scope, is_enabled, created_at, updated_at, last_status, last_error, last_sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', NULL)",
  ).bind(
    input.name,
    input.type,
    input.target,
    input.secret || null,
    jsonStringify(input.events, "[]"),
    jsonStringify(input.alert_config as unknown as JsonValue, "{}"),
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
    alert_config: NotificationAlertConfig;
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
    "UPDATE notification_endpoints SET name = ?, type = ?, target = ?, secret = ?, events = ?, alert_config_json = ?, access_scope = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.name,
    input.type,
    input.target,
    input.secret || null,
    jsonStringify(input.events, "[]"),
    jsonStringify(input.alert_config as unknown as JsonValue, "{}"),
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
        "SELECT id, notification_endpoint_id, event, payload_json, scope_json, status, attempt_count, max_attempts, last_error, response_status, next_retry_at, last_attempt_at, is_dead_letter, dead_letter_reason, resolved_at, resolved_by, created_at, updated_at FROM notification_deliveries WHERE id = ? LIMIT 1",
      ).bind(insertedId).first<DbRow>()
    : await db.prepare(
        "SELECT id, notification_endpoint_id, event, payload_json, scope_json, status, attempt_count, max_attempts, last_error, response_status, next_retry_at, last_attempt_at, is_dead_letter, dead_letter_reason, resolved_at, resolved_by, created_at, updated_at FROM notification_deliveries WHERE notification_endpoint_id = ? AND event = ? AND created_at = ? ORDER BY id DESC LIMIT 1",
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
  filters: {
    dead_letter_only?: boolean;
  } = {},
): Promise<NotificationDeliveriesPayload> {
  const offset = (page - 1) * pageSize;
  const clauses = ["notification_endpoint_id = ?"];
  const params: unknown[] = [notification_endpoint_id];
  const countParams: unknown[] = [notification_endpoint_id];

  if (filters.dead_letter_only) {
    clauses.push("is_dead_letter = 1");
  }

  const whereClause = ` WHERE ${clauses.join(" AND ")}`;
  const [list, countRow, summaryRow, endpointAlertRow] = await Promise.all([
    db.prepare(
      `SELECT id, notification_endpoint_id, event, payload_json, scope_json, status, attempt_count, max_attempts, last_error, response_status, next_retry_at, last_attempt_at, is_dead_letter, dead_letter_reason, resolved_at, resolved_by, created_at, updated_at FROM notification_deliveries${whereClause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    ).bind(...params, pageSize, offset).all<DbRow>(),
    db.prepare(
      `SELECT COUNT(1) as total FROM notification_deliveries${whereClause}`,
    ).bind(...countParams).first<DbRow>(),
    db.prepare(
      `SELECT
        COUNT(1) as total_deliveries,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_total,
        SUM(CASE WHEN status = 'retrying' THEN 1 ELSE 0 END) as retrying_total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_total,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_total,
        SUM(CASE WHEN is_dead_letter = 1 THEN 1 ELSE 0 END) as dead_letter_total,
        SUM(CASE WHEN resolved_at IS NOT NULL THEN 1 ELSE 0 END) as resolved_dead_letter_total,
        COALESCE(SUM(attempt_count), 0) as total_attempts,
        MAX(last_attempt_at) as last_attempt_at
      FROM notification_deliveries
      WHERE notification_endpoint_id = ?`,
    ).bind(notification_endpoint_id).first<DbRow>(),
    db.prepare(
      "SELECT alert_config_json FROM notification_endpoints WHERE id = ? LIMIT 1",
    ).bind(notification_endpoint_id).first<DbRow>(),
  ]);

  const alertConfig = normalizeNotificationAlertConfig(
    safeParseJson<Record<string, unknown>>(
      stringValue(endpointAlertRow || {}, "alert_config_json", "{}"),
      {},
    ),
  );

  let recentAttemptRow: DbRow | null = null;
  try {
    recentAttemptRow = await db.prepare(
      `SELECT
        COUNT(1) as recent_attempts_24h,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as recent_success_attempts_24h,
        SUM(CASE WHEN status IN ('failed', 'retrying') THEN 1 ELSE 0 END) as recent_failed_attempts_24h,
        AVG(duration_ms) as avg_duration_ms_24h,
        MAX(CASE WHEN status = 'success' THEN attempted_at ELSE NULL END) as last_success_at,
        MAX(CASE WHEN status IN ('failed', 'retrying') THEN attempted_at ELSE NULL END) as last_failure_at
      FROM notification_delivery_attempts
      WHERE notification_endpoint_id = ? AND attempted_at >= ?`,
    ).bind(notification_endpoint_id, Date.now() - 24 * 60 * 60 * 1000).first<DbRow>();
  } catch (error) {
    if (!isSqliteSchemaError(error)) throw error;
  }

  return {
    items: list.results.map(mapNotificationDelivery),
    page,
    pageSize,
    summary: mapNotificationDeliverySummary({
      ...(summaryRow || {}),
      avg_duration_ms_24h: nullableNumberValue(recentAttemptRow || {}, "avg_duration_ms_24h"),
      last_failure_at: nullableNumberValue(recentAttemptRow || {}, "last_failure_at"),
      last_success_at: nullableNumberValue(recentAttemptRow || {}, "last_success_at"),
      recent_attempts_24h: numberValue(recentAttemptRow || {}, "recent_attempts_24h", 0),
      recent_failed_attempts_24h: numberValue(recentAttemptRow || {}, "recent_failed_attempts_24h", 0),
      recent_success_attempts_24h: numberValue(recentAttemptRow || {}, "recent_success_attempts_24h", 0),
    }, alertConfig),
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getNotificationDeliveryById(
  db: D1Database,
  id: number,
): Promise<NotificationDeliveryRecord | null> {
  const row = await db.prepare(
    "SELECT id, notification_endpoint_id, event, payload_json, scope_json, status, attempt_count, max_attempts, last_error, response_status, next_retry_at, last_attempt_at, is_dead_letter, dead_letter_reason, resolved_at, resolved_by, created_at, updated_at FROM notification_deliveries WHERE id = ? LIMIT 1",
  ).bind(id).first<DbRow>();

  return row ? mapNotificationDelivery(row) : null;
}

export async function getDueNotificationDeliveries(
  db: D1Database,
  limit = 20,
): Promise<NotificationDeliveryRecord[]> {
  const rows = await db.prepare(
    "SELECT id, notification_endpoint_id, event, payload_json, scope_json, status, attempt_count, max_attempts, last_error, response_status, next_retry_at, last_attempt_at, is_dead_letter, dead_letter_reason, resolved_at, resolved_by, created_at, updated_at FROM notification_deliveries WHERE status IN ('pending', 'retrying') AND next_retry_at IS NOT NULL AND next_retry_at <= ? ORDER BY next_retry_at ASC, id ASC LIMIT ?",
  ).bind(Date.now(), limit).all<DbRow>();

  return rows.results.map(mapNotificationDelivery);
}

export async function updateNotificationDeliveryRecord(
  db: D1Database,
  id: number,
  input: {
    attempt_count: number;
    dead_letter_reason: string;
    is_dead_letter: boolean;
    last_attempt_at: number | null;
    last_error: string;
    next_retry_at: number | null;
    response_status: number | null;
    resolved_at: number | null;
    resolved_by: string;
    status: NotificationDeliveryStatus;
  },
): Promise<void> {
  await db.prepare(
    "UPDATE notification_deliveries SET status = ?, attempt_count = ?, last_error = ?, response_status = ?, next_retry_at = ?, last_attempt_at = ?, is_dead_letter = ?, dead_letter_reason = ?, resolved_at = ?, resolved_by = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.status,
    input.attempt_count,
    input.last_error,
    input.response_status,
    input.next_retry_at,
    input.last_attempt_at,
    input.is_dead_letter ? 1 : 0,
    input.dead_letter_reason,
    input.resolved_at,
    input.resolved_by,
    Date.now(),
    id,
  ).run();
}

export async function createNotificationDeliveryAttemptRecord(
  db: D1Database,
  input: {
    attempt_number: number;
    attempted_at: number;
    duration_ms: number | null;
    error_message: string;
    next_retry_at: number | null;
    notification_delivery_id: number;
    notification_endpoint_id: number;
    response_status: number | null;
    status: NotificationDeliveryStatus;
  },
): Promise<void> {
  await db.prepare(
    "INSERT INTO notification_delivery_attempts (notification_delivery_id, notification_endpoint_id, attempt_number, status, response_status, error_message, next_retry_at, attempted_at, duration_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    input.notification_delivery_id,
    input.notification_endpoint_id,
    input.attempt_number,
    input.status,
    input.response_status,
    input.error_message,
    input.next_retry_at,
    input.attempted_at,
    input.duration_ms,
    input.attempted_at,
    input.attempted_at,
  ).run();
}

export async function getNotificationDeliveryAttemptsPaged(
  db: D1Database,
  page: number,
  pageSize: number,
  notification_delivery_id: number,
): Promise<PaginationPayload<NotificationDeliveryAttemptRecord>> {
  const offset = (page - 1) * pageSize;
  const [list, countRow] = await Promise.all([
    db.prepare(
      "SELECT id, notification_delivery_id, notification_endpoint_id, attempt_number, status, response_status, error_message, next_retry_at, attempted_at, duration_ms, created_at, updated_at FROM notification_delivery_attempts WHERE notification_delivery_id = ? ORDER BY attempted_at DESC, id DESC LIMIT ? OFFSET ?",
    ).bind(notification_delivery_id, pageSize, offset).all<DbRow>(),
    db.prepare(
      "SELECT COUNT(1) as total FROM notification_delivery_attempts WHERE notification_delivery_id = ?",
    ).bind(notification_delivery_id).first<DbRow>(),
  ]);

  return {
    items: list.results.map(mapNotificationDeliveryAttempt),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function resolveNotificationDeliveryDeadLetter(
  db: D1Database,
  id: number,
  resolvedBy: string,
): Promise<void> {
  const now = Date.now();
  await db.prepare(
    "UPDATE notification_deliveries SET is_dead_letter = 0, resolved_at = ?, resolved_by = ?, updated_at = ? WHERE id = ?",
  ).bind(now, resolvedBy, now, id).run();
}

export async function deleteNotificationEndpoint(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM notification_delivery_attempts WHERE notification_endpoint_id = ?").bind(id).run();
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

interface AuditLogPageFilters {
  action?: string | null;
  action_prefix?: string | null;
  entity_id?: string | null;
  entity_type?: string | null;
  keyword?: string | null;
}

function buildAuditLogFilters(filters: AuditLogPageFilters = {}) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const normalizedKeyword = String(filters.keyword || "").trim();
  const normalizedEntityType = String(filters.entity_type || "").trim();
  const normalizedEntityId = String(filters.entity_id || "").trim();
  const normalizedAction = String(filters.action || "").trim();
  const normalizedActionPrefix = String(filters.action_prefix || "").trim();

  if (normalizedKeyword) {
    const pattern = `%${normalizedKeyword}%`;
    clauses.push(`(
      actor_name LIKE ?
      OR actor_role LIKE ?
      OR action LIKE ?
      OR entity_type LIKE ?
      OR entity_id LIKE ?
      OR detail_json LIKE ?
    )`);
    params.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }

  if (normalizedEntityType) {
    clauses.push("entity_type = ?");
    params.push(normalizedEntityType);
  }

  if (normalizedEntityId) {
    clauses.push("entity_id = ?");
    params.push(normalizedEntityId);
  }

  if (normalizedAction) {
    clauses.push("action = ?");
    params.push(normalizedAction);
  }

  if (normalizedActionPrefix) {
    clauses.push("action LIKE ?");
    params.push(`${normalizedActionPrefix}%`);
  }

  return {
    params,
    whereClause: clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "",
  };
}

export async function getAuditLogsPaged(
  db: D1Database,
  page: number,
  pageSize: number,
  filters: AuditLogPageFilters = {},
): Promise<PaginationPayload<AuditLogRecord>> {
  const offset = (page - 1) * pageSize;
  const { params, whereClause } = buildAuditLogFilters(filters);
  const countParams = [...params];
  const [list, countRow] = await Promise.all([
    db.prepare(
      `SELECT id, actor_id, actor_name, actor_role, action, entity_type, entity_id, detail_json, created_at FROM audit_logs${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).bind(...params, pageSize, offset).all<DbRow>(),
    db.prepare(`SELECT COUNT(1) as total FROM audit_logs${whereClause}`).bind(...countParams).first<DbRow>(),
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
    "SELECT message_id FROM emails WHERE deleted_at IS NULL AND archived_at IS NULL AND received_at < ?",
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
    const result = await getEmails(db, 1, 10_000, { archived: "exclude", deleted: "exclude" }, allowedProjectIds);
    return result.items.map(item => toExportRow(item));
  }
  if (resource === "trash") {
    const result = await getEmails(db, 1, 10_000, { archived: "include", deleted: "only" }, allowedProjectIds);
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
