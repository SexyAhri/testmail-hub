import { DownloadOutlined } from "@ant-design/icons";
import { Button, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";

import type { EmailAttachmentRecord, RuleMatchInsight } from "../../types";

function getInsightLabel(type: RuleMatchInsight["match_type"]) {
  const mapping: Record<RuleMatchInsight["match_type"], { color: string; label: string }> = {
    generic: { color: "default", label: "通用" },
    login_link: { color: "blue", label: "登录链接" },
    magic_link: { color: "purple", label: "魔法链接" },
    platform_signal: { color: "geekblue", label: "平台线索" },
    reset_link: { color: "orange", label: "重置链接" },
    verification_code: { color: "green", label: "验证码" },
    verification_hint: { color: "cyan", label: "验证码线索" },
  };
  return mapping[type] || mapping.generic;
}

export function buildResultColumns(): ColumnsType<RuleMatchInsight> {
  return [
    {
      title: "规则 ID",
      dataIndex: ["source", "rule_id"],
      key: "rule_id",
      width: 100,
      render: value => <Tag color="processing">#{value}</Tag>,
    },
    {
      title: "类型",
      dataIndex: "match_type",
      key: "match_type",
      width: 120,
      render: value => {
        const config = getInsightLabel(String(value || "generic") as RuleMatchInsight["match_type"]);
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
    {
      title: "置信度",
      dataIndex: "confidence",
      key: "confidence",
      width: 120,
      render: (_value, record) => {
        const color =
          record.confidence_label === "high" ? "success"
          : record.confidence_label === "medium" ? "processing"
          : "default";
        const label =
          record.confidence_label === "high" ? "高"
          : record.confidence_label === "medium" ? "中"
          : "低";
        return <Tag color={color}>{label} {record.confidence}</Tag>;
      },
    },
    {
      title: "备注",
      dataIndex: ["source", "remark"],
      key: "remark",
      render: value => value || "-",
    },
    {
      title: "匹配值",
      dataIndex: ["source", "value"],
      key: "value",
      render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
    },
    {
      title: "原因",
      dataIndex: "reason",
      key: "reason",
      render: value => value || "-",
    },
  ];
}

export function buildAttachmentColumns(
  messageId: string,
  buildAttachmentDownloadUrl: (messageId: string, attachmentId: number) => string,
): ColumnsType<EmailAttachmentRecord> {
  return [
    {
      title: "文件名",
      dataIndex: "filename",
      key: "filename",
      render: value => value || "附件",
    },
    {
      title: "类型",
      dataIndex: "mime_type",
      key: "mime_type",
      render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
    },
    {
      title: "大小",
      dataIndex: "size_bytes",
      key: "size_bytes",
      width: 120,
      render: value => `${Math.max(1, Math.round(value / 1024))} KB`,
    },
    {
      title: "下载",
      key: "action",
      width: 120,
      render: (_value, record) =>
        record.is_stored ? (
          <Button
            size="small"
            type="link"
            icon={<DownloadOutlined />}
            href={buildAttachmentDownloadUrl(messageId, record.id)}
          >
            下载
          </Button>
        ) : (
          <Tag>未存储</Tag>
        ),
    },
  ];
}
