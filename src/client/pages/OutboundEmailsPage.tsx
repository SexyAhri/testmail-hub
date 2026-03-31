import {
  BarChartOutlined,
  ContactsOutlined,
  MailOutlined,
  PaperClipOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  SettingOutlined,
  SnippetsOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Col,
  DatePicker,
  Descriptions,
  Form,
  Input,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
  theme,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

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
} from "../api";
import {
  ActionButtons,
  BatchActionsBar,
  DataTable,
  DetailDrawer,
  FormDrawer,
  InfoCard,
  MetricCard,
  MetricChart,
  MetricGrid,
  PageHeader,
  SearchToolbar,
  TypeTag,
} from "../components";
import type { MetricChartDatum } from "../components";
import { useTableSelection } from "../hooks/useTableSelection";
import {
  canManageGlobalSettings,
  canWriteAnyResource,
  isProjectScopedUser,
  isReadOnlyUser,
  type CurrentUser,
} from "../permissions";
import type {
  OutboundContactPayload,
  OutboundContactRecord,
  OutboundEmailAttachmentPayload,
  OutboundEmailPayload,
  OutboundEmailRecord,
  OutboundEmailSettings,
  OutboundEmailSettingsPayload,
  OutboundStats,
  OutboundTemplatePayload,
  OutboundTemplateRecord,
} from "../types";
import { buildBatchActionMessage, fileToBase64, formatBytes, formatDateTime, normalizeApiError, runBatchAction } from "../utils";

const { Text, Paragraph } = Typography;
const { TextArea } = Input;
type OutboundEmailStatus = OutboundEmailRecord["status"];

const RECORD_STATUSES: OutboundEmailStatus[] = ["sent", "failed", "sending"];
const DRAFT_STATUSES: OutboundEmailStatus[] = ["draft", "scheduled"];

const STATUS_TAGS: Record<string, { color: string; label: string }> = {
  draft: { color: "default", label: "草稿" },
  failed: { color: "error", label: "失败" },
  scheduled: { color: "processing", label: "计划发送" },
  sending: { color: "warning", label: "发送中" },
  sent: { color: "success", label: "已发送" },
};

const INITIAL_SETTINGS: OutboundEmailSettings = {
  allow_external_recipients: false,
  api_key_configured: false,
  configured: false,
  default_from_address: "",
  default_from_name: "",
  default_reply_to: "",
  from_domain: "",
  provider: "resend",
};

const INITIAL_STATS: OutboundStats = {
  recent_daily: [],
  top_recipient_domains: [],
  total_drafts: 0,
  total_failed: 0,
  total_scheduled: 0,
  total_sent: 0,
};

interface OutboundEmailsPageProps {
  currentUser?: CurrentUser;
  onUnauthorized: () => void;
}

interface ComposeFormValues {
  bcc: string[];
  cc: string[];
  from_address: string;
  from_name: string;
  html_body: string;
  reply_to: string;
  scheduled_at?: Dayjs | null;
  subject: string;
  template_id?: number;
  template_variables: string;
  text_body: string;
  to: string[];
}

interface TemplateFormValues {
  html_template: string;
  is_enabled: boolean;
  name: string;
  subject_template: string;
  text_template: string;
  variables: string;
}

interface ContactFormValues {
  email: string;
  is_favorite: boolean;
  name: string;
  note: string;
  tags: string;
}

function isFormError(error: unknown) {
  return Boolean(error && typeof error === "object" && "errorFields" in (error as Record<string, unknown>));
}

function renderTemplateString(template: string, variables: Record<string, string>) {
  return String(template || "").replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, rawKey: string) => {
    const key = String(rawKey || "").trim();
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : "";
  });
}

function parseTemplateVariables(value: string) {
  try {
    const parsed = JSON.parse(value || "{}") as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).map(([key, item]) => [key, String(item ?? "")]));
  } catch {
    return {};
  }
}

function buildVariableSkeleton(template?: OutboundTemplateRecord | null) {
  if (!template || template.variables.length === 0) return "{}";
  return JSON.stringify(Object.fromEntries(template.variables.map(item => [item, ""])), null, 2);
}

