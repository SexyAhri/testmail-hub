import {
  ArrowLeftOutlined,
  DeleteOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  InboxOutlined,
  LinkOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { Alert, App, Button, Col, Empty, Row, Space, Spin } from "antd";
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
} from "../../api/emails";
import { DataTable, MetricCard, PageHeader } from "../../components";
import { promptOperationNote } from "../../delete-operation-note";
import {
  canDeleteEmails,
  canRestoreEmails,
  canWriteEmails,
  isReadOnlyUser,
  type CurrentUser,
} from "../../permissions";
import type { EmailAttachmentRecord, EmailDetail, RuleMatchInsight } from "../../types";
import { copyText, normalizeApiError } from "../../utils";
import { EmailBodyPanel } from "./EmailBodyPanel";
import { buildAttachmentColumns, buildResultColumns } from "./email-detail-table-columns";
import { EmailInfoPanel } from "./EmailInfoPanel";

interface EmailDetailPageProps {
  currentUser?: CurrentUser;
  onUnauthorized: () => void;
}

type BodyMode = "html-preview" | "html-source" | "text";

const DETAIL_PAGE_MIN_HEIGHT = "calc(100vh - 170px)";
const DETAIL_BOTTOM_TABLE_HEIGHT = 220;

export default function EmailDetailPage({ currentUser, onUnauthorized }: EmailDetailPageProps) {
  const navigate = useNavigate();
  const params = useParams<{ messageId: string }>();
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [bodyMode, setBodyMode] = useState<BodyMode>("text");
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [tagsDraft, setTagsDraft] = useState<string[]>([]);
  const canEditEmailMetadata = canWriteEmails(currentUser);
  const canArchiveEmail = canWriteEmails(currentUser);
  const canDeleteEmailRecord = canDeleteEmails(currentUser);
  const canRestoreEmailRecord = canRestoreEmails(currentUser);
  const canManageEmailActions = canEditEmailMetadata || canArchiveEmail || canDeleteEmailRecord || canRestoreEmailRecord;
  const isReadOnly = isReadOnlyUser(currentUser);

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
    if (!canEditEmailMetadata || !detail) return;

    setMetadataSaving(true);
    try {
      const payload = await updateEmailMetadata(detail.message_id, {
        note: noteDraft,
        tags: tagsDraft,
      });
      setDetail(payload);
      setNoteDraft(payload.note || "");
      setTagsDraft(payload.tags || []);
      message.success("邮件标签和备注已保存。");
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
    if (!canDeleteEmailRecord || !detail) return;

    const operationNote = await promptOperationNote(modal, {
      title: "删除邮件",
      description: `将把 ${detail.subject || detail.message_id} 移入回收站。可选填写本次删除备注，便于后续审计追溯。`,
      okText: "确认删除",
    });
    if (operationNote === null) return;

    try {
      await deleteEmail(detail.message_id, { operation_note: operationNote });
      message.success("邮件已移入回收站。");
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
    if (!canRestoreEmailRecord || !detail) return;

    try {
      await restoreEmail(detail.message_id);
      message.success("邮件已恢复。");
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
    if (!canArchiveEmail || !detail) return;

    try {
      await archiveEmail(detail.message_id);
      message.success("邮件已归档。");
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
    if (!canRestoreEmailRecord || !detail) return;

    try {
      await unarchiveEmail(detail.message_id);
      message.success("邮件已取消归档。");
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
    if (!canDeleteEmailRecord || !detail) return;

    const operationNote = await promptOperationNote(modal, {
      title: "永久删除邮件",
      description: `将永久删除 ${detail.subject || detail.message_id}，此操作不可恢复。可选填写本次删除备注，便于后续审计追溯。`,
      okText: "确认永久删除",
    });
    if (operationNote === null) return;

    try {
      await purgeEmail(detail.message_id, { operation_note: operationNote });
      message.success("邮件已永久删除。");
      navigate("/trash");
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  const resultColumns = useMemo(() => buildResultColumns(), []);
  const attachmentColumns = useMemo(
    () =>
      detail
        ? buildAttachmentColumns(detail.message_id, buildAttachmentDownloadUrl)
        : ([] as never),
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
    return <Empty description="未找到邮件。" />;
  }

  return (
    <div style={{ minHeight: DETAIL_PAGE_MIN_HEIGHT, display: "flex", flexDirection: "column" }}>
      <PageHeader
        title={detail.subject || "邮件详情"}
        subtitle={`来自 ${detail.from_address}，发送到 ${detail.to_address}`}
        extra={(
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(detail.deleted_at ? "/trash" : detail.archived_at ? "/archives" : "/emails")}
          >
            返回
          </Button>
        )}
      />

      {!canManageEmailActions ? (
        <Alert
          showIcon
          type="info"
          message={isReadOnly ? "当前账号在详情页为只读。" : "当前账号无法在详情页修改这封邮件。"}
          description="你仍可查看正文、附件、提取结果和生命周期信息，但保存、归档、恢复和删除操作已禁用。"
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title="规则命中"
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
            title="平台"
            value={detail.extraction.platform || "未知"}
            icon={<GlobalOutlined />}
            percent={detail.extraction.platform ? 100 : 0}
            color="#fa8c16"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title={detail.archived_at ? "状态" : "链接数"}
            value={detail.archived_at ? "已归档" : detail.extraction.links.length}
            icon={detail.archived_at ? <InboxOutlined /> : <LinkOutlined />}
            percent={detail.archived_at ? 100 : Math.min(100, detail.extraction.links.length * 20)}
            color={detail.archived_at ? "#0f766e" : "#722ed1"}
          />
        </Col>
      </Row>

      <div style={{ marginTop: 16 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={12} style={{ display: "flex" }}>
            <EmailInfoPanel
              canEditEmailMetadata={canEditEmailMetadata}
              detail={detail}
              metadataSaving={metadataSaving}
              noteDraft={noteDraft}
              onNoteChange={setNoteDraft}
              onSave={() => void handleMetadataSave()}
              onTagsChange={setTagsDraft}
              tagsDraft={tagsDraft}
            />
          </Col>

          <Col xs={24} xl={12} style={{ display: "flex" }}>
            <EmailBodyPanel
              bodyMode={bodyMode}
              detail={detail}
              onBodyModeChange={setBodyMode}
              onCopyValue={(value, successText) => void handleCopyValue(value, successText)}
            />
          </Col>
        </Row>
      </div>

      <div style={{ marginTop: 16 }}>
        <Space wrap>
          {detail.deleted_at ? (
            <>
              {canRestoreEmailRecord ? (
                <Button icon={<RollbackOutlined />} onClick={() => void handleRestore()}>
                  恢复
                </Button>
              ) : null}
              {canDeleteEmailRecord ? (
                <Button danger icon={<DeleteOutlined />} onClick={() => void handlePurge()}>
                  彻底删除
                </Button>
              ) : null}
            </>
          ) : (
            <>
              {detail.archived_at && canRestoreEmailRecord ? (
                <Button icon={<RollbackOutlined />} onClick={() => void handleUnarchive()}>
                  取消归档
                </Button>
              ) : null}
              {!detail.archived_at && canArchiveEmail ? (
                <Button icon={<InboxOutlined />} onClick={() => void handleArchive()}>
                  归档
                </Button>
              ) : null}
              {canDeleteEmailRecord ? (
                <Button danger icon={<DeleteOutlined />} onClick={() => void handleDelete()}>
                  删除
                </Button>
              ) : null}
            </>
          )}
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginTop: 16, flex: 1, minHeight: 0 }} align="stretch">
        <Col xs={24} lg={12} style={{ display: "flex", minHeight: 0 }}>
          <DataTable<RuleMatchInsight>
            cardTitle="规则洞察"
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
            cardTitle="附件"
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
