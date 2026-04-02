import {
  addAuditLog,
  createEnvironment,
  deleteEnvironment,
  getEnvironmentById,
  updateEnvironment,
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
  toWorkspaceEnvironmentAuditSnapshot,
} from "../audit";
import { resolveWorkspaceAssignment } from "../request-helpers";
import { validateEnvironmentBody } from "../validation";

export async function handleAdminEnvironmentsPost(
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

  const validation = validateEnvironmentBody(parsed.data || {});
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
    project_id: validation.data.project_id,
  });
  if (!scope.ok) return jsonError(scope.error, 400);

  await createEnvironment(db, {
    ...validation.data,
    project_id: scope.data.project_id!,
  });
  await addAuditLog(db, {
    action: "workspace.environment.create",
    actor,
    detail: validation.data,
    entity_type: "workspace_environment",
  });
  return json({ ok: true });
}

export async function handleAdminEnvironmentsPut(
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

  const id = Number(pathname.replace("/admin/environments/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid environment id", 400);

  const existing = await getEnvironmentById(db, id);
  if (!existing) return jsonError("environment not found", 404);
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

  const validation = validateEnvironmentBody(parsed.data || {});
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
    project_id: validation.data.project_id,
  });
  if (!scope.ok) return jsonError(scope.error, 400);

  await updateEnvironment(db, id, {
    ...validation.data,
    project_id: scope.data.project_id!,
  });
  await addAuditLog(db, {
    action: "workspace.environment.update",
    actor,
    detail: { id, ...validation.data },
    entity_id: String(id),
    entity_type: "workspace_environment",
  });
  return json({ ok: true });
}

export async function handleAdminEnvironmentsDelete(
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

  const id = Number(pathname.replace("/admin/environments/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid environment id", 400);

  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const existing = await getEnvironmentById(db, id);
  if (!existing) return jsonError("environment not found", 404);
  try {
    ensureActorCanAccessProject(actor, existing.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  await deleteEnvironment(db, id);
  await addAuditLog(db, {
    action: "workspace.environment.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toWorkspaceEnvironmentAuditSnapshot(existing),
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "workspace_environment",
  });
  return json({ ok: true });
}
