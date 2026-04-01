import type { ResolvedRetentionPolicy, WorkspaceCatalog } from "./types";

export interface RetentionScopeInput {
  environment_id?: number | null;
  mailbox_pool_id?: number | null;
  project_id?: number | null;
}

export interface EmailLifecycleScheduleItem {
  description: string;
  key: string;
  label: string;
  timestamp: number;
  tone: "error" | "processing" | "success";
}

export function createEmptyResolvedRetentionPolicy(): ResolvedRetentionPolicy {
  return {
    archive_email_hours: null,
    archive_email_source: null,
    deleted_email_retention_hours: null,
    deleted_email_retention_source: null,
    email_retention_hours: null,
    email_retention_source: null,
    mailbox_ttl_hours: null,
    mailbox_ttl_source: null,
  };
}

export function hasResolvedRetentionPolicy(resolved: ResolvedRetentionPolicy | null | undefined) {
  if (!resolved) return false;
  return [
    resolved.mailbox_ttl_hours,
    resolved.archive_email_hours,
    resolved.email_retention_hours,
    resolved.deleted_email_retention_hours,
  ].some(value => value !== null && value !== undefined);
}

export function getRetentionSourceColor(source: ResolvedRetentionPolicy["archive_email_source"]) {
  if (source === "mailbox_pool") return "purple";
  if (source === "environment") return "cyan";
  if (source === "project") return "blue";
  if (source === "global") return "gold";
  return "default";
}

export function getRetentionSourceText(source: ResolvedRetentionPolicy["archive_email_source"]) {
  if (source === "mailbox_pool") return "邮箱池";
  if (source === "environment") return "环境";
  if (source === "project") return "项目";
  if (source === "global") return "全局";
  if (source === "default") return "默认";
  return "未设置";
}

export function formatRetentionHours(value: number | null, emptyText = "不限") {
  return value === null || value === undefined ? emptyText : `${value}h`;
}

export function resolveRetentionFromCatalog(
  catalog: WorkspaceCatalog | null | undefined,
  scope: RetentionScopeInput,
): ResolvedRetentionPolicy {
  if (!catalog) return createEmptyResolvedRetentionPolicy();

  if (scope.mailbox_pool_id) {
    const mailboxPool = catalog.mailbox_pools.find(item => item.id === scope.mailbox_pool_id);
    if (mailboxPool) return mailboxPool.resolved_retention;
  }

  if (scope.environment_id) {
    const environment = catalog.environments.find(item => item.id === scope.environment_id);
    if (environment) return environment.resolved_retention;
  }

  if (scope.project_id) {
    const project = catalog.projects.find(item => item.id === scope.project_id);
    if (project) return project.resolved_retention;
  }

  return createEmptyResolvedRetentionPolicy();
}

function hoursToTimestamp(baseTimestamp: number, hours: number | null) {
  if (hours === null || hours === undefined || !Number.isFinite(baseTimestamp)) return null;
  return baseTimestamp + hours * 60 * 60 * 1000;
}

export function buildEmailLifecycleSchedule(input: {
  archived_at: number | null;
  deleted_at: number | null;
  received_at: number;
  resolved_retention: ResolvedRetentionPolicy;
}) {
  const { archived_at, deleted_at, received_at, resolved_retention } = input;
  const now = Date.now();
  const items: EmailLifecycleScheduleItem[] = [];

  if (archived_at !== null) {
    items.push({
      description: "邮件已归档。",
      key: "archived",
      label: "已归档",
      timestamp: archived_at,
      tone: "success",
    });
  } else {
    const autoArchiveAt = hoursToTimestamp(received_at, resolved_retention.archive_email_hours);
    if (autoArchiveAt !== null) {
      items.push({
        description: `收件后 ${resolved_retention.archive_email_hours}h 自动归档。`,
        key: "archive",
        label: "自动归档",
        timestamp: autoArchiveAt,
        tone: autoArchiveAt <= now ? "error" : "processing",
      });
    }
  }

  if (deleted_at !== null) {
    const purgeDeletedAt = hoursToTimestamp(deleted_at, resolved_retention.deleted_email_retention_hours);
    if (purgeDeletedAt !== null) {
      items.push({
        description: `删除后 ${resolved_retention.deleted_email_retention_hours}h 永久清理。`,
        key: "purge_deleted",
        label: "清理已删",
        timestamp: purgeDeletedAt,
        tone: purgeDeletedAt <= now ? "error" : "processing",
      });
    }
    return items;
  }

  const purgeActiveAt = hoursToTimestamp(received_at, resolved_retention.email_retention_hours);
  if (purgeActiveAt !== null) {
    items.push({
      description: `收件后 ${resolved_retention.email_retention_hours}h 自动清理。`,
      key: "purge_active",
      label: "清理邮件",
      timestamp: purgeActiveAt,
      tone: purgeActiveAt <= now ? "error" : "processing",
    });
  }

  return items;
}
