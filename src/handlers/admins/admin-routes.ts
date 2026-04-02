import {
  addAuditLog,
  createAdminUser,
  findAdminUserByUsername,
  getAdminAccessContext,
  getAdminUsersPaged,
  updateAdminUser,
} from "../../core/db";
import { captureError } from "../../core/errors";
import { ADMIN_PAGE_SIZE, normalizeAdminRole } from "../../utils/constants";
import {
  clampPage,
  isSqliteConstraintError,
  json,
  jsonError,
  maybeBoolean,
  readJsonBody,
} from "../../utils/utils";
import type {
  AccessScope,
  AdminRole,
  AuthSession,
  D1Database,
} from "../../server/types";
import {
  ensureActorCanAssignAdminRole,
  ensureActorCanManageAdminRecord,
  ensureActorCanManageAdmins,
  getScopedProjectIds,
} from "../access-control";
import {
  buildAdminUpdateAuditDetail,
  toAdminAuditSnapshot,
  withAuditOperationNote,
} from "../audit";
import { normalizeNullable, parseOptionalId, validateAdminBody } from "../validation";

export async function handleAdminAdminsGet(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageAdmins(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }
  const page = clampPage(url.searchParams.get("page"));
  const keyword = normalizeNullable(url.searchParams.get("keyword"));
  const accessScopeValue = normalizeNullable(
    url.searchParams.get("access_scope"),
  );
  const roleValue = normalizeNullable(url.searchParams.get("role"));
  const projectIdRaw = url.searchParams.get("project_id");
  const project_id = parseOptionalId(projectIdRaw);

  if (accessScopeValue && !["all", "bound"].includes(accessScopeValue)) {
    return jsonError("invalid access_scope", 400);
  }
  if (projectIdRaw !== null && projectIdRaw !== "" && project_id === null) {
    return jsonError("invalid project_id", 400);
  }

  const access_scope = (accessScopeValue || null) as AccessScope | null;
  const role = roleValue
    ? normalizeAdminRole(roleValue, access_scope || "all")
    : null;
  if (roleValue && !role) {
    return jsonError("invalid role", 400);
  }

  const payload = await getAdminUsersPaged(
    db,
    page,
    ADMIN_PAGE_SIZE,
    {
      access_scope,
      is_enabled: maybeBoolean(url.searchParams.get("is_enabled")),
      keyword,
      project_id,
      role: role as AdminRole | null,
    },
    getScopedProjectIds(actor),
  );
  return json(payload);
}

export async function handleAdminAdminsPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageAdmins(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = await validateAdminBody(parsed.data || {}, true, actor);
  if (!validation.ok) return jsonError(validation.error, 400);
  if (
    !("username" in validation.data) ||
    !("password_hash" in validation.data) ||
    !("password_salt" in validation.data)
  ) {
    return jsonError("password is required", 400);
  }
  try {
    ensureActorCanAssignAdminRole(
      actor,
      validation.data.role,
      validation.data.access_scope,
    );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const createData = validation.data as {
    access_scope: AccessScope;
    display_name: string;
    is_enabled: boolean;
    note: string;
    operation_note: string;
    password_hash: string;
    password_salt: string;
    project_ids: number[];
    role: AdminRole;
    username: string;
  };

  const existingUser = await findAdminUserByUsername(db, createData.username);
  if (existingUser) {
    await captureError(
      db,
      "admin.create_failed",
      new Error("username already exists"),
      {
        actor: actor.username,
        reason: "duplicate_username",
        username: createData.username,
      },
    );
    return jsonError("username already exists", 409);
  }

  let user: Awaited<ReturnType<typeof createAdminUser>>;
  try {
    user = await createAdminUser(db, {
      access_scope: createData.access_scope,
      display_name: createData.display_name,
      is_enabled: createData.is_enabled,
      note: createData.note,
      password_hash: createData.password_hash,
      password_salt: createData.password_salt,
      project_ids: createData.project_ids,
      role: createData.role,
      username: createData.username,
    });
  } catch (error) {
    if (isSqliteConstraintError(error)) {
      await captureError(
        db,
        "admin.create_failed",
        new Error("username already exists"),
        {
          actor: actor.username,
          reason: "duplicate_username",
          username: createData.username,
        },
      );
      return jsonError("username already exists", 409);
    }
    await captureError(db, "admin.create_failed", error, {
      actor: actor.username,
      username: createData.username,
    });
    throw error;
  }

  await addAuditLog(db, {
    action: "admin.create",
    actor,
    detail: withAuditOperationNote(
      toAdminAuditSnapshot({
        access_scope: user.access_scope,
        display_name: user.display_name,
        is_enabled: user.is_enabled,
        note: user.note,
        project_ids: user.projects.map((project) => project.id),
        role: user.role,
        username: user.username,
      }),
      createData.operation_note,
    ),
    entity_id: user.id,
    entity_type: "admin_user",
  });
  return json({ ok: true, user });
}

export async function handleAdminAdminsPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageAdmins(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = pathname.replace("/admin/admins/", "").trim();
  if (!id) return jsonError("invalid admin id", 400);

  const existing = await getAdminAccessContext(db, id);
  if (!existing) return jsonError("admin user not found", 404);

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = await validateAdminBody(parsed.data || {}, false, actor);
  if (!validation.ok) return jsonError(validation.error, 400);
  try {
    ensureActorCanManageAdminRecord(actor, existing);
    ensureActorCanAssignAdminRole(
      actor,
      validation.data.role,
      validation.data.access_scope,
    );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const previous = toAdminAuditSnapshot({
    access_scope: existing.access_scope,
    display_name: existing.display_name,
    is_enabled: existing.is_enabled,
    note: existing.note,
    project_ids: existing.project_ids,
    role: existing.role,
    username: existing.username,
  });
  const next = toAdminAuditSnapshot({
    access_scope: validation.data.access_scope,
    display_name: validation.data.display_name,
    is_enabled: validation.data.is_enabled,
    note: validation.data.note,
    project_ids: validation.data.project_ids,
    role: validation.data.role,
    username: existing.username,
  });

  const { operation_note, ...updateData } = validation.data;
  await updateAdminUser(db, id, updateData);
  await addAuditLog(db, {
    action: "admin.update",
    actor,
    detail: buildAdminUpdateAuditDetail(previous, next, operation_note),
    entity_id: id,
    entity_type: "admin_user",
  });
  return json({ ok: true });
}
