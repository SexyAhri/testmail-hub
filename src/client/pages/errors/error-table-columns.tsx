import { EyeOutlined } from "@ant-design/icons";
import { Button, Space, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";

import type { ErrorEventRecord } from "../../types";
import { formatDateTime } from "../../utils";
import { buildContextPreview, formatSourceName, getSourceMeta } from "./errors-utils";

const { Text } = Typography;

interface BuildErrorColumnsOptions {
  onOpenDetail: (record: ErrorEventRecord) => void;
}

export function buildErrorColumns({
  onOpenDetail,
}: BuildErrorColumnsOptions): ColumnsType<ErrorEventRecord> {
  return [
    {
      title: "时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 176,
      render: value => formatDateTime(value),
    },
    {
      title: "来源",
      dataIndex: "source",
      key: "source",
      width: 220,
      render: value => {
        const meta = getSourceMeta(String(value || ""));
        return (
          <Space direction="vertical" size={4}>
            <Space size={6} wrap>
              <Tag color={meta.color}>{meta.label}</Tag>
              <Text strong>{formatSourceName(String(value || ""))}</Text>
            </Space>
            <Text code>{String(value || "-")}</Text>
          </Space>
        );
      },
    },
    {
      title: "错误摘要",
      dataIndex: "message",
      key: "message",
      render: (_value, record) => (
        <Space direction="vertical" size={4}>
          <Text strong>{record.message || "-"}</Text>
          <Text type="secondary">{buildContextPreview(record.context_json)}</Text>
        </Space>
      ),
    },
    {
      title: "详情",
      key: "action",
      width: 92,
      render: (_value, record) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onOpenDetail(record)}>
          查看
        </Button>
      ),
    },
  ];
}
