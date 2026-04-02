import {
  addAuditLog,
  createProject,
  deleteProject,
  getProjectById,
  updateProject,
} from "../../core/db";
import { json, jsonError, readJsonBody } from "../../utils/utils";
import type { AuthSession, D1Database } from "../../server/types";
import {
  ensureActorCanAccessProject,
  ensureActorCanCreateProject,
  ensureActorCanDeleteProject,
  ensureActorCanWrite,
} from "../access-control";
import {
  buildResourceDeleteAuditDetail,
  readRequestAuditOperationNote,
  toWorkspaceProjectAuditSnapshot,
} from "../audit";
import { validateProjectBody } from "../validation";

export async function handleAdminProjectsPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanCreateProject(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateProjectBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await createProject(db, validation.data);
  await addAuditLog(db, {
    action: "workspace.project.create",
    actor,
    detail: validation.data,
    entity_type: "workspace_project",
  });
  return json({ ok: true });
}

export async function handleAdminProjectsPut(
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

  const id = Number(pathname.replace("/admin/projects/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid project id", 400);

  const project = await getProjectById(db, id);
  if (!project) return jsonError("project not found", 404);
  try {
    ensureActorCanAccessProject(actor, project.id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateProjectBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await updateProject(db, id, validation.data);
  await addAuditLog(db, {
    action: "workspace.project.update",
    actor,
    detail: { id, ...validation.data },
    entity_id: String(id),
    entity_type: "workspace_project",
  });
  return json({ ok: true });
}

export async function handleAdminProjectsDelete(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/projects/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid project id", 400);

  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const project = await getProjectById(db, id);
  if (!project) return jsonError("project not found", 404);
  try {
    ensureActorCanDeleteProject(actor);
    ensureActorCanAccessProject(actor, project.id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  await deleteProject(db, id);
  await addAuditLog(db, {
    action: "workspace.project.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toWorkspaceProjectAuditSnapshot(project),
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "workspace_project",
  });
  return json({ ok: true });
}
