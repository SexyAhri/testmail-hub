import type {
  D1Database,
  MailboxRecord,
  PaginationPayload,
  ResolvedRetentionPolicy,
  RetentionPolicyRecord,
  RetentionPolicyScopeLevel,
} from "../server/types";

type DbRow = Record<string, unknown>;

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

type RetentionPurgeExecutionOptions = {
  archive_emails?: boolean;
  purge_active_emails?: boolean;
  purge_deleted_emails?: boolean;
};

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

const RETENTION_POLICY_SCOPE_ORDER: Record<RetentionPolicyScopeLevel, number> = {
  environment: 2,
  global: 0,
  mailbox_pool: 3,
  project: 1,
};

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

function normalizeNullableId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
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

function getRetentionPolicyScopeLevel(
  row: Pick<RetentionPolicyRecord, "environment_id" | "mailbox_pool_id" | "project_id"> | DbRow,
): RetentionPolicyScopeLevel {
  const mailboxPoolId = normalizeNullableId(
    (row as { mailbox_pool_id?: unknown }).mailbox_pool_id,
  );
  const environmentId = normalizeNullableId(
    (row as { environment_id?: unknown }).environment_id,
  );
  const projectId = normalizeNullableId(
    (row as { project_id?: unknown }).project_id,
  );
  if (mailboxPoolId) return "mailbox_pool";
  if (environmentId) return "environment";
  if (projectId) return "project";
  return "global";
}

