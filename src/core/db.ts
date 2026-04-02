import {
  isSqliteSchemaError,
  jsonStringify,
  safeParseJson,
} from "../utils/utils";
import { normalizeNotificationAlertConfig } from "../utils/constants";
import { getAllAdminUsers } from "./db-admin-users";
import { getEmails } from "./db-emails";
import {
  getAllNotificationEndpoints,
  getNotificationEndpointsPaged,
} from "./db-notification-endpoints";
import { getAllMailboxes } from "./db-mailboxes";
import {
  attachResolvedRetentionToRecord,
  getAllRetentionPolicies,
  resolveRetentionPolicyConfigFromRecords,
} from "./db-retention-policies";
import {
  getAllRules,
  getAllWhitelist,
} from "./db-rules-whitelist";
import { getAllAuditLogs } from "./db-audit";
import type {
  D1Database,
  ExportRow,
  JsonValue,
  MailboxPoolRecord,
  NotificationAlertConfig,
  NotificationDeliveriesPayload,
  NotificationDeliveryRecord,
  NotificationDeliveryAttemptRecord,
  NotificationSummaryAlert,
  NotificationDeliverySummary,
  NotificationDeliveryScope,
  NotificationDeliveryStatus,
  OverviewStats,
  PaginationPayload,
  ResolvedRetentionPolicy,
  WorkspaceCatalog,
  WorkspaceEnvironmentRecord,
  WorkspaceProjectRecord,
  WhitelistSettings,
} from "../server/types";
export {
  addAuditLog,
  addErrorEvent,
  getAllAuditLogs,
  getAuditLogsPaged,
  getErrorEventsPaged,
} from "./db-audit";
export {
  createRule,
  createWhitelistEntry,
  deleteRule,
  deleteWhitelistEntry,
  getAllRules,
  getAllWhitelist,
  getRuleById,
  getRulesPaged,
  getWhitelistById,
  getWhitelistPaged,
  loadRules,
  loadWhitelist,
  updateRule,
  updateWhitelistEntry,
} from "./db-rules-whitelist";
export {
  createAdminUser,
  findAdminUserByUsername,
  getAdminAccessContext,
  getAdminUsersPaged,
  touchAdminUserLogin,
  updateAdminUser,
} from "./db-admin-users";
export {
  createApiToken,
  deleteApiToken,
  getActiveApiTokenById,
  getAllApiTokens,
  getApiTokenById,
  getApiTokensPaged,
  touchApiTokenLastUsed,
  updateApiToken,
} from "./db-api-tokens";
export {
  createOutboundContact,
  createOutboundEmailRecord,
  createOutboundTemplate,
  deleteOutboundContact,
  deleteOutboundEmailRecord,
  deleteOutboundTemplate,
  getDueScheduledOutboundEmails,
  getOutboundContactById,
  getOutboundContacts,
  getOutboundEmailById,
  getOutboundEmailSettings,
  getOutboundEmailsPaged,
  getOutboundStats,
  getOutboundTemplateById,
  getOutboundTemplates,
  updateOutboundContact,
  updateOutboundEmailDelivery,
  updateOutboundEmailRecord,
  updateOutboundEmailSettings,
  updateOutboundTemplate,
} from "./db-outbound";
export {
  completeMailboxSyncRun,
  createMailboxSyncRun,
  createRetentionJobRun,
  failMailboxSyncRun,
  getActiveMailboxSyncRun,
  getLatestMailboxSyncRun,
  getMailboxSyncRunById,
  getRetentionJobRunsPaged,
  getRetentionJobRunSummary,
  markMailboxSyncRunRunning,
  touchMailboxSyncRunHeartbeat,
} from "./db-job-runs";
export {
  createNotificationEndpoint,
  deleteNotificationEndpoint,
  getAllNotificationEndpoints,
  getNotificationEndpointById,
  getNotificationEndpointsPaged,
  updateNotificationDelivery,
  updateNotificationEndpoint,
} from "./db-notification-endpoints";
export {
  createEnvironment,
  createMailboxPool,
  createProject,
  deleteEnvironment,
  deleteMailboxPool,
  deleteProject,
  getEnvironmentById,
  getMailboxPoolById,
  getProjectById,
  updateEnvironment,
  updateMailboxPool,
  updateProject,
  validateWorkspaceAssignment,
} from "./db-workspace-entities";
export {
  createDomainAsset,
  createDomainRoutingProfile,
  deleteDomainAsset,
  deleteDomainRoutingProfile,
  getAllDomainAssets,
  getAllDomainAssetsWithSecrets,
  getAllDomainRoutingProfiles,
  getAvailableDomains,
  getDomainAssetById,
  getDomainAssetByName,
  getDomainAssetUsageStats,
  getDomainAssetWithSecretById,
  getDomainAssetWithSecretByName,
  getDomainAssetsPaged,
  getDomainRoutingProfileById,
  getDomainRoutingProfilesPaged,
  getPrimaryDomainAsset,
  updateDomainAsset,
  updateDomainRoutingProfile,
} from "./db-domain-assets";
export {
  archiveEmail,
  clearExpiredEmails,
  getAttachmentContent,
  getEmailByMessageId,
  getEmailByMessageIdScoped,
  getEmailProjectIds,
  getEmails,
  getLatestEmail,
  purgeDeletedEmails,
  purgeEmail,
  restoreEmail,
  saveEmail,
  softDeleteEmail,
  unarchiveEmail,
  updateEmailMetadata,
} from "./db-emails";
export {
  applyMailboxSyncCandidate,
  backfillMailboxWorkspaceScope,
  createMailbox,
  deleteMailbox,
  disableExpiredMailboxes,
  getAllMailboxes,
  getMailboxById,
  getMailboxesPaged,
  getObservedMailboxStats,
  updateMailbox,
} from "./db-mailboxes";
export {
  applyRetentionPoliciesPurge,
  attachResolvedRetentionToRecord,
  buildRetentionPolicyScopeKey,
  createRetentionPolicy,
  deleteRetentionPolicy,
  getAllRetentionPolicies,
  getRetentionPoliciesPaged,
  getRetentionPolicyById,
  resolveMailboxExpirationTimestamp,
  resolveRetentionPolicyConfig,
  resolveRetentionPolicyConfigFromRecords,
  updateRetentionPolicy,
} from "./db-retention-policies";
export type {
  RetentionAffectedEmailRecord,
  RetentionPurgeSummary,
  RetentionScopeSummaryRecord,
} from "./db-retention-policies";

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
    resolved_retention: createEmptyResolvedRetentionPolicy(),
    slug: stringValue(row, "slug"),
    updated_at: numberValue(row, "updated_at", Date.now()),
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
    resolved_retention: createEmptyResolvedRetentionPolicy(),
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
    resolved_retention: createEmptyResolvedRetentionPolicy(),
    slug: stringValue(row, "slug"),
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

  const [projectRows, environmentRows, poolRows, policies] = await Promise.all([
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
    getAllRetentionPolicies(db, { enabledOnly: true }, allowedProjectIds),
  ]);

  const projects = projectRows.results.map(row => {
    const record = mapWorkspaceProject(row);
    return {
      ...record,
      resolved_retention: resolveRetentionPolicyConfigFromRecords(policies, {
        project_id: record.id,
      }),
    };
  });

  const environments = environmentRows.results.map(row => {
    const record = mapWorkspaceEnvironment(row);
    return {
      ...record,
      resolved_retention: resolveRetentionPolicyConfigFromRecords(policies, {
        environment_id: record.id,
        project_id: record.project_id,
      }),
    };
  });

  const mailboxPools = poolRows.results.map(row => {
    const record = mapMailboxPool(row);
    return {
      ...record,
      resolved_retention: resolveRetentionPolicyConfigFromRecords(policies, {
        environment_id: record.environment_id,
        mailbox_pool_id: record.id,
        project_id: record.project_id,
      }),
    };
  });

  return {
    environments,
    mailbox_pools: mailboxPools,
    projects,
  };
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
