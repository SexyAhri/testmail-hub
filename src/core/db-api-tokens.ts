import { jsonStringify, safeParseJson } from "../utils/utils";
import type {
  AccessScope,
  ApiTokenPermission,
  ApiTokenRecord,
  D1Database,
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
      safeParseJson<ApiTokenPermission[]>(
        stringValue(row, "permissions_json", "[]"),
        [],
      ) || [],
    projects: [],
    token_prefix,
    token_preview: token_prefix ? `${token_prefix}...` : "",
    updated_at: numberValue(row, "updated_at", Date.now()),
  };
}

async function getApiTokenProjectBindingsMap(
  db: D1Database,
  ids: string[],
): Promise<Map<string, ProjectBindingRecord[]>> {
  const normalizedIds = Array.from(
    new Set(ids.map(item => String(item || "")).filter(Boolean)),
  );
  if (normalizedIds.length === 0) return new Map();

  const rows = await db
    .prepare(
      `SELECT
        bindings.api_token_id as binding_id,
        p.id as project_id,
        p.name as project_name,
        p.slug as project_slug
      FROM api_token_project_bindings bindings
      LEFT JOIN projects p ON p.id = bindings.project_id
      WHERE bindings.api_token_id IN (${buildSqlPlaceholders(normalizedIds.length)})
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

async function replaceApiTokenProjectBindings(
  db: D1Database,
  id: string,
  projectIds: number[],
): Promise<void> {
  await db
    .prepare("DELETE FROM api_token_project_bindings WHERE api_token_id = ?")
    .bind(id)
    .run();

  const normalizedProjectIds = uniquePositiveIds(projectIds);
  if (normalizedProjectIds.length === 0) return;

  const now = Date.now();
  for (const projectId of normalizedProjectIds) {
    await db
      .prepare(
        "INSERT INTO api_token_project_bindings (api_token_id, project_id, created_at) VALUES (?, ?, ?)",
      )
      .bind(id, projectId, now)
      .run();
  }
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
    db
      .prepare(
        `SELECT id, name, description, token_prefix, permissions_json, access_scope, is_enabled, created_by, last_used_at, expires_at, created_at, updated_at FROM api_tokens t${whereClause} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...params, pageSize, offset)
      .all<DbRow>(),
    db
      .prepare(
        `SELECT COUNT(1) as total FROM api_tokens t${whereClause}`,
      )
      .bind(...countParams)
      .first<DbRow>(),
  ]);

  const items = list.results.map(mapApiToken);
  const projectBindings = await getApiTokenProjectBindingsMap(
    db,
    items.map(item => item.id),
  );

  return {
    items: items.map(item => ({
      ...item,
      projects: projectBindings.get(item.id) || [],
    })),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllApiTokens(
  db: D1Database,
): Promise<ApiTokenRecord[]> {
  const result = await db
    .prepare(
      "SELECT id, name, description, token_prefix, permissions_json, access_scope, is_enabled, created_by, last_used_at, expires_at, created_at, updated_at FROM api_tokens ORDER BY updated_at DESC",
    )
    .all<DbRow>();
  const items = result.results.map(mapApiToken);
  const projectBindings = await getApiTokenProjectBindingsMap(
    db,
    items.map(item => item.id),
  );
  return items.map(item => ({
    ...item,
    projects: projectBindings.get(item.id) || [],
  }));
}

export async function getApiTokenById(
  db: D1Database,
  id: string,
): Promise<ApiTokenRecord | null> {
  const row = await db
    .prepare(
      "SELECT id, name, description, token_prefix, permissions_json, access_scope, is_enabled, created_by, last_used_at, expires_at, created_at, updated_at FROM api_tokens WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .first<DbRow>();

  if (!row) return null;
  const base = mapApiToken(row);
  const projectBindings = await getApiTokenProjectBindingsMap(db, [id]);
  return {
    ...base,
    projects: projectBindings.get(id) || [],
  };
}

export async function getActiveApiTokenById(
  db: D1Database,
  id: string,
): Promise<(ApiTokenRecord & { token_hash: string }) | null> {
  const row = await db
    .prepare(
      "SELECT id, name, description, token_prefix, token_hash, permissions_json, access_scope, is_enabled, created_by, last_used_at, expires_at, created_at, updated_at FROM api_tokens WHERE id = ? AND is_enabled = 1 AND (expires_at IS NULL OR expires_at > ?) LIMIT 1",
    )
    .bind(id, Date.now())
    .first<DbRow>();

  if (!row) return null;
  const base = mapApiToken(row);
  const projectBindings = await getApiTokenProjectBindingsMap(db, [id]);
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
  await db
    .prepare(
      "INSERT INTO api_tokens (id, name, description, token_prefix, token_hash, permissions_json, access_scope, is_enabled, created_by, last_used_at, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)",
    )
    .bind(
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
    )
    .run();

  await replaceApiTokenProjectBindings(
    db,
    id,
    input.access_scope === "bound" ? input.project_ids : [],
  );

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
    projects:
      (await getApiTokenProjectBindingsMap(db, [id])).get(id) || [],
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
  await db
    .prepare(
      "UPDATE api_tokens SET name = ?, description = ?, permissions_json = ?, access_scope = ?, is_enabled = ?, expires_at = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      input.name,
      input.description,
      jsonStringify(input.permissions, "[]"),
      input.access_scope,
      input.is_enabled ? 1 : 0,
      input.expires_at,
      Date.now(),
      id,
    )
    .run();

  await replaceApiTokenProjectBindings(
    db,
    id,
    input.access_scope === "bound" ? input.project_ids : [],
  );
}

export async function deleteApiToken(
  db: D1Database,
  id: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM api_token_project_bindings WHERE api_token_id = ?")
    .bind(id)
    .run();
  await db.prepare("DELETE FROM api_tokens WHERE id = ?").bind(id).run();
}

export async function touchApiTokenLastUsed(
  db: D1Database,
  id: string,
): Promise<void> {
  await db
    .prepare("UPDATE api_tokens SET last_used_at = ?, updated_at = ? WHERE id = ?")
    .bind(Date.now(), Date.now(), id)
    .run();
}
