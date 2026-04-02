import {
  isSqliteSchemaError,
  isValidEmailAddress,
  normalizeEmailAddress,
} from "../utils/utils";
import type {
  D1Database,
  DomainAssetRecord,
  DomainAssetSecretRecord,
  DomainRoutingProfileRecord,
  PaginationPayload,
} from "../server/types";

type DbRow = Record<string, unknown>;

const DOMAIN_ASSET_SELECT_FIELDS = [
  "d.id",
  "d.domain",
  "d.provider",
  "d.allow_new_mailboxes",
  "d.allow_catch_all_sync",
  "d.allow_mailbox_route_sync",
  "d.zone_id",
  "d.email_worker",
  "d.mailbox_route_forward_to",
  "CASE WHEN COALESCE(d.cloudflare_api_token, '') <> '' THEN 1 ELSE 0 END as cloudflare_api_token_configured",
  "d.note",
  "d.is_enabled",
  "d.is_primary",
  "d.catch_all_mode",
  "d.catch_all_forward_to",
  "d.routing_profile_id",
  "d.project_id",
  "d.environment_id",
  "d.created_at",
  "d.updated_at",
  "COALESCE(rp.name, '') as routing_profile_name",
  "COALESCE(rp.slug, '') as routing_profile_slug",
  "COALESCE(rp.catch_all_mode, 'inherit') as routing_profile_catch_all_mode",
  "COALESCE(rp.catch_all_forward_to, '') as routing_profile_catch_all_forward_to",
  "COALESCE(rp.is_enabled, 0) as routing_profile_enabled",
  "COALESCE(p.name, '') as project_name",
  "COALESCE(p.slug, '') as project_slug",
  "COALESCE(e.name, '') as environment_name",
  "COALESCE(e.slug, '') as environment_slug",
].join(", ");

const DOMAIN_ASSET_SECRET_SELECT_FIELDS = [
  DOMAIN_ASSET_SELECT_FIELDS,
  "COALESCE(d.cloudflare_api_token, '') as cloudflare_api_token",
].join(", ");

const DOMAIN_ROUTING_PROFILE_SELECT_FIELDS = [
  "rp.id",
  "rp.name",
  "rp.slug",
  "rp.provider",
  "rp.note",
  "rp.is_enabled",
  "rp.catch_all_mode",
  "rp.catch_all_forward_to",
  "rp.project_id",
  "rp.environment_id",
  "rp.created_at",
  "rp.updated_at",
  "COALESCE(p.name, '') as project_name",
  "COALESCE(p.slug, '') as project_slug",
  "COALESCE(e.name, '') as environment_name",
  "COALESCE(e.slug, '') as environment_slug",
  "COALESCE(dc.linked_domain_count, 0) as linked_domain_count",
].join(", ");

