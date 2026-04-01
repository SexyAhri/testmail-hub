import { Tag } from "antd";

import type { ResolvedRetentionPolicy } from "../../types";
import {
  formatRetentionHours,
  getRetentionSourceColor,
  getRetentionSourceText,
  hasResolvedRetentionPolicy,
} from "../../retention";

interface RetentionSummaryProps {
  emptyText?: string;
  nowrap?: boolean;
  resolved: ResolvedRetentionPolicy;
}

const RETENTION_SUMMARY_ITEMS: Array<{
  key: keyof Pick<
    ResolvedRetentionPolicy,
    "archive_email_hours" | "deleted_email_retention_hours" | "email_retention_hours" | "mailbox_ttl_hours"
  >;
  label: string;
  shortLabel: string;
  sourceKey: keyof Pick<
    ResolvedRetentionPolicy,
    "archive_email_source" | "deleted_email_retention_source" | "email_retention_source" | "mailbox_ttl_source"
  >;
}> = [
  {
    key: "mailbox_ttl_hours",
    label: "邮箱 TTL",
    shortLabel: "TTL",
    sourceKey: "mailbox_ttl_source",
  },
  {
    key: "archive_email_hours",
    label: "自动归档",
    shortLabel: "归档",
    sourceKey: "archive_email_source",
  },
  {
    key: "email_retention_hours",
    label: "邮件保留",
    shortLabel: "邮件",
    sourceKey: "email_retention_source",
  },
  {
    key: "deleted_email_retention_hours",
    label: "已删保留",
    shortLabel: "已删",
    sourceKey: "deleted_email_retention_source",
  },
];

export function RetentionSummary({
  emptyText = "未设置",
  nowrap = true,
  resolved,
}: RetentionSummaryProps) {
  if (!hasResolvedRetentionPolicy(resolved)) {
    return <span style={{ color: "#999" }}>{emptyText}</span>;
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: nowrap ? "nowrap" : "wrap",
        gap: 6,
        minWidth: nowrap ? "max-content" : undefined,
      }}
    >
      {RETENTION_SUMMARY_ITEMS.map(item => {
        const source = resolved[item.sourceKey];
        const value = resolved[item.key];
        return (
          <span
            key={item.key}
            title={`${item.label}：${formatRetentionHours(value)} · 来源 ${getRetentionSourceText(source)}`}
          >
            <Tag color={getRetentionSourceColor(source)} style={{ marginInlineEnd: 0, whiteSpace: "nowrap" }}>
              {item.shortLabel} {formatRetentionHours(value)}
            </Tag>
          </span>
        );
      })}
    </div>
  );
}
