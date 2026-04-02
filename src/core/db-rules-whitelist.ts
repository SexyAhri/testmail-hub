import type {
  D1Database,
  PaginationPayload,
  RuleRecord,
  WhitelistRecord,
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

function boolValue(row: DbRow, key: string, fallback = false): boolean {
  const value = row[key];
  if (value === null || value === undefined) return fallback;
  return value === true || value === 1 || value === "1";
}

function mapRule(row: DbRow): RuleRecord {
  return {
    created_at: numberValue(row, "created_at", Date.now()),
    id: numberValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    pattern: stringValue(row, "pattern"),
    remark: stringValue(row, "remark"),
    sender_filter: stringValue(row, "sender_filter"),
    updated_at: numberValue(
      row,
      "updated_at",
      numberValue(row, "created_at", Date.now()),
    ),
  };
}

function mapWhitelist(row: DbRow): WhitelistRecord {
  return {
    created_at: numberValue(row, "created_at", Date.now()),
    id: numberValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    note: stringValue(row, "note"),
    sender_pattern: stringValue(row, "sender_pattern"),
    updated_at: numberValue(
      row,
      "updated_at",
      numberValue(row, "created_at", Date.now()),
    ),
  };
}

export async function loadRules(
  db: D1Database,
  enabledOnly = true,
): Promise<RuleRecord[]> {
  const query = enabledOnly
    ? "SELECT id, remark, sender_filter, pattern, created_at, updated_at, is_enabled FROM rules WHERE is_enabled = 1 ORDER BY created_at DESC"
    : "SELECT id, remark, sender_filter, pattern, created_at, updated_at, is_enabled FROM rules ORDER BY created_at DESC";
  const result = await db.prepare(query).all<DbRow>();
  return result.results.map(mapRule);
}

export async function loadWhitelist(
  db: D1Database,
  enabledOnly = true,
): Promise<WhitelistRecord[]> {
  const query = enabledOnly
    ? "SELECT id, sender_pattern, note, created_at, updated_at, is_enabled FROM whitelist WHERE is_enabled = 1 ORDER BY created_at DESC"
    : "SELECT id, sender_pattern, note, created_at, updated_at, is_enabled FROM whitelist ORDER BY created_at DESC";
  const result = await db.prepare(query).all<DbRow>();
  return result.results.map(mapWhitelist);
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
    )
      .bind(pageSize, offset)
      .all<DbRow>(),
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
  await db
    .prepare(
      "INSERT INTO rules (remark, sender_filter, pattern, created_at, updated_at, is_enabled) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      input.remark || null,
      input.sender_filter || null,
      input.pattern,
      now,
      now,
      input.is_enabled ? 1 : 0,
    )
    .run();
}

export async function updateRule(
  db: D1Database,
  id: number,
  input: Pick<RuleRecord, "remark" | "sender_filter" | "pattern" | "is_enabled">,
): Promise<void> {
  await db
    .prepare(
      "UPDATE rules SET remark = ?, sender_filter = ?, pattern = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      input.remark || null,
      input.sender_filter || null,
      input.pattern,
      input.is_enabled ? 1 : 0,
      Date.now(),
      id,
    )
    .run();
}

export async function deleteRule(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM rules WHERE id = ?").bind(id).run();
}

export async function getRuleById(
  db: D1Database,
  id: number,
): Promise<RuleRecord | null> {
  const row = await db
    .prepare(
      "SELECT id, remark, sender_filter, pattern, created_at, updated_at, is_enabled FROM rules WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .first<DbRow>();
  return row ? mapRule(row) : null;
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
    )
      .bind(pageSize, offset)
      .all<DbRow>(),
    db.prepare("SELECT COUNT(1) as total FROM whitelist").first<DbRow>(),
  ]);

  return {
    items: list.results.map(mapWhitelist),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllWhitelist(
  db: D1Database,
): Promise<WhitelistRecord[]> {
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
  await db
    .prepare(
      "INSERT INTO whitelist (sender_pattern, note, created_at, updated_at, is_enabled) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(
      input.sender_pattern,
      input.note || null,
      now,
      now,
      input.is_enabled ? 1 : 0,
    )
    .run();
}

export async function updateWhitelistEntry(
  db: D1Database,
  id: number,
  input: Pick<WhitelistRecord, "sender_pattern" | "note" | "is_enabled">,
): Promise<void> {
  await db
    .prepare(
      "UPDATE whitelist SET sender_pattern = ?, note = ?, is_enabled = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      input.sender_pattern,
      input.note || null,
      input.is_enabled ? 1 : 0,
      Date.now(),
      id,
    )
    .run();
}

export async function deleteWhitelistEntry(
  db: D1Database,
  id: number,
): Promise<void> {
  await db.prepare("DELETE FROM whitelist WHERE id = ?").bind(id).run();
}

export async function getWhitelistById(
  db: D1Database,
  id: number,
): Promise<WhitelistRecord | null> {
  const row = await db
    .prepare(
      "SELECT id, sender_pattern, note, created_at, updated_at, is_enabled FROM whitelist WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .first<DbRow>();
  return row ? mapWhitelist(row) : null;
}
