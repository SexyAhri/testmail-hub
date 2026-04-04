import {
  ReloadOutlined,
  SendOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Form,
  Space,
  Tabs,
} from "antd";
import { useDeferredValue, useEffect, useMemo, useState, type ChangeEvent } from "react";

import {
  createOutboundContact,
  createOutboundEmail,
  createOutboundTemplate,
  deleteOutboundEmail,
  getOutboundContacts,
  getOutboundEmailDetail,
  getOutboundEmailsPaged,
  getOutboundSettings,
  getOutboundStats,
  getOutboundTemplates,
  removeOutboundContact,
  removeOutboundTemplate,
  sendStoredOutboundEmail,
  updateOutboundContact,
  updateOutboundEmail,
  updateOutboundSettings,
  updateOutboundTemplate,
} from "../../api/outbound";
import { PageHeader } from "../../components";
import { promptDeleteOperationNote as promptSharedDeleteOperationNote } from "../../delete-operation-note";
import { usePageFeedback } from "../../hooks/usePageFeedback";
import { useTableSelection } from "../../hooks/useTableSelection";
import {
  canManageGlobalSettings,
  canWriteAnyResource,
  isProjectScopedUser,
  isReadOnlyUser,
  type CurrentUser,
} from "../../permissions";
import type {
  OutboundContactRecord,
  OutboundEmailAttachmentPayload,
  OutboundEmailRecord,
  OutboundEmailSettings,
  OutboundEmailSettingsPayload,
  OutboundStats,
  OutboundTemplateRecord,
} from "../../types";
import { fileToBase64, runBatchAction } from "../../utils";
import {
  MAX_OUTBOUND_ATTACHMENTS,
  MAX_OUTBOUND_ATTACHMENT_TOTAL_BYTES,
} from "../../../utils/constants";
import { ComposeEmailDrawer } from "./ComposeEmailDrawer";
import { OutboundContactDrawer } from "./OutboundContactDrawer";
import { OutboundContactsTable } from "./OutboundContactsTable";
import { OutboundEmailDetailDrawer } from "./OutboundEmailDetailDrawer";
import { OutboundEmailsTable } from "./OutboundEmailsTable";
import { OutboundMetrics } from "./OutboundMetrics";
import { OutboundOverviewPanel } from "./OutboundOverviewPanel";
import { OutboundSettingsDrawer } from "./OutboundSettingsDrawer";
import { OutboundStatsPanels } from "./OutboundStatsPanels";
import { OutboundTemplateDrawer } from "./OutboundTemplateDrawer";
import { OutboundTemplatesTable } from "./OutboundTemplatesTable";
import {
  buildContactColumns,
  buildEmailColumns,
  buildTemplateColumns,
} from "./outbound-table-columns";
import {
  DRAFT_STATUSES,
  INITIAL_SETTINGS,
  INITIAL_STATS,
  RECORD_STATUSES,
  STATUS_TAGS,
  buildCompactSettingsItems,
  buildComposeDefaults,
  buildComposePayload,
  buildComposeValuesFromRecord,
  buildContactPayload,
  buildTemplatePayload,
  buildTrendSeries,
  getSendActionText,
  isFormError,
  normalizeAttachment,
  downloadOutboundAttachment,
  planOutboundAttachmentSelection,
  parseTemplateVariables,
  renderTemplateString,
  type ComposeFormValues,
  type ContactFormValues,
  type OutboundEmailStatus,
  type TemplateFormValues,
} from "./outbound-utils";

interface OutboundEmailsPageProps {
  currentUser?: CurrentUser;
  onUnauthorized: () => void;
}

type OutboundTabKey = "contacts" | "drafts" | "records" | "stats" | "templates";

