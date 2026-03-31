import { Space, Tag } from "antd";
import type { ReactNode } from "react";

import type { AuditLogRecord } from "./types";

export const ACTION_LABELS: Record<string, string> = {
  "admin.create": "新增成员",
  "admin.login": "管理员登录",
  "admin.update": "更新成员",
  "api_token.create": "创建 API Token",
  "api_token.delete": "删除 API Token",
  "api_token.update": "更新 API Token",
  "domain.catch_all_sync": "同步 Catch-all",
  "domain.create": "新增域名资产",
  "domain.delete": "删除域名资产",
  "domain.governance.update": "更新域名治理",
  "domain.routing_profile.create": "新增路由策略",
  "domain.routing_profile.delete": "删除路由策略",
  "domain.routing_profile.update": "更新路由策略",
  "domain.update": "更新域名资产",
  "email.archive": "归档邮件",
  "email.delete": "删除邮件",
  "email.metadata.update": "更新邮件备注/标签",
  "email.purge": "彻底删除邮件",
  "email.restore": "恢复邮件",
  "email.unarchive": "取消归档邮件",
  "mailbox.create": "新增邮箱",
  "mailbox.delete": "删除邮箱",
  "mailbox.update": "更新邮箱",
  "notification.create": "新增 Webhook",
  "notification.delete": "删除 Webhook",
  "notification.delivery.resolve": "忽略 Webhook 投递",
  "notification.delivery.retry": "重试 Webhook 投递",
  "notification.update": "更新 Webhook",
  "outbound.contact.create": "新增联系人",
  "outbound.contact.delete": "删除联系人",
  "outbound.contact.update": "更新联系人",
  "outbound.email.delete": "删除发信记录",
  "outbound.email.send_failed": "发信失败",
  "outbound.settings.update": "更新发信设置",
  "outbound.template.create": "新增模板",
  "outbound.template.delete": "删除模板",
  "outbound.template.update": "更新模板",
  "retention.policy.create": "新增生命周期策略",
  "retention.policy.delete": "删除生命周期策略",
  "retention.policy.update": "更新生命周期策略",
  "retention.run.failed": "生命周期任务失败",
  "rule.create": "新增规则",
  "rule.delete": "删除规则",
  "rule.update": "更新规则",
  "whitelist.create": "新增白名单",
  "whitelist.delete": "删除白名单",
  "whitelist.settings.update": "更新白名单开关",
  "whitelist.update": "更新白名单",
  "workspace.environment.create": "新增环境",
  "workspace.environment.delete": "删除环境",
  "workspace.environment.update": "更新环境",
  "workspace.mailbox_pool.create": "新增邮箱池",
  "workspace.mailbox_pool.delete": "删除邮箱池",
  "workspace.mailbox_pool.update": "更新邮箱池",
  "workspace.project.create": "新增项目",
  "workspace.project.delete": "删除项目",
  "workspace.project.update": "更新项目",
};

export const ENTITY_LABELS: Record<string, string> = {
  admin: "成员",
  admin_session: "登录会话",
  admin_user: "成员",
  api_token: "API Token",
  domain: "域名资产",
  domain_routing_profile: "路由策略",
  email: "邮件",
  mailbox: "邮箱",
  notification: "Webhook",
  notification_delivery: "Webhook 投递",
  notification_endpoint: "Webhook",
  outbound_contact: "联系人",
  outbound_email: "发信记录",
  outbound_settings: "发信设置",
  outbound_template: "发信模板",
  retention_job: "生命周期任务",
  retention_policy: "生命周期策略",
  rule: "规则",
  whitelist: "白名单",
  whitelist_settings: "白名单设置",
  workspace_environment: "环境",
  workspace_mailbox_pool: "邮箱池",
  workspace_project: "项目",
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "管理员",
  analyst: "分析员",
  operator: "执行成员",
  owner: "所有者",
  platform_admin: "平台管理员",
  project_admin: "项目管理员",
  viewer: "只读成员",
};

export const AUDIT_ACTION_PREFIX_OPTIONS = [
  { label: "成员治理", value: "admin." },
  { label: "域名治理", value: "domain." },
  { label: "项目空间", value: "workspace." },
  { label: "邮箱资产", value: "mailbox." },
  { label: "邮件治理", value: "email." },
  { label: "Webhook", value: "notification." },
  { label: "API Token", value: "api_token." },
  { label: "发信中心", value: "outbound." },
  { label: "生命周期", value: "retention." },
  { label: "规则", value: "rule." },
  { label: "白名单", value: "whitelist." },
];

