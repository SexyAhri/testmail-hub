import { CopyOutlined, EyeOutlined } from "@ant-design/icons";
import { Button, Space, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { MouseEvent } from "react";

import { RetentionSummary } from "../../components";
import type { EmailSummary } from "../../types";
import { formatDateTime } from "../../utils";

interface BuildEmailColumnsOptions {
  onCopyCode: (event: MouseEvent<HTMLElement>, code: string) => void;
  onOpenDetail: (event: MouseEvent<HTMLElement>, messageId: string) => void;
}

export function buildEmailColumns({
  onCopyCode,
  onOpenDetail,
}: BuildEmailColumnsOptions): ColumnsType<EmailSummary> {
  return [
    {
      title: "主题",
      dataIndex: "subject",
      key: "subject",
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{record.subject || "（无主题）"}</Typography.Text>
          <Typography.Text type="secondary">{record.preview || "暂无预览。"}</Typography.Text>
          {record.note ? <Typography.Text type="secondary">备注：{record.note}</Typography.Text> : null}
          {record.tags.length > 0
          || record.extraction.platform
          || record.extraction.links.length > 0
          || record.project_name
          || record.environment_name
          || record.mailbox_pool_name ? (
            <Space size={[0, 4]} wrap>
              {record.project_name ? <Tag color="blue">{record.project_name}</Tag> : null}
              {record.environment_name ? <Tag color="green">{record.environment_name}</Tag> : null}
              {record.mailbox_pool_name ? <Tag color="purple">{record.mailbox_pool_name}</Tag> : null}
              {record.extraction.platform ? <Tag color="geekblue">{record.extraction.platform}</Tag> : null}
              {record.extraction.links.length > 0 ? (
                <Tag color="cyan">
                  {record.extraction.primary_link?.label || "链接"} {record.extraction.links.length}
                </Tag>
              ) : null}
              {record.tags.map(tag => (
                <Tag key={`${record.message_id}-${tag}`} color="blue">
                  {tag}
                </Tag>
              ))}
            </Space>
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
      render: value => (value > 0 ? <Tag color="success">{value}</Tag> : <Tag>0</Tag>),
    },
    {
      title: "附件",
      dataIndex: "has_attachments",
      key: "has_attachments",
      width: 110,
      render: value => (value ? <Tag color="processing">有</Tag> : <Tag>无</Tag>),
    },
    {
      title: "收件时间",
      dataIndex: "received_at",
      key: "received_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      key: "action",
      width: 100,
      render: (_value, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={event => onOpenDetail(event, record.message_id)}
        >
          查看
        </Button>
      ),
    },
  ];
}