export default function OutboundEmailsPage({ currentUser, onUnauthorized }: OutboundEmailsPageProps) {
  const { message, modal } = App.useApp();
  const [composeForm] = Form.useForm<ComposeFormValues>();
  const [settingsForm] = Form.useForm<OutboundEmailSettingsPayload>();
  const [templateForm] = Form.useForm<TemplateFormValues>();
  const [contactForm] = Form.useForm<ContactFormValues>();

  const [activeTab, setActiveTab] = useState<OutboundTabKey>("records");
  const [emails, setEmails] = useState<OutboundEmailRecord[]>([]);
  const [emailTotal, setEmailTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const deferredKeyword = useDeferredValue(keyword.trim());
  const [recordStatuses, setRecordStatuses] = useState<OutboundEmailStatus[]>(RECORD_STATUSES);
  const [draftStatuses, setDraftStatuses] = useState<OutboundEmailStatus[]>(DRAFT_STATUSES);

  const [settings, setSettings] = useState<OutboundEmailSettings>(INITIAL_SETTINGS);
  const [stats, setStats] = useState<OutboundStats>(INITIAL_STATS);
  const [templates, setTemplates] = useState<OutboundTemplateRecord[]>([]);
  const [contacts, setContacts] = useState<OutboundContactRecord[]>([]);

  const [loadingBase, setLoadingBase] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [composeSubmitting, setComposeSubmitting] = useState<"draft" | "send" | null>(null);
  const [settingsSubmitting, setSettingsSubmitting] = useState(false);
  const [templateSubmitting, setTemplateSubmitting] = useState(false);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [attachmentLoading, setAttachmentLoading] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const [composeAttachments, setComposeAttachments] = useState<OutboundEmailAttachmentPayload[]>([]);
  const [editingEmail, setEditingEmail] = useState<OutboundEmailRecord | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<OutboundTemplateRecord | null>(null);
  const [editingContact, setEditingContact] = useState<OutboundContactRecord | null>(null);
  const [detailRecord, setDetailRecord] = useState<OutboundEmailRecord | null>(null);
  const {
    clearSelection: clearSelectedEmails,
    rowSelection: emailRowSelection,
    selectedItems: selectedEmails,
  } = useTableSelection(emails, "id");
  const {
    clearSelection: clearSelectedTemplates,
    rowSelection: templateRowSelection,
    selectedItems: selectedTemplates,
  } = useTableSelection(templates, "id");
  const {
    clearSelection: clearSelectedContacts,
    rowSelection: contactRowSelection,
    selectedItems: selectedContacts,
  } = useTableSelection(contacts, "id");
  const { handlePageError, notifyBatchActionResult } = usePageFeedback(onUnauthorized);

  const activeStatuses = activeTab === "records" ? recordStatuses : draftStatuses;
  const activeStatusKey = activeStatuses.join(",");
  const composeSchedule = Form.useWatch("scheduled_at", composeForm);
  const canWriteOutbound = canWriteAnyResource(currentUser);
  const canManageOutboundSettings = canManageGlobalSettings(currentUser);
  const isReadOnly = isReadOnlyUser(currentUser);
  const isProjectScoped = isProjectScopedUser(currentUser);

  const contactOptions = useMemo(
    () =>
      contacts.map(item => ({
        label: `${item.name} <${item.email}>`,
        value: item.email,
      })),
    [contacts],
  );
  const emailTableRowSelection = canWriteOutbound ? emailRowSelection : undefined;
  const templateTableRowSelection = canWriteOutbound ? templateRowSelection : undefined;
  const contactTableRowSelection = canWriteOutbound ? contactRowSelection : undefined;
  const selectedHasSendable = selectedEmails.some(item => item.status !== "sent" && item.status !== "sending");

  const statsSentSeries = useMemo(() => buildTrendSeries(stats.recent_daily, "sent"), [stats.recent_daily]);
  const statsFailedSeries = useMemo(() => buildTrendSeries(stats.recent_daily, "failed"), [stats.recent_daily]);
  const statsScheduledSeries = useMemo(() => buildTrendSeries(stats.recent_daily, "scheduled"), [stats.recent_daily]);
  const topDomainSeries = useMemo(
    () => stats.top_recipient_domains.map(item => ({ time: item.label, value: item.value })),
    [stats.top_recipient_domains],
  );

  useEffect(() => {
    void loadBaseData();
  }, []);

  useEffect(() => {
    void loadEmails();
  }, [page, deferredKeyword, activeTab, activeStatusKey]);

  function handleRequestError(error: unknown, fallback = "请求失败") {
    if (isFormError(error)) return;
    handlePageError(error, { fallback });
  }

  async function loadBaseData() {
    setLoadingBase(true);
    try {
      const [nextSettings, nextStats, nextTemplates, nextContacts] = await Promise.all([
        getOutboundSettings(),
        getOutboundStats(),
        getOutboundTemplates(),
        getOutboundContacts(),
      ]);
      setSettings(nextSettings);
      setStats(nextStats);
      setTemplates(nextTemplates);
      setContacts(nextContacts);
    } catch (error) {
      handleRequestError(error);
    } finally {
      setLoadingBase(false);
    }
  }

  async function loadEmails(targetPage = page) {
    setLoadingList(true);
    try {
      const params = new URLSearchParams({ page: String(targetPage) });
      if (deferredKeyword) params.set("keyword", deferredKeyword);
      if (activeStatuses.length > 0) params.set("status", activeStatuses.join(","));
      const payload = await getOutboundEmailsPaged(params);
      setEmails(payload.items);
      setEmailTotal(payload.total);
      setPage(payload.page);
    } catch (error) {
      handleRequestError(error);
    } finally {
      setLoadingList(false);
    }
  }

  function openCompose(defaults?: Partial<ComposeFormValues>) {
    setEditingEmail(null);
    setComposeAttachments([]);
    composeForm.setFieldsValue({ ...buildComposeDefaults(settings), ...defaults });
    setComposeOpen(true);
  }

  async function openEditEmail(record: OutboundEmailRecord) {
    setDetailLoading(true);
    try {
      const detail = await getOutboundEmailDetail(record.id);
      setEditingEmail(detail);
      setComposeAttachments(normalizeAttachment(detail));
      composeForm.setFieldsValue(buildComposeValuesFromRecord(detail));
      setComposeOpen(true);
    } catch (error) {
      handleRequestError(error);
    } finally {
      setDetailLoading(false);
    }
  }

  async function openEmailDetail(record: OutboundEmailRecord) {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      setDetailRecord(await getOutboundEmailDetail(record.id));
    } catch (error) {
      setDetailOpen(false);
      handleRequestError(error);
    } finally {
      setDetailLoading(false);
    }
  }

  function openSettingsDrawer() {
    settingsForm.setFieldsValue({
      allow_external_recipients: settings.allow_external_recipients,
      default_from_address: settings.default_from_address,
      default_from_name: settings.default_from_name,
      default_reply_to: settings.default_reply_to,
    });
    setSettingsOpen(true);
  }

  function openTemplateDrawer(template?: OutboundTemplateRecord) {
    setEditingTemplate(template || null);
    templateForm.setFieldsValue({
      html_template: template?.html_template || "",
      is_enabled: template?.is_enabled ?? true,
      name: template?.name || "",
      operation_note: "",
      subject_template: template?.subject_template || "",
      text_template: template?.text_template || "",
      variables: template?.variables.join(", ") || "",
    });
    setTemplateOpen(true);
  }

  function openContactDrawer(contact?: OutboundContactRecord) {
    setEditingContact(contact || null);
    contactForm.setFieldsValue({
      email: contact?.email || "",
      is_favorite: contact?.is_favorite ?? true,
      name: contact?.name || "",
      note: contact?.note || "",
      operation_note: "",
      tags: contact?.tags.join(", ") || "",
    });
    setContactOpen(true);
  }

  function handleApplyTemplate() {
    const templateId = composeForm.getFieldValue("template_id");
    const template = templates.find(item => item.id === templateId);
    if (!template) {
      message.warning("请先选择一个模板");
      return;
    }

    const variables = parseTemplateVariables(composeForm.getFieldValue("template_variables") || "{}");
    composeForm.setFieldsValue({
      html_body: renderTemplateString(template.html_template, variables),
      subject: renderTemplateString(template.subject_template, variables),
      text_body: renderTemplateString(template.text_template, variables),
    });
    message.success("模板内容已套用");
  }

  async function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const attachmentPlan = planOutboundAttachmentSelection(composeAttachments, files);
    const acceptedFiles = attachmentPlan.acceptedIndexes.map(index => files[index]);
    const rejectedByCount = attachmentPlan.rejected.filter(item => item.reason === "count").length;
    const rejectedBySize = attachmentPlan.rejected.filter(item => item.reason === "size").length;

    if (acceptedFiles.length === 0) {
      const rejectMessages = [
        rejectedByCount > 0 ? `attachment count cannot exceed ${MAX_OUTBOUND_ATTACHMENTS}` : "",
        rejectedBySize > 0 ? `attachment total size cannot exceed ${(MAX_OUTBOUND_ATTACHMENT_TOTAL_BYTES / (1024 * 1024)).toFixed(0)} MB` : "",
      ].filter(Boolean);
      message.warning(rejectMessages.join("; "));
      event.target.value = "";
      return;
    }

    setAttachmentLoading(true);
    try {
      const attachments = await Promise.all(
        acceptedFiles.map(async file => ({
          content_base64: await fileToBase64(file),
          content_type: file.type || "application/octet-stream",
          filename: file.name,
          size_bytes: file.size,
        })),
      );
      setComposeAttachments(current => [...current, ...attachments]);
      if (attachmentPlan.rejected.length > 0) {
        const rejectMessages = [
          rejectedByCount > 0 ? `${rejectedByCount} skipped because the attachment count limit was reached` : "",
          rejectedBySize > 0 ? `${rejectedBySize} skipped because the total attachment size would exceed ${(MAX_OUTBOUND_ATTACHMENT_TOTAL_BYTES / (1024 * 1024)).toFixed(0)} MB` : "",
        ].filter(Boolean);
        message.warning(`added ${attachments.length} attachment(s); ${rejectMessages.join("; ")}`);
        return;
      }
      message.success(`已添加 ${attachments.length} 个附件`);
    } catch (error) {
      handleRequestError(error, "附件读取失败");
    } finally {
      event.target.value = "";
      setAttachmentLoading(false);
    }
  }

  async function handleComposeSubmit(mode: "draft" | "send") {
    setComposeSubmitting(mode);
    try {
      const values = await composeForm.validateFields();
      const payload = buildComposePayload(values, composeAttachments, mode);

      if (editingEmail) {
        await updateOutboundEmail(editingEmail.id, payload);
      } else {
        await createOutboundEmail(payload);
      }

      setComposeOpen(false);
      setEditingEmail(null);
      setComposeAttachments([]);
      await Promise.all([loadBaseData(), loadEmails()]);

      const actionText =
        mode === "draft" ? "草稿已保存"
        : payload.scheduled_at && payload.scheduled_at > Date.now() ? "邮件已加入计划发送"
        : "邮件已提交发送";
      message.success(actionText);
    } catch (error) {
      handleRequestError(error);
    } finally {
      setComposeSubmitting(null);
    }
  }

  async function handleSendStored(record: OutboundEmailRecord) {
    try {
      await sendStoredOutboundEmail(record.id);
      await Promise.all([loadBaseData(), loadEmails()]);
      message.success("邮件已重新提交发送");
    } catch (error) {
      handleRequestError(error);
    }
  }


  async function handleDeleteEmail(record: OutboundEmailRecord) {
    const operationNote = await promptSharedDeleteOperationNote(modal, {

      title: "删除发信记录",

      description: `将删除 ${record.subject || `发信记录 #${record.id}`}。可选填写本次删除备注，便于后续审计追溯。`,

      okText: "确认删除",

    });
    if (operationNote === null) return;

    try {
      await deleteOutboundEmail(record.id, { operation_note: operationNote });
      if (emails.length === 1 && page > 1) {
        setPage(current => current - 1);
      } else {
        await loadEmails();
      }
      await loadBaseData();
      message.success("邮件记录已删除");
    } catch (error) {
      handleRequestError(error);
    }
  }

  async function handleSettingsSubmit() {
    setSettingsSubmitting(true);
    try {
      const values = await settingsForm.validateFields();
      const next = await updateOutboundSettings(values);
      setSettings(next);
      setSettingsOpen(false);
      message.success("发件设置已保存");
    } catch (error) {
      handleRequestError(error);
    } finally {
      setSettingsSubmitting(false);
    }
  }

  async function handleTemplateSubmit() {
    setTemplateSubmitting(true);
    try {
      const values = await templateForm.validateFields();
      const payload = buildTemplatePayload(values);

      if (editingTemplate) {
        await updateOutboundTemplate(editingTemplate.id, payload);
      } else {
        await createOutboundTemplate(payload);
      }

      setTemplateOpen(false);
      setEditingTemplate(null);
      setTemplates(await getOutboundTemplates());
      message.success(editingTemplate ? "模板已更新" : "模板已创建");
    } catch (error) {
      handleRequestError(error);
    } finally {
      setTemplateSubmitting(false);
    }
  }

  async function handleDeleteTemplate(record: OutboundTemplateRecord) {
    const operationNote = await promptSharedDeleteOperationNote(modal, {

      title: "删除模板",

      description: `将删除 ${record.name || `模板 #${record.id}`}。可选填写本次删除备注，便于后续审计追溯。`,

      okText: "确认删除",

    });
    if (operationNote === null) return;

    try {
      await removeOutboundTemplate(record.id, { operation_note: operationNote });
      setTemplates(await getOutboundTemplates());
      message.success("模板已删除");
    } catch (error) {
      handleRequestError(error);
    }
  }

  async function handleContactSubmit() {
    setContactSubmitting(true);
    try {
      const values = await contactForm.validateFields();
      const payload = buildContactPayload(values);

      if (editingContact) {
        await updateOutboundContact(editingContact.id, payload);
      } else {
        await createOutboundContact(payload);
      }

      setContactOpen(false);
      setEditingContact(null);
      setContacts(await getOutboundContacts());
      message.success(editingContact ? "联系人已更新" : "联系人已创建");
    } catch (error) {
      handleRequestError(error);
    } finally {
      setContactSubmitting(false);
    }
  }

  async function handleDeleteContact(record: OutboundContactRecord) {
    const operationNote = await promptSharedDeleteOperationNote(modal, {

      title: "删除联系人",

      description: `将删除 ${record.name || record.email || `联系人 #${record.id}`}。可选填写本次删除备注，便于后续审计追溯。`,

      okText: "确认删除",

    });
    if (operationNote === null) return;

    try {
      await removeOutboundContact(record.id, { operation_note: operationNote });
      setContacts(await getOutboundContacts());
      message.success("联系人已删除");
    } catch (error) {
      handleRequestError(error);
    }
  }

  async function handleBatchSendEmails() {
    const sendableItems = selectedEmails.filter(item => item.status !== "sent" && item.status !== "sending");
    const result = await runBatchAction(sendableItems, item => sendStoredOutboundEmail(item.id));

    if (result.successCount > 0) {
      clearSelectedEmails();
      await Promise.all([loadBaseData(), loadEmails()]);
    }

    notifyBatchActionResult("批量发送邮件", result);
  }

  async function handleBatchDeleteEmails() {
    const operationNote = await promptSharedDeleteOperationNote(modal, {

      title: "批量删除发信记录",

      description: `将删除 ${selectedEmails.length} 条发信记录。填写的备注会写入每条记录的审计日志。`,

      okText: "确认批量删除",

    });
    if (operationNote === null) return;

    const result = await runBatchAction(
      selectedEmails,
      item => deleteOutboundEmail(item.id, { operation_note: operationNote }),
    );
    if (result.successCount > 0) {
      clearSelectedEmails();
      await Promise.all([loadBaseData(), loadEmails()]);
    }

    notifyBatchActionResult("批量删除邮件", result);
  }

  async function handleBatchToggleTemplates(is_enabled: boolean) {
    const result = await runBatchAction(selectedTemplates, item => updateOutboundTemplate(item.id, {
      html_template: item.html_template,
      is_enabled,
      name: item.name,
      subject_template: item.subject_template,
      text_template: item.text_template,
      variables: item.variables,
    }));

    if (result.successCount > 0) {
      clearSelectedTemplates();
      setTemplates(await getOutboundTemplates());
    }

    notifyBatchActionResult(is_enabled ? "批量启用模板" : "批量停用模板", result);
  }

  async function handleBatchDeleteTemplates() {
    const operationNote = await promptSharedDeleteOperationNote(modal, {

      title: "批量删除模板",

      description: `将删除 ${selectedTemplates.length} 个模板。填写的备注会写入每条模板的审计日志。`,

      okText: "确认批量删除",

    });
    if (operationNote === null) return;

    const result = await runBatchAction(
      selectedTemplates,
      item => removeOutboundTemplate(item.id, { operation_note: operationNote }),
    );
    if (result.successCount > 0) {
      clearSelectedTemplates();
      setTemplates(await getOutboundTemplates());
    }

    notifyBatchActionResult("批量删除模板", result);
  }

  async function handleBatchFavoriteContacts(is_favorite: boolean) {
    const result = await runBatchAction(selectedContacts, item => updateOutboundContact(item.id, {
      email: item.email,
      is_favorite,
      name: item.name,
      note: item.note,
      tags: item.tags,
    }));

    if (result.successCount > 0) {
      clearSelectedContacts();
      setContacts(await getOutboundContacts());
    }

    notifyBatchActionResult(is_favorite ? "批量收藏联系人" : "批量取消收藏联系人", result);
  }

  async function handleBatchDeleteContacts() {
    const operationNote = await promptSharedDeleteOperationNote(modal, {

      title: "批量删除联系人",

      description: `将删除 ${selectedContacts.length} 个联系人。填写的备注会写入每条联系人的审计日志。`,

      okText: "确认批量删除",

    });
    if (operationNote === null) return;

    const result = await runBatchAction(
      selectedContacts,
      item => removeOutboundContact(item.id, { operation_note: operationNote }),
    );
    if (result.successCount > 0) {
      clearSelectedContacts();
      setContacts(await getOutboundContacts());
    }

    notifyBatchActionResult("批量删除联系人", result);
  }

  function changeStatusFilter(values: OutboundEmailStatus[]) {
    setPage(1);
    if (activeTab === "records") {
      setRecordStatuses(values.length > 0 ? values : RECORD_STATUSES);
      return;
    }
    setDraftStatuses(values.length > 0 ? values : DRAFT_STATUSES);
  }

  const currentStatusOptions = useMemo(
    () => (activeTab === "records" ? RECORD_STATUSES : DRAFT_STATUSES).map(item => ({
      label: STATUS_TAGS[item].label,
      value: item,
    })),
    [activeTab],
  );

  const emailColumns = useMemo(
    () =>
      buildEmailColumns({
        activeTab: activeTab === "drafts" ? "drafts" : "records",
        canWriteOutbound,
        onDelete: record => {
          void handleDeleteEmail(record);
        },
        onEdit: record => {
          void openEditEmail(record);
        },
        onSend: record => {
          void handleSendStored(record);
        },
        onView: record => {
          void openEmailDetail(record);
        },
      }),
    [activeTab, canWriteOutbound],
  );

  const templateColumns = useMemo(
    () =>
      buildTemplateColumns({
        canWriteOutbound,
        onDelete: record => {
          void handleDeleteTemplate(record);
        },
        onEdit: record => openTemplateDrawer(record),
        onWriteEmail: defaults => openCompose(defaults),
      }),
    [canWriteOutbound],
  );

  const contactColumns = useMemo(
    () =>
      buildContactColumns({
        canWriteOutbound,
        onDelete: record => {
          void handleDeleteContact(record);
        },
        onEdit: record => openContactDrawer(record),
        onQuickCompose: defaults => openCompose(defaults),
      }),
    [canWriteOutbound],
  );

  const compactSettingsItems = useMemo(() => buildCompactSettingsItems(settings), [settings]);
  const showOverviewSection = activeTab === "records" || activeTab === "drafts";
  const sendActionText = useMemo(() => getSendActionText(composeSchedule), [composeSchedule]);

  return (
    <div>
      <PageHeader
        title="发信中心"
        subtitle="统一管理外发邮件、草稿、计划任务、模板、联系人与发送统计"
        extra={(
          <Space wrap>
            {!isReadOnly ? (
              <Button icon={<SettingOutlined />} disabled={!canManageOutboundSettings} onClick={openSettingsDrawer}>
                发件设置
              </Button>
            ) : null}
            <Button icon={<ReloadOutlined />} loading={loadingBase} onClick={() => void Promise.all([loadBaseData(), loadEmails()])}>
              刷新
            </Button>
            {canWriteOutbound ? (
              <Button type="primary" icon={<SendOutlined />} onClick={() => openCompose()}>
                立即写信
              </Button>
            ) : null}
          </Space>
        )}
        tags={[
          { color: settings.api_key_configured ? "success" : "error", label: settings.api_key_configured ? "Resend 已连接" : "Resend 未配置" },
          { color: settings.allow_external_recipients ? "processing" : "default", label: settings.allow_external_recipients ? "允许外部收件人" : "仅域内发信" },
          { color: "blue", label: settings.from_domain || "未配置发信域名" },
          ...(isReadOnly ? [{ color: "gold", label: "只读视角" }] : []),
          ...(!isReadOnly && isProjectScoped ? [{ color: "gold", label: "项目级视角" }] : []),
        ]}
      />

      {isReadOnly ? (
        <Alert
          showIcon
          type="info"
          message="当前账号为发信只读视角"
          description="你可以查看发送记录、模板、联系人和统计数据，但发信、编辑、删除和批量操作入口已关闭。"
          style={{ marginBottom: 16 }}
        />
      ) : isProjectScoped ? (
        <Alert
          showIcon
          type="info"
          message="当前账号为项目级发信视角"
          description="你可以继续发信和管理模板/联系人，但“发件设置”属于全局配置，当前只提供查看，不支持修改。"
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <OutboundMetrics
        totalDrafts={stats.total_drafts}
        totalFailed={stats.total_failed}
        totalScheduled={stats.total_scheduled}
        totalSent={stats.total_sent}
      />

      {showOverviewSection ? (
        <OutboundOverviewPanel
          compactSettingsItems={compactSettingsItems}
          sentSeries={statsSentSeries}
        />
      ) : null}

      <Tabs
        activeKey={activeTab}
        onChange={key => {
          setActiveTab(key as OutboundTabKey);
          setPage(1);
        }}
        items={[
          {
            key: "records",
            label: "发送记录",
            children: (
              <OutboundEmailsTable
                activeStatuses={recordStatuses}
                activeTab="records"
                canWriteOutbound={canWriteOutbound}
                currentStatusOptions={currentStatusOptions}
                emailColumns={emailColumns}
                emailTotal={emailTotal}
                emails={emails}
                keyword={keyword}
                loading={loadingList}
                onBatchDelete={() => void handleBatchDeleteEmails()}
                onBatchSend={() => void handleBatchSendEmails()}
                onChangeKeyword={value => {
                  setKeyword(value);
                  setPage(1);
                }}
                onChangeStatuses={changeStatusFilter}
                onClearSelection={clearSelectedEmails}
                onCreate={() => openCompose()}
                onPageChange={setPage}
                onRefresh={() => void Promise.all([loadBaseData(), loadEmails()])}
                page={page}
                rowSelection={emailTableRowSelection}
                selectedCount={selectedEmails.length}
                selectedHasSendable={selectedHasSendable}
              />
            ),
          },
          {
            key: "drafts",
            label: "草稿与计划发送",
            children: (
              <OutboundEmailsTable
                activeStatuses={draftStatuses}
                activeTab="drafts"
                canWriteOutbound={canWriteOutbound}
                currentStatusOptions={currentStatusOptions}
                emailColumns={emailColumns}
                emailTotal={emailTotal}
                emails={emails}
                keyword={keyword}
                loading={loadingList}
                onBatchDelete={() => void handleBatchDeleteEmails()}
                onBatchSend={() => void handleBatchSendEmails()}
                onChangeKeyword={value => {
                  setKeyword(value);
                  setPage(1);
                }}
                onChangeStatuses={changeStatusFilter}
                onClearSelection={clearSelectedEmails}
                onCreate={() => openCompose()}
                onPageChange={setPage}
                onRefresh={() => void Promise.all([loadBaseData(), loadEmails()])}
                page={page}
                rowSelection={emailTableRowSelection}
                selectedCount={selectedEmails.length}
                selectedHasSendable={selectedHasSendable}
              />
            ),
          },
          {
            key: "templates",
            label: "模板中心",
            children: (
              <OutboundTemplatesTable
                canWriteOutbound={canWriteOutbound}
                columns={templateColumns}
                dataSource={templates}
                loading={loadingBase}
                onBatchDelete={() => void handleBatchDeleteTemplates()}
                onBatchDisable={() => void handleBatchToggleTemplates(false)}
                onBatchEnable={() => void handleBatchToggleTemplates(true)}
                onClearSelection={clearSelectedTemplates}
                onCreate={() => openTemplateDrawer()}
                rowSelection={templateTableRowSelection}
                selectedCount={selectedTemplates.length}
              />
            ),
          },
          {
            key: "contacts",
            label: "常用收件人",
            children: (
              <OutboundContactsTable
                canWriteOutbound={canWriteOutbound}
                columns={contactColumns}
                dataSource={contacts}
                loading={loadingBase}
                onBatchDelete={() => void handleBatchDeleteContacts()}
                onBatchFavorite={() => void handleBatchFavoriteContacts(true)}
                onBatchUnfavorite={() => void handleBatchFavoriteContacts(false)}
                onClearSelection={clearSelectedContacts}
                onCreate={() => openContactDrawer()}
                rowSelection={contactTableRowSelection}
                selectedCount={selectedContacts.length}
              />
            ),
          },
          {
            key: "stats",
            label: "发送统计",
            children: (
              <OutboundStatsPanels
                failedSeries={statsFailedSeries}
                scheduledSeries={statsScheduledSeries}
                sentSeries={statsSentSeries}
                topDomainSeries={topDomainSeries}
              />
            ),
          },
        ]}
      />

      <ComposeEmailDrawer
        attachmentLoading={attachmentLoading}
        composeAttachments={composeAttachments}
        composeSubmitting={composeSubmitting}
        contactOptions={contactOptions}
        editingEmail={editingEmail}
        form={composeForm}
        onApplyTemplate={handleApplyTemplate}
        onAttachmentChange={event => void handleAttachmentChange(event)}
        onClose={() => {
          setComposeOpen(false);
          setEditingEmail(null);
          setComposeAttachments([]);
        }}
        onDownloadAttachment={index => {
          const attachment = composeAttachments[index];
          if (!attachment) return;
          downloadOutboundAttachment(attachment);
        }}
        onRemoveAttachment={index => {
          setComposeAttachments(current => current.filter((_value, itemIndex) => itemIndex !== index));
        }}
        onSaveDraft={() => void handleComposeSubmit("draft")}
        onSend={() => void handleComposeSubmit("send")}
        open={composeOpen}
        sendActionText={sendActionText}
        settings={settings}
        templates={templates}
      />

      <OutboundSettingsDrawer
        form={settingsForm}
        loading={settingsSubmitting}
        onClose={() => setSettingsOpen(false)}
        onSubmit={() => void handleSettingsSubmit()}
        open={settingsOpen}
      />

      <OutboundTemplateDrawer
        editingTemplate={editingTemplate}
        form={templateForm}
        loading={templateSubmitting}
        onClose={() => setTemplateOpen(false)}
        onSubmit={() => void handleTemplateSubmit()}
        open={templateOpen}
      />

      <OutboundContactDrawer
        editingContact={editingContact}
        form={contactForm}
        loading={contactSubmitting}
        onClose={() => setContactOpen(false)}
        onSubmit={() => void handleContactSubmit()}
        open={contactOpen}
      />

      <OutboundEmailDetailDrawer
        detailLoading={detailLoading}
        detailRecord={detailRecord}
        onClose={() => {
          setDetailOpen(false);
          setDetailRecord(null);
        }}
        open={detailOpen}
      />
    </div>
  );
}
