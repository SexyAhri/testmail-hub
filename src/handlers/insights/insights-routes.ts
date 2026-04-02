import {
  getAuditLogsPaged,
  getErrorEventsPaged,
  getExportRows,
  getOverviewStats,
} from "../../core/db";
import { AUDIT_PAGE_SIZE } from "../../utils/constants";
import {
  clampPage,
  downloadResponse,
  json,
  jsonError,
  toCsv,
} from "../../utils/utils";
import type { AuthSession, D1Database } from "../../server/types";
import {
  ensureActorCanManageGlobalSettings,
  getActorProjectIds,
  isActorProjectScoped,
} from "../access-control";
import { normalizeExportResource, normalizeNullable } from "../validation";

export async function handleAdminOverviewStats(
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  return json(await getOverviewStats(db, getActorProjectIds(actor)));
}

export async function handleAdminAuditLogs(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageGlobalSettings(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const page = clampPage(url.searchParams.get("page"));
  return json(
    await getAuditLogsPaged(db, page, AUDIT_PAGE_SIZE, {
      action: normalizeNullable(url.searchParams.get("action")),
      action_prefix: normalizeNullable(url.searchParams.get("action_prefix")),
      entity_id: normalizeNullable(url.searchParams.get("entity_id")),
      entity_type: normalizeNullable(url.searchParams.get("entity_type")),
      keyword: normalizeNullable(url.searchParams.get("keyword")),
    }),
  );
}

export async function handleAdminErrors(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageGlobalSettings(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const page = clampPage(url.searchParams.get("page"));
  return json(
    await getErrorEventsPaged(db, page, AUDIT_PAGE_SIZE, {
      keyword: normalizeNullable(url.searchParams.get("keyword")),
      source: normalizeNullable(url.searchParams.get("source")),
    }),
  );
}

export async function handleAdminExport(
  resource: string,
  db: D1Database,
  format: string,
  actor: AuthSession,
): Promise<Response> {
  const normalized = normalizeExportResource(resource);
  if (!normalized) return jsonError("invalid export resource", 400);

  if (
    isActorProjectScoped(actor) &&
    !["emails", "trash", "mailboxes", "notifications"].includes(normalized)
  ) {
    return jsonError("project-scoped admin cannot export this resource", 403);
  }

  const rows = await getExportRows(db, normalized, getActorProjectIds(actor));

  if (format === "json") {
    return downloadResponse(
      JSON.stringify(rows, null, 2),
      `${normalized}.json`,
      "application/json",
    );
  }

  return downloadResponse(
    toCsv(rows),
    `${normalized}.csv`,
    "text/csv; charset=utf-8",
  );
}