export const AUDIT_ENTITY_OPTIONS = Object.entries(ENTITY_LABELS)
  .map(([value, label]) => ({ label, value }))
  .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readBoolean(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  return typeof value === "boolean" ? value : null;
}

function readString(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readStringArray(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => typeof item === "string" && item.trim())
    .map(item => String(item).trim());
}

function readNumberArray(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  if (!Array.isArray(value)) return [];
  return value
    .map(item => Number(item))
    .filter(item => Number.isFinite(item) && item > 0)
    .map(item => Math.floor(item));
}

function formatGovernanceState(value: boolean | null, enabledText: string, disabledText: string) {
  if (value === null) return "未知";
  return value ? enabledText : disabledText;
}

function formatAdminAccessScope(value: string) {
  return value === "bound" ? "项目绑定" : "全局";
}

function formatAdminChangedField(value: string) {
  if (value === "access_scope") return "访问范围";
  if (value === "display_name") return "显示名称";
  if (value === "is_enabled") return "状态";
  if (value === "note") return "备注";
  if (value === "project_ids") return "绑定项目";
  if (value === "role") return "角色";
  return value;
}

function renderGovernanceSummary(detail: Record<string, unknown>, entityId: string) {
  const previous = asObject(detail.previous_governance);
  const next = asObject(detail.next_governance);
  const domain = readString(detail, "domain") || (entityId ? `域名 #${entityId}` : "域名治理");
  const chips: ReactNode[] = [];

  const previousAllowNew = readBoolean(previous, "allow_new_mailboxes");
  const nextAllowNew = readBoolean(next, "allow_new_mailboxes");
  if (previousAllowNew !== null && nextAllowNew !== null && previousAllowNew !== nextAllowNew) {
    chips.push(
      <Tag key="allow_new_mailboxes" color={nextAllowNew ? "success" : "default"}>
        允许新建邮箱: {formatGovernanceState(previousAllowNew, "开", "关")} {"->"} {formatGovernanceState(nextAllowNew, "开", "关")}
      </Tag>,
    );
  }

  const previousRouteSync = readBoolean(previous, "allow_mailbox_route_sync");
  const nextRouteSync = readBoolean(next, "allow_mailbox_route_sync");
  if (previousRouteSync !== null && nextRouteSync !== null && previousRouteSync !== nextRouteSync) {
    chips.push(
      <Tag key="allow_mailbox_route_sync" color={nextRouteSync ? "processing" : "default"}>
        路由同步: {formatGovernanceState(previousRouteSync, "开", "关")} {"->"} {formatGovernanceState(nextRouteSync, "开", "关")}
      </Tag>,
    );
  }

  return (
    <Space direction="vertical" size={4}>
      <span style={{ fontWeight: 500 }}>{domain}</span>
      <Space size={[4, 4]} wrap>
        {chips.length > 0 ? chips : <Tag>治理配置已更新</Tag>}
      </Space>
    </Space>
  );
}

function renderAdminSummary(record: AuditLogRecord) {
  const detail = asObject(record.detail_json);
  if (!detail) return null;

  const previous = asObject(detail.previous);
  const next = asObject(detail.next) || detail;
  const username = readString(next, "username") || readString(detail, "username") || record.entity_id || "成员";
  const displayName = readString(next, "display_name") || readString(detail, "display_name");
  const role = readString(next, "role");
  const accessScope = readString(next, "access_scope");
  const note = readString(next, "note");
  const changedFields = readStringArray(detail, "changed_fields");
  const nextProjectIds = readNumberArray(next, "project_ids");
  const previousProjectIds = readNumberArray(previous, "project_ids");
  const nextEnabled = readBoolean(next, "is_enabled");
  const roleChanged = previous !== null && readString(previous, "role") !== role;
  const accessScopeChanged = previous !== null && readString(previous, "access_scope") !== accessScope;
  const statusChanged = previous !== null && readBoolean(previous, "is_enabled") !== nextEnabled;
  const noteChanged = changedFields.includes("note");
  const projectChanged =
    changedFields.includes("project_ids")
    || JSON.stringify(previousProjectIds) !== JSON.stringify(nextProjectIds);

  return (
    <Space direction="vertical" size={4}>
      <span style={{ fontWeight: 500 }}>
        {displayName ? `${displayName} (${username})` : username}
      </span>
      <Space size={[4, 4]} wrap>
        {role ? (
          <Tag color={roleChanged ? "purple" : "blue"}>
            角色: {ROLE_LABELS[role] || role}
          </Tag>
        ) : null}
        {accessScope ? (
          <Tag color={accessScopeChanged ? "gold" : "default"}>
            范围: {formatAdminAccessScope(accessScope)}
          </Tag>
        ) : null}
        {typeof nextEnabled === "boolean" ? (
          <Tag color={nextEnabled ? "success" : "default"}>
            {statusChanged ? "状态已变更" : nextEnabled ? "已启用" : "已停用"}
          </Tag>
        ) : null}
        {projectChanged ? (
          <Tag color="processing">
            项目绑定: {nextProjectIds.length > 0 ? `${nextProjectIds.length} 个` : "无"}
          </Tag>
        ) : nextProjectIds.length > 0 ? (
          <Tag color="default">项目绑定: {nextProjectIds.length} 个</Tag>
        ) : null}
        {noteChanged ? <Tag color="cyan">备注已更新</Tag> : null}
      </Space>
      {changedFields.length > 0 ? (
        <span style={{ color: "#8c8c8c", fontSize: 12 }}>
          变更字段: {changedFields.map(formatAdminChangedField).join("、")}
        </span>
      ) : null}
      {note ? (
        <span style={{ color: "#8c8c8c", fontSize: 12 }}>备注: {note}</span>
      ) : null}
    </Space>
  );
}