const DOMAIN_ROUTING_PROFILE_JOINS = `
  FROM domain_routing_profiles rp
  LEFT JOIN projects p ON p.id = rp.project_id
  LEFT JOIN environments e ON e.id = rp.environment_id
  LEFT JOIN (
    SELECT routing_profile_id, COUNT(1) as linked_domain_count
    FROM domains
    WHERE routing_profile_id IS NOT NULL
    GROUP BY routing_profile_id
  ) dc ON dc.routing_profile_id = rp.id
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

function buildProjectScopedFilter(
  tableAlias: string,
  allowedProjectIds?: number[] | null,
) {
  const hasScopedProjects = allowedProjectIds !== null && allowedProjectIds !== undefined;
  const normalizedAllowedProjectIds = uniquePositiveIds(allowedProjectIds || []);
  if (!hasScopedProjects) {
    return {
      params: [] as number[],
      whereClause: "",
    };
  }

  if (normalizedAllowedProjectIds.length === 0) {
    return {
      params: [] as number[],
      whereClause: ` WHERE ${tableAlias}.project_id IS NULL`,
    };
  }

  return {
    params: normalizedAllowedProjectIds,
    whereClause: ` WHERE (${tableAlias}.project_id IS NULL OR ${tableAlias}.project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)}))`,
  };
}

function mapDomainAsset(row: DbRow): DomainAssetRecord {
  return {
    allow_catch_all_sync: boolValue(row, "allow_catch_all_sync", true),
    allow_mailbox_route_sync: boolValue(row, "allow_mailbox_route_sync", true),
    allow_new_mailboxes: boolValue(row, "allow_new_mailboxes", true),
    catch_all_forward_to: stringValue(row, "catch_all_forward_to"),
    catch_all_mode: stringValue(row, "catch_all_mode", "inherit") as DomainAssetRecord["catch_all_mode"],
    cloudflare_api_token_configured: boolValue(row, "cloudflare_api_token_configured", false),
    created_at: numberValue(row, "created_at", Date.now()),
    domain: stringValue(row, "domain"),
    email_worker: stringValue(row, "email_worker"),
    mailbox_route_forward_to: stringValue(row, "mailbox_route_forward_to"),
    environment_id: nullableNumberValue(row, "environment_id"),
    environment_name: stringValue(row, "environment_name"),
    environment_slug: stringValue(row, "environment_slug"),
    id: numberValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    is_primary: boolValue(row, "is_primary", false),
    note: stringValue(row, "note"),
    provider: stringValue(row, "provider", "cloudflare"),
    project_id: nullableNumberValue(row, "project_id"),
    project_name: stringValue(row, "project_name"),
    project_slug: stringValue(row, "project_slug"),
    routing_profile_catch_all_forward_to: stringValue(row, "routing_profile_catch_all_forward_to"),
    routing_profile_catch_all_mode: stringValue(
      row,
      "routing_profile_catch_all_mode",
      "inherit",
    ) as DomainAssetRecord["routing_profile_catch_all_mode"],
    routing_profile_enabled: boolValue(row, "routing_profile_enabled", false),
    routing_profile_id: nullableNumberValue(row, "routing_profile_id"),
    routing_profile_name: stringValue(row, "routing_profile_name"),
    routing_profile_slug: stringValue(row, "routing_profile_slug"),
    updated_at: numberValue(row, "updated_at", Date.now()),
    zone_id: stringValue(row, "zone_id"),
  };
}

function mapDomainAssetSecret(row: DbRow): DomainAssetSecretRecord {
  return {
    ...mapDomainAsset(row),
    cloudflare_api_token: stringValue(row, "cloudflare_api_token"),
  };
}

function mapDomainRoutingProfile(row: DbRow): DomainRoutingProfileRecord {
  return {
    catch_all_forward_to: stringValue(row, "catch_all_forward_to"),
    catch_all_mode: stringValue(
      row,
      "catch_all_mode",
      "inherit",
    ) as DomainRoutingProfileRecord["catch_all_mode"],
    created_at: numberValue(row, "created_at", Date.now()),
    environment_id: nullableNumberValue(row, "environment_id"),
    environment_name: stringValue(row, "environment_name"),
    environment_slug: stringValue(row, "environment_slug"),
    id: numberValue(row, "id"),
    is_enabled: boolValue(row, "is_enabled", true),
    linked_domain_count: numberValue(row, "linked_domain_count", 0),
    name: stringValue(row, "name"),
    note: stringValue(row, "note"),
    project_id: nullableNumberValue(row, "project_id"),
    project_name: stringValue(row, "project_name"),
    project_slug: stringValue(row, "project_slug"),
    provider: stringValue(row, "provider", "cloudflare"),
    slug: stringValue(row, "slug"),
    updated_at: numberValue(row, "updated_at", Date.now()),
  };
}

export async function getDomainAssetsPaged(
  db: D1Database,
  page: number,
  pageSize: number,
  allowedProjectIds?: number[] | null,
): Promise<PaginationPayload<DomainAssetRecord>> {
  const offset = (page - 1) * pageSize;
  const scope = buildProjectScopedFilter("d", allowedProjectIds);
  const [list, countRow] = await Promise.all([
    db
      .prepare(
        `SELECT ${DOMAIN_ASSET_SELECT_FIELDS}
        FROM domains d
        LEFT JOIN domain_routing_profiles rp ON rp.id = d.routing_profile_id
        LEFT JOIN projects p ON p.id = d.project_id
        LEFT JOIN environments e ON e.id = d.environment_id${scope.whereClause}
        ORDER BY d.is_primary DESC, d.is_enabled DESC, d.domain ASC
        LIMIT ? OFFSET ?`,
      )
      .bind(...scope.params, pageSize, offset)
      .all<DbRow>(),
    db
      .prepare(`SELECT COUNT(1) as total FROM domains d${scope.whereClause}`)
      .bind(...scope.params)
      .first<DbRow>(),
  ]);

  return {
    items: list.results.map(mapDomainAsset),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllDomainAssets(
  db: D1Database,
  includeDisabled = true,
  allowedProjectIds?: number[] | null,
): Promise<DomainAssetRecord[]> {
  const scope = buildProjectScopedFilter("d", allowedProjectIds);
  const query = includeDisabled
    ? `SELECT ${DOMAIN_ASSET_SELECT_FIELDS}
      FROM domains d
      LEFT JOIN domain_routing_profiles rp ON rp.id = d.routing_profile_id
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN environments e ON e.id = d.environment_id${scope.whereClause}
      ORDER BY d.is_primary DESC, d.is_enabled DESC, d.domain ASC`
    : `SELECT ${DOMAIN_ASSET_SELECT_FIELDS}
      FROM domains d
      LEFT JOIN domain_routing_profiles rp ON rp.id = d.routing_profile_id
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN environments e ON e.id = d.environment_id${scope.whereClause ? `${scope.whereClause} AND d.is_enabled = 1` : " WHERE d.is_enabled = 1"}
      ORDER BY d.is_primary DESC, d.domain ASC`;
  const rows = await db.prepare(query).bind(...scope.params).all<DbRow>();
  return rows.results.map(mapDomainAsset);
}

export async function getDomainAssetById(
  db: D1Database,
  id: number,
): Promise<DomainAssetRecord | null> {
  const row = await db
    .prepare(
      `SELECT ${DOMAIN_ASSET_SELECT_FIELDS}
      FROM domains d
      LEFT JOIN domain_routing_profiles rp ON rp.id = d.routing_profile_id
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN environments e ON e.id = d.environment_id
      WHERE d.id = ? LIMIT 1`,
    )
    .bind(id)
    .first<DbRow>();

  return row ? mapDomainAsset(row) : null;
}

export async function getDomainAssetWithSecretById(
  db: D1Database,
  id: number,
): Promise<DomainAssetSecretRecord | null> {
  const row = await db
    .prepare(
      `SELECT ${DOMAIN_ASSET_SECRET_SELECT_FIELDS}
      FROM domains d
      LEFT JOIN domain_routing_profiles rp ON rp.id = d.routing_profile_id
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN environments e ON e.id = d.environment_id
      WHERE d.id = ? LIMIT 1`,
    )
    .bind(id)
    .first<DbRow>();

  return row ? mapDomainAssetSecret(row) : null;
}

export async function getDomainAssetByName(
  db: D1Database,
  domain: string,
): Promise<DomainAssetRecord | null> {
  const row = await db
    .prepare(
      `SELECT ${DOMAIN_ASSET_SELECT_FIELDS}
      FROM domains d
      LEFT JOIN domain_routing_profiles rp ON rp.id = d.routing_profile_id
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN environments e ON e.id = d.environment_id
      WHERE d.domain = ? LIMIT 1`,
    )
    .bind(String(domain || "").trim().toLowerCase())
    .first<DbRow>();

  return row ? mapDomainAsset(row) : null;
}

export async function getDomainAssetWithSecretByName(
  db: D1Database,
  domain: string,
): Promise<DomainAssetSecretRecord | null> {
  const row = await db
    .prepare(
      `SELECT ${DOMAIN_ASSET_SECRET_SELECT_FIELDS}
      FROM domains d
      LEFT JOIN domain_routing_profiles rp ON rp.id = d.routing_profile_id
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN environments e ON e.id = d.environment_id
      WHERE d.domain = ? LIMIT 1`,
    )
    .bind(String(domain || "").trim().toLowerCase())
    .first<DbRow>();

  return row ? mapDomainAssetSecret(row) : null;
}

export async function getPrimaryDomainAsset(
  db: D1Database,
): Promise<DomainAssetRecord | null> {
  const row = await db
    .prepare(
      `SELECT ${DOMAIN_ASSET_SELECT_FIELDS}
      FROM domains d
      LEFT JOIN domain_routing_profiles rp ON rp.id = d.routing_profile_id
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN environments e ON e.id = d.environment_id
      WHERE d.is_primary = 1 LIMIT 1`,
    )
    .first<DbRow>();

  return row ? mapDomainAsset(row) : null;
}

export async function getAllDomainAssetsWithSecrets(
  db: D1Database,
  includeDisabled = true,
  allowedProjectIds?: number[] | null,
): Promise<DomainAssetSecretRecord[]> {
  const scope = buildProjectScopedFilter("d", allowedProjectIds);
  const query = includeDisabled
    ? `SELECT ${DOMAIN_ASSET_SECRET_SELECT_FIELDS}
      FROM domains d
      LEFT JOIN domain_routing_profiles rp ON rp.id = d.routing_profile_id
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN environments e ON e.id = d.environment_id${scope.whereClause}
      ORDER BY d.is_primary DESC, d.is_enabled DESC, d.domain ASC`
    : `SELECT ${DOMAIN_ASSET_SECRET_SELECT_FIELDS}
      FROM domains d
      LEFT JOIN domain_routing_profiles rp ON rp.id = d.routing_profile_id
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN environments e ON e.id = d.environment_id${scope.whereClause ? `${scope.whereClause} AND d.is_enabled = 1` : " WHERE d.is_enabled = 1"}
      ORDER BY d.is_primary DESC, d.domain ASC`;
  const rows = await db.prepare(query).bind(...scope.params).all<DbRow>();
  return rows.results.map(mapDomainAssetSecret);
}

export async function createDomainAsset(
  db: D1Database,
  input: {
    allow_catch_all_sync: boolean;
    allow_mailbox_route_sync: boolean;
    allow_new_mailboxes: boolean;
    catch_all_forward_to: string;
    catch_all_mode: DomainAssetRecord["catch_all_mode"];
    cloudflare_api_token: string;
    domain: string;
    email_worker: string;
    mailbox_route_forward_to: string;
    environment_id: number | null;
    is_enabled: boolean;
    is_primary: boolean;
    note: string;
    provider: string;
    project_id: number | null;
    routing_profile_id: number | null;
    zone_id: string;
  },
): Promise<number> {
  const now = Date.now();
  if (input.is_primary) {
    await db
      .prepare("UPDATE domains SET is_primary = 0, updated_at = ? WHERE is_primary = 1")
      .bind(now)
      .run();
  }

  const result = (await db
    .prepare(
      "INSERT INTO domains (domain, provider, allow_new_mailboxes, allow_catch_all_sync, allow_mailbox_route_sync, zone_id, email_worker, mailbox_route_forward_to, cloudflare_api_token, note, is_enabled, is_primary, catch_all_mode, catch_all_forward_to, routing_profile_id, project_id, environment_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      input.domain,
      input.provider,
      input.allow_new_mailboxes ? 1 : 0,
      input.allow_catch_all_sync ? 1 : 0,
      input.allow_mailbox_route_sync ? 1 : 0,
      input.zone_id,
      input.email_worker,
      input.mailbox_route_forward_to,
      input.cloudflare_api_token,
      input.note,
      input.is_enabled ? 1 : 0,
      input.is_primary ? 1 : 0,
      input.catch_all_mode,
      input.catch_all_forward_to,
      input.routing_profile_id,
      input.project_id,
      input.environment_id,
      now,
      now,
    )
    .run()) as { meta?: { last_row_id?: number } };

  const insertedId = Number(result?.meta?.last_row_id || 0);
  if (insertedId > 0) return insertedId;

  const row = await db
    .prepare("SELECT id FROM domains WHERE domain = ? AND created_at = ? LIMIT 1")
    .bind(input.domain, now)
    .first<DbRow>();
  return numberValue(row || {}, "id", 0);
}

export async function updateDomainAsset(
  db: D1Database,
  id: number,
  input: {
    allow_catch_all_sync: boolean;
    allow_mailbox_route_sync: boolean;
    allow_new_mailboxes: boolean;
    catch_all_forward_to: string;
    catch_all_mode: DomainAssetRecord["catch_all_mode"];
    cloudflare_api_token: string;
    domain: string;
    email_worker: string;
    mailbox_route_forward_to: string;
    environment_id: number | null;
    is_enabled: boolean;
    is_primary: boolean;
    note: string;
    provider: string;
    project_id: number | null;
    routing_profile_id: number | null;
    zone_id: string;
  },
): Promise<void> {
  const now = Date.now();
  if (input.is_primary) {
    await db
      .prepare(
        "UPDATE domains SET is_primary = 0, updated_at = ? WHERE id <> ? AND is_primary = 1",
      )
      .bind(now, id)
      .run();
  }

  await db
    .prepare(
      "UPDATE domains SET domain = ?, provider = ?, allow_new_mailboxes = ?, allow_catch_all_sync = ?, allow_mailbox_route_sync = ?, zone_id = ?, email_worker = ?, mailbox_route_forward_to = ?, cloudflare_api_token = ?, note = ?, is_enabled = ?, is_primary = ?, catch_all_mode = ?, catch_all_forward_to = ?, routing_profile_id = ?, project_id = ?, environment_id = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      input.domain,
      input.provider,
      input.allow_new_mailboxes ? 1 : 0,
      input.allow_catch_all_sync ? 1 : 0,
      input.allow_mailbox_route_sync ? 1 : 0,
      input.zone_id,
      input.email_worker,
      input.mailbox_route_forward_to,
      input.cloudflare_api_token,
      input.note,
      input.is_enabled ? 1 : 0,
      input.is_primary ? 1 : 0,
      input.catch_all_mode,
      input.catch_all_forward_to,
      input.routing_profile_id,
      input.project_id,
      input.environment_id,
      now,
      id,
    )
    .run();
}

export async function deleteDomainAsset(
  db: D1Database,
  id: number,
): Promise<void> {
  const existing = await getDomainAssetById(db, id);
  if (!existing) return;

  const [mailboxCount, emailCount] = await Promise.all([
    db
      .prepare(
        "SELECT COUNT(1) as total FROM mailboxes WHERE deleted_at IS NULL AND lower(address) LIKE ?",
      )
      .bind(`%@${existing.domain}`)
      .first<DbRow>(),
    db
      .prepare(
        "SELECT COUNT(1) as total FROM emails WHERE deleted_at IS NULL AND lower(to_address) LIKE ?",
      )
      .bind(`%@${existing.domain}%`)
      .first<DbRow>(),
  ]);

  if (
    numberValue(mailboxCount || {}, "total", 0) > 0
    || numberValue(emailCount || {}, "total", 0) > 0
  ) {
    throw new Error("domain is in use and cannot be deleted");
  }

  await db.prepare("DELETE FROM domains WHERE id = ?").bind(id).run();
}

export async function getDomainRoutingProfilesPaged(
  db: D1Database,
  page: number,
  pageSize: number,
  allowedProjectIds?: number[] | null,
): Promise<PaginationPayload<DomainRoutingProfileRecord>> {
  const offset = (page - 1) * pageSize;
  const scope = buildProjectScopedFilter("rp", allowedProjectIds);
  const [list, countRow] = await Promise.all([
    db
      .prepare(
        `SELECT ${DOMAIN_ROUTING_PROFILE_SELECT_FIELDS}
        ${DOMAIN_ROUTING_PROFILE_JOINS}${scope.whereClause}
        ORDER BY rp.is_enabled DESC, rp.name ASC
        LIMIT ? OFFSET ?`,
      )
      .bind(...scope.params, pageSize, offset)
      .all<DbRow>(),
    db
      .prepare(
        `SELECT COUNT(1) as total FROM domain_routing_profiles rp${scope.whereClause}`,
      )
      .bind(...scope.params)
      .first<DbRow>(),
  ]);

  return {
    items: list.results.map(mapDomainRoutingProfile),
    page,
    pageSize,
    total: numberValue(countRow || {}, "total", 0),
  };
}

export async function getAllDomainRoutingProfiles(
  db: D1Database,
  includeDisabled = true,
  allowedProjectIds?: number[] | null,
): Promise<DomainRoutingProfileRecord[]> {
  const scope = buildProjectScopedFilter("rp", allowedProjectIds);
  const whereClause = includeDisabled
    ? scope.whereClause
    : scope.whereClause
      ? `${scope.whereClause} AND rp.is_enabled = 1`
      : " WHERE rp.is_enabled = 1";
  const rows = await db
    .prepare(
      `SELECT ${DOMAIN_ROUTING_PROFILE_SELECT_FIELDS}
      ${DOMAIN_ROUTING_PROFILE_JOINS}${whereClause}
      ORDER BY rp.is_enabled DESC, rp.name ASC`,
    )
    .bind(...scope.params)
    .all<DbRow>();

  return rows.results.map(mapDomainRoutingProfile);
}

export async function getDomainRoutingProfileById(
  db: D1Database,
  id: number,
): Promise<DomainRoutingProfileRecord | null> {
  const row = await db
    .prepare(
      `SELECT ${DOMAIN_ROUTING_PROFILE_SELECT_FIELDS}
      ${DOMAIN_ROUTING_PROFILE_JOINS}
      WHERE rp.id = ? LIMIT 1`,
    )
    .bind(id)
    .first<DbRow>();

  return row ? mapDomainRoutingProfile(row) : null;
}

export async function createDomainRoutingProfile(
  db: D1Database,
  input: {
    catch_all_forward_to: string;
    catch_all_mode: DomainRoutingProfileRecord["catch_all_mode"];
    environment_id: number | null;
    is_enabled: boolean;
    name: string;
    note: string;
    project_id: number | null;
    provider: string;
    slug: string;
  },
): Promise<number> {
  const now = Date.now();
  const result = (await db
    .prepare(
      "INSERT INTO domain_routing_profiles (name, slug, provider, catch_all_mode, catch_all_forward_to, note, is_enabled, project_id, environment_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      input.name,
      input.slug,
      input.provider,
      input.catch_all_mode,
      input.catch_all_forward_to,
      input.note,
      input.is_enabled ? 1 : 0,
      input.project_id,
      input.environment_id,
      now,
      now,
    )
    .run()) as { meta?: { last_row_id?: number } };

  const insertedId = Number(result?.meta?.last_row_id || 0);
  if (insertedId > 0) return insertedId;

  const row = await db
    .prepare("SELECT id FROM domain_routing_profiles WHERE slug = ? LIMIT 1")
    .bind(input.slug)
    .first<DbRow>();
  return numberValue(row || {}, "id", 0);
}

export async function updateDomainRoutingProfile(
  db: D1Database,
  id: number,
  input: {
    catch_all_forward_to: string;
    catch_all_mode: DomainRoutingProfileRecord["catch_all_mode"];
    environment_id: number | null;
    is_enabled: boolean;
    name: string;
    note: string;
    project_id: number | null;
    provider: string;
    slug: string;
  },
): Promise<void> {
  await db
    .prepare(
      "UPDATE domain_routing_profiles SET name = ?, slug = ?, provider = ?, catch_all_mode = ?, catch_all_forward_to = ?, note = ?, is_enabled = ?, project_id = ?, environment_id = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      input.name,
      input.slug,
      input.provider,
      input.catch_all_mode,
      input.catch_all_forward_to,
      input.note,
      input.is_enabled ? 1 : 0,
      input.project_id,
      input.environment_id,
      Date.now(),
      id,
    )
    .run();
}

export async function deleteDomainRoutingProfile(
  db: D1Database,
  id: number,
): Promise<void> {
  const existing = await getDomainRoutingProfileById(db, id);
  if (!existing) return;
  if (existing.linked_domain_count > 0) {
    throw new Error("routing profile is in use and cannot be deleted");
  }
  await db.prepare("DELETE FROM domain_routing_profiles WHERE id = ?").bind(id).run();
}

export async function getAvailableDomains(
  db: D1Database,
  allowedProjectIds?: number[] | null,
): Promise<string[]> {
  const hasScopedProjects = allowedProjectIds !== null && allowedProjectIds !== undefined;
  const normalizedAllowedProjectIds = uniquePositiveIds(allowedProjectIds || []);

  try {
    const configured = await getAllDomainAssets(
      db,
      false,
      hasScopedProjects ? normalizedAllowedProjectIds : null,
    );
    if (configured.length > 0) {
      return configured.map(item => item.domain);
    }
  } catch (error) {
    if (!isSqliteSchemaError(error)) throw error;
  }

  const emailWhere = hasScopedProjects
    ? normalizedAllowedProjectIds.length > 0
      ? ` WHERE deleted_at IS NULL AND EXISTS (
      SELECT 1
      FROM email_mailbox_links links
      WHERE links.email_message_id = emails.message_id
        AND links.project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)})
    )`
      : " WHERE 1 = 0"
    : " WHERE deleted_at IS NULL";
  const mailboxWhere = hasScopedProjects
    ? normalizedAllowedProjectIds.length > 0
      ? ` WHERE deleted_at IS NULL AND project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)})`
      : " WHERE 1 = 0"
    : " WHERE deleted_at IS NULL";

  const [emailResult, mailboxResult] = await Promise.all([
    db
      .prepare(`SELECT to_address FROM emails${emailWhere}`)
      .bind(...normalizedAllowedProjectIds)
      .all<DbRow>(),
    db
      .prepare(`SELECT address FROM mailboxes${mailboxWhere}`)
      .bind(...normalizedAllowedProjectIds)
      .all<DbRow>(),
  ]);

  const domains = new Set<string>();
  for (const row of emailResult.results) {
    for (const addr of stringValue(row, "to_address").split(",")) {
      const parts = normalizeEmailAddress(addr).split("@");
      if (parts.length === 2 && parts[1]) domains.add(parts[1]);
    }
  }

  for (const row of mailboxResult.results) {
    const parts = normalizeEmailAddress(stringValue(row, "address")).split("@");
    if (parts.length === 2 && parts[1]) domains.add(parts[1]);
  }

  return Array.from(domains).sort();
}

export async function getDomainAssetUsageStats(
  db: D1Database,
  domains: string[],
  allowedProjectIds?: number[] | null,
): Promise<
  Array<{
    active_mailbox_total: number;
    active_mailbox_addresses: string[];
    domain: string;
    email_total: number;
    observed_mailbox_total: number;
  }>
> {
  const normalizedDomains = Array.from(
    new Set(
      (Array.isArray(domains) ? domains : [])
        .map(item => String(item || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  if (normalizedDomains.length === 0) return [];

  const hasScopedProjects = allowedProjectIds !== null && allowedProjectIds !== undefined;
  const normalizedAllowedProjectIds = uniquePositiveIds(allowedProjectIds || []);
  const mailboxWhere = hasScopedProjects
    ? normalizedAllowedProjectIds.length > 0
      ? ` WHERE deleted_at IS NULL AND is_enabled = 1 AND project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)})`
      : " WHERE 1 = 0"
    : " WHERE deleted_at IS NULL AND is_enabled = 1";
  const emailWhere = hasScopedProjects
    ? normalizedAllowedProjectIds.length > 0
      ? ` WHERE deleted_at IS NULL AND EXISTS (
      SELECT 1
      FROM email_mailbox_links links
      WHERE links.email_message_id = emails.message_id
        AND links.project_id IN (${buildSqlPlaceholders(normalizedAllowedProjectIds.length)})
    )`
      : " WHERE 1 = 0"
    : " WHERE deleted_at IS NULL";

  const [mailboxRows, emailRows] = await Promise.all([
    db
      .prepare(`SELECT address FROM mailboxes${mailboxWhere}`)
      .bind(...normalizedAllowedProjectIds)
      .all<DbRow>(),
    db
      .prepare(`SELECT to_address FROM emails${emailWhere}`)
      .bind(...normalizedAllowedProjectIds)
      .all<DbRow>(),
  ]);

  const statsMap = new Map<
    string,
    {
      active_mailbox_total: number;
      active_mailboxes: Set<string>;
      domain: string;
      email_total: number;
      observed_mailboxes: Set<string>;
    }
  >();

  for (const domain of normalizedDomains) {
    statsMap.set(domain, {
      active_mailbox_total: 0,
      active_mailboxes: new Set<string>(),
      domain,
      email_total: 0,
      observed_mailboxes: new Set<string>(),
    });
  }

  for (const row of mailboxRows.results) {
    const address = normalizeEmailAddress(stringValue(row, "address"));
    const domain = address.split("@")[1] || "";
    const stats = statsMap.get(domain);
    if (!stats) continue;
    stats.active_mailbox_total += 1;
    stats.active_mailboxes.add(address);
  }

  for (const row of emailRows.results) {
    const domainsInMessage = new Set<string>();
    const addresses = stringValue(row, "to_address")
      .split(",")
      .map(item => normalizeEmailAddress(item))
      .filter(isValidEmailAddress);

    for (const address of addresses) {
      const domain = address.split("@")[1] || "";
      const stats = statsMap.get(domain);
      if (!stats) continue;
      stats.observed_mailboxes.add(address);
      domainsInMessage.add(domain);
    }

    for (const domain of domainsInMessage) {
      const stats = statsMap.get(domain);
      if (!stats) continue;
      stats.email_total += 1;
    }
  }

  return normalizedDomains.map(domain => {
    const stats = statsMap.get(domain)!;
    return {
      active_mailbox_total: stats.active_mailbox_total,
      active_mailbox_addresses: Array.from(stats.active_mailboxes).sort(),
      domain,
      email_total: stats.email_total,
      observed_mailbox_total: stats.observed_mailboxes.size,
    };
  });
}
