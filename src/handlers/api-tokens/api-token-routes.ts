import {
  addAuditLog,
  createApiToken,
  deleteApiToken,
  getApiTokenById,
  getApiTokensPaged,
  updateApiToken,
} from "../../core/db";
import {
  createManagedApiTokenValue,
  hashApiTokenValue,
} from "../../core/auth";
import { ADMIN_PAGE_SIZE } from "../../utils/constants";
import { clampPage, json, jsonError, readJsonBody } from "../../utils/utils";
import type { AuthSession, D1Database } from "../../server/types";
import {
  ensureActorCanAccessAnyProject,
  ensureActorCanAccessProject,
  ensureActorCanWrite,
  getActorProjectIds,
} from "../access-control";
import {
  buildResourceDeleteAuditDetail,
  buildResourceUpdateAuditDetail,
  readRequestAuditOperationNote,
  toApiTokenAuditSnapshot,
  withAuditOperationNote,
} from "../audit";
import { validateApiTokenBody } from "../validation";

export async function handleAdminApiTokensGet(
  url: URL,
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
  const page = clampPage(url.searchParams.get("page"));
  return json(
    await getApiTokensPaged(
      db,
      page,
      ADMIN_PAGE_SIZE,
      getActorProjectIds(actor),
    ),
  );
}

export async function handleAdminApiTokensPost(
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

  const validation = validateApiTokenBody(parsed.data || {}, actor);
  if (!validation.ok) return jsonError(validation.error, 400);

  const { operation_note, ...createData } = validation.data;
  const issuedTokenId = crypto.randomUUID();
  const issuedToken = createManagedApiTokenValue(issuedTokenId);
  const token = await createApiToken(db, {
    ...createData,
    created_by: actor.username,
    id: issuedTokenId,
    token_hash: await hashApiTokenValue(issuedToken),
    token_prefix: issuedToken.slice(0, 18),
  });

  await addApiTokenCreateAuditLog(db, actor, token, operation_note);

  return json({
    plain_text_token: issuedToken,
    token,
  });
}

export async function handleAdminApiTokensPut(
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

  const id = pathname.replace("/admin/api-tokens/", "").trim();
  if (!id) return jsonError("invalid api token id", 400);

  const existing = await getApiTokenById(db, id);
  if (!existing) return jsonError("api token not found", 404);
  try {
    if (existing.access_scope === "all") {
      ensureActorCanAccessProject(actor, null);
    } else {
      ensureActorCanAccessAnyProject(
        actor,
        existing.projects.map((project) => project.id),
      );
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateApiTokenBody(parsed.data || {}, actor);
  if (!validation.ok) return jsonError(validation.error, 400);

  const { operation_note, ...updateData } = validation.data;
  const previous = toApiTokenAuditSnapshot(existing);
  const next = toApiTokenAuditSnapshot(updateData);
  await updateApiToken(db, id, updateData);
  await addAuditLog(db, {
    action: "api_token.update",
    actor,
    detail: buildResourceUpdateAuditDetail(
      previous,
      next,
      [
        "access_scope",
        "description",
        "expires_at",
        "is_enabled",
        "name",
        "permissions",
        "project_ids",
      ],
      operation_note,
      { id },
    ),
    entity_id: id,
    entity_type: "api_token",
  });
  return json({ ok: true });
}

export async function handleAdminApiTokensDelete(
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

  const id = pathname.replace("/admin/api-tokens/", "").trim();
  if (!id) return jsonError("invalid api token id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const existing = await getApiTokenById(db, id);
  if (!existing) return jsonError("api token not found", 404);
  try {
    if (existing.access_scope === "all") {
      ensureActorCanAccessProject(actor, null);
    } else {
      ensureActorCanAccessAnyProject(
        actor,
        existing.projects.map((project) => project.id),
      );
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  await deleteApiToken(db, id);
  await addAuditLog(db, {
    action: "api_token.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toApiTokenAuditSnapshot(existing),
      operation_note,
      { id },
    ),
    entity_id: id,
    entity_type: "api_token",
  });
  return json({ ok: true });
}

async function addApiTokenCreateAuditLog(
  db: D1Database,
  actor: AuthSession,
  token: Awaited<ReturnType<typeof createApiToken>>,
  operation_note: string,
) {
  await addAuditLog(db, {
    action: "api_token.create",
    actor,
    detail: withAuditOperationNote(
      {
        ...toApiTokenAuditSnapshot(token),
        id: token.id,
        plain_text_token_issued: true,
        token_preview: token.token_preview,
      },
      operation_note,
    ),
    entity_id: token.id,
    entity_type: "api_token",
  });
}
