import type {
  AdminUserRecord,
  AccessScope,
  NotificationEndpointRecord,
  ProjectBindingRecord,
  RetentionPolicyRecord,
  SessionPayload,
} from "./types";
import {
  hasAdminPermission,
  isReadOnlyAdminRole,
} from "../utils/constants";

export type CurrentUser = SessionPayload["user"] | null | undefined;

function normalizeProjectBindings(projects?: ProjectBindingRecord[]) {
  return Array.isArray(projects) ? projects : [];
}

export function getAccessibleProjectIds(user: CurrentUser): number[] {
  return normalizeProjectBindings(user?.projects)
    .map(project => Number(project.id))
    .filter(projectId => Number.isFinite(projectId) && projectId > 0);
}

export function isReadOnlyUser(user: CurrentUser) {
  return isReadOnlyAdminRole(user?.role, user?.access_scope || "all");
}

export function isOwnerUser(user: CurrentUser) {
  return user?.role === "owner";
}

export function isProjectScopedUser(user: CurrentUser) {
  return user?.access_scope === "bound";
}

export function canWriteAnyResource(user: CurrentUser) {
  return Boolean(user) && !isReadOnlyUser(user);
}

export function canManageGlobalSettings(user: CurrentUser) {
  return canWriteAnyResource(user) && !isProjectScopedUser(user);
}

export function canManageAdmins(user: CurrentUser) {
  if (!user) return false;
  return hasAdminPermission(user.role, "admins:read", user.access_scope || "all");
}

function canManageAdminProjects(
  user: CurrentUser,
  accessScope: AccessScope,
  projects: ProjectBindingRecord[],
) {
  if (!user) return false;
  if (!isProjectScopedUser(user)) return true;
  const actorProjectIds = getAccessibleProjectIds(user);
  if (accessScope !== "bound" || projects.length === 0) return false;
  return projects.every(project => actorProjectIds.includes(project.id));
}

export function canAccessProject(user: CurrentUser, projectId: number | null | undefined) {
  if (!isProjectScopedUser(user)) return true;
  if (!projectId) return false;
  return getAccessibleProjectIds(user).includes(projectId);
}

export function canManageProjectResource(user: CurrentUser, projectId: number | null | undefined) {
  return canWriteAnyResource(user) && canAccessProject(user, projectId);
}

export function canManageAdminRecord(
  user: CurrentUser,
  record?: Pick<AdminUserRecord, "access_scope" | "projects" | "role"> | null,
) {
  if (!canManageAdmins(user)) return false;
  if (record?.role === "owner" && !isOwnerUser(user)) return false;
  if (record && !canManageAdminProjects(user, record.access_scope, normalizeProjectBindings(record.projects))) {
    return false;
  }
  return true;
}

export function canManageNotificationRecord(
  user: CurrentUser,
  record: Pick<NotificationEndpointRecord, "access_scope" | "projects">,
) {
  if (!canWriteAnyResource(user)) return false;
  if (!isProjectScopedUser(user)) return true;
  if (record.access_scope === "all") return false;
  return record.projects.some(project => getAccessibleProjectIds(user).includes(project.id));
}

export function canManageRetentionPolicyRecord(
  user: CurrentUser,
  record: Pick<RetentionPolicyRecord, "project_id">,
) {
  if (!canWriteAnyResource(user)) return false;
  if (record.project_id === null || record.project_id === undefined) {
    return canManageGlobalSettings(user);
  }
  return canManageProjectResource(user, record.project_id);
}

export function getReadonlyNotice(
  user: CurrentUser,
  resourceLabel: string,
) {
  if (isReadOnlyUser(user)) {
    return {
      description: `当前账号为只读角色，${resourceLabel}页面仅支持查看，写操作入口已关闭。`,
      title: `${resourceLabel}当前为只读模式`,
    };
  }

  if (isProjectScopedUser(user)) {
    return {
      description: `${resourceLabel}属于平台级资源，项目级管理员当前仅支持查看，不支持新增、编辑或删除。`,
      title: `${resourceLabel}当前为项目级只读视角`,
    };
  }

  return null;
}
