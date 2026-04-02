import {
  isValidEmailAddress,
  jsonStringify,
  normalizeEmailAddress,
  safeParseJson,
} from "../utils/utils";
import type {
  D1Database,
  MailboxRecord,
  PaginationPayload,
  ResolvedRetentionPolicy,
} from "../server/types";
import {
  attachResolvedRetentionToRecord,
  getAllRetentionPolicies,
} from "./db-retention-policies";

type DbRow = Record<string, unknown>;

const MAILBOX_SELECT_FIELDS = `
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
`;

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
    resolved_retention: createEmptyResolvedRetentionPolicy(),
    tags: safeParseJson<string[]>(stringValue(row, "tags", "[]"), []) || [],
    updated_at: numberValue(row, "updated_at", Date.now()),
  };
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
  const [list, countRow, policies] = await Promise.all([
    db
      .prepare(
        `SELECT ${MAILBOX_SELECT_FIELDS}
        FROM mailboxes m
        LEFT JOIN projects p ON p.id = m.project_id
        LEFT JOIN environments e ON e.id = m.environment_id
        LEFT JOIN mailbox_pools mp ON mp.id = m.mailbox_pool_id${whereClause}
        ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...params, pageSize, offset)
      .all<DbRow>(),
    db
      .prepare(`SELECT COUNT(1) as total FROM mailboxes m${whereClause}`)
      .bind(...countParams)
      .first<DbRow>(),
    getAllRetentionPolicies(db, { enabledOnly: true }, allowedProjectIds),
  ]);

  return {
    items: list.results.map(row => attachResolvedRetentionToRecord(mapMailbox(row), policies)),
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
  const [result, policies] = await Promise.all([
    db
      .prepare(
        `SELECT ${MAILBOX_SELECT_FIELDS}
        FROM mailboxes m
        LEFT JOIN projects p ON p.id = m.project_id
        LEFT JOIN environments e ON e.id = m.environment_id
        LEFT JOIN mailbox_pools mp ON mp.id = m.mailbox_pool_id${whereClause}
        ORDER BY m.created_at DESC`,
      )
      .bind(...params)
      .all<DbRow>(),
    getAllRetentionPolicies(db, { enabledOnly: true }, allowedProjectIds),
  ]);
  return result.results.map(row => attachResolvedRetentionToRecord(mapMailbox(row), policies));
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
  const [row, policies] = await Promise.all([
    db
      .prepare(
        `SELECT ${MAILBOX_SELECT_FIELDS}
        FROM mailboxes m
        LEFT JOIN projects p ON p.id = m.project_id
        LEFT JOIN environments e ON e.id = m.environment_id
        LEFT JOIN mailbox_pools mp ON mp.id = m.mailbox_pool_id
        WHERE m.id = ?${scopedWhere} LIMIT 1`,
      )
      .bind(id, ...normalizedAllowedProjectIds)
      .first<DbRow>(),
    getAllRetentionPolicies(db, { enabledOnly: true }, allowedProjectIds),
  ]);
  if (!row) return null;
  return attachResolvedRetentionToRecord(mapMailbox(row), policies);
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

  await db
    .prepare(
      "UPDATE email_mailbox_links SET mailbox_address = ?, project_id = ?, environment_id = ?, mailbox_pool_id = ? WHERE mailbox_id = ?",
    )
    .bind(
      mailbox.address,
      mailbox.project_id,
      mailbox.environment_id,
      mailbox.mailbox_pool_id,
      mailbox.id,
    )
    .run();

  await db
    .prepare(
      "UPDATE emails SET project_id = ?, environment_id = ?, mailbox_pool_id = ? WHERE primary_mailbox_id = ?",
    )
    .bind(
      mailbox.project_id,
      mailbox.environment_id,
      mailbox.mailbox_pool_id,
      mailbox.id,
    )
    .run();

  const whereClause = trackedAddresses
    .map(() => "instr(',' || to_address || ',', ',' || ? || ',') > 0")
    .join(" OR ");
  const emailRows = await db
    .prepare(`SELECT message_id, primary_mailbox_id FROM emails WHERE ${whereClause}`)
    .bind(...trackedAddresses)
    .all<DbRow>();

  if (emailRows.results.length === 0) return;

  const now = Date.now();
  for (const row of emailRows.results) {
    const messageId = stringValue(row, "message_id");
    if (!messageId) continue;

    await db
      .prepare(
        "INSERT INTO email_mailbox_links (email_message_id, mailbox_id, mailbox_address, project_id, environment_id, mailbox_pool_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email_message_id, mailbox_id) DO UPDATE SET mailbox_address = excluded.mailbox_address, project_id = excluded.project_id, environment_id = excluded.environment_id, mailbox_pool_id = excluded.mailbox_pool_id",
      )
      .bind(
        messageId,
        mailbox.id,
        mailbox.address,
        mailbox.project_id,
        mailbox.environment_id,
        mailbox.mailbox_pool_id,
        now,
      )
      .run();

    if (nullableNumberValue(row, "primary_mailbox_id") === null) {
      await db
        .prepare(
          "UPDATE emails SET primary_mailbox_id = ?, project_id = ?, environment_id = ?, mailbox_pool_id = ? WHERE message_id = ?",
        )
        .bind(
          mailbox.id,
          mailbox.project_id,
          mailbox.environment_id,
          mailbox.mailbox_pool_id,
          messageId,
        )
        .run();
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
  const normalizedAddress = normalizeEmailAddress(input.address);
  const result = (await db
    .prepare(
      "INSERT INTO mailboxes (address, note, is_enabled, created_at, updated_at, last_received_at, tags, expires_at, deleted_at, receive_count, created_by, project_id, environment_id, mailbox_pool_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?)",
    )
    .bind(
      normalizedAddress,
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
    )
    .run()) as { meta?: { last_row_id?: number } };

  const insertedId = Number(result?.meta?.last_row_id || 0);
  const mailbox = insertedId > 0
    ? await getMailboxById(db, insertedId)
    : await db
      .prepare("SELECT id FROM mailboxes WHERE address = ? ORDER BY id DESC LIMIT 1")
      .bind(normalizedAddress)
      .first<DbRow>()
      .then(row => (row ? getMailboxById(db, numberValue(row, "id")) : null));

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
  await db
    .prepare(
      "UPDATE mailboxes SET address = ?, note = ?, is_enabled = ?, tags = ?, expires_at = ?, project_id = ?, environment_id = ?, mailbox_pool_id = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
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
    )
    .run();

  const mailbox = await getMailboxById(db, id);
  if (!mailbox) {
    throw new Error("mailbox not found");
  }

  return mailbox;
}

export async function deleteMailbox(db: D1Database, id: number): Promise<void> {
  const now = Date.now();
  await db
    .prepare("UPDATE mailboxes SET deleted_at = ?, is_enabled = 0, updated_at = ? WHERE id = ?")
    .bind(now, now, id)
    .run();
}

export async function getObservedMailboxStats(
  db: D1Database,
  mailboxDomains: string[] | string = "",
): Promise<Array<{ address: string; last_received_at: number | null; receive_count: number }>> {
  const normalizedDomains = Array.from(
    new Set(
      (Array.isArray(mailboxDomains) ? mailboxDomains : [mailboxDomains])
        .map(item => String(item || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  const clauses = ["deleted_at IS NULL"];
  const params: unknown[] = [];

  if (normalizedDomains.length > 0) {
    clauses.push(`(${normalizedDomains.map(() => "to_address LIKE ?").join(" OR ")})`);
    params.push(...normalizedDomains.map(domain => `%@${domain}%`));
  }

  const result = await db
    .prepare(
      `SELECT
        to_address,
        MAX(received_at) as last_received_at,
        COUNT(1) as receive_count
      FROM emails
      WHERE ${clauses.join(" AND ")}
      GROUP BY to_address
      ORDER BY last_received_at DESC`,
    )
    .bind(...params)
    .all<DbRow>();

  const addresses = new Map<
    string,
    { address: string; last_received_at: number | null; receive_count: number }
  >();

  for (const row of result.results) {
    const receivedAt = numberValue(row, "last_received_at", 0);
    const groupedReceiveCount = Math.max(0, numberValue(row, "receive_count", 0));
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
      current.receive_count += groupedReceiveCount;
      current.last_received_at = Math.max(current.last_received_at || 0, receivedAt) || null;
      addresses.set(address, current);
    }
  }

  return Array.from(addresses.values()).sort((left, right) =>
    left.address.localeCompare(right.address)
  );
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
  const existing = await db
    .prepare(
      "SELECT id, deleted_at, last_received_at, receive_count, is_enabled FROM mailboxes WHERE address = ? LIMIT 1",
    )
    .bind(address)
    .first<DbRow>();

  if (!existing) {
    const now = Date.now();
    await db
      .prepare(
        "INSERT INTO mailboxes (address, note, is_enabled, created_at, updated_at, last_received_at, tags, expires_at, deleted_at, receive_count, created_by, project_id, environment_id, mailbox_pool_id) VALUES (?, NULL, ?, ?, ?, ?, '[]', NULL, NULL, ?, ?, NULL, NULL, NULL)",
      )
      .bind(
        address,
        input.is_enabled ? 1 : 0,
        now,
        now,
        input.last_received_at,
        Math.max(0, Math.floor(input.receive_count || 0)),
        input.created_by,
      )
      .run();
    return "created";
  }

  if (nullableNumberValue(existing, "deleted_at") !== null) {
    return "skipped";
  }

  const nextLastReceivedAt = Math.max(
    nullableNumberValue(existing, "last_received_at") || 0,
    input.last_received_at || 0,
  ) || null;
  const nextReceiveCount = Math.max(
    numberValue(existing, "receive_count", 0),
    Math.floor(input.receive_count || 0),
  );
  const nextEnabled = input.is_enabled;
  const currentEnabled = boolValue(existing, "is_enabled", true);

  if (
    nextLastReceivedAt === (nullableNumberValue(existing, "last_received_at") || null)
    && nextReceiveCount === numberValue(existing, "receive_count", 0)
    && nextEnabled === currentEnabled
  ) {
    return "skipped";
  }

  await db
    .prepare(
      "UPDATE mailboxes SET is_enabled = ?, last_received_at = ?, receive_count = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      nextEnabled ? 1 : 0,
      nextLastReceivedAt,
      nextReceiveCount,
      Date.now(),
      numberValue(existing, "id"),
    )
    .run();

  return "updated";
}

export async function disableExpiredMailboxes(
  db: D1Database,
): Promise<MailboxRecord[]> {
  const now = Date.now();
  const [expired, policies] = await Promise.all([
    db
      .prepare(
        `SELECT ${MAILBOX_SELECT_FIELDS}
        FROM mailboxes m
        LEFT JOIN projects p ON p.id = m.project_id
        LEFT JOIN environments e ON e.id = m.environment_id
        LEFT JOIN mailbox_pools mp ON mp.id = m.mailbox_pool_id
        WHERE m.deleted_at IS NULL AND m.is_enabled = 1 AND m.expires_at IS NOT NULL AND m.expires_at <= ?`,
      )
      .bind(now)
      .all<DbRow>(),
    getAllRetentionPolicies(db, { enabledOnly: true }),
  ]);

  if (expired.results.length === 0) return [];

  await db
    .prepare(
      "UPDATE mailboxes SET is_enabled = 0, updated_at = ? WHERE deleted_at IS NULL AND is_enabled = 1 AND expires_at IS NOT NULL AND expires_at <= ?",
    )
    .bind(now, now)
    .run();

  return expired.results.map(row => attachResolvedRetentionToRecord(mapMailbox(row), policies));
}
