import {
  ArrowLeftOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  InboxOutlined,
  LinkOutlined,
  RollbackOutlined,
  SaveOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  theme,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  archiveEmail,
  buildAttachmentDownloadUrl,
  deleteEmail,
  getEmailDetail,
  purgeEmail,
  restoreEmail,
  unarchiveEmail,
  updateEmailMetadata,
} from "../api";
import { DataTable, MetricCard, PageHeader } from "../components";
import type { EmailAttachmentRecord, EmailDetail, RuleMatchInsight } from "../types";
import { formatDateTime, normalizeApiError } from "../utils";

interface EmailDetailPageProps {
  onUnauthorized: () => void;
}

type BodyMode = "html-preview" | "html-source" | "text";

const BODY_PANEL_HEIGHT = 220;
const BODY_PANEL_MAX_HEIGHT = 300;
const DETAIL_PAGE_MIN_HEIGHT = "calc(100vh - 170px)";
const DETAIL_TOP_CARD_MIN_HEIGHT = 360;
const DETAIL_BOTTOM_TABLE_HEIGHT = 220;

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

export default function EmailDetailPage({ onUnauthorized }: EmailDetailPageProps) {
  const navigate = useNavigate();
  const params = useParams<{ messageId: string }>();
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [bodyMode, setBodyMode] = useState<BodyMode>("text");
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [tagsDraft, setTagsDraft] = useState<string[]>([]);

  useEffect(() => {
    void loadDetail();
  }, [params.messageId]);

  async function loadDetail() {
    if (!params.messageId) return;

    setLoading(true);
    try {
      const payload = await getEmailDetail(params.messageId);
      setDetail(payload);
      setNoteDraft(payload.note || "");
      setTagsDraft(payload.tags || []);
      setBodyMode(payload.text_body ? "text" : payload.html_body ? "html-preview" : "html-source");
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyValue(value: string, successText: string) {
    try {
      await copyText(value);
      message.success(successText);
    } catch (error) {
      message.error(normalizeApiError(error, "复制失败"));
    }
  }

  async function handleMetadataSave() {
    if (!detail) return;

    setMetadataSaving(true);
    try {
      const payload = await updateEmailMetadata(detail.message_id, {
        note: noteDraft,
        tags: tagsDraft,
      });
      setDetail(payload);
      setNoteDraft(payload.note || "");
      setTagsDraft(payload.tags || []);
      message.success("邮件标签和备注已保存");
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setMetadataSaving(false);
    }
  }

  async function handleDelete() {
    if (!detail) return;

    try {
      await deleteEmail(detail.message_id);
      message.success("邮件已移入回收站");
      navigate("/trash");
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function handleRestore() {
    if (!detail) return;

    try {
      await restoreEmail(detail.message_id);
      message.success("邮件已恢复");
      await loadDetail();
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function handleArchive() {
    if (!detail) return;

    try {
      await archiveEmail(detail.message_id);
      message.success("邮件已归档");
      await loadDetail();
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function handleUnarchive() {
    if (!detail) return;

    try {
      await unarchiveEmail(detail.message_id);
      message.success("邮件已取消归档");
      await loadDetail();
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function handlePurge() {
    if (!detail) return;

    try {
      await purgeEmail(detail.message_id);
      message.success("邮件已彻底删除");
      navigate("/trash");
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  const resultColumns = useMemo<ColumnsType<RuleMatchInsight>>(
    () => [
      {
        title: "规则 ID",
        dataIndex: ["source", "rule_id"],
        key: "rule_id",
        width: 100,
        render: value => <Tag color="processing">#{value}</Tag>,
      },
      {
        title: "类型",
        dataIndex: "match_type",
        key: "match_type",
        width: 120,
        render: value => {
          const mapping: Record<string, { color: string; label: string }> = {
            generic: { color: "default", label: "普通命中" },
            login_link: { color: "blue", label: "登录链接" },
            magic_link: { color: "purple", label: "魔法链接" },
            platform_signal: { color: "geekblue", label: "平台特征" },
            reset_link: { color: "orange", label: "重置链接" },
            verification_code: { color: "green", label: "验证码" },
            verification_hint: { color: "cyan", label: "验证码线索" },
          };
          const config = mapping[String(value || "generic")] || mapping.generic;
          return <Tag color={config.color}>{config.label}</Tag>;
        },
      },
      {
        title: "置信度",
        dataIndex: "confidence",
        key: "confidence",
        width: 110,
        render: (_value, record) => {
          const color =
            record.confidence_label === "high" ? "success"
            : record.confidence_label === "medium" ? "processing"
            : "default";
          const label =
            record.confidence_label === "high" ? "高"
            : record.confidence_label === "medium" ? "中"
            : "低";
          return <Tag color={color}>{label} {record.confidence}</Tag>;
        },
      },
      {
        title: "备注",
        dataIndex: ["source", "remark"],
        key: "remark",
        render: value => value || "-",
      },
      {
        title: "命中内容",
        dataIndex: ["source", "value"],
        key: "value",
        render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
      },
      {
        title: "命中原因",
        dataIndex: "reason",
        key: "reason",
        render: value => value || "-",
      },
    ],
    [],
  );

  const attachmentColumns = useMemo<ColumnsType<EmailAttachmentRecord>>(
    () => [
      {
        title: "文件名",
        dataIndex: "filename",
        key: "filename",
        render: value => value || "附件",
      },
      {
        title: "类型",
        dataIndex: "mime_type",
        key: "mime_type",
        render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
      },
      {
        title: "大小",
        dataIndex: "size_bytes",
        key: "size_bytes",
        width: 120,
        render: value => `${Math.max(1, Math.round(value / 1024))} KB`,
      },
      {
        title: "下载",
        key: "action",
        width: 120,
        render: (_value, record) =>
          record.is_stored ? (
            <Button
              size="small"
              type="link"
              icon={<DownloadOutlined />}
              href={buildAttachmentDownloadUrl(detail!.message_id, record.id)}
            >
              下载
            </Button>
          ) : (
            <Tag>未存储</Tag>
          ),
      },
    ],
    [detail],
  );

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!detail) {
    return <Empty description="未找到邮件" />;
  }

  const infoItems = [
    { label: "发件人", value: detail.from_address },
    { label: "收件人", value: detail.to_address },
    { label: "项目", value: detail.project_name || "-" },
    { label: "环境", value: detail.environment_name || "-" },
    { label: "邮箱池", value: detail.mailbox_pool_name || "-" },
    { label: "归属邮箱", value: detail.primary_mailbox_address || "-" },
    { label: "接收时间", value: formatDateTime(detail.received_at) },
    { label: "归档时间", value: formatDateTime(detail.archived_at) },
    { label: "归档操作人", value: detail.archived_by || "-" },
    { label: "归档原因", value: detail.archive_reason || "-" },
    { label: "Message ID", value: detail.message_id },
    { label: "删除时间", value: formatDateTime(detail.deleted_at) },
  ];

  const bodyPanelStyle = {
    minHeight: BODY_PANEL_HEIGHT,
    maxHeight: BODY_PANEL_MAX_HEIGHT,
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
    <div style={{ minHeight: DETAIL_PAGE_MIN_HEIGHT, display: "flex", flexDirection: "column" }}>
      <PageHeader
        title={detail.subject || "邮件详情"}
        subtitle={`${detail.from_address} -> ${detail.to_address}`}
        extra={(
          <Space wrap>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(detail.deleted_at ? "/trash" : detail.archived_at ? "/archives" : "/emails")}
            >
              返回列表
            </Button>
            {detail.deleted_at ? (
              <>
                <Button icon={<RollbackOutlined />} onClick={() => void handleRestore()}>
                  恢复邮件
                </Button>
                <Popconfirm title="彻底删除后不可恢复，确认继续吗？" onConfirm={() => void handlePurge()}>
                  <Button danger icon={<DeleteOutlined />}>
                    彻底删除
                  </Button>
                </Popconfirm>
              </>
            ) : (
              <>
                {detail.archived_at ? (
                  <Button icon={<RollbackOutlined />} onClick={() => void handleUnarchive()}>
                    取消归档
                  </Button>
                ) : (
                  <Button icon={<InboxOutlined />} onClick={() => void handleArchive()}>
                    归档邮件
                  </Button>
                )}
                <Popconfirm title="确定将这封邮件移入回收站吗？" onConfirm={() => void handleDelete()}>
                  <Button danger icon={<DeleteOutlined />}>
                    删除邮件
                  </Button>
                </Popconfirm>
              </>
            )}
          </Space>
        )}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title="命中规则"
            value={detail.results.length}
            icon={<FileSearchOutlined />}
            percent={Math.min(100, detail.results.length * 20)}
            color="#1890ff"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title="验证码"
            value={detail.verification_code || "未识别"}
            icon={<SafetyCertificateOutlined />}
            percent={detail.verification_code ? 100 : 0}
            color="#52c41a"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title="识别平台"
            value={detail.extraction.platform || "未识别"}
            icon={<GlobalOutlined />}
            percent={detail.extraction.platform ? 100 : 0}
            color="#fa8c16"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title={detail.archived_at ? "当前状态" : "提取链接"}
            value={detail.archived_at ? "已归档" : detail.extraction.links.length}
            icon={detail.archived_at ? <InboxOutlined /> : <LinkOutlined />}
            percent={detail.archived_at ? 100 : Math.min(100, detail.extraction.links.length * 20)}
            color={detail.archived_at ? "#0f766e" : "#722ed1"}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={12} style={{ display: "flex" }}>
          <Card size="small" style={{ borderRadius: 12, width: "100%" }}>
            <div style={{ display: "flex", flexDirection: "column", minHeight: DETAIL_TOP_CARD_MIN_HEIGHT }}>
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
                      onChange={value => setTagsDraft(value)}
                      placeholder="输入后回车，可添加多个标签"
                      style={{ width: "100%" }}
                      tokenSeparators={[","]}
                    />
                  </div>
                  <div>
                    <div style={{ marginBottom: 8, fontSize: 13, opacity: 0.8 }}>备注</div>
                    <Input.TextArea
                      rows={2}
                      value={noteDraft}
                      onChange={event => setNoteDraft(event.target.value)}
                      placeholder="补充这封邮件的用途、来源或处理说明"
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={metadataSaving}
                      onClick={() => void handleMetadataSave()}
                    >
                      保存
                    </Button>
                  </div>
                </Space>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} xl={12} style={{ display: "flex" }}>
          <Card
            size="small"
            title="邮件正文"
            extra={(
              <Segmented<BodyMode>
                size="small"
                value={bodyMode}
                options={[
                  { label: "文本正文", value: "text" },
                  { label: "HTML 源码", value: "html-source" },
                  { label: "HTML 预览", value: "html-preview" },
                ]}
                onChange={value => setBodyMode(value)}
              />
            )}
            style={{ borderRadius: 12, width: "100%" }}
          >
            <div style={{ minHeight: DETAIL_TOP_CARD_MIN_HEIGHT, display: "flex", flexDirection: "column" }}>
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
                        平台 {detail.extraction.platform || "未识别"}
                      </Tag>
                      <Tag color={detail.extraction.links.length > 0 ? "cyan" : "default"} icon={<LinkOutlined />}>
                        链接 {detail.extraction.links.length}
                      </Tag>
                    </Space>

                    {detail.verification_code ? (
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => void handleCopyValue(detail.verification_code || "", "验证码已复制")}
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
                        主链接: {detail.extraction.primary_link.url}
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
                          onClick={() => void handleCopyValue(detail.extraction.primary_link?.url || "", "链接已复制")}
                        >
                          复制
                        </Button>
                      </Space>
                    </div>
                  ) : (
                    <Typography.Text type="secondary">未识别到高置信链接</Typography.Text>
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

              <div style={{ flex: 1 }}>
                {bodyMode === "text" ? (
                  <div style={bodyPanelStyle}>{detail.text_body || "(无文本正文)"}</div>
                ) : null}

                {bodyMode === "html-source" ? (
                  <div style={bodyPanelStyle}>{detail.html_body || "(无 HTML 正文)"}</div>
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
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可预览的 HTML 正文" />
                    </div>
                  )
                ) : null}
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16, flex: 1, minHeight: 0 }} align="stretch">
        <Col xs={24} lg={12} style={{ display: "flex", minHeight: 0 }}>
          <DataTable<RuleMatchInsight>
            cardTitle="规则命中"
            columns={resultColumns}
            dataSource={detail.result_insights}
            rowKey={record => `${record.source.rule_id}-${record.source.value}-${record.match_type}`}
            showPagination={false}
            style={{ width: "100%", height: "100%" }}
            scroll={{ x: "max-content", y: DETAIL_BOTTOM_TABLE_HEIGHT }}
          />
        </Col>

        <Col xs={24} lg={12} style={{ display: "flex", minHeight: 0 }}>
          <DataTable<EmailAttachmentRecord>
            cardTitle="附件列表"
            columns={attachmentColumns}
            dataSource={detail.attachments}
            rowKey="id"
            showPagination={false}
            style={{ width: "100%", height: "100%" }}
            scroll={{ x: "max-content", y: DETAIL_BOTTOM_TABLE_HEIGHT }}
          />
        </Col>
      </Row>
    </div>
  );
}
