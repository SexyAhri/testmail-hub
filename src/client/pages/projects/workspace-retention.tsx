import { Tag } from "antd";

import type { ResolvedRetentionPolicy } from "../../types";

function getRetentionSourceColor(source: ResolvedRetentionPolicy["archive_email_source"]) {
  if (source === "mailbox_pool") return "purple";
  if (source === "environment") return "cyan";
  if (source === "project") return "blue";
  if (source === "global") return "gold";
  return "default";
}

function getRetentionSourceText(source: ResolvedRetentionPolicy["archive_email_source"]) {
  if (source === "mailbox_pool") return "邮箱池";
  if (source === "environment") return "环境";
  if (source === "project") return "项目";
  if (source === "global") return "全局";
  if (source === "default") return "默认";
  return "未设置";
}

function formatRetentionHours(value: number | null) {
  return value === null ? "不限" : `${value}h`;
}

export function renderRetentionSummary(resolved: ResolvedRetentionPolicy) {
  const items = [
    {
      key: "mailbox_ttl_hours",
      label: "邮箱 TTL",
      shortLabel: "TTL",
      source: resolved.mailbox_ttl_source,
      value: resolved.mailbox_ttl_hours,
    },
    {
      key: "archive_email_hours",
      label: "自动归档",
      shortLabel: "归档",
      source: resolved.archive_email_source,
      value: resolved.archive_email_hours,
    },
    {
      key: "email_retention_hours",
      label: "邮件保留",
      shortLabel: "邮件",
      source: resolved.email_retention_source,
      value: resolved.email_retention_hours,
    },
    {
      key: "deleted_email_retention_hours",
      label: "已删邮件保留",
      shortLabel: "已删",
      source: resolved.deleted_email_retention_source,
      value: resolved.deleted_email_retention_hours,
    },
  ];

  if (items.every(item => item.source === null && item.value === null)) {
    return <span style={{ color: "#999" }}>未设置</span>;
  }

  return (
    <div style={{ display: "flex", flexWrap: "nowrap", gap: 6, minWidth: "max-content" }}>
      {items.map(item => (
        <span
          key={item.key}
          title={`${item.label}: ${formatRetentionHours(item.value)} · 来源 ${getRetentionSourceText(item.source)}`}
        >
          <Tag color={getRetentionSourceColor(item.source)} style={{ marginInlineEnd: 0, whiteSpace: "nowrap" }}>
            {item.shortLabel} {formatRetentionHours(item.value)}
          </Tag>
        </span>
      ))}
    </div>
  );
}
