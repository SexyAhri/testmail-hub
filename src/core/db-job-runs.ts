import { jsonStringify, safeParseJson } from "../utils/utils";
import type {
  D1Database,
  JsonValue,
  MailboxSyncResult,
  MailboxSyncRunRecord,
  MailboxSyncRunStatus,
  PaginationPayload,
  RetentionJobRunRecord,
  RetentionJobRunSummary,
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

function mapRetentionJobRun(row: DbRow): RetentionJobRunRecord {
  return {
    archived_email_count: numberValue(row, "archived_email_count", 0),
    applied_policy_count: numberValue(row, "applied_policy_count", 0),
    created_at: numberValue(row, "created_at", Date.now()),
    detail_json:
      safeParseJson<JsonValue>(stringValue(row, "detail_json", "{}"), {})
      || {},
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

function mapMailboxSyncRun(row: DbRow): MailboxSyncRunRecord {
  return {
    catch_all_enabled: boolValue(row, "catch_all_enabled", false),
    cloudflare_configured: boolValue(row, "cloudflare_configured", false),
    cloudflare_routes_total: numberValue(row, "cloudflare_routes_total", 0),
    created_at: numberValue(row, "created_at", Date.now()),
    created_count: numberValue(row, "created_count", 0),
    domain_summaries:
      safeParseJson<MailboxSyncResult["domain_summaries"]>(
        stringValue(row, "domain_summaries_json", "[]"),
        [],
      ) || [],
    duration_ms: nullableNumberValue(row, "duration_ms"),
    error_message: stringValue(row, "error_message"),
    finished_at: nullableNumberValue(row, "finished_at"),
    id: numberValue(row, "id"),
    observed_total: numberValue(row, "observed_total", 0),
    requested_by: stringValue(row, "requested_by"),
    skipped_count: numberValue(row, "skipped_count", 0),
    started_at: numberValue(row, "started_at", Date.now()),
    status: stringValue(row, "status", "pending") as MailboxSyncRunStatus,
    trigger_source: stringValue(row, "trigger_source", "manual"),
    updated_at: numberValue(
      row,
      "updated_at",
      numberValue(row, "created_at", Date.now()),
    ),
    updated_count: numberValue(row, "updated_count", 0),
  };
}

function mapRetentionJobRunSummaryLastRun(
  row: DbRow | null,
): RetentionJobRunSummary["last_run"] {
  if (!row) return null;

  return {
    duration_ms: nullableNumberValue(row, "duration_ms"),
    finished_at: nullableNumberValue(row, "finished_at"),
    id: numberValue(row, "id", 0),
    started_at: numberValue(row, "started_at", 0),
    status: stringValue(row, "status", "success") as RetentionJobRunRecord["status"],
    trigger_source: stringValue(row, "trigger_source", "scheduled"),
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
  const result = (await db
    .prepare(
      "INSERT INTO retention_job_runs (trigger_source, status, scanned_email_count, archived_email_count, purged_active_email_count, purged_deleted_email_count, expired_mailbox_count, applied_policy_count, started_at, finished_at, duration_ms, error_message, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
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
    )
    .run()) as { meta?: { last_row_id?: number } };

  const insertedId = Number(result?.meta?.last_row_id || 0);
  if (insertedId > 0) return insertedId;

  const row = await db
    .prepare(
      "SELECT id FROM retention_job_runs WHERE trigger_source = ? AND started_at = ? ORDER BY id DESC LIMIT 1",
    )
    .bind(input.trigger_source, input.started_at)
    .first<DbRow>();
  return numberValue(row || {}, "id", 0);
}

export async function createMailboxSyncRun(
  db: D1Database,
  input: {
    requested_by: string;
    started_at: number;
    status?: MailboxSyncRunStatus;
    trigger_source?: string;
  },
): Promise<number> {
  const status = input.status || "pending";
  const triggerSource = input.trigger_source || "manual";
  const createdAt = input.started_at || Date.now();
  const result = (await db
    .prepare(
      "INSERT INTO mailbox_sync_runs (trigger_source, requested_by, status, catch_all_enabled, cloudflare_configured, cloudflare_routes_total, created_count, updated_count, skipped_count, observed_total, domain_summaries_json, error_message, started_at, finished_at, duration_ms, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0, '[]', '', ?, NULL, NULL, ?, ?)",
    )
    .bind(
      triggerSource,
      input.requested_by || "",
      status,
      input.started_at,
      createdAt,
      createdAt,
    )
    .run()) as { meta?: { last_row_id?: number } };

  const insertedId = Number(result?.meta?.last_row_id || 0);
  if (insertedId > 0) return insertedId;

  const row = await db
    .prepare(
      "SELECT id FROM mailbox_sync_runs WHERE trigger_source = ? AND requested_by = ? AND started_at = ? ORDER BY id DESC LIMIT 1",
    )
    .bind(triggerSource, input.requested_by || "", input.started_at)
    .first<DbRow>();
  return numberValue(row || {}, "id", 0);
}

export async function markMailboxSyncRunRunning(
  db: D1Database,
  id: number,
): Promise<void> {
  await db
    .prepare(
      "UPDATE mailbox_sync_runs SET status = 'running', updated_at = ? WHERE id = ? AND status = 'pending'",
    )
    .bind(Date.now(), id)
    .run();
}

export async function touchMailboxSyncRunHeartbeat(
  db: D1Database,
  id: number,
  updatedAt = Date.now(),
): Promise<void> {
  await db
    .prepare(
      "UPDATE mailbox_sync_runs SET updated_at = ? WHERE id = ? AND status IN ('pending', 'running')",
    )
    .bind(updatedAt, id)
    .run();
}

export async function completeMailboxSyncRun(
  db: D1Database,
  id: number,
  input: {
    finished_at: number;
    result: MailboxSyncResult;
    started_at: number;
    status?: Extract<MailboxSyncRunStatus, "success">;
  },
): Promise<void> {
  const status = input.status || "success";
  await db
    .prepare(
      "UPDATE mailbox_sync_runs SET status = ?, catch_all_enabled = ?, cloudflare_configured = ?, cloudflare_routes_total = ?, created_count = ?, updated_count = ?, skipped_count = ?, observed_total = ?, domain_summaries_json = ?, error_message = '', finished_at = ?, duration_ms = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      status,
      input.result.catch_all_enabled ? 1 : 0,
      input.result.cloudflare_configured ? 1 : 0,
      input.result.cloudflare_routes_total,
      input.result.created_count,
      input.result.updated_count,
      input.result.skipped_count,
      input.result.observed_total,
      jsonStringify(
        (input.result.domain_summaries || []) as unknown as JsonValue,
        "[]",
      ),
      input.finished_at,
      Math.max(0, input.finished_at - input.started_at),
      input.finished_at,
      id,
    )
    .run();
}

export async function failMailboxSyncRun(
  db: D1Database,
  id: number,
  input: {
    error_message: string;
    finished_at: number;
    started_at: number;
  },
): Promise<void> {
  await db
    .prepare(
      "UPDATE mailbox_sync_runs SET status = 'failed', error_message = ?, finished_at = ?, duration_ms = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      input.error_message,
      input.finished_at,
      Math.max(0, input.finished_at - input.started_at),
      input.finished_at,
      id,
    )
    .run();
}

export async function getMailboxSyncRunById(
  db: D1Database,
  id: number,
): Promise<MailboxSyncRunRecord | null> {
  const row = await db
    .prepare(
      "SELECT id, trigger_source, requested_by, status, catch_all_enabled, cloudflare_configured, cloudflare_routes_total, created_count, updated_count, skipped_count, observed_total, domain_summaries_json, error_message, started_at, finished_at, duration_ms, created_at, updated_at FROM mailbox_sync_runs WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .first<DbRow>();

  return row ? mapMailboxSyncRun(row) : null;
}

export async function getLatestMailboxSyncRun(
  db: D1Database,
): Promise<MailboxSyncRunRecord | null> {
  const row = await db
    .prepare(
      "SELECT id, trigger_source, requested_by, status, catch_all_enabled, cloudflare_configured, cloudflare_routes_total, created_count, updated_count, skipped_count, observed_total, domain_summaries_json, error_message, started_at, finished_at, duration_ms, created_at, updated_at FROM mailbox_sync_runs ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    .first<DbRow>();

  return row ? mapMailboxSyncRun(row) : null;
}

export async function getActiveMailboxSyncRun(
  db: D1Database,
): Promise<MailboxSyncRunRecord | null> {
  const row = await db
    .prepare(
      "SELECT id, trigger_source, requested_by, status, catch_all_enabled, cloudflare_configured, cloudflare_routes_total, created_count, updated_count, skipped_count, observed_total, domain_summaries_json, error_message, started_at, finished_at, duration_ms, created_at, updated_at FROM mailbox_sync_runs WHERE status IN ('pending', 'running') ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    .first<DbRow>();

  return row ? mapMailboxSyncRun(row) : null;
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

  let query =
    "SELECT id, trigger_source, status, scanned_email_count, archived_email_count, purged_active_email_count, purged_deleted_email_count, expired_mailbox_count, applied_policy_count, started_at, finished_at, duration_ms, error_message, detail_json, created_at FROM retention_job_runs";
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

export async function getRetentionJobRunSummary(
  db: D1Database,
): Promise<RetentionJobRunSummary> {
  const recent24hThreshold = Date.now() - 24 * 60 * 60 * 1000;

  const [
    totalsRow,
    recent24hRow,
    lastRunRow,
    lastSuccessRow,
    lastFailedRow,
    recentStatusRows,
  ] = await Promise.all([
    db.prepare(
      `SELECT
        COUNT(1) as total_run_count,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as total_success_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as total_failed_count
      FROM retention_job_runs`,
    ).first<DbRow>(),
    db.prepare(
      `SELECT
        COUNT(1) as recent_24h_run_count,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as recent_24h_success_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as recent_24h_failed_count,
        SUM(scanned_email_count) as recent_24h_scanned_email_count,
        SUM(archived_email_count) as recent_24h_archived_email_count,
        SUM(purged_active_email_count) as recent_24h_purged_active_email_count,
        SUM(purged_deleted_email_count) as recent_24h_purged_deleted_email_count,
        SUM(expired_mailbox_count) as recent_24h_expired_mailbox_count,
        AVG(duration_ms) as average_duration_ms_24h
      FROM retention_job_runs
      WHERE created_at >= ?`,
    ).bind(recent24hThreshold).first<DbRow>(),
    db.prepare(
      `SELECT id, trigger_source, status, started_at, finished_at, duration_ms
      FROM retention_job_runs
      ORDER BY created_at DESC
      LIMIT 1`,
    ).first<DbRow>(),
    db.prepare(
      `SELECT started_at, finished_at
      FROM retention_job_runs
      WHERE status = 'success'
      ORDER BY created_at DESC
      LIMIT 1`,
    ).first<DbRow>(),
    db.prepare(
      `SELECT started_at, finished_at
      FROM retention_job_runs
      WHERE status = 'failed'
      ORDER BY created_at DESC
      LIMIT 1`,
    ).first<DbRow>(),
    db.prepare(
      `SELECT status
      FROM retention_job_runs
      ORDER BY created_at DESC`,
    ).all<DbRow>(),
  ]);

  let consecutiveFailureCount = 0;
  for (const row of recentStatusRows.results) {
    if (stringValue(row, "status") !== "failed") break;
    consecutiveFailureCount += 1;
  }

  return {
    average_duration_ms_24h: nullableNumberValue(
      recent24hRow || {},
      "average_duration_ms_24h",
    ),
    consecutive_failure_count: consecutiveFailureCount,
    last_failed_at:
      nullableNumberValue(lastFailedRow || {}, "finished_at")
      ?? nullableNumberValue(lastFailedRow || {}, "started_at"),
    last_run: mapRetentionJobRunSummaryLastRun(lastRunRow),
    last_success_at:
      nullableNumberValue(lastSuccessRow || {}, "finished_at")
      ?? nullableNumberValue(lastSuccessRow || {}, "started_at"),
    recent_24h_archived_email_count: numberValue(
      recent24hRow || {},
      "recent_24h_archived_email_count",
      0,
    ),
    recent_24h_expired_mailbox_count: numberValue(
      recent24hRow || {},
      "recent_24h_expired_mailbox_count",
      0,
    ),
    recent_24h_failed_count: numberValue(
      recent24hRow || {},
      "recent_24h_failed_count",
      0,
    ),
    recent_24h_purged_active_email_count: numberValue(
      recent24hRow || {},
      "recent_24h_purged_active_email_count",
      0,
    ),
    recent_24h_purged_deleted_email_count: numberValue(
      recent24hRow || {},
      "recent_24h_purged_deleted_email_count",
      0,
    ),
    recent_24h_run_count: numberValue(recent24hRow || {}, "recent_24h_run_count", 0),
    recent_24h_scanned_email_count: numberValue(
      recent24hRow || {},
      "recent_24h_scanned_email_count",
      0,
    ),
    recent_24h_success_count: numberValue(
      recent24hRow || {},
      "recent_24h_success_count",
      0,
    ),
    total_failed_count: numberValue(totalsRow || {}, "total_failed_count", 0),
    total_run_count: numberValue(totalsRow || {}, "total_run_count", 0),
    total_success_count: numberValue(totalsRow || {}, "total_success_count", 0),
  };
}