function mapRetentionPolicy(row: DbRow): RetentionPolicyRecord {
  return {
    archive_email_hours: nullableNumberValue(row, "archive_email_hours"),
    created_at: numberValue(row, "created_at", Date.now()),
    deleted_email_retention_hours: nullableNumberValue(
      row,
      "deleted_email_retention_hours",
    ),
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

function toRetentionAffectedEmailRecord(
  row: DbRow,
): RetentionAffectedEmailRecord {
  return {
    deleted_at: nullableNumberValue(row, "deleted_at"),
    environment_id: nullableNumberValue(row, "environment_id"),
    mailbox_pool_id: nullableNumberValue(row, "mailbox_pool_id"),
    message_id: stringValue(row, "message_id"),
    project_id: nullableNumberValue(row, "project_id"),
    received_at: numberValue(row, "received_at", Date.now()),
  };
}

function buildRetentionScopeSummaryKey(
  record: Pick<
    RetentionAffectedEmailRecord,
    "environment_id" | "mailbox_pool_id" | "project_id"
  >,
): string {
  return [
    record.project_id ?? "global",
    record.environment_id ?? "env",
    record.mailbox_pool_id ?? "pool",
  ].join(":");
}

function ensureRetentionScopeSummary(
  summaries: Map<string, RetentionScopeSummaryRecord>,
  record: Pick<
    RetentionAffectedEmailRecord,
    "environment_id" | "mailbox_pool_id" | "project_id"
  >,
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
  policy: Pick<
    RetentionPolicyRecord,
    | "environment_id"
    | "mailbox_pool_id"
    | "project_id"
    | "scope_level"
  >,
  scope: {
    environment_id?: number | null;
    mailbox_pool_id?: number | null;
    project_id?: number | null;
  },
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
  policies: Array<
    Pick<
      RetentionPolicyRecord,
      | "archive_email_hours"
      | "deleted_email_retention_hours"
      | "email_retention_hours"
      | "environment_id"
      | "is_enabled"
      | "mailbox_pool_id"
      | "mailbox_ttl_hours"
      | "project_id"
      | "scope_level"
    >
  >,
  scope: {
    environment_id?: number | null;
    mailbox_pool_id?: number | null;
    project_id?: number | null;
  },
  fallback: RetentionPolicyConfigInput = {},
): ResolvedRetentionPolicy {
  const resolved: ResolvedRetentionPolicy = {
    archive_email_hours: fallback.archive_email_hours ?? null,
    archive_email_source:
      fallback.archive_email_hours === null
      || fallback.archive_email_hours === undefined
        ? null
        : "default",
    deleted_email_retention_hours:
      fallback.deleted_email_retention_hours ?? null,
    deleted_email_retention_source:
      fallback.deleted_email_retention_hours === null
      || fallback.deleted_email_retention_hours === undefined
        ? null
        : "default",
    email_retention_hours: fallback.email_retention_hours ?? null,
    email_retention_source:
      fallback.email_retention_hours === null
      || fallback.email_retention_hours === undefined
        ? null
        : "default",
    mailbox_ttl_hours: fallback.mailbox_ttl_hours ?? null,
    mailbox_ttl_source:
      fallback.mailbox_ttl_hours === null
      || fallback.mailbox_ttl_hours === undefined
        ? null
        : "default",
  };

  const applicablePolicies = policies
    .filter(policy => policy.is_enabled && matchesRetentionPolicyScope(policy, scope))
    .sort(
      (left, right) =>
        RETENTION_POLICY_SCOPE_ORDER[left.scope_level]
        - RETENTION_POLICY_SCOPE_ORDER[right.scope_level],
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
      resolved.deleted_email_retention_hours =
        policy.deleted_email_retention_hours;
      resolved.deleted_email_retention_source = policy.scope_level;
    }
  }

  return resolved;
}

export function attachResolvedRetentionToRecord<
  T extends {
    environment_id: number | null;
    mailbox_pool_id: number | null;
    project_id: number | null;
    resolved_retention: ResolvedRetentionPolicy;
  },
>(
  record: T,
  policies: Array<
    Pick<
      RetentionPolicyRecord,
      | "archive_email_hours"
      | "deleted_email_retention_hours"
      | "email_retention_hours"
      | "environment_id"
      | "is_enabled"
      | "mailbox_pool_id"
      | "mailbox_ttl_hours"
      | "project_id"
      | "scope_level"
    >
  >,
  fallback: RetentionPolicyConfigInput = {},
): T {
  return {
    ...record,
    resolved_retention: resolveRetentionPolicyConfigFromRecords(
      policies,
      {
        environment_id: record.environment_id,
        mailbox_pool_id: record.mailbox_pool_id,
        project_id: record.project_id,
      },
      fallback,
    ),
  };
}

export function resolveMailboxExpirationTimestamp(
  requestedExpiresAt: number | null | undefined,
  resolvedPolicy: Pick<ResolvedRetentionPolicy, "mailbox_ttl_hours">,
  now = Date.now(),
): number | null {
  if (requestedExpiresAt !== null && requestedExpiresAt !== undefined) {
    return requestedExpiresAt;
  }
  if (
    resolvedPolicy.mailbox_ttl_hours === null
    || resolvedPolicy.mailbox_ttl_hours === undefined
  ) {
    return null;
  }
  return now + resolvedPolicy.mailbox_ttl_hours * 60 * 60 * 1000;
}

function buildRetentionPolicyVisibilityFilter(
  allowedProjectIds?: number[] | null,
) {
  const hasScopedProjects =
    allowedProjectIds !== null && allowedProjectIds !== undefined;
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
  const whereParts = [
    visibility.clause.replace(/^ WHERE /, ""),
    ...clauses,
  ].filter(Boolean);
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
  const row = await db
    .prepare(
      `SELECT ${RETENTION_POLICY_SELECT_FIELDS}
      FROM retention_policies rp
      LEFT JOIN projects p ON p.id = rp.project_id
      LEFT JOIN environments e ON e.id = rp.environment_id
      LEFT JOIN mailbox_pools mp ON mp.id = rp.mailbox_pool_id
      WHERE ${whereParts.join(" AND ")}
      LIMIT 1`,
    )
    .bind(id, ...visibility.params)
    .first<DbRow>();

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
  const result = (await db
    .prepare(
      "INSERT INTO retention_policies (name, description, is_enabled, scope_key, project_id, environment_id, mailbox_pool_id, archive_email_hours, mailbox_ttl_hours, email_retention_hours, deleted_email_retention_hours, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
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
    )
    .run()) as { meta?: { last_row_id?: number } };

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
  await db
    .prepare(
      "UPDATE retention_policies SET name = ?, description = ?, is_enabled = ?, scope_key = ?, project_id = ?, environment_id = ?, mailbox_pool_id = ?, archive_email_hours = ?, mailbox_ttl_hours = ?, email_retention_hours = ?, deleted_email_retention_hours = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
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
    )
    .run();

  const policy = await getRetentionPolicyById(db, id);
  if (!policy) {
    throw new Error("retention policy not found");
  }
  return policy;
}

export async function deleteRetentionPolicy(
  db: D1Database,
  id: number,
): Promise<void> {
  await db.prepare("DELETE FROM retention_policies WHERE id = ?").bind(id).run();
}

export async function resolveRetentionPolicyConfig(
  db: D1Database,
  scope: {
    environment_id?: number | null;
    mailbox_pool_id?: number | null;
    project_id?: number | null;
  },
  fallback: RetentionPolicyConfigInput = {},
): Promise<ResolvedRetentionPolicy> {
  const policies = await getAllRetentionPolicies(db, { enabledOnly: true });
  return resolveRetentionPolicyConfigFromRecords(policies, scope, fallback);
}

async function archiveEmailRecord(
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

async function purgeEmailRecord(
  db: D1Database,
  messageId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM email_attachments WHERE email_message_id = ?")
    .bind(messageId)
    .run();
  await db.prepare("DELETE FROM emails WHERE message_id = ?").bind(messageId).run();
}

export async function applyRetentionPoliciesPurge(
  db: D1Database,
  fallback: RetentionPolicyConfigInput = {},
  options: RetentionPurgeExecutionOptions = {},
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
  const shouldArchiveEmails = options.archive_emails !== false;
  const shouldPurgeActiveEmails = options.purge_active_emails !== false;
  const shouldPurgeDeletedEmails = options.purge_deleted_emails !== false;

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
      if (
        shouldPurgeDeletedEmails
        && maxHours !== null
        && deletedAt <= now - maxHours * hourInMs
      ) {
        await purgeEmailRecord(db, messageId);
        purged_deleted_emails.push(record);
        if (record.project_id) affectedProjectIds.add(record.project_id);
        ensureRetentionScopeSummary(scopeSummaries, record).purged_deleted_email_count += 1;
        purged_deleted_email_count += 1;
      }
      continue;
    }

    const maxHours = resolved.email_retention_hours;
    if (
      shouldPurgeActiveEmails
      && maxHours !== null
      && record.received_at <= now - maxHours * hourInMs
    ) {
      await purgeEmailRecord(db, messageId);
      purged_active_emails.push(record);
      if (record.project_id) affectedProjectIds.add(record.project_id);
      ensureRetentionScopeSummary(scopeSummaries, record).purged_active_email_count += 1;
      purged_active_email_count += 1;
      continue;
    }

    const archivedAt = nullableNumberValue(row, "archived_at");
    const archiveHours = resolved.archive_email_hours;
    if (
      shouldArchiveEmails
      && archivedAt === null
      && archiveHours !== null
      && record.received_at <= now - archiveHours * hourInMs
    ) {
      await archiveEmailRecord(db, messageId, {
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
    affected_project_ids: Array.from(affectedProjectIds).sort(
      (left, right) => left - right,
    ),
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
