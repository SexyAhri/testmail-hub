import {
  CopyOutlined,
  DeleteOutlined,
  EyeOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import { Button, Space, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";

import { RetentionSummary } from "../../components";
import type { EmailSummary } from "../../types";
import { formatDateTime } from "../../utils";

interface BuildArchivesColumnsOptions {
  canDeleteArchivedEmails: boolean;
  canUnarchiveEmails: boolean;
  onCopyCode: (event: React.MouseEvent<HTMLElement>, code: string) => void;
  onDelete: (event: React.MouseEvent<HTMLElement>, record: EmailSummary) => void;
  onOpenDetail: (event: React.MouseEvent<HTMLElement>, record: EmailSummary) => void;
  onUnarchive: (event: React.MouseEvent<HTMLElement>, record: EmailSummary) => void;
}

export function buildArchivesColumns({
  canDeleteArchivedEmails,
  canUnarchiveEmails,
  onCopyCode,
  onDelete,
  onOpenDetail,
  onUnarchive,
}: BuildArchivesColumnsOptions): ColumnsType<EmailSummary> {
  return [
    {
      title: "主题",
      dataIndex: "subject",
      key: "subject",
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{record.subject || "（无主题）"}</Typography.Text>
          <Typography.Text type="secondary">{record.preview || "暂无预览。"}</Typography.Text>
          {record.archive_reason ? (
            <Typography.Text type="secondary">归档原因：{record.archive_reason}</Typography.Text>
          ) : null}
        </Space>
      ),
    },
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
      title: "验证码",
      dataIndex: "verification_code",
      key: "verification_code",
      width: 120,
      render: value =>
        value ? (
          <Button
            type="link"
            size="small"
            icon={<CopyOutlined />}
            onClick={event => onCopyCode(event, value)}
            style={{ paddingInline: 0, fontFamily: "monospace", fontWeight: 600 }}
          >
            {value}
          </Button>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        ),
    },
    {
      title: "匹配",
      dataIndex: "result_count",
      key: "result_count",
      width: 90,
      render: value => <Tag color={value ? "success" : "default"}>{value}</Tag>,
    },
    {
      title: "归档时间",
      dataIndex: "archived_at",
      key: "archived_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      key: "action",
      width: 220,
      render: (_value, record) => (
        <Space>
          <Button
            size="small"
            type="link"
            icon={<EyeOutlined />}
            onClick={event => onOpenDetail(event, record)}
          >
            查看
          </Button>
          {canUnarchiveEmails ? (
            <Button
              size="small"
              icon={<RollbackOutlined />}
              onClick={event => onUnarchive(event, record)}
            >
              取消归档
            </Button>
          ) : null}
          {canDeleteArchivedEmails ? (
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={event => onDelete(event, record)}
            >
              删除
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];
}
