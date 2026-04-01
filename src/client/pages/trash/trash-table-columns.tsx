import {
  DeleteOutlined,
  EyeOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import { Button, Space, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";

import { RetentionSummary } from "../../components";
import type { EmailSummary } from "../../types";
import { formatDateTime } from "../../utils";

interface BuildTrashColumnsOptions {
  canPurgeDeletedEmails: boolean;
  canRestoreDeletedEmails: boolean;
  onOpenDetail: (record: EmailSummary) => void;
  onPurge: (record: EmailSummary) => void;
  onRestore: (record: EmailSummary) => void;
}

export function buildTrashColumns({
  canPurgeDeletedEmails,
  canRestoreDeletedEmails,
  onOpenDetail,
  onPurge,
  onRestore,
}: BuildTrashColumnsOptions): ColumnsType<EmailSummary> {
  return [
    { title: "主题", dataIndex: "subject", key: "subject", render: value => value || "（无主题）" },
    {
      title: "发件人",
      dataIndex: "from_address",
      key: "from_address",
      render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
    },
    {
      title: "收件人",
      dataIndex: "to_address",
      key: "to_address",
      render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
    },
    {
      title: "生命周期",
      dataIndex: "resolved_retention",
      key: "resolved_retention",
      render: value => <RetentionSummary resolved={value} />,
    },
    {
      title: "匹配",
      dataIndex: "result_count",
      key: "result_count",
      width: 90,
      render: value => <Tag color={value ? "success" : "default"}>{value}</Tag>,
    },
    {
      title: "删除时间",
      dataIndex: "deleted_at",
      key: "deleted_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      key: "action",
      width: 240,
      render: (_value, record) => (
        <Space>
          <Button
            size="small"
            type="link"
            icon={<EyeOutlined />}
            onClick={() => onOpenDetail(record)}
          >
            查看
          </Button>
          {canRestoreDeletedEmails ? (
            <Button size="small" icon={<RollbackOutlined />} onClick={() => onRestore(record)}>
              恢复
            </Button>
          ) : null}
          {canPurgeDeletedEmails ? (
            <Button danger size="small" icon={<DeleteOutlined />} onClick={() => onPurge(record)}>
              删除
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];
}
