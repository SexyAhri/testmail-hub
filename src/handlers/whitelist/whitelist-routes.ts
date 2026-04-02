import {
  addAuditLog,
  createWhitelistEntry,
  deleteWhitelistEntry,
  getWhitelistById,
  getWhitelistPaged,
  getWhitelistSettings,
  updateWhitelistEntry,
  updateWhitelistSettings,
} from "../../core/db";
import { RULES_PAGE_SIZE } from "../../utils/constants";
import { clampPage, json, jsonError, readJsonBody } from "../../utils/utils";
import type { AuthSession, D1Database } from "../../server/types";
import { ensureActorCanManageGlobalSettings } from "../access-control";
import {
  buildResourceDeleteAuditDetail,
  readRequestAuditOperationNote,
  toWhitelistAuditSnapshot,
} from "../audit";
import { validateWhitelistBody } from "../validation";

export async function handleAdminWhitelistGet(
  url: URL,
  db: D1Database,
): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  const payload = await getWhitelistPaged(db, page, RULES_PAGE_SIZE);
  return json(payload);
}

export async function handleAdminWhitelistPost(
  request: Request,
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

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateWhitelistBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await createWhitelistEntry(db, validation.data);
  await addAuditLog(db, {
    action: "whitelist.create",
    actor,
    detail: validation.data,
    entity_type: "whitelist",
  });
  return json({ ok: true });
}

export async function handleAdminWhitelistPut(
  pathname: string,
  request: Request,
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

  const id = Number(pathname.replace("/admin/whitelist/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid whitelist id", 400);

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateWhitelistBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await updateWhitelistEntry(db, id, validation.data);
  await addAuditLog(db, {
    action: "whitelist.update",
    actor,
    detail: { id, ...validation.data },
    entity_id: String(id),
    entity_type: "whitelist",
  });
  return json({ ok: true });
}

export async function handleAdminWhitelistDelete(
  pathname: string,
  request: Request,
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

  const id = Number(pathname.replace("/admin/whitelist/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid whitelist id", 400);

  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const existing = await getWhitelistById(db, id);
  if (!existing) return jsonError("whitelist not found", 404);

  await deleteWhitelistEntry(db, id);
  await addAuditLog(db, {
    action: "whitelist.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toWhitelistAuditSnapshot(existing),
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "whitelist",
  });
  return json({ ok: true });
}

export async function handleAdminWhitelistSettingsGet(
  db: D1Database,
): Promise<Response> {
  return json(await getWhitelistSettings(db));
}

export async function handleAdminWhitelistSettingsPut(
  request: Request,
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

  const parsed = await readJsonBody<{ enabled?: boolean }>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);
  const enabled = parsed.data?.enabled !== false;

  const settings = await updateWhitelistSettings(db, enabled);
  await addAuditLog(db, {
    action: "whitelist.settings.update",
    actor,
    detail: { enabled: settings.enabled },
    entity_type: "whitelist_settings",
  });
  return json(settings);
}
