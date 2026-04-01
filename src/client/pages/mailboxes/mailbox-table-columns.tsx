import { Button, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";

import { ActionButtons, RetentionSummary, StatusTag } from "../../components";
import type { MailboxRecord } from "../../types";
import { formatDateTime } from "../../utils";

interface BuildMailboxColumnsOptions {
  canManageMailboxRecord: (record: Pick<MailboxRecord, "project_id">) => boolean;
  onDelete: (record: MailboxRecord) => void;
  onEdit: (record: MailboxRecord) => void;
  onOpenInbox: (record: MailboxRecord) => void;
}

export function buildMailboxColumns({
  canManageMailboxRecord,
  onDelete,
  onEdit,
  onOpenInbox,
}: BuildMailboxColumnsOptions): ColumnsType<MailboxRecord> {
  return [
    {
      title: "邮箱地址",
      dataIndex: "address",
      key: "address",
      render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
    },
    {
      title: "归属",
      key: "scope",
      render: (_value, record) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {record.project_name ? <Tag color="blue">{record.project_name}</Tag> : <Tag>未分配</Tag>}
          {record.environment_name ? <Tag color="green">{record.environment_name}</Tag> : null}
          {record.mailbox_pool_name ? <Tag color="purple">{record.mailbox_pool_name}</Tag> : null}
        </div>
      ),
    },
    {
      title: "生命周期",
      dataIndex: "resolved_retention",
      key: "resolved_retention",
      render: value => <RetentionSummary resolved={value} />,
    },
    {
      title: "备注",
      dataIndex: "note",
      key: "note",
      render: value => value || "-",
    },
    {
      title: "标签",
      dataIndex: "tags",
      key: "tags",
      render: value => value?.length ? value.map((tag: string) => <Tag key={tag}>{tag}</Tag>) : "-",
    },
    {
      title: "状态",
      dataIndex: "is_enabled",
      key: "is_enabled",
      width: 100,
      render: value => (
        <StatusTag status={value ? "enabled" : "disabled"} activeText="启用" inactiveText="停用" />
      ),
    },
    {
      title: "到期时间",
      dataIndex: "expires_at",
      key: "expires_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "收件数",
      dataIndex: "receive_count",
      key: "receive_count",
      width: 100,
    },
    {
      title: "最近收件",
      dataIndex: "last_received_at",
      key: "last_received_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      key: "action",
      width: 180,
      render: (_value, record) => (
        canManageMailboxRecord(record) ? (
          <ActionButtons
            onEdit={() => onEdit(record)}
            onDelete={() => onDelete(record)}
            extra={(
              <Button type="link" size="small" onClick={() => onOpenInbox(record)}>
                收件箱
              </Button>
            )}
          />
        ) : (
          <Button type="link" size="small" onClick={() => onOpenInbox(record)}>
            收件箱
          </Button>
        )
      ),
    },
  ];
}
