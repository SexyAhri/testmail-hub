import { Space, Tag, Typography } from "antd";

import type {
  MailboxPoolRecord,
  PaginationPayload,
  RetentionJobAction,
  RetentionJobRunRecord,
  RetentionJobRunSummary,
  RetentionPolicyPayload,
  RetentionPolicyRecord,
  WorkspaceCatalog,
} from "../../types";
import { formatDateTime } from "../../utils";

const { Text } = Typography;

export interface RetentionPolicyFilters {
  environment_id?: number | null;
  is_enabled?: boolean | null;
  keyword?: string;
  mailbox_pool_id?: number | null;
  project_id?: number | null;
}

export interface RetentionRunFilters {
  status?: "failed" | "success" | null;
  trigger_source?: string | null;
}

export interface RetentionRunOption {
  actions: RetentionJobAction[];
  description: string;
  key: string;
  label: string;
}

export interface RetentionEmailSample {
  deleted_at: number | null;
  environment_id: number | null;
  mailbox_pool_id: number | null;
  message_id: string;
  project_id: number | null;
  received_at: number | null;
}

export interface ExpiredMailboxSample {
  address: string;
  environment_id: number | null;
  expires_at: number | null;
  mailbox_pool_id: number | null;
  project_id: number | null;
}

export interface RetentionScopeSummarySample {
  archived_email_count: number;
  environment_id: number | null;
  mailbox_pool_id: number | null;
  project_id: number | null;
  purged_active_email_count: number;
  purged_deleted_email_count: number;
}

export const EMPTY_POLICY_LIST: PaginationPayload<RetentionPolicyRecord> = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
};

export const EMPTY_RUN_LIST: PaginationPayload<RetentionJobRunRecord> = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
};

export const EMPTY_RUN_SUMMARY: RetentionJobRunSummary = {
  average_duration_ms_24h: null,
  consecutive_failure_count: 0,
  last_failed_at: null,
  last_run: null,
  last_success_at: null,
  recent_24h_archived_email_count: 0,
  recent_24h_expired_mailbox_count: 0,
  recent_24h_failed_count: 0,
  recent_24h_purged_active_email_count: 0,
  recent_24h_purged_deleted_email_count: 0,
  recent_24h_run_count: 0,
  recent_24h_scanned_email_count: 0,
  recent_24h_success_count: 0,
  total_failed_count: 0,
  total_run_count: 0,
  total_success_count: 0,
};

export const EMPTY_CATALOG: WorkspaceCatalog = {
  environments: [],
  mailbox_pools: [],
  projects: [],
};

export const INITIAL_VALUES: RetentionPolicyPayload = {
  archive_email_hours: null,
  deleted_email_retention_hours: null,
  description: "",
  email_retention_hours: null,
  environment_id: null,
  is_enabled: true,
  mailbox_pool_id: null,
  mailbox_ttl_hours: null,
  name: "",
  operation_note: "",
  project_id: null,
};

export const RETENTION_JOB_ACTIONS: RetentionJobAction[] = [
  "expire_mailboxes",
  "archive_emails",
  "purge_active_emails",
  "purge_deleted_emails",
];

export const RETENTION_RUN_OPTIONS: RetentionRunOption[] = [
  {
    actions: [...RETENTION_JOB_ACTIONS],
    description: "停用过期邮箱，并执行归档、普通邮件清理、已删邮件清理",
    key: "full",
    label: "全量维护",
  },
  {
    actions: ["expire_mailboxes"],
    description: "只停用已到期邮箱，不扫描邮件生命周期动作",
    key: "expire_only",
    label: "仅停用过期邮箱",
  },
  {
    actions: ["archive_emails"],
    description: "只执行自动归档，不清理邮件也不停用邮箱",
    key: "archive_only",
    label: "仅自动归档",
  },
  {
    actions: ["purge_active_emails"],
    description: "只清理超过保留期的普通邮件",
    key: "purge_active_only",
    label: "仅清理普通邮件",
  },
  {
    actions: ["purge_deleted_emails"],
    description: "只清理超过保留期的已删邮件",
    key: "purge_deleted_only",
    label: "仅清理已删邮件",
  },
  {
    actions: ["purge_active_emails", "purge_deleted_emails"],
    description: "只执行普通邮件和已删邮件清理，不触发归档或邮箱停用",
    key: "purge_all",
    label: "仅清理邮件",
  },
];

