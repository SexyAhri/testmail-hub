import { normalizeNotificationAlertConfig } from "../utils/constants";
import { jsonStringify, safeParseJson } from "../utils/utils";
import type {
  AccessScope,
  D1Database,
  JsonValue,
  NotificationAlertConfig,
  NotificationEndpointRecord,
  PaginationPayload,
  ProjectBindingRecord,
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

function normalizeAccessScope(
  value: unknown,
  fallback: AccessScope = "all",
): AccessScope {
  return value === "bound" ? "bound" : fallback;
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

function mapProjectBinding(row: DbRow): ProjectBindingRecord {
  return {
    id: numberValue(row, "project_id", numberValue(row, "id")),
    name: stringValue(row, "project_name", stringValue(row, "name")),
    slug: stringValue(row, "project_slug", stringValue(row, "slug")),
  };
}

function mapNotificationEndpoint(row: DbRow): NotificationEndpointRecord {
  return {
    access_scope: normalizeAccessScope(row.access_scope),
    alert_config: normalizeNotificationAlertConfig(
      safeParseJson<Record<string, unknown>>(
        stringValue(row, "alert_config_json", "{}"),
        {},
      ) || {},
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

async function getNotificationEndpointProjectBindingsMap(
  db: D1Database,
  ids: number[],
): Promise<Map<string, ProjectBindingRecord[]>> {
  const normalizedIds = Array.from(
    new Set(ids.map(id => Number(id)).filter(id => Number.isFinite(id) && id > 0)),
  );
  if (normalizedIds.length === 0) return new Map();

  const rows = await db
    .prepare(
      `SELECT
        bindings.notification_endpoint_id as binding_id,
        p.id as project_id,
        p.name as project_name,
        p.slug as project_slug
      FROM notification_endpoint_project_bindings bindings
      LEFT JOIN projects p ON p.id = bindings.project_id
      WHERE bindings.notification_endpoint_id IN (${buildSqlPlaceholders(normalizedIds.length)})
      ORDER BY p.name ASC, p.id ASC`,
    )
    .bind(...normalizedIds)
    .all<DbRow>();

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

async function replaceNotificationEndpointProjectBindings(
  db: D1Database,
  id: number,
  projectIds: number[],
): Promise<void> {
  await db
    .prepare(
      "DELETE FROM notification_endpoint_project_bindings WHERE notification_endpoint_id = ?",
    )
    .bind(id)
    .run();

  const normalizedProjectIds = uniquePositiveIds(projectIds);
  if (normalizedProjectIds.length === 0) return;

  const now = Date.now();
  for (const projectId of normalizedProjectIds) {
    await db
      .prepare(
        "INSERT INTO notification_endpoint_project_bindings (notification_endpoint_id, project_id, created_at) VALUES (?, ?, ?)",
      )
      .bind(id, projectId, now)
      .run();
  }
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
    db
      .prepare(
        `SELECT id, name, type, target, secret, events, alert_config_json, access_scope, is_enabled, created_at, updated_at, last_status, last_error, last_sent_at FROM notification_endpoints n${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...params, pageSize, offset)
      .all<DbRow>(),
    db
      .prepare(
        `SELECT COUNT(1) as total FROM notification_endpoints n${whereClause}`,
      )
      .bind(...countParams)
      .first<DbRow>(),
  ]);

  const items = list.results.map(mapNotificationEndpoint);
  const projectBindings = await getNotificationEndpointProjectBindingsMap(
    db,
    items.map(item => item.id),
  );

  return {
    items: items.map(item => ({
      ...item,
      projects: projectBindings.get(String(item.id)) || [],
    })),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllNotificationEndpoints(
  db: D1Database,
): Promise<NotificationEndpointRecord[]> {
  const result = await db
    .prepare(
      "SELECT id, name, type, target, secret, events, alert_config_json, access_scope, is_enabled, created_at, updated_at, last_status, last_error, last_sent_at FROM notification_endpoints ORDER BY created_at DESC",
    )
    .all<DbRow>();
  const items = result.results.map(mapNotificationEndpoint);
  const projectBindings = await getNotificationEndpointProjectBindingsMap(
    db,
    items.map(item => item.id),
  );
  return items.map(item => ({
    ...item,
    projects: projectBindings.get(String(item.id)) || [],
  }));
}

export async function getNotificationEndpointById(
  db: D1Database,
  id: number,
): Promise<NotificationEndpointRecord | null> {
  const row = await db
    .prepare(
      "SELECT id, name, type, target, secret, events, alert_config_json, access_scope, is_enabled, created_at, updated_at, last_status, last_error, last_sent_at FROM notification_endpoints WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .first<DbRow>();

  if (!row) return null;
  const base = mapNotificationEndpoint(row);
  const projectBindings = await getNotificationEndpointProjectBindingsMap(db, [id]);
  return {
    ...base,
    projects: projectBindings.get(String(id)) || [],
  };
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
  const result = (await db
    .prepare(
      "INSERT INTO notification_endpoints (name, type, target, secret, events, alert_config_json, access_scope, is_enabled, created_at, updated_at, last_status, last_error, last_sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', NULL)",
    )
    .bind(
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
    )
    .run()) as { meta?: { last_row_id?: number } };

  const insertedId = Number(result?.meta?.last_row_id || 0);
  const row =
    insertedId > 0
      ? { id: insertedId }
      : await db
          .prepare(
            "SELECT id FROM notification_endpoints WHERE name = ? AND target = ? AND created_at = ? ORDER BY id DESC LIMIT 1",
          )
          .bind(input.name, input.target, now)
          .first<DbRow>();
  const id = numberValue(row || {}, "id", 0);
  if (id > 0) {
    await replaceNotificationEndpointProjectBindings(
      db,
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
  await db
    .prepare(
      "UPDATE notification_endpoints SET name = ?, type = ?, target = ?, secret = ?, events = ?, alert_config_json = ?, access_scope = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
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
    )
    .run();

  await replaceNotificationEndpointProjectBindings(
    db,
    id,
    input.access_scope === "bound" ? input.project_ids : [],
  );
}

export async function deleteNotificationEndpoint(
  db: D1Database,
  id: number,
): Promise<void> {
  await db
    .prepare(
      "DELETE FROM notification_delivery_attempts WHERE notification_endpoint_id = ?",
    )
    .bind(id)
    .run();
  await db
    .prepare("DELETE FROM notification_deliveries WHERE notification_endpoint_id = ?")
    .bind(id)
    .run();
  await db
    .prepare(
      "DELETE FROM notification_endpoint_project_bindings WHERE notification_endpoint_id = ?",
    )
    .bind(id)
    .run();
  await db.prepare("DELETE FROM notification_endpoints WHERE id = ?").bind(id).run();
}

export async function updateNotificationDelivery(
  db: D1Database,
  id: number,
  status: string,
  error = "",
): Promise<void> {
  await db
    .prepare(
      "UPDATE notification_endpoints SET last_status = ?, last_error = ?, last_sent_at = ?, updated_at = ? WHERE id = ?",
    )
    .bind(status, error, Date.now(), Date.now(), id)
    .run();
}