function buildTrendSeries(
  recentDaily: OutboundStats["recent_daily"],
  field: "failed" | "scheduled" | "sent",
): MetricChartDatum[] {
  const dailyMap = new Map(recentDaily.map(item => [item.day, item]));
  const output: MetricChartDatum[] = [];
  const now = new Date();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const current = new Date(now);
    current.setHours(0, 0, 0, 0);
    current.setDate(now.getDate() - offset);

    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");
    const day = String(current.getDate()).padStart(2, "0");
    const key = `${year}-${month}-${day}`;

    output.push({
      time: `${month}-${day}`,
      value: dailyMap.get(key)?.[field] ?? 0,
    });
  }

  return output;
}

function buildComposeDefaults(settings: OutboundEmailSettings): ComposeFormValues {
  return {
    bcc: [],
    cc: [],
    from_address: settings.default_from_address,
    from_name: settings.default_from_name,
    html_body: "",
    reply_to: settings.default_reply_to,
    scheduled_at: null,
    subject: "",
    template_id: undefined,
    template_variables: "{}",
    text_body: "",
    to: [],
  };
}

function buildComposePayload(
  values: ComposeFormValues,
  attachments: OutboundEmailAttachmentPayload[],
  mode: "draft" | "send",
): OutboundEmailPayload {
  return {
    attachments,
    bcc: values.bcc,
    cc: values.cc,
    from_address: values.from_address.trim(),
    from_name: values.from_name.trim(),
    html_body: values.html_body,
    mode,
    reply_to: values.reply_to.trim(),
    scheduled_at: values.scheduled_at ? values.scheduled_at.valueOf() : null,
    subject: values.subject.trim(),
    template_id: values.template_id,
    template_variables: values.template_variables.trim() || "{}",
    text_body: values.text_body,
    to: values.to,
  };
}

function buildComposeValuesFromRecord(record: OutboundEmailRecord): ComposeFormValues {
  return {
    bcc: record.bcc_addresses,
    cc: record.cc_addresses,
    from_address: record.from_address,
    from_name: record.from_name,
    html_body: record.html_body,
    reply_to: record.reply_to,
    scheduled_at: record.scheduled_at ? dayjs(record.scheduled_at) : null,
    subject: record.subject,
    template_id: undefined,
    template_variables: "{}",
    text_body: record.text_body,
    to: record.to_addresses,
  };
}

function normalizeAttachment(record: OutboundEmailRecord): OutboundEmailAttachmentPayload[] {
  return (record.attachments || []).map(item => ({
    content_base64: item.content_base64 || "",
    content_type: item.content_type,
    filename: item.filename,
    size_bytes: item.size_bytes,
  }));
}

