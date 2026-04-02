import {
  addAuditLog,
  createMailboxPool,
  deleteMailboxPool,
  getMailboxPoolById,
  updateMailboxPool,
} from "../../core/db";
import { json, jsonError, readJsonBody } from "../../utils/utils";
import type { AuthSession, D1Database } from "../../server/types";
import {
  ensureActorCanAccessProject,
  ensureActorCanWrite,
} from "../access-control";
import {
  buildResourceDeleteAuditDetail,
  readRequestAuditOperationNote,
  toWorkspaceMailboxPoolAuditSnapshot,
} from "../audit";
import { resolveWorkspaceAssignment } from "../request-helpers";
import { validateMailboxPoolBody } from "../validation";

export async function handleAdminMailboxPoolsPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateMailboxPoolBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);
  try {
    ensureActorCanAccessProject(actor, validation.data.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const scope = await resolveWorkspaceAssignment(db, {
    environment_id: validation.data.environment_id,
    project_id: validation.data.project_id,
  });
  if (!scope.ok) return jsonError(scope.error, 400);

  await createMailboxPool(db, {
    ...validation.data,
    environment_id: scope.data.environment_id!,
    project_id: scope.data.project_id!,
  });
  await addAuditLog(db, {
    action: "workspace.mailbox_pool.create",
    actor,
    detail: validation.data,
    entity_type: "workspace_mailbox_pool",
  });
  return json({ ok: true });
}

export async function handleAdminMailboxPoolsPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = Number(pathname.replace("/admin/mailbox-pools/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid mailbox pool id", 400);

  const existing = await getMailboxPoolById(db, id);
  if (!existing) return jsonError("mailbox pool not found", 404);
  try {
    ensureActorCanAccessProject(actor, existing.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateMailboxPoolBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);
  try {
    ensureActorCanAccessProject(actor, validation.data.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const scope = await resolveWorkspaceAssignment(db, {
    environment_id: validation.data.environment_id,
    project_id: validation.data.project_id,
  });
  if (!scope.ok) return jsonError(scope.error, 400);

  await updateMailboxPool(db, id, {
    ...validation.data,
    environment_id: scope.data.environment_id!,
    project_id: scope.data.project_id!,
  });
  await addAuditLog(db, {
    action: "workspace.mailbox_pool.update",
    actor,
    detail: { id, ...validation.data },
    entity_id: String(id),
    entity_type: "workspace_mailbox_pool",
  });
  return json({ ok: true });
}

export async function handleAdminMailboxPoolsDelete(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = Number(pathname.replace("/admin/mailbox-pools/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid mailbox pool id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const existing = await getMailboxPoolById(db, id);
  if (!existing) return jsonError("mailbox pool not found", 404);
  try {
    ensureActorCanAccessProject(actor, existing.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  await deleteMailboxPool(db, id);
  await addAuditLog(db, {
    action: "workspace.mailbox_pool.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toWorkspaceMailboxPoolAuditSnapshot(existing),
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "workspace_mailbox_pool",
  });
  return json({ ok: true });
}
