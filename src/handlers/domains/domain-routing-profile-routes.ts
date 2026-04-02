import {
  addAuditLog,
  createDomainRoutingProfile,
  deleteDomainRoutingProfile,
  getDomainRoutingProfileById,
  getDomainRoutingProfilesPaged,
  updateDomainRoutingProfile,
} from "../../core/db";
import { ADMIN_PAGE_SIZE } from "../../utils/constants";
import { clampPage, json, jsonError, readJsonBody } from "../../utils/utils";
import type { AuthSession, D1Database } from "../../server/types";
import {
  ensureActorCanAccessProject,
  ensureActorCanManageDomains,
  getScopedProjectIds,
} from "../access-control";
import {
  buildResourceDeleteAuditDetail,
  buildResourceUpdateAuditDetail,
  readRequestAuditOperationNote,
  toDomainRoutingProfileAuditSnapshot,
  withAuditOperationNote,
} from "../audit";
import { resolveWorkspaceAssignment } from "../request-helpers";
import { validateDomainRoutingProfileBody } from "../validation";

export async function handleAdminDomainRoutingProfilesGet(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  return json(
    await getDomainRoutingProfilesPaged(
      db,
      page,
      ADMIN_PAGE_SIZE,
      getScopedProjectIds(actor),
    ),
  );
}

export async function handleAdminDomainRoutingProfilesPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "domain access denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateDomainRoutingProfileBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const workspaceScope = await resolveWorkspaceAssignment(db, validation.scope);
  if (!workspaceScope.ok) return jsonError(workspaceScope.error, 400);
  try {
    ensureActorCanAccessProject(actor, workspaceScope.data.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const { operation_note, ...createData } = validation.data;
  const next = toDomainRoutingProfileAuditSnapshot({
    ...createData,
    ...workspaceScope.data,
  });
  const id = await createDomainRoutingProfile(db, {
    ...createData,
    ...workspaceScope.data,
  });
  await addAuditLog(db, {
    action: "domain.routing_profile.create",
    actor,
    detail: withAuditOperationNote({ id, ...next }, operation_note),
    entity_id: String(id),
    entity_type: "domain_routing_profile",
  });
  return json({ ok: true });
}

export async function handleAdminDomainRoutingProfilesPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "domain access denied",
      403,
    );
  }

  const match = pathname.match(/^\/admin\/domain-routing-profiles\/(\d+)$/);
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0) {
    return jsonError("invalid routing profile id", 400);
  }

  const existing = await getDomainRoutingProfileById(db, id);
  if (!existing) return jsonError("routing profile not found", 404);
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

  const validation = validateDomainRoutingProfileBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const workspaceScope = await resolveWorkspaceAssignment(db, validation.scope);
  if (!workspaceScope.ok) return jsonError(workspaceScope.error, 400);
  try {
    ensureActorCanAccessProject(actor, workspaceScope.data.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const { operation_note, ...updateData } = validation.data;
  const previous = toDomainRoutingProfileAuditSnapshot(existing);
  const next = toDomainRoutingProfileAuditSnapshot({
    ...updateData,
    ...workspaceScope.data,
  });
  await updateDomainRoutingProfile(db, id, {
    ...updateData,
    ...workspaceScope.data,
  });
  await addAuditLog(db, {
    action: "domain.routing_profile.update",
    actor,
    detail: buildResourceUpdateAuditDetail(
      previous,
      next,
      [
        "catch_all_forward_to",
        "catch_all_mode",
        "environment_id",
        "is_enabled",
        "name",
        "note",
        "project_id",
        "provider",
        "slug",
      ],
      operation_note,
      {
        id,
        previous_scope: {
          environment_id: existing.environment_id,
          project_id: existing.project_id,
        },
      },
    ),
    entity_id: String(id),
    entity_type: "domain_routing_profile",
  });
  return json({ ok: true });
}

export async function handleAdminDomainRoutingProfilesDelete(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "domain access denied",
      403,
    );
  }

  const match = pathname.match(/^\/admin\/domain-routing-profiles\/(\d+)$/);
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0) {
    return jsonError("invalid routing profile id", 400);
  }
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const existing = await getDomainRoutingProfileById(db, id);
  if (!existing) return jsonError("routing profile not found", 404);
  try {
    ensureActorCanAccessProject(actor, existing.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  await deleteDomainRoutingProfile(db, id);
  await addAuditLog(db, {
    action: "domain.routing_profile.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toDomainRoutingProfileAuditSnapshot(existing),
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "domain_routing_profile",
  });
  return json({ ok: true });
}
