import { hasPermission } from "../core/auth";
import {
  isReadOnlyAdminRole,
  requiresBoundAdminScope,
  requiresGlobalAdminScope,
  type AdminPermission,
} from "../utils/constants";
import type { AccessScope, AdminRole, AuthSession } from "../server/types";

export function getActorProjectIds(actor: AuthSession): number[] {
  return Array.isArray(actor.project_ids)
    ? actor.project_ids.filter(
        (projectId) => Number.isFinite(projectId) && projectId > 0,
      )
    : [];
}

export function isActorProjectScoped(actor: AuthSession): boolean {
  return actor.access_scope === "bound";
}

export function isActorReadOnly(actor: AuthSession): boolean {
  return isReadOnlyAdminRole(actor.role, actor.access_scope || "all");
}

export function getScopedProjectIds(
  actor?: AuthSession | null,
): number[] | null {
  if (!actor || !isActorProjectScoped(actor)) return null;
  return getActorProjectIds(actor);
}

export function actorProjectScopePayload(actor: AuthSession) {
  return isActorProjectScoped(actor)
    ? { access_scope: "bound" as const, project_ids: getActorProjectIds(actor) }
    : { access_scope: "all" as const, project_ids: [] };
}

export function canAccessProject(
  actor: AuthSession,
  projectId: number | null | undefined,
): boolean {
  if (!projectId) return !isActorProjectScoped(actor);
  return (
    !isActorProjectScoped(actor) ||
    getActorProjectIds(actor).includes(projectId)
  );
}

export function ensureActorCanAccessProject(
  actor: AuthSession,
  projectId: number | null | undefined,
) {
  if (!canAccessProject(actor, projectId)) {
    throw new Error("project access denied");
  }
}

export function ensureActorCanWrite(actor: AuthSession) {
  if (isActorReadOnly(actor)) {
    throw new Error("read-only role cannot modify resources");
  }
}

export function ensureActorHasPermission(
  actor: AuthSession,
  permission: AdminPermission,
) {
  if (!hasPermission(actor.role, permission)) {
    throw new Error("permission denied");
  }
}

export function ensureActorCanManageGlobalSettings(actor: AuthSession) {
  ensureActorCanWrite(actor);
  if (isActorProjectScoped(actor)) {
    throw new Error("project-scoped admin cannot manage global settings");
  }
}

export function ensureActorCanReadGlobalSettings(actor: AuthSession) {
  if (isActorProjectScoped(actor)) {
    throw new Error("project-scoped admin cannot access global observability");
  }
}

export function ensureActorCanCreateProject(actor: AuthSession) {
  ensureActorCanManageGlobalSettings(actor);
}

export function ensureActorCanDeleteProject(actor: AuthSession) {
  ensureActorCanManageGlobalSettings(actor);
}

export function ensureActorCanAccessAnyProject(
  actor: AuthSession,
  projectIds: number[],
) {
  const normalizedProjectIds = Array.from(
    new Set(
      projectIds.filter(
        (projectId) => Number.isFinite(projectId) && projectId > 0,
      ),
    ),
  );
  if (normalizedProjectIds.length === 0) {
    if (isActorProjectScoped(actor)) {
      throw new Error("project access denied");
    }
    return;
  }

  if (
    isActorProjectScoped(actor) &&
    !normalizedProjectIds.some((projectId) =>
      getActorProjectIds(actor).includes(projectId),
    )
  ) {
    throw new Error("project access denied");
  }
}

export function ensureActorCanManageDomains(actor: AuthSession) {
  ensureActorCanWrite(actor);
  if (isActorProjectScoped(actor) && getActorProjectIds(actor).length === 0) {
    throw new Error("project-scoped admin has no bound projects");
  }
}

export function ensureActorCanManageAdmins(actor: AuthSession) {
  if (!hasPermission(actor.role, "admins:write")) {
    throw new Error("permission denied");
  }
  if (isActorProjectScoped(actor) && getActorProjectIds(actor).length === 0) {
    throw new Error("project-scoped admin has no bound projects");
  }
}

export function ensureActorCanManageOwnerAccount(
  actor: AuthSession,
  nextRole?: AdminRole | null,
  existingRole?: AdminRole | null,
) {
  if (
    (nextRole === "owner" || existingRole === "owner") &&
    actor.role !== "owner"
  ) {
    throw new Error("only owner can manage owner accounts");
  }
}

export function ensureActorCanManageAdminRecord(
  actor: AuthSession,
  record: {
    access_scope: AccessScope;
    project_ids: number[];
    role: AdminRole;
  },
) {
  ensureActorCanManageAdmins(actor);
  ensureActorCanManageOwnerAccount(actor, null, record.role);

  if (!isActorProjectScoped(actor)) return;

  const actorProjectIds = getActorProjectIds(actor);
  if (record.access_scope !== "bound") {
    throw new Error("project-scoped admin cannot manage global admin accounts");
  }
  if (record.project_ids.length === 0) {
    throw new Error("admin user has no bound projects");
  }
  if (
    record.project_ids.some((projectId) => !actorProjectIds.includes(projectId))
  ) {
    throw new Error("admin user is outside your scope");
  }
}

export function ensureActorCanAssignAdminRole(
  actor: AuthSession,
  role: AdminRole,
  access_scope: AccessScope,
) {
  ensureActorCanManageOwnerAccount(actor, role, null);

  if (requiresGlobalAdminScope(role, access_scope) && access_scope !== "all") {
    throw new Error("platform_admin and owner must keep global scope");
  }
  if (requiresBoundAdminScope(role, access_scope) && access_scope !== "bound") {
    throw new Error("project_admin must use bound access_scope");
  }

  if (!isActorProjectScoped(actor)) {
    if (actor.role !== "owner" && role === "owner") {
      throw new Error("only owner can manage owner accounts");
    }
    return;
  }

  if (access_scope !== "bound") {
    throw new Error("project-scoped admin cannot manage global admin accounts");
  }
  if (!["project_admin", "operator", "viewer"].includes(role)) {
    throw new Error(
      "project-scoped admin can only manage project_admin, operator, or viewer roles",
    );
  }
}