function renderGenericSummary(record: AuditLogRecord) {
  const detail = asObject(record.detail_json);
  const primaryLabel = readString(detail, "domain")
    || readString(detail, "name")
    || readString(detail, "username")
    || readString(detail, "address")
    || readString(detail, "email")
    || readString(detail, "target")
    || (record.entity_id ? `${getEntityLabel(record)} #${record.entity_id}` : getEntityLabel(record));

  const metadata: string[] = [];
  const provider = readString(detail, "provider");
  if (provider) metadata.push(`Provider: ${provider}`);

  const changeKinds = readStringArray(detail, "change_kinds").map(kind => {
    if (kind === "config") return "配置变更";
    if (kind === "governance") return "治理变更";
    return kind;
  });
  if (changeKinds.length > 0) metadata.push(changeKinds.join(" / "));

  const projectName = readString(detail, "project_name");
  if (projectName) metadata.push(`项目: ${projectName}`);

  const environmentName = readString(detail, "environment_name");
  if (environmentName) metadata.push(`环境: ${environmentName}`);

  const description = metadata.join(" 路 ");

  return (
    <Space direction="vertical" size={4}>
      <span style={{ fontWeight: 500 }}>{primaryLabel}</span>
      {description ? (
        <span style={{ color: "#8c8c8c", fontSize: 12 }}>{description}</span>
      ) : null}
    </Space>
  );
}

export function getActionColor(action: string) {
  if (action.startsWith("domain.")) return "processing";
  if (action.startsWith("workspace.")) return "purple";
  if (action.startsWith("admin.")) return "volcano";
  if (action.startsWith("notification.")) return "gold";
  if (action.startsWith("outbound.")) return "cyan";
  if (action.startsWith("email.")) return "green";
  if (action.startsWith("retention.")) return "magenta";
  if (action.startsWith("rule.")) return "orange";
  if (action.startsWith("whitelist.")) return "lime";
  if (action.startsWith("api_token.")) return "geekblue";
  return "default";
}

export function getActionLabel(action: string) {
  return ACTION_LABELS[action] || action || "未知动作";
}

export function getEntityLabel(record: Pick<AuditLogRecord, "entity_type">) {
  return ENTITY_LABELS[record.entity_type] || record.entity_type || "未知实体";
}

export function renderAuditSummary(record: AuditLogRecord) {
  const detail = asObject(record.detail_json);

  if ((record.action === "admin.create" || record.action === "admin.update") && detail) {
    return renderAdminSummary(record);
  }

  if (record.action === "domain.governance.update" && detail) {
    return renderGovernanceSummary(detail, record.entity_id);
  }

  return renderGenericSummary(record);
}

export function renderRawAuditDetail(value: AuditLogRecord["detail_json"]) {
  const serialized = JSON.stringify(value, null, 2);
  if (!serialized || serialized === "{}") return "-";

  return (
    <details>
      <summary style={{ cursor: "pointer", color: "#1677ff" }}>查看原始详情</summary>
      <pre
        style={{
          margin: "8px 0 0",
          maxWidth: 420,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {serialized}
      </pre>
    </details>
  );
}
