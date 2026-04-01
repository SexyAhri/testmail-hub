import { Button, Space, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";

import { ActionButtons, TypeTag } from "../../components";
import type {
  OutboundContactRecord,
  OutboundEmailRecord,
  OutboundTemplateRecord,
} from "../../types";
import { formatDateTime } from "../../utils";
import type { ComposeFormValues } from "./outbound-utils";
import {
  STATUS_TAGS,
  buildVariableSkeleton,
  renderTemplateString,
} from "./outbound-utils";

const { Text } = Typography;

interface BuildEmailColumnsOptions {
  activeTab: "drafts" | "records";
  canWriteOutbound: boolean;
  onDelete: (record: OutboundEmailRecord) => void;
  onEdit: (record: OutboundEmailRecord) => void;
  onSend: (record: OutboundEmailRecord) => void;
  onView: (record: OutboundEmailRecord) => void;
}

interface BuildTemplateColumnsOptions {
  canWriteOutbound: boolean;
  onDelete: (record: OutboundTemplateRecord) => void;
  onEdit: (record: OutboundTemplateRecord) => void;
  onWriteEmail: (defaults: Partial<ComposeFormValues>) => void;
}

interface BuildContactColumnsOptions {
  canWriteOutbound: boolean;
  onDelete: (record: OutboundContactRecord) => void;
  onEdit: (record: OutboundContactRecord) => void;
  onQuickCompose: (defaults: Partial<ComposeFormValues>) => void;
}

export function buildEmailColumns({
  activeTab,
  canWriteOutbound,
  onDelete,
  onEdit,
  onSend,
  onView,
}: BuildEmailColumnsOptions): ColumnsType<OutboundEmailRecord> {
  return [
    {
      title: "主题",
      dataIndex: "subject",
      key: "subject",
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.subject}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.from_name || record.from_address}
          </Text>
        </Space>
      ),
    },
    {
      title: "收件人",
      key: "to_addresses",
      render: (_value, record) => (
        <Text style={{ maxWidth: 280 }} ellipsis={{ tooltip: record.to_addresses.join(", ") }}>
          {record.to_addresses.join(", ")}
        </Text>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: value => <TypeTag options={STATUS_TAGS} type={value} />,
    },
    {
      title: "附件",
      dataIndex: "attachment_count",
      key: "attachment_count",
      width: 90,
      render: value => value || 0,
    },
    {
      title: activeTab === "drafts" ? "计划时间" : "发送时间",
      key: "time",
      width: 180,
      render: (_value, record) => formatDateTime(activeTab === "drafts" ? record.scheduled_at : record.sent_at || record.last_attempt_at),
    },
    {
      title: "操作",
      key: "action",
      width: 260,
      render: (_value, record) => (
        <ActionButtons
          confirmDelete={false}
          onView={() => onView(record)}
          onEdit={
            canWriteOutbound && record.status !== "sent" && record.status !== "sending"
              ? () => onEdit(record)
              : undefined
          }
          onDelete={canWriteOutbound ? () => onDelete(record) : undefined}
          extra={(
            canWriteOutbound && record.status !== "sent" && record.status !== "sending" ? (
              <Button type="link" size="small" onClick={() => onSend(record)}>
                立即发
              </Button>
            ) : null
          )}
        />
      ),
    },
  ];
}

export function buildTemplateColumns({
  canWriteOutbound,
  onDelete,
  onEdit,
  onWriteEmail,
}: BuildTemplateColumnsOptions): ColumnsType<OutboundTemplateRecord> {
  return [
    { title: "模板名称", dataIndex: "name", key: "name" },
    {
      title: "变量",
      dataIndex: "variables",
      key: "variables",
      render: value => value?.length ? value.map((item: string) => <Tag key={item}>{item}</Tag>) : "-",
    },
    {
      title: "状态",
      dataIndex: "is_enabled",
      key: "is_enabled",
      width: 100,
      render: value => <Tag color={value ? "success" : "default"}>{value ? "启用" : "停用"}</Tag>,
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      key: "action",
      width: 220,
      render: (_value, record) => (
        canWriteOutbound ? (
          <ActionButtons
            confirmDelete={false}
            onEdit={() => onEdit(record)}
            onDelete={() => onDelete(record)}
            extra={(
              <Button
                type="link"
                size="small"
                onClick={() => onWriteEmail({
                  html_body: renderTemplateString(record.html_template, {}),
                  subject: renderTemplateString(record.subject_template, {}),
                  template_id: record.id,
                  template_variables: buildVariableSkeleton(record),
                  text_body: renderTemplateString(record.text_template, {}),
                })}
              >
                写邮件
              </Button>
            )}
          />
        ) : (
          <span style={{ color: "#999" }}>只读</span>
        )
      ),
    },
  ];
}

export function buildContactColumns({
  canWriteOutbound,
  onDelete,
  onEdit,
  onQuickCompose,
}: BuildContactColumnsOptions): ColumnsType<OutboundContactRecord> {
  return [
    { title: "联系人", dataIndex: "name", key: "name" },
    {
      title: "邮箱",
      dataIndex: "email",
      key: "email",
      render: value => <Text code>{value}</Text>,
    },
    {
      title: "标签",
      dataIndex: "tags",
      key: "tags",
      render: value => value?.length ? value.map((item: string) => <Tag key={item}>{item}</Tag>) : "-",
    },
    {
      title: "收藏",
      dataIndex: "is_favorite",
      key: "is_favorite",
      width: 90,
      render: value => <Tag color={value ? "gold" : "default"}>{value ? "已收藏" : "普通"}</Tag>,
    },
    {
      title: "备注",
      dataIndex: "note",
      key: "note",
      render: value => value || "-",
    },
    {
      title: "操作",
      key: "action",
      width: 220,
      render: (_value, record) => (
        canWriteOutbound ? (
          <ActionButtons
            confirmDelete={false}
            onEdit={() => onEdit(record)}
            onDelete={() => onDelete(record)}
            extra={(
              <Button type="link" size="small" onClick={() => onQuickCompose({ to: [record.email] })}>
                快速发信
              </Button>
            )}
          />
        ) : (
          <span style={{ color: "#999" }}>只读</span>
        )
      ),
    },
  ];
}
