import {
  addAuditLog,
  buildRetentionPolicyScopeKey,
  createRetentionPolicy,
  deleteRetentionPolicy,
  getRetentionJobRunSummary,
  getRetentionJobRunsPaged,
  getRetentionPoliciesPaged,
  getRetentionPolicyById,
  updateRetentionPolicy,
} from "../../core/db";
import { RETENTION_JOB_PAGE_SIZE, RETENTION_POLICY_PAGE_SIZE } from "../../utils/constants";
import {
  clampPage,
  json,
  jsonError,
  maybeBoolean,
  readJsonBody,
} from "../../utils/utils";
import type { AuthSession, D1Database } from "../../server/types";
import {
  ensureActorCanAccessProject,
  ensureActorCanManageGlobalSettings,
  ensureActorCanReadGlobalSettings,
  ensureActorCanWrite,
  getScopedProjectIds,
  isActorProjectScoped,
} from "../access-control";
import {
  buildResourceDeleteAuditDetail,
  buildResourceUpdateAuditDetail,
  readRequestAuditOperationNote,
  toRetentionPolicyAuditSnapshot,
  withAuditOperationNote,
} from "../audit";
import { resolveWorkspaceAssignment } from "../request-helpers";
import {
  normalizeNullable,
  parseOptionalId,
  validateRetentionPolicyBody,
} from "../validation";

export async function handleAdminRetentionPoliciesGet(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  const project_id = parseOptionalId(url.searchParams.get("project_id"));
  const environment_id = parseOptionalId(
    url.searchParams.get("environment_id"),
  );
  const mailbox_pool_id = parseOptionalId(
    url.searchParams.get("mailbox_pool_id"),
  );
  const is_enabled = maybeBoolean(url.searchParams.get("is_enabled"));
  const keyword = normalizeNullable(url.searchParams.get("keyword"));

  try {
    ensureActorCanAccessProject(actor, project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  return json(
    await getRetentionPoliciesPaged(
      db,
      page,
      RETENTION_POLICY_PAGE_SIZE,
      {
        environment_id,
        is_enabled,
        keyword,
        mailbox_pool_id,
        project_id,
      },
      getScopedProjectIds(actor),
    ),
  );
}

export async function handleAdminRetentionJobRunsGet(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanReadGlobalSettings(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const page = clampPage(url.searchParams.get("page"));
  const status = normalizeNullable(url.searchParams.get("status"));
  const trigger_source = normalizeNullable(
    url.searchParams.get("trigger_source"),
  );

  return json(
    await getRetentionJobRunsPaged(db, page, RETENTION_JOB_PAGE_SIZE, {
      status: status === "success" || status === "failed" ? status : null,
      trigger_source,
    }),
  );
}

export async function handleAdminRetentionJobRunSummaryGet(
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanReadGlobalSettings(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  return json(await getRetentionJobRunSummary(db));
}

export async function handleAdminRetentionPoliciesPost(
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

  const validation = validateRetentionPolicyBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const requestedScope = {
    environment_id: validation.data.environment_id,
    mailbox_pool_id: validation.data.mailbox_pool_id,
    project_id: validation.data.project_id,
  };
  if (!requestedScope.project_id && isActorProjectScoped(actor)) {
    return jsonError("project-scoped admin cannot manage global settings", 403);
  }

  const workspaceScope = await resolveWorkspaceAssignment(db, requestedScope);
  if (!workspaceScope.ok) return jsonError(workspaceScope.error, 400);

  try {
    if (workspaceScope.data.project_id === null) {
      ensureActorCanManageGlobalSettings(actor);
    } else {
      ensureActorCanAccessProject(actor, workspaceScope.data.project_id);
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const scope_key = buildRetentionPolicyScopeKey(workspaceScope.data);
  const { operation_note, ...createData } = validation.data;
  const policy = await createRetentionPolicy(db, {
    ...createData,
    ...workspaceScope.data,
    scope_key,
  });
  const next = toRetentionPolicyAuditSnapshot(policy);

  await addAuditLog(db, {
    action: "retention_policy.create",
    actor,
    detail: withAuditOperationNote({ id: policy.id, ...next }, operation_note),
    entity_id: String(policy.id),
    entity_type: "retention_policy",
  });

  return json(policy);
}

export async function handleAdminRetentionPoliciesPut(
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

  const id = Number(pathname.replace("/admin/retention-policies/", ""));
  if (!Number.isFinite(id) || id <= 0) {
    return jsonError("invalid retention policy id", 400);
  }

  const existing = await getRetentionPolicyById(
    db,
    id,
    getScopedProjectIds(actor),
  );
  if (!existing) return jsonError("retention policy not found", 404);

  try {
    if (existing.project_id === null) {
      ensureActorCanManageGlobalSettings(actor);
    } else {
      ensureActorCanAccessProject(actor, existing.project_id);
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateRetentionPolicyBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const requestedScope = {
    environment_id: validation.data.environment_id,
    mailbox_pool_id: validation.data.mailbox_pool_id,
    project_id: validation.data.project_id,
  };
  if (!requestedScope.project_id && isActorProjectScoped(actor)) {
    return jsonError("project-scoped admin cannot manage global settings", 403);
  }

  const workspaceScope = await resolveWorkspaceAssignment(db, requestedScope);
  if (!workspaceScope.ok) return jsonError(workspaceScope.error, 400);

  try {
    if (workspaceScope.data.project_id === null) {
      ensureActorCanManageGlobalSettings(actor);
    } else {
      ensureActorCanAccessProject(actor, workspaceScope.data.project_id);
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const scope_key = buildRetentionPolicyScopeKey(workspaceScope.data);
  const { operation_note, ...updateData } = validation.data;
  const previous = toRetentionPolicyAuditSnapshot(existing);
  const policy = await updateRetentionPolicy(db, id, {
    ...updateData,
    ...workspaceScope.data,
    scope_key,
  });
  const next = toRetentionPolicyAuditSnapshot(policy);

  await addAuditLog(db, {
    action: "retention_policy.update",
    actor,
    detail: buildResourceUpdateAuditDetail(
      previous,
      next,
      [
        "archive_email_hours",
        "deleted_email_retention_hours",
        "description",
        "email_retention_hours",
        "environment_id",
        "is_enabled",
        "mailbox_pool_id",
        "mailbox_ttl_hours",
        "name",
        "project_id",
        "scope_key",
        "scope_level",
      ],
      operation_note,
      {
        id: policy.id,
        previous_scope_key: existing.scope_key,
      },
    ),
    entity_id: String(policy.id),
    entity_type: "retention_policy",
  });

  return json(policy);
}

export async function handleAdminRetentionPoliciesDelete(
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

  const id = Number(pathname.replace("/admin/retention-policies/", ""));
  if (!Number.isFinite(id) || id <= 0) {
    return jsonError("invalid retention policy id", 400);
  }

  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const existing = await getRetentionPolicyById(
    db,
    id,
    getScopedProjectIds(actor),
  );
  if (!existing) return jsonError("retention policy not found", 404);

  try {
    if (existing.project_id === null) {
      ensureActorCanManageGlobalSettings(actor);
    } else {
      ensureActorCanAccessProject(actor, existing.project_id);
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  await deleteRetentionPolicy(db, id);
  await addAuditLog(db, {
    action: "retention_policy.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toRetentionPolicyAuditSnapshot(existing),
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "retention_policy",
  });

  return json({ ok: true });
}
