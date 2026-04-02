import {
  isSqliteSchemaError,
  jsonStringify,
  safeParseJson,
} from "../utils/utils";
import type {
  AuditLogRecord,
  AuthSession,
  D1Database,
  ErrorEventRecord,
  ErrorEventsPayload,
  ErrorEventSummary,
  JsonValue,
  PaginationPayload,
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
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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
    source_options: sourceRows.results.map((row) => stringValue(row, "source")).filter(Boolean),
    summary: mapErrorEventSummary(summaryRow || {}),
    total: numberValue(summaryRow || {}, "total", 0),
  };
}