function isRetentionJobAction(value: unknown): value is RetentionJobAction {
  return RETENTION_JOB_ACTIONS.includes(value as RetentionJobAction);
}

export function normalizeRetentionJobActions(actions: unknown): RetentionJobAction[] {
  if (!Array.isArray(actions)) return [...RETENTION_JOB_ACTIONS];

  const normalized = Array.from(new Set(actions.filter(isRetentionJobAction)));
  return normalized.length > 0 ? normalized : [...RETENTION_JOB_ACTIONS];
}

export function isFullRetentionRun(actions: RetentionJobAction[]) {
  return RETENTION_JOB_ACTIONS.every(action => actions.includes(action));
}

export function getRetentionJobActionLabel(action: RetentionJobAction) {
  if (action === "expire_mailboxes") return "停用过期邮箱";
  if (action === "archive_emails") return "自动归档";
  if (action === "purge_active_emails") return "清理普通邮件";
  return "清理已删邮件";
}

export function getRetentionJobActionColor(action: RetentionJobAction) {
  if (action === "expire_mailboxes") return "cyan";
  if (action === "archive_emails") return "purple";
  if (action === "purge_active_emails") return "volcano";
  return "red";
}

export function renderRetentionJobActionTags(actions: unknown, expandAll = false) {
  const normalized = normalizeRetentionJobActions(actions);

  if (isFullRetentionRun(normalized) && !expandAll) {
    return <Tag color="blue">全量维护</Tag>;
  }

  return (
    <Space size={[4, 4]} wrap>
      {normalized.map(action => (
        <Tag key={action} color={getRetentionJobActionColor(action)}>
          {getRetentionJobActionLabel(action)}
        </Tag>
      ))}
    </Space>
  );
}

export function getPolicyScopeLabel(
  record: Pick<
    RetentionPolicyRecord,
    "environment_name" | "mailbox_pool_name" | "project_name" | "scope_level"
  >,
) {
  if (record.scope_level === "mailbox_pool") {
    return `${record.project_name} / ${record.environment_name} / ${record.mailbox_pool_name}`;
  }
  if (record.scope_level === "environment") {
    return `${record.project_name} / ${record.environment_name}`;
  }
  if (record.scope_level === "project") {
    return record.project_name;
  }
  return "全局默认";
}

export function getPolicyScopeColor(scopeLevel: RetentionPolicyRecord["scope_level"]) {
  if (scopeLevel === "mailbox_pool") return "purple";
  if (scopeLevel === "environment") return "cyan";
  if (scopeLevel === "project") return "blue";
  return "gold";
}

export function getPolicyScopeText(scopeLevel: RetentionPolicyRecord["scope_level"]) {
  if (scopeLevel === "mailbox_pool") return "邮箱池";
  if (scopeLevel === "environment") return "环境";
  if (scopeLevel === "project") return "项目";
  return "全局";
}

export function formatHours(value: number | null) {
  return value === null ? "-" : `${value} 小时`;
}