export default function OutboundEmailsPage({ currentUser, onUnauthorized }: OutboundEmailsPageProps) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [composeForm] = Form.useForm<ComposeFormValues>();
  const [settingsForm] = Form.useForm<OutboundEmailSettingsPayload>();
  const [templateForm] = Form.useForm<TemplateFormValues>();
  const [contactForm] = Form.useForm<ContactFormValues>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState("records");
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
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      onUnauthorized();
      return;
    }
    if (isFormError(error)) return;
    message.error(normalizeApiError(error, fallback));
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

    setAttachmentLoading(true);
    try {
      const attachments = await Promise.all(
        files.map(async file => ({
          content_base64: await fileToBase64(file),
          content_type: file.type || "application/octet-stream",
          filename: file.name,
          size_bytes: file.size,
        })),
      );
      setComposeAttachments(current => [...current, ...attachments]);
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
    try {
      await deleteOutboundEmail(record.id);
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
      const payload: OutboundTemplatePayload = {
        html_template: values.html_template,
        is_enabled: values.is_enabled,
        name: values.name.trim(),
        subject_template: values.subject_template.trim(),
        text_template: values.text_template,
        variables: values.variables,
      };

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
    try {
      await removeOutboundTemplate(record.id);
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
      const payload: OutboundContactPayload = {
        email: values.email.trim(),
        is_favorite: values.is_favorite,
        name: values.name.trim(),
        note: values.note.trim(),
        tags: values.tags,
      };

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
    try {
      await removeOutboundContact(record.id);
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

    const messageText = buildBatchActionMessage("批量发送邮件", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  async function handleBatchDeleteEmails() {
    const result = await runBatchAction(selectedEmails, item => deleteOutboundEmail(item.id));
    if (result.successCount > 0) {
      clearSelectedEmails();
      await Promise.all([loadBaseData(), loadEmails()]);
    }

    const messageText = buildBatchActionMessage("批量删除邮件", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
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

    const messageText = buildBatchActionMessage(is_enabled ? "批量启用模板" : "批量停用模板", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  async function handleBatchDeleteTemplates() {
    const result = await runBatchAction(selectedTemplates, item => removeOutboundTemplate(item.id));
    if (result.successCount > 0) {
      clearSelectedTemplates();
      setTemplates(await getOutboundTemplates());
    }

    const messageText = buildBatchActionMessage("批量删除模板", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
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

    const messageText = buildBatchActionMessage(is_favorite ? "批量收藏联系人" : "批量取消收藏联系人", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  async function handleBatchDeleteContacts() {
    const result = await runBatchAction(selectedContacts, item => removeOutboundContact(item.id));
    if (result.successCount > 0) {
      clearSelectedContacts();
      setContacts(await getOutboundContacts());
    }

    const messageText = buildBatchActionMessage("批量删除联系人", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  function changeStatusFilter(values: OutboundEmailStatus[]) {
    setPage(1);
    if (activeTab === "records") {
      setRecordStatuses(values.length > 0 ? values : RECORD_STATUSES);
      return;
    }
    setDraftStatuses(values.length > 0 ? values : DRAFT_STATUSES);
  }

  const currentStatusOptions = (activeTab === "records" ? RECORD_STATUSES : DRAFT_STATUSES).map(item => ({
    label: STATUS_TAGS[item].label,
    value: item,
  }));

  const emailColumns: ColumnsType<OutboundEmailRecord> = [
    {
      title: "主题",
      dataIndex: "subject",
      key: "subject",
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.subject}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.from_name || record.from_address}
          </Text>
        </Space>
      ),
    },
    {
      title: "收件人",
      key: "to_addresses",
      render: (_value, record) => (
        <Text style={{ maxWidth: 280 }} ellipsis={{ tooltip: record.to_addresses.join(", ") }}>
          {record.to_addresses.join(", ")}
        </Text>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: value => <TypeTag options={STATUS_TAGS} type={value} />,
    },
    {
      title: "附件",
      dataIndex: "attachment_count",
      key: "attachment_count",
      width: 90,
      render: value => value || 0,
    },
    {
      title: activeTab === "drafts" ? "计划时间" : "发送时间",
      key: "time",
      width: 180,
      render: (_value, record) => formatDateTime(activeTab === "drafts" ? record.scheduled_at : record.sent_at || record.last_attempt_at),
    },
    {
      title: "操作",
      key: "action",
      width: 260,
      render: (_value, record) => (
        <ActionButtons
          onView={() => void openEmailDetail(record)}
          onEdit={
            canWriteOutbound && record.status !== "sent" && record.status !== "sending"
              ? () => void openEditEmail(record)
              : undefined
          }
          onDelete={canWriteOutbound ? () => void handleDeleteEmail(record) : undefined}
          extra={(
            canWriteOutbound && record.status !== "sent" && record.status !== "sending" ? (
              <Button type="link" size="small" onClick={() => void handleSendStored(record)}>
                立即发
              </Button>
            ) : null
          )}
        />
      ),
    },
  ];

  const templateColumns: ColumnsType<OutboundTemplateRecord> = [
    { title: "模板名称", dataIndex: "name", key: "name" },
    {
      title: "变量",
      dataIndex: "variables",
      key: "variables",
      render: value => value?.length ? value.map((item: string) => <Tag key={item}>{item}</Tag>) : "-",
    },
    {
      title: "状态",
      dataIndex: "is_enabled",
      key: "is_enabled",
      width: 100,
      render: value => <Tag color={value ? "success" : "default"}>{value ? "启用" : "停用"}</Tag>,
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      key: "action",
      width: 220,
      render: (_value, record) => (
        canWriteOutbound ? (
          <ActionButtons
            onEdit={() => openTemplateDrawer(record)}
            onDelete={() => void handleDeleteTemplate(record)}
            extra={(
              <Button
                type="link"
                size="small"
                onClick={() => openCompose({
                  html_body: renderTemplateString(record.html_template, {}),
                  subject: renderTemplateString(record.subject_template, {}),
                  template_id: record.id,
                  template_variables: buildVariableSkeleton(record),
                  text_body: renderTemplateString(record.text_template, {}),
                })}
              >
                写邮件
              </Button>
            )}
          />
        ) : (
          <span style={{ color: "#999" }}>只读</span>
        )
      ),
    },
  ];

  const contactColumns: ColumnsType<OutboundContactRecord> = [
    { title: "联系人", dataIndex: "name", key: "name" },
    {
      title: "邮箱",
      dataIndex: "email",
      key: "email",
      render: value => <Text code>{value}</Text>,
    },
    {
      title: "标签",
      dataIndex: "tags",
      key: "tags",
      render: value => value?.length ? value.map((item: string) => <Tag key={item}>{item}</Tag>) : "-",
    },
    {
      title: "收藏",
      dataIndex: "is_favorite",
      key: "is_favorite",
      width: 90,
      render: value => <Tag color={value ? "gold" : "default"}>{value ? "已收藏" : "普通"}</Tag>,
    },
    {
      title: "备注",
      dataIndex: "note",
      key: "note",
      render: value => value || "-",
    },
    {
      title: "操作",
      key: "action",
      width: 220,
      render: (_value, record) => (
        canWriteOutbound ? (
          <ActionButtons
            onEdit={() => openContactDrawer(record)}
            onDelete={() => void handleDeleteContact(record)}
            extra={(
              <Button type="link" size="small" onClick={() => openCompose({ to: [record.email] })}>
                快速发信
              </Button>
            )}
          />
        ) : (
          <span style={{ color: "#999" }}>只读</span>
        )
      ),
    },
  ];

  const settingsItems = [
    { label: "服务商", value: settings.provider },
    { label: "发信域名", value: settings.from_domain || "--" },
    { label: "默认发件人", value: settings.default_from_name || "--" },
    { label: "默认发件地址", value: settings.default_from_address || "--" },
    { label: "Reply-To", value: settings.default_reply_to || "--" },
    { label: "外部发信", value: settings.allow_external_recipients ? "已开启" : "已关闭" },
    { label: "API Key", value: settings.api_key_configured ? "已配置" : "未配置" },
  ];
  const compactSettingsItems = [
    { label: "服务商", value: settings.provider },
    { label: "发信域名", value: settings.from_domain || "--" },
    { label: "默认地址", value: settings.default_from_address || "--" },
    { label: "外部发信", value: settings.allow_external_recipients ? "已开启" : "已关闭" },
  ];
  const showOverviewSection = activeTab === "records" || activeTab === "drafts";

  const sendActionText =
    composeSchedule && dayjs.isDayjs(composeSchedule) && composeSchedule.valueOf() > Date.now()
      ? "计划发送"
      : "立即发送";

  const emailTable = (
    <>
      <div style={{ marginBottom: 16 }}>
        <SearchToolbar>
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} md={10} xl={8}>
              <Input
                value={keyword}
                onChange={event => {
                  setKeyword(event.target.value);
                  setPage(1);
                }}
                placeholder="搜索主题、发件地址或收件人"
                allowClear
              />
            </Col>
            <Col xs={24} md={10} xl={8}>
              <Select
                mode="multiple"
                allowClear
                style={{ width: "100%" }}
                value={activeStatuses}
                onChange={value => changeStatusFilter(value as OutboundEmailStatus[])}
                options={currentStatusOptions}
                placeholder="筛选状态"
              />
            </Col>
            <Col xs={24} xl={8}>
              <Space wrap>
                <Button icon={<ReloadOutlined />} onClick={() => void Promise.all([loadBaseData(), loadEmails()])}>
                  刷新
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openCompose()} disabled={!canWriteOutbound}>
                  新建邮件
                </Button>
              </Space>
            </Col>
          </Row>
        </SearchToolbar>
      </div>

      <DataTable
        cardTitle={activeTab === "drafts" ? "草稿与计划发送" : "发送记录"}
        cardToolbar={canWriteOutbound ? (
          <BatchActionsBar selectedCount={selectedEmails.length} onClear={clearSelectedEmails}>
            {selectedEmails.some(item => item.status !== "sent" && item.status !== "sending") ? (
              <Button onClick={() => void handleBatchSendEmails()}>
                批量发送
              </Button>
            ) : null}
            <Popconfirm
              title={`确定删除选中的 ${selectedEmails.length} 封邮件吗？`}
              onConfirm={() => void handleBatchDeleteEmails()}
            >
              <Button danger>
                批量删除
              </Button>
            </Popconfirm>
          </BatchActionsBar>
        ) : undefined}
        columns={emailColumns}
        dataSource={emails}
        loading={loadingList}
        rowSelection={emailTableRowSelection}
        rowKey="id"
        current={page}
        total={emailTotal}
        pageSize={20}
        onPageChange={current => setPage(current)}
      />
    </>
  );

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

      <MetricGrid>
        <MetricCard title="已发送" value={stats.total_sent} icon={<MailOutlined />} percent={Math.min(100, stats.total_sent)} color="#1677ff" />
        <MetricCard title="计划发送" value={stats.total_scheduled} icon={<BarChartOutlined />} percent={Math.min(100, stats.total_scheduled * 10)} color="#13c2c2" />
        <MetricCard title="草稿数" value={stats.total_drafts} icon={<SnippetsOutlined />} percent={Math.min(100, stats.total_drafts * 10)} color="#722ed1" />
        <MetricCard title="失败数" value={stats.total_failed} icon={<PaperClipOutlined />} percent={Math.min(100, stats.total_failed * 10)} color="#ff4d4f" />
      </MetricGrid>

      {showOverviewSection ? (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} xl={9}>
            <InfoCard title="发件配置概览" icon={<SettingOutlined />} color="#1677ff" items={compactSettingsItems} />
          </Col>
          <Col xs={24} xl={15}>
            <MetricChart
              title="近 7 天发送趋势"
              data={statsSentSeries}
              color="#1677ff"
              height={190}
              emptyText="暂无发送趋势数据"
            />
          </Col>
        </Row>
      ) : null}

      <Tabs
        activeKey={activeTab}
        onChange={key => {
          setActiveTab(key);
          setPage(1);
        }}
        items={[
          { key: "records", label: "发送记录", children: emailTable },
          { key: "drafts", label: "草稿与计划发送", children: emailTable },
          {
            key: "templates",
            label: "模板中心",
            children: (
              <DataTable
                cardTitle="模板列表"
                cardExtra={canWriteOutbound ? <Button onClick={() => openTemplateDrawer()}>新建模板</Button> : undefined}
                cardToolbar={canWriteOutbound ? (
                  <>
                    <BatchActionsBar selectedCount={selectedTemplates.length} onClear={clearSelectedTemplates}>
                      <Button onClick={() => void handleBatchToggleTemplates(true)}>
                        批量启用
                      </Button>
                      <Button onClick={() => void handleBatchToggleTemplates(false)}>
                        批量停用
                      </Button>
                      <Popconfirm
                        title={`确定删除选中的 ${selectedTemplates.length} 个模板吗？`}
                        onConfirm={() => void handleBatchDeleteTemplates()}
                      >
                        <Button danger>
                          批量删除
                        </Button>
                      </Popconfirm>
                    </BatchActionsBar>
                  </>
                ) : undefined}
                columns={templateColumns}
                dataSource={templates}
                loading={loadingBase}
                rowSelection={templateTableRowSelection}
                rowKey="id"
                pageSize={10}
              />
            ),
          },
          {
            key: "contacts",
            label: "常用收件人",
            children: (
              <DataTable
                cardTitle="联系人列表"
                cardExtra={canWriteOutbound ? <Button onClick={() => openContactDrawer()}>新增联系人</Button> : undefined}
                cardToolbar={canWriteOutbound ? (
                  <>
                    <BatchActionsBar selectedCount={selectedContacts.length} onClear={clearSelectedContacts}>
                      <Button onClick={() => void handleBatchFavoriteContacts(true)}>
                        批量收藏
                      </Button>
                      <Button onClick={() => void handleBatchFavoriteContacts(false)}>
                        取消收藏
                      </Button>
                      <Popconfirm
                        title={`确定删除选中的 ${selectedContacts.length} 个联系人吗？`}
                        onConfirm={() => void handleBatchDeleteContacts()}
                      >
                        <Button danger>
                          批量删除
                        </Button>
                      </Popconfirm>
                    </BatchActionsBar>
                  </>
                ) : undefined}
                columns={contactColumns}
                dataSource={contacts}
                loading={loadingBase}
                rowSelection={contactTableRowSelection}
                rowKey="id"
                pageSize={10}
              />
            ),
          },
          {
            key: "stats",
            label: "发送统计",
            children: (
              <Row gutter={[16, 16]}>
                <Col xs={24} xl={12}>
                  <MetricChart title="发送成功趋势" data={statsSentSeries} color="#1677ff" height={210} emptyText="暂无成功数据" />
                </Col>
                <Col xs={24} xl={12}>
                  <MetricChart title="发送失败趋势" data={statsFailedSeries} color="#ff4d4f" height={210} emptyText="暂无失败数据" />
                </Col>
                <Col xs={24} xl={12}>
                  <MetricChart title="计划发送趋势" data={statsScheduledSeries} color="#13c2c2" height={210} emptyText="暂无计划数据" />
                </Col>
                <Col xs={24} xl={12}>
                  <MetricChart title="热门收件域名" data={topDomainSeries} color="#722ed1" height={210} emptyText="暂无域名统计" />
                </Col>
              </Row>
            ),
          },
        ]}
      />

      <FormDrawer
        title={editingEmail ? `编辑邮件 #${editingEmail.id}` : "新建邮件"}
        open={composeOpen}
        onClose={() => {
          setComposeOpen(false);
          setEditingEmail(null);
          setComposeAttachments([]);
        }}
        form={composeForm}
        labelLayout="top"
        width="64vw"
        footer={(
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <Space>
              <Button onClick={() => setComposeOpen(false)}>取消</Button>
              <Button loading={composeSubmitting === "draft"} onClick={() => void handleComposeSubmit("draft")}>
                保存草稿
              </Button>
            </Space>
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={composeSubmitting === "send"}
              disabled={!settings.api_key_configured}
              onClick={() => void handleComposeSubmit("send")}
            >
              {sendActionText}
            </Button>
          </Space>
        )}
      >
        <Col span={24}>
          <Text type="secondary">
            当前默认发件地址：{settings.default_from_address || "--"}，{settings.api_key_configured ? "已配置 Resend，可直接发送" : "尚未配置 Resend，只能保存草稿"}
          </Text>
        </Col>
        <Col xs={24} xl={12}>
          <Form.Item label="收件人" name="to" rules={[{ required: true, message: "请输入至少一个收件人" }]}>
            <Select mode="tags" options={contactOptions} tokenSeparators={[",", ";"]} placeholder="输入邮箱后回车，可选择联系人" />
          </Form.Item>
        </Col>
        <Col xs={24} xl={12}>
          <Form.Item label="主题" name="subject" rules={[{ required: true, message: "请输入邮件主题" }]}>
            <Input placeholder="请输入邮件主题" />
          </Form.Item>
        </Col>
        <Col xs={24} xl={12}>
          <Form.Item label="抄送" name="cc">
            <Select mode="tags" options={contactOptions} tokenSeparators={[",", ";"]} placeholder="可留空" />
          </Form.Item>
        </Col>
        <Col xs={24} xl={12}>
          <Form.Item label="密送" name="bcc">
            <Select mode="tags" options={contactOptions} tokenSeparators={[",", ";"]} placeholder="可留空" />
          </Form.Item>
        </Col>
        <Col xs={24} xl={8}>
          <Form.Item label="发件人名称" name="from_name" rules={[{ required: true, message: "请输入发件人名称" }]}>
            <Input placeholder="例如：TestMail Hub" />
          </Form.Item>
        </Col>
        <Col xs={24} xl={8}>
          <Form.Item label="发件地址" name="from_address" rules={[{ required: true, message: "请输入发件地址" }]}>
            <Input placeholder="例如：TestMail@vixenahri.cn" />
          </Form.Item>
        </Col>
        <Col xs={24} xl={8}>
          <Form.Item label="Reply-To" name="reply_to">
            <Input placeholder="可留空" />
          </Form.Item>
        </Col>
        <Col xs={24} xl={8}>
          <Form.Item label="模板" name="template_id">
            <Select
              allowClear
              placeholder="可选模板"
              options={templates.map(item => ({
                label: `${item.name}${item.is_enabled ? "" : "（已停用）"}`,
                value: item.id,
              }))}
            />
          </Form.Item>
        </Col>
        <Col xs={24} xl={8}>
          <Form.Item label="计划发送时间" name="scheduled_at">
            <DatePicker showTime style={{ width: "100%" }} placeholder="留空则立即发送" />
          </Form.Item>
        </Col>
        <Col xs={24} xl={8}>
          <Form.Item label="模板变量 JSON" name="template_variables">
            <Input
              addonAfter={(
                <Button type="link" style={{ paddingInline: 0 }} onClick={handleApplyTemplate}>
                  套用
                </Button>
              )}
              placeholder='例如：{"code":"123456"}'
            />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="文本正文" name="text_body">
            <TextArea rows={8} placeholder="纯文本正文，可与 HTML 正文二选一或同时填写" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="HTML 正文" name="html_body">
            <TextArea rows={10} placeholder="支持 HTML 内容" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="附件">
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Space wrap>
                <Button icon={<PaperClipOutlined />} loading={attachmentLoading} onClick={() => fileInputRef.current?.click()}>
                  添加附件
                </Button>
                <Text type="secondary">支持多文件上传，发送时会一并写入 Resend</Text>
              </Space>
              <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={event => void handleAttachmentChange(event)} />
              {composeAttachments.length === 0 ? (
                <Text type="secondary">暂未添加附件</Text>
              ) : (
                composeAttachments.map((item, index) => (
                  <div
                    key={`${item.filename}-${index}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      border: `1px solid ${token.colorBorderSecondary}`,
                      borderRadius: 10,
                      padding: "10px 12px",
                    }}
                  >
                    <Space direction="vertical" size={2}>
                      <Text strong>{item.filename}</Text>
                      <Text type="secondary">{formatBytes(item.size_bytes)} · {item.content_type}</Text>
                    </Space>
                    <Button danger type="link" onClick={() => setComposeAttachments(current => current.filter((_value, itemIndex) => itemIndex !== index))}>
                      移除
                    </Button>
                  </div>
                ))
              )}
            </Space>
          </Form.Item>
        </Col>
      </FormDrawer>

      <FormDrawer
        title="发件设置"
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSubmit={() => void handleSettingsSubmit()}
        form={settingsForm}
        labelLayout="top"
        loading={settingsSubmitting}
      >
        <Col span={24}>
          <Form.Item label="默认发件人名称" name="default_from_name" rules={[{ required: true, message: "请输入默认发件人名称" }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="默认发件地址" name="default_from_address" rules={[{ required: true, message: "请输入默认发件地址" }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="默认 Reply-To" name="default_reply_to">
            <Input placeholder="可留空" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="允许外部收件人" name="allow_external_recipients" valuePropName="checked">
            <Switch checkedChildren="已开启" unCheckedChildren="已关闭" />
          </Form.Item>
        </Col>
      </FormDrawer>

      <FormDrawer
        title={editingTemplate ? "编辑模板" : "新建模板"}
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onSubmit={() => void handleTemplateSubmit()}
        form={templateForm}
        labelLayout="top"
        width="56vw"
        loading={templateSubmitting}
      >
        <Col span={24}>
          <Form.Item label="模板名称" name="name" rules={[{ required: true, message: "请输入模板名称" }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="主题模板" name="subject_template" rules={[{ required: true, message: "请输入主题模板" }]}>
            <Input placeholder="例如：{{product}} 登录验证码" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="文本模板" name="text_template">
            <TextArea rows={6} placeholder="支持 {{variable}} 占位符" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="HTML 模板" name="html_template">
            <TextArea rows={8} placeholder="支持 {{variable}} 占位符" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="变量列表" name="variables" extra="多个变量使用逗号分隔">
            <Input placeholder="例如：product, code, username" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="启用模板" name="is_enabled" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Col>
      </FormDrawer>

      <FormDrawer
        title={editingContact ? "编辑联系人" : "新建联系人"}
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        onSubmit={() => void handleContactSubmit()}
        form={contactForm}
        labelLayout="top"
        loading={contactSubmitting}
      >
        <Col span={24}>
          <Form.Item label="联系人名称" name="name" rules={[{ required: true, message: "请输入联系人名称" }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="邮箱地址" name="email" rules={[{ required: true, message: "请输入邮箱地址" }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="标签" name="tags" extra="多个标签用逗号分隔">
            <Input placeholder="例如：客户, 付款, 测试" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="备注" name="note">
            <TextArea rows={4} />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="收藏联系人" name="is_favorite" valuePropName="checked">
            <Switch checkedChildren="收藏" unCheckedChildren="普通" />
          </Form.Item>
        </Col>
      </FormDrawer>

      <DetailDrawer
        title={detailRecord ? `邮件详情 #${detailRecord.id}` : "邮件详情"}
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetailRecord(null);
        }}
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
    </div>
  );
}
