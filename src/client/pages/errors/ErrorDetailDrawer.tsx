import { CopyOutlined } from "@ant-design/icons";
import { Button, Descriptions, Space, Tag, Typography } from "antd";

import { DetailDrawer } from "../../components";
import type { ErrorEventRecord } from "../../types";
import { formatDateTime } from "../../utils";
import { formatSourceName, getSourceMeta, stringifyJson } from "./errors-utils";

const { Paragraph, Text } = Typography;

interface ErrorDetailDrawerProps {
  onClose: () => void;
  onCopy: (content: string, label: string) => void;
  record: ErrorEventRecord | null;
}

export function ErrorDetailDrawer({
  onClose,
  onCopy,
  record,
}: ErrorDetailDrawerProps) {
  return (
    <DetailDrawer
      title={record ? `日志详情 #${record.id}` : "日志详情"}
      open={Boolean(record)}
      onClose={onClose}
      width="60vw"
    >
      {record ? (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="时间">{formatDateTime(record.created_at)}</Descriptions.Item>
            <Descriptions.Item label="事件编号">{record.id}</Descriptions.Item>
            <Descriptions.Item label="事件分类">
              <Tag color={getSourceMeta(record.source).color}>{getSourceMeta(record.source).label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="来源标识">
              <Text code>{record.source}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="事件名称" span={2}>
              {formatSourceName(record.source)}
            </Descriptions.Item>
            <Descriptions.Item label="错误消息" span={2}>
              {record.message || "-"}
            </Descriptions.Item>
          </Descriptions>

          <div>
            <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
              <Text strong>上下文 JSON</Text>
              <Button
                type="link"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => onCopy(stringifyJson(record.context_json), "上下文")}
              >
                复制上下文
              </Button>
            </Space>
            <div
              style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 10,
                background: "#fafafa",
                maxHeight: 260,
                overflow: "auto",
              }}
            >
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {stringifyJson(record.context_json)}
              </pre>
            </div>
          </div>

          <div>
            <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
              <Text strong>异常堆栈</Text>
              <Button
                type="link"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => onCopy(record.stack || "-", "堆栈")}
              >
                复制堆栈
              </Button>
            </Space>
            <div
              style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 10,
                background: "#fafafa",
                maxHeight: 320,
                overflow: "auto",
              }}
            >
              <Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {record.stack || "-"}
              </Paragraph>
            </div>
          </div>
        </Space>
      ) : null}
    </DetailDrawer>
  );
}
