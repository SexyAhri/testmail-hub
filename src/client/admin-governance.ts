import type { AdminUserRecord } from "./types";

const HIGH_PRIVILEGE_ROLES = new Set(["owner", "platform_admin"]);
const RECENT_CHANGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function isHighPrivilegeAdmin(
  record: Pick<AdminUserRecord, "access_scope" | "role">,
) {
  return record.access_scope === "all" || HIGH_PRIVILEGE_ROLES.has(record.role);
}

export function isMultiProjectAdmin(
  record: Pick<AdminUserRecord, "access_scope" | "projects">,
) {
  return record.access_scope === "bound" && record.projects.length > 1;
}

export function hasAdminGovernanceNote(
  record: Pick<AdminUserRecord, "note">,
) {
  return Boolean(String(record.note || "").trim());
}

export function changedAdminRecently(
  record: Pick<AdminUserRecord, "last_modified_at">,
  now = Date.now(),
) {
  return Boolean(record.last_modified_at && now - record.last_modified_at <= RECENT_CHANGE_WINDOW_MS);
}

export function isPendingAdminLoginAfterChange(
  record: Pick<AdminUserRecord, "last_login_at" | "last_modified_at">,
) {
  if (!record.last_modified_at) return false;
  if (!record.last_login_at) return true;
  return record.last_login_at < record.last_modified_at;
}

export interface AdminGovernanceSummary {
  highPrivilegeCount: number;
  missingNoteCount: number;
  multiProjectCount: number;
  pendingLoginAfterChangeCount: number;
  recentlyChangedCount: number;
}

export function summarizeAdminGovernance(
  records: AdminUserRecord[],
  now = Date.now(),
): AdminGovernanceSummary {
  let highPrivilegeCount = 0;
  let missingNoteCount = 0;
  let multiProjectCount = 0;
  let pendingLoginAfterChangeCount = 0;
  let recentlyChangedCount = 0;

  for (const record of records) {
    if (isHighPrivilegeAdmin(record)) highPrivilegeCount += 1;
    if (!hasAdminGovernanceNote(record)) missingNoteCount += 1;
    if (isMultiProjectAdmin(record)) multiProjectCount += 1;
    if (isPendingAdminLoginAfterChange(record)) pendingLoginAfterChangeCount += 1;
    if (changedAdminRecently(record, now)) recentlyChangedCount += 1;
  }

  return {
    highPrivilegeCount,
    missingNoteCount,
    multiProjectCount,
    pendingLoginAfterChangeCount,
    recentlyChangedCount,
  };
}
