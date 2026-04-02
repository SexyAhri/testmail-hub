import { normalizeAdminRole } from "../utils/constants";
import type {
  AccessScope,
  AdminRole,
  AdminUserRecord,
  D1Database,
  PaginationPayload,
  ProjectBindingRecord,
} from "../server/types";

type DbRow = Record<string, unknown>;

interface AdminUserPageFilters {
  access_scope?: AccessScope | null;
  is_enabled?: boolean | null;
  keyword?: string | null;
  project_id?: number | null;
  role?: AdminRole | null;
}

const ADMIN_USER_MODIFIED_FIELDS = `(
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
) AS last_modified_action`;

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
    role:
      normalizeAdminRole(stringValue(row, "role", "viewer"), access_scope)
      || "viewer",
    updated_at: numberValue(row, "updated_at", Date.now()),
    username: stringValue(row, "username"),
  };
}

async function getAdminProjectBindingsMap(
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
        bindings.admin_id as binding_id,
        p.id as project_id,
        p.name as project_name,
        p.slug as project_slug
      FROM admin_project_bindings bindings
      LEFT JOIN projects p ON p.id = bindings.project_id
      WHERE bindings.admin_id IN (${buildSqlPlaceholders(normalizedIds.length)})
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

async function replaceAdminProjectBindings(
  db: D1Database,
  id: string,
  projectIds: number[],
): Promise<void> {
  await db
    .prepare("DELETE FROM admin_project_bindings WHERE admin_id = ?")
    .bind(id)
    .run();

  const normalizedProjectIds = uniquePositiveIds(projectIds);
  if (normalizedProjectIds.length === 0) return;

  const now = Date.now();
  for (const projectId of normalizedProjectIds) {
    await db
      .prepare(
        "INSERT INTO admin_project_bindings (admin_id, project_id, created_at) VALUES (?, ?, ?)",
      )
      .bind(id, projectId, now)
      .run();
  }
}

export async function findAdminUserByUsername(
  db: D1Database,
  username: string,
): Promise<(AdminUserRecord & { password_hash: string; password_salt: string }) | null> {
  const row = await db
    .prepare(
      "SELECT id, username, display_name, role, access_scope, note, password_hash, password_salt, is_enabled, created_at, updated_at, last_login_at FROM admin_users WHERE username = ? LIMIT 1",
    )
    .bind(username)
    .first<DbRow>();

  if (!row) return null;
  const base = mapAdminUser(row);
  const projectBindings = await getAdminProjectBindingsMap(db, [base.id]);
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
  const row = await db
    .prepare(
      "SELECT id, username, display_name, role, access_scope, note, is_enabled FROM admin_users WHERE id = ? LIMIT 1",
    )
    .bind(adminId)
    .first<DbRow>();

  if (!row) return null;

  const bindings = await getAdminProjectBindingsMap(db, [adminId]);
  const access_scope = normalizeAccessScope(row.access_scope);
  return {
    access_scope,
    display_name: stringValue(row, "display_name"),
    is_enabled: boolValue(row, "is_enabled", true),
    note: stringValue(row, "note"),
    project_ids: (bindings.get(String(adminId)) || []).map(item => item.id),
    role:
      normalizeAdminRole(stringValue(row, "role", "viewer"), access_scope)
      || "viewer",
    username: stringValue(row, "username"),
  };
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
    db
      .prepare(
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
          ${ADMIN_USER_MODIFIED_FIELDS}
        FROM admin_users${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...params, pageSize, offset)
      .all<DbRow>(),
    db
      .prepare(`SELECT COUNT(1) as total FROM admin_users${whereClause}`)
      .bind(...countParams)
      .first<DbRow>(),
  ]);

  const items = list.results.map(mapAdminUser);
  const projectBindings = await getAdminProjectBindingsMap(
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

export async function getAllAdminUsers(
  db: D1Database,
): Promise<AdminUserRecord[]> {
  const result = await db
    .prepare(
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
        ${ADMIN_USER_MODIFIED_FIELDS}
      FROM admin_users ORDER BY created_at DESC`,
    )
    .all<DbRow>();

  const items = result.results.map(mapAdminUser);
  const projectBindings = await getAdminProjectBindingsMap(
    db,
    items.map(item => item.id),
  );

  return items.map(item => ({
    ...item,
    projects: projectBindings.get(item.id) || [],
  }));
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
  await db
    .prepare(
      "INSERT INTO admin_users (id, username, display_name, role, access_scope, note, password_hash, password_salt, is_enabled, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)",
    )
    .bind(
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
    )
    .run();

  await replaceAdminProjectBindings(
    db,
    id,
    input.access_scope === "bound" ? input.project_ids : [],
  );

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
    projects:
      (await getAdminProjectBindingsMap(db, [id])).get(id) || [],
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
    await db
      .prepare(
        "UPDATE admin_users SET display_name = ?, role = ?, access_scope = ?, is_enabled = ?, note = ?, password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?",
      )
      .bind(
        input.display_name,
        input.role,
        input.access_scope,
        input.is_enabled ? 1 : 0,
        input.note,
        input.password_hash,
        input.password_salt,
        Date.now(),
        id,
      )
      .run();
  } else {
    await db
      .prepare(
        "UPDATE admin_users SET display_name = ?, role = ?, access_scope = ?, is_enabled = ?, note = ?, updated_at = ? WHERE id = ?",
      )
      .bind(
        input.display_name,
        input.role,
        input.access_scope,
        input.is_enabled ? 1 : 0,
        input.note,
        Date.now(),
        id,
      )
      .run();
  }

  await replaceAdminProjectBindings(
    db,
    id,
    input.access_scope === "bound" ? input.project_ids : [],
  );
}

export async function touchAdminUserLogin(
  db: D1Database,
  id: string,
): Promise<void> {
  await db
    .prepare("UPDATE admin_users SET last_login_at = ?, updated_at = ? WHERE id = ?")
    .bind(Date.now(), Date.now(), id)
    .run();
}
