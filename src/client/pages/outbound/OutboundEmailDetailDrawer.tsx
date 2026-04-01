import { Descriptions, Space, Tag, Typography, theme } from "antd";

import { DetailDrawer, TypeTag } from "../../components";
import type { OutboundEmailRecord } from "../../types";
import { formatBytes, formatDateTime } from "../../utils";
import { STATUS_TAGS } from "./outbound-utils";

const { Paragraph, Text } = Typography;

interface OutboundEmailDetailDrawerProps {
  detailLoading: boolean;
  detailRecord: OutboundEmailRecord | null;
  onClose: () => void;
  open: boolean;
}

export function OutboundEmailDetailDrawer({
  detailLoading,
  detailRecord,
  onClose,
  open,
}: OutboundEmailDetailDrawerProps) {
  const { token } = theme.useToken();

  return (
    <DetailDrawer
      title={detailRecord ? `邮件详情 #${detailRecord.id}` : "邮件详情"}
      open={open}
      onClose={onClose}
      width="60vw"
    >
      {detailLoading || !detailRecord ? (
        <div style={{ padding: 40, textAlign: "center", color: token.colorTextSecondary }}>
          正在加载邮件详情...
        </div>
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="主题">{detailRecord.subject}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <TypeTag options={STATUS_TAGS} type={detailRecord.status} />
            </Descriptions.Item>
            <Descriptions.Item label="发件地址">{detailRecord.from_address}</Descriptions.Item>
            <Descriptions.Item label="Reply-To">{detailRecord.reply_to || "-"}</Descriptions.Item>
            <Descriptions.Item label="发送时间">{formatDateTime(detailRecord.sent_at)}</Descriptions.Item>
            <Descriptions.Item label="计划时间">{formatDateTime(detailRecord.scheduled_at)}</Descriptions.Item>
            <Descriptions.Item label="Provider ID" span={2}>
              <Paragraph copyable style={{ marginBottom: 0 }}>
                {detailRecord.provider_message_id || "-"}
              </Paragraph>
            </Descriptions.Item>
            <Descriptions.Item label="错误信息" span={2}>
              {detailRecord.error_message || "-"}
            </Descriptions.Item>
          </Descriptions>

          <div>
            <Text strong>收件人</Text>
            <Paragraph copyable style={{ marginBottom: 0 }}>{detailRecord.to_addresses.join(", ") || "-"}</Paragraph>
          </div>

          <div>
            <Text strong>抄送 / 密送</Text>
            <Paragraph style={{ marginBottom: 0 }}>
              CC：{detailRecord.cc_addresses.join(", ") || "-"}
              <br />
              BCC：{detailRecord.bcc_addresses.join(", ") || "-"}
            </Paragraph>
          </div>

          <div>
            <Text strong>附件</Text>
            <div style={{ marginTop: 8 }}>
              {detailRecord.attachments?.length ? (
                detailRecord.attachments.map(item => (
                  <Tag key={item.id}>
                    {item.filename} · {formatBytes(item.size_bytes)}
                  </Tag>
                ))
              ) : (
                <Text type="secondary">无附件</Text>
              )}
            </div>
          </div>

          <div>
            <Text strong>文本正文</Text>
            <div
              style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 10,
                background: token.colorFillQuaternary,
                whiteSpace: "pre-wrap",
                maxHeight: 240,
                overflow: "auto",
              }}
            >
              {detailRecord.text_body || "-"}
            </div>
          </div>

          <div>
            <Text strong>HTML 正文源码</Text>
            <div
              style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 10,
                background: token.colorFillQuaternary,
                whiteSpace: "pre-wrap",
                maxHeight: 280,
                overflow: "auto",
              }}
            >
              {detailRecord.html_body || "-"}
            </div>
          </div>
        </Space>
      )}
    </DetailDrawer>
  );
}
