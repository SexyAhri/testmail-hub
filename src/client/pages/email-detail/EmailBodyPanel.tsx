import {
  CopyOutlined,
  GlobalOutlined,
  InboxOutlined,
  LinkOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { Button, Card, Empty, Segmented, Space, Tag, Typography, theme } from "antd";

import type { EmailDetail } from "../../types";

type BodyMode = "html-preview" | "html-source" | "text";

const BODY_PANEL_HEIGHT = "clamp(360px, 48vh, 620px)";

interface EmailBodyPanelProps {
  bodyMode: BodyMode;
  detail: EmailDetail;
  onBodyModeChange: (value: BodyMode) => void;
  onCopyValue: (value: string, successText: string) => void;
}

export function EmailBodyPanel({
  bodyMode,
  detail,
  onBodyModeChange,
  onCopyValue,
}: EmailBodyPanelProps) {
  const { token } = theme.useToken();

  const bodyPanelStyle = {
    minHeight: BODY_PANEL_HEIGHT,
    height: BODY_PANEL_HEIGHT,
    overflow: "auto" as const,
    padding: 16,
    borderRadius: 10,
    background: "rgba(79,110,247,0.06)",
    color: token.colorText,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    fontFamily: "monospace",
  };

  return (
    <Card
      size="small"
      title="邮件正文"
      extra={(
        <Segmented<BodyMode>
          size="small"
          value={bodyMode}
          options={[
            { label: "纯文本", value: "text" },
            { label: "HTML 源码", value: "html-source" },
            { label: "HTML 预览", value: "html-preview" },
          ]}
          onChange={onBodyModeChange}
        />
      )}
      style={{ borderRadius: 12, width: "100%" }}
    >
      <div style={{ minHeight: "clamp(520px, 64vh, 820px)", display: "flex", flexDirection: "column" }}>
        <div
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 10,
            background: token.colorFillQuaternary,
          }}
        >
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <Space size={[8, 8]} wrap>
                <Tag color={detail.verification_code ? "success" : "default"} icon={<SafetyCertificateOutlined />}>
                  验证码 {detail.verification_code || "未识别"}
                </Tag>
                <Tag color={detail.extraction.platform ? "geekblue" : "default"} icon={<GlobalOutlined />}>
                  平台 {detail.extraction.platform || "未知"}
                </Tag>
                <Tag color={detail.extraction.links.length > 0 ? "cyan" : "default"} icon={<LinkOutlined />}>
                  链接 {detail.extraction.links.length}
                </Tag>
              </Space>

              {detail.verification_code ? (
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => onCopyValue(detail.verification_code || "", "验证码已复制。")}
                >
                  复制验证码
                </Button>
              ) : null}
            </div>

            {detail.extraction.primary_link ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <Typography.Text
                  style={{ flex: "1 1 280px", minWidth: 0, fontFamily: "monospace", fontSize: 12 }}
                  ellipsis={{ tooltip: detail.extraction.primary_link.url }}
                >
                  主链接：{detail.extraction.primary_link.url}
                </Typography.Text>
                <Space size={8}>
                  <Button
                    size="small"
                    type="link"
                    href={detail.extraction.primary_link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    icon={<CopyOutlined />}
                    onClick={() => onCopyValue(detail.extraction.primary_link?.url || "", "链接已复制。")}
                  >
                    复制
                  </Button>
                </Space>
              </div>
            ) : (
              <Typography.Text type="secondary">未识别到高置信度主链接。</Typography.Text>
            )}

            {detail.extraction.links.length > 1 ? (
              <Space size={[8, 8]} wrap>
                {detail.extraction.links.slice(1).map(link => (
                  <Tag key={link.url} color="blue">
                    {link.label}
                  </Tag>
                ))}
              </Space>
            ) : null}
          </Space>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          {bodyMode === "text" ? (
            <div style={bodyPanelStyle}>{detail.text_body || "（无纯文本正文）"}</div>
          ) : null}

          {bodyMode === "html-source" ? (
            <div style={bodyPanelStyle}>{detail.html_body || "（无 HTML 正文）"}</div>
          ) : null}

          {bodyMode === "html-preview" ? (
            detail.html_body ? (
              <iframe
                title="email-html-preview"
                srcDoc={detail.html_body}
                style={{
                  width: "100%",
                  height: BODY_PANEL_HEIGHT,
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 10,
                  background: "#fff",
                }}
                sandbox=""
              />
            ) : (
              <div style={{ minHeight: BODY_PANEL_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 HTML 预览。" />
              </div>
            )
          ) : null}
        </div>
      </div>
    </Card>
  );
}
