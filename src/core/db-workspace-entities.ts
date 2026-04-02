import type {
  D1Database,
  MailboxPoolRecord,
  ResolvedRetentionPolicy,
  WorkspaceEnvironmentRecord,
  WorkspaceProjectRecord,
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

function normalizeNullableId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
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

async function getProjectRecordById(db: D1Database, id: number) {
  return db
    .prepare(
      "SELECT id, name, slug, description, is_enabled, created_at, updated_at FROM projects WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .first<DbRow>();
}

async function getEnvironmentRecordById(db: D1Database, id: number) {
  return db
    .prepare(
      "SELECT e.id, e.project_id, e.name, e.slug, e.description, e.is_enabled, e.created_at, e.updated_at, COALESCE(p.name, '') as project_name, COALESCE(p.slug, '') as project_slug FROM environments e LEFT JOIN projects p ON p.id = e.project_id WHERE e.id = ? LIMIT 1",
    )
    .bind(id)
    .first<DbRow>();
}

async function getMailboxPoolRecordById(db: D1Database, id: number) {
  return db
    .prepare(
      "SELECT mp.id, mp.project_id, mp.environment_id, mp.name, mp.slug, mp.description, mp.is_enabled, mp.created_at, mp.updated_at, COALESCE(p.name, '') as project_name, COALESCE(p.slug, '') as project_slug, COALESCE(e.name, '') as environment_name, COALESCE(e.slug, '') as environment_slug FROM mailbox_pools mp LEFT JOIN projects p ON p.id = mp.project_id LEFT JOIN environments e ON e.id = mp.environment_id WHERE mp.id = ? LIMIT 1",
    )
    .bind(id)
    .first<DbRow>();
}

export async function getProjectById(
  db: D1Database,
  id: number,
): Promise<WorkspaceProjectRecord | null> {
  const row = await getProjectRecordById(db, id);
  return row
    ? mapWorkspaceProject({
        ...row,
        environment_count: 0,
        mailbox_count: 0,
        mailbox_pool_count: 0,
      })
    : null;
}

export async function getEnvironmentById(
  db: D1Database,
  id: number,
): Promise<WorkspaceEnvironmentRecord | null> {
  const row = await getEnvironmentRecordById(db, id);
  return row
    ? mapWorkspaceEnvironment({
        ...row,
        mailbox_count: 0,
        mailbox_pool_count: 0,
      })
    : null;
}

export async function getMailboxPoolById(
  db: D1Database,
  id: number,
): Promise<MailboxPoolRecord | null> {
  const row = await getMailboxPoolRecordById(db, id);
  return row ? mapMailboxPool({ ...row, mailbox_count: 0 }) : null;
}

export async function validateWorkspaceAssignment(
  db: D1Database,
  input: {
    environment_id?: number | null;
    mailbox_pool_id?: number | null;
    project_id?: number | null;
  },
): Promise<{
  environment_id: number | null;
  mailbox_pool_id: number | null;
  project_id: number | null;
}> {
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
  input: {
    description: string;
    is_enabled: boolean;
    name: string;
    slug: string;
  },
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO projects (name, slug, description, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      input.name,
      input.slug,
      input.description,
      input.is_enabled ? 1 : 0,
      now,
      now,
    )
    .run();
}

export async function updateProject(
  db: D1Database,
  id: number,
  input: {
    description: string;
    is_enabled: boolean;
    name: string;
    slug: string;
  },
): Promise<void> {
  await db
    .prepare(
      "UPDATE projects SET name = ?, slug = ?, description = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      input.name,
      input.slug,
      input.description,
      input.is_enabled ? 1 : 0,
      Date.now(),
      id,
    )
    .run();
}

export async function deleteProject(
  db: D1Database,
  id: number,
): Promise<void> {
  const [environmentCount, poolCount, mailboxCount, linkCount] =
    await Promise.all([
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
  input: {
    description: string;
    is_enabled: boolean;
    name: string;
    project_id: number;
    slug: string;
  },
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO environments (project_id, name, slug, description, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      input.project_id,
      input.name,
      input.slug,
      input.description,
      input.is_enabled ? 1 : 0,
      now,
      now,
    )
    .run();
}

export async function updateEnvironment(
  db: D1Database,
  id: number,
  input: {
    description: string;
    is_enabled: boolean;
    name: string;
    project_id: number;
    slug: string;
  },
): Promise<void> {
  await db
    .prepare(
      "UPDATE environments SET project_id = ?, name = ?, slug = ?, description = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      input.project_id,
      input.name,
      input.slug,
      input.description,
      input.is_enabled ? 1 : 0,
      Date.now(),
      id,
    )
    .run();
}

export async function deleteEnvironment(
  db: D1Database,
  id: number,
): Promise<void> {
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
  await db
    .prepare(
      "INSERT INTO mailbox_pools (project_id, environment_id, name, slug, description, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      input.project_id,
      input.environment_id,
      input.name,
      input.slug,
      input.description,
      input.is_enabled ? 1 : 0,
      now,
      now,
    )
    .run();
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
  await db
    .prepare(
      "UPDATE mailbox_pools SET project_id = ?, environment_id = ?, name = ?, slug = ?, description = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      input.project_id,
      input.environment_id,
      input.name,
      input.slug,
      input.description,
      input.is_enabled ? 1 : 0,
      Date.now(),
      id,
    )
    .run();
}

export async function deleteMailboxPool(
  db: D1Database,
  id: number,
): Promise<void> {
  const [mailboxCount, linkCount] = await Promise.all([
    db.prepare("SELECT COUNT(1) as total FROM mailboxes WHERE mailbox_pool_id = ?").bind(id).first<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM email_mailbox_links WHERE mailbox_pool_id = ?").bind(id).first<DbRow>(),
  ]);

  if (
    numberValue(mailboxCount || {}, "total", 0) > 0
    || numberValue(linkCount || {}, "total", 0) > 0
  ) {
    throw new Error("mailbox pool is in use and cannot be deleted");
  }

  await db.prepare("DELETE FROM mailbox_pools WHERE id = ?").bind(id).run();
}
