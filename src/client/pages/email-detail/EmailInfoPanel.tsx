import { InfoCircleOutlined, SaveOutlined } from "@ant-design/icons";
import { Button, Card, Col, Input, Row, Select, Space, Tag, Typography, theme } from "antd";

import { RetentionSummary } from "../../components";
import {
  buildEmailLifecycleSchedule,
  formatRetentionHours,
  getRetentionSourceText,
  hasResolvedRetentionPolicy,
} from "../../retention";
import type { EmailDetail } from "../../types";
import { formatDateTime } from "../../utils";

interface EmailInfoPanelProps {
  canEditEmailMetadata: boolean;
  detail: EmailDetail;
  metadataSaving: boolean;
  noteDraft: string;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onTagsChange: (value: string[]) => void;
  tagsDraft: string[];
}

export function EmailInfoPanel({
  canEditEmailMetadata,
  detail,
  metadataSaving,
  noteDraft,
  onNoteChange,
  onSave,
  onTagsChange,
  tagsDraft,
}: EmailInfoPanelProps) {
  const { token } = theme.useToken();

  const infoItems = [
    { label: "发件人", value: detail.from_address },
    { label: "收件人", value: detail.to_address },
    { label: "项目", value: detail.project_name || "-" },
    { label: "环境", value: detail.environment_name || "-" },
    { label: "邮箱池", value: detail.mailbox_pool_name || "-" },
    { label: "邮箱", value: detail.primary_mailbox_address || "-" },
    { label: "收件时间", value: formatDateTime(detail.received_at) },
    { label: "归档时间", value: formatDateTime(detail.archived_at) },
    { label: "归档人", value: detail.archived_by || "-" },
    { label: "归档原因", value: detail.archive_reason || "-" },
    { label: "消息 ID", value: detail.message_id },
    { label: "删除时间", value: formatDateTime(detail.deleted_at) },
  ];

  const lifecycleSchedule = buildEmailLifecycleSchedule({
    archived_at: detail.archived_at,
    deleted_at: detail.deleted_at,
    received_at: detail.received_at,
    resolved_retention: detail.resolved_retention,
  });

  return (
    <Card size="small" style={{ borderRadius: 12, width: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", minHeight: "clamp(520px, 64vh, 820px)" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "rgba(24,144,255,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#1890ff",
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            <InfoCircleOutlined />
          </div>
          <span style={{ marginLeft: 12, fontSize: 15, fontWeight: 600, color: token.colorText }}>邮件信息</span>
        </div>

        <Row gutter={[12, 12]}>
          {infoItems.map(item => (
            <Col xs={24} sm={12} key={`${item.label}-${String(item.value)}`}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: token.colorFillQuaternary,
                  height: "100%",
                }}
              >
                <span style={{ color: token.colorTextSecondary, fontSize: 13 }}>{item.label}</span>
                <span
                  style={{
                    color: token.colorText,
                    fontSize: 12,
                    fontFamily: "monospace",
                    fontWeight: 500,
                    maxWidth: "62%",
                    textAlign: "right",
                    wordBreak: "break-all",
                  }}
                >
                  {item.value}
                </span>
              </div>
            </Col>
          ))}
        </Row>

        <div
          style={{
            marginTop: 20,
            padding: 14,
            borderRadius: 10,
            background: token.colorFillQuaternary,
          }}
        >
          <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: token.colorText }}>生命周期策略</div>
          <div style={{ display: "grid", gap: 12 }}>
            <RetentionSummary resolved={detail.resolved_retention} nowrap={false} />

            <div style={{ display: "grid", gap: 8 }}>
              {detail.resolved_retention.mailbox_ttl_hours !== null ? (
                <Typography.Text type="secondary">
                  邮箱 TTL：{formatRetentionHours(detail.resolved_retention.mailbox_ttl_hours)}，来源：{getRetentionSourceText(detail.resolved_retention.mailbox_ttl_source)}
                </Typography.Text>
              ) : null}

              {lifecycleSchedule.length > 0 ? (
                lifecycleSchedule.map(item => (
                  <div
                    key={item.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <Space size={[8, 8]} wrap>
                      <Tag color={item.tone === "success" ? "success" : item.tone === "error" ? "error" : "processing"}>
                        {item.label}
                      </Tag>
                      <Typography.Text type="secondary">{item.description}</Typography.Text>
                    </Space>
                    <Typography.Text style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {formatDateTime(item.timestamp)}
                    </Typography.Text>
                  </div>
                ))
              ) : (
                <Typography.Text type="secondary">
                  {hasResolvedRetentionPolicy(detail.resolved_retention)
                    ? "已解析到生命周期策略，但基于当前邮件状态暂时无法推导后续时间点。"
                    : "当前邮件作用域未命中生命周期策略。"}
                </Typography.Text>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 20,
            paddingTop: 18,
            borderTop: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: token.colorText }}>标签与备注</div>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <div>
              <div style={{ marginBottom: 8, fontSize: 13, opacity: 0.8 }}>标签</div>
              <Select
                mode="tags"
                value={tagsDraft}
                onChange={onTagsChange}
                placeholder="每个标签输入后按回车"
                style={{ width: "100%" }}
                disabled={!canEditEmailMetadata}
                tokenSeparators={[","]}
              />
            </div>
            <div>
              <div style={{ marginBottom: 8, fontSize: 13, opacity: 0.8 }}>备注</div>
              <Input.TextArea
                rows={2}
                value={noteDraft}
                onChange={event => onNoteChange(event.target.value)}
                placeholder="为这封邮件补充处理备注或上下文"
                disabled={!canEditEmailMetadata}
              />
            </div>
            <div style={{ display: "flex", justifyContent: canEditEmailMetadata ? "flex-end" : "flex-start" }}>
              {canEditEmailMetadata ? (
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={metadataSaving}
                  onClick={onSave}
                >
                  保存
                </Button>
              ) : (
                <Typography.Text type="secondary">当前账号无权编辑元数据。</Typography.Text>
              )}
            </div>
          </Space>
        </div>
      </div>
    </Card>
  );
}