export function formatDuration(value: number | null) {
  if (value === null || value < 0) return "-";
  if (value < 1000) return `${value} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
  return `${(value / 60_000).toFixed(1)} min`;
}

export function formatSuccessRate(successCount: number, totalCount: number) {
  if (totalCount <= 0) return "-";
  return `${Math.round((successCount / totalCount) * 100)}%`;
}

export function getSuccessRatePercent(successCount: number, totalCount: number) {
  if (totalCount <= 0) return 0;
  return Math.round((successCount / totalCount) * 100);
}

export function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

export function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readString(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function readNumber(source: Record<string, unknown> | null, key: string) {
  const value = Number(source?.[key]);
  return Number.isFinite(value) ? value : null;
}

export function readNumberArray(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  if (!Array.isArray(value)) return [];
  return value
    .map(item => Number(item))
    .filter(item => Number.isFinite(item))
    .map(item => Math.floor(item));
}

export function readBoolean(source: Record<string, unknown> | null, key: string) {
  return source?.[key] === true;
}

export function readObjectArray(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  if (!Array.isArray(value)) return [];
  return value
    .map(item => asObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

export function readRetentionEmailSamples(source: Record<string, unknown> | null, key: string): RetentionEmailSample[] {
  return readObjectArray(source, key)
    .map(item => ({
      deleted_at: readNumber(item, "deleted_at"),
      environment_id: readNumber(item, "environment_id"),
      mailbox_pool_id: readNumber(item, "mailbox_pool_id"),
      message_id: readString(item, "message_id"),
      project_id: readNumber(item, "project_id"),
      received_at: readNumber(item, "received_at"),
    }))
    .filter(item => item.message_id);
}

export function readExpiredMailboxSamples(source: Record<string, unknown> | null, key: string): ExpiredMailboxSample[] {
  return readObjectArray(source, key)
    .map(item => ({
      address: readString(item, "address"),
      environment_id: readNumber(item, "environment_id"),
      expires_at: readNumber(item, "expires_at"),
      mailbox_pool_id: readNumber(item, "mailbox_pool_id"),
      project_id: readNumber(item, "project_id"),
    }))
    .filter(item => item.address);
}

export function readRetentionScopeSummarySamples(
  source: Record<string, unknown> | null,
  key: string,
): RetentionScopeSummarySample[] {
  return readObjectArray(source, key).map(item => ({
    archived_email_count: readNumber(item, "archived_email_count") ?? 0,
    environment_id: readNumber(item, "environment_id"),
    mailbox_pool_id: readNumber(item, "mailbox_pool_id"),
    project_id: readNumber(item, "project_id"),
    purged_active_email_count: readNumber(item, "purged_active_email_count") ?? 0,
    purged_deleted_email_count: readNumber(item, "purged_deleted_email_count") ?? 0,
  }));
}

export function formatOptionalDateTime(value: number | null) {
  return typeof value === "number" ? formatDateTime(value) : "-";
}

export function renderScopeTags(input: {
  environment_id: number | null;
  mailbox_pool_id: number | null;
  project_id: number | null;
}) {
  const tags = [
    typeof input.project_id === "number"
      ? { key: `project:${input.project_id}`, label: `项目 #${input.project_id}`, color: "blue" }
      : null,
    typeof input.environment_id === "number"
      ? { key: `environment:${input.environment_id}`, label: `环境 #${input.environment_id}`, color: "cyan" }
      : null,
    typeof input.mailbox_pool_id === "number"
      ? { key: `mailbox_pool:${input.mailbox_pool_id}`, label: `邮箱池 #${input.mailbox_pool_id}`, color: "purple" }
      : null,
  ].filter((item): item is { color: string; key: string; label: string } => Boolean(item));

  if (tags.length === 0) {
    return <Tag>全局范围</Tag>;
  }

  return (
    <Space size={[4, 4]} wrap>
      {tags.map(tag => (
        <Tag key={tag.key} color={tag.color}>
          {tag.label}
        </Tag>
      ))}
    </Space>
  );
}

export function renderSampleTruncatedHint(truncated: boolean, visibleCount: number) {
  if (!truncated) return null;
  return (
    <Text type="secondary" style={{ fontSize: 12 }}>
      仅展示前 {visibleCount} 条样本，完整执行上下文仍可在下方原始 JSON 中查看。
    </Text>
  );
}

export function buildEnvironmentOptionsForPolicyFilters(
  catalog: WorkspaceCatalog,
  filters: RetentionPolicyFilters,
  isProjectScoped: boolean,
  accessibleProjectIds: number[],
) {
  return catalog.environments
    .filter(environment => !filters.project_id || environment.project_id === filters.project_id)
    .filter(environment => !isProjectScoped || accessibleProjectIds.includes(environment.project_id))
    .map(environment => ({
      label: `${environment.project_name} / ${environment.name}`,
      value: environment.id,
    }));
}

export function buildMailboxPoolOptionsForPolicyFilters(
  catalog: WorkspaceCatalog,
  filters: RetentionPolicyFilters,
  isProjectScoped: boolean,
  accessibleProjectIds: number[],
) {
  return catalog.mailbox_pools
    .filter(pool => !filters.project_id || pool.project_id === filters.project_id)
    .filter(pool => !filters.environment_id || pool.environment_id === filters.environment_id)
    .filter(pool => !isProjectScoped || accessibleProjectIds.includes(pool.project_id))
    .map(pool => ({
      label: `${pool.project_name} / ${pool.environment_name} / ${pool.name}`,
      value: pool.id,
    }));
}

export function buildMailboxPoolOptionsForForm(pools: MailboxPoolRecord[]) {
  return pools.map(pool => ({
    label: `${pool.project_name} / ${pool.environment_name} / ${pool.name}`,
    value: pool.id,
  }));
}
