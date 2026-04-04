import dayjs, { type Dayjs } from "dayjs";

import type { MetricChartDatum } from "../../components";
import type {
  OutboundContactPayload,
  OutboundEmailAttachmentPayload,
  OutboundEmailPayload,
  OutboundEmailRecord,
  OutboundEmailSettings,
  OutboundStats,
  OutboundTemplatePayload,
  OutboundTemplateRecord,
} from "../../types";
import { downloadBase64File } from "../../utils";
import {
  MAX_OUTBOUND_ATTACHMENTS,
  MAX_OUTBOUND_ATTACHMENT_TOTAL_BYTES,
} from "../../../utils/constants";

export type OutboundEmailStatus = OutboundEmailRecord["status"];

export interface ComposeFormValues {
  bcc: string[];
  cc: string[];
  from_address: string;
  from_name: string;
  html_body: string;
  operation_note: string;
  reply_to: string;
  scheduled_at?: Dayjs | null;
  subject: string;
  template_id?: number;
  template_variables: string;
  text_body: string;
  to: string[];
}

export interface TemplateFormValues {
  html_template: string;
  is_enabled: boolean;
  name: string;
  operation_note: string;
  subject_template: string;
  text_template: string;
  variables: string;
}

export interface ContactFormValues {
  email: string;
  is_favorite: boolean;
  name: string;
  note: string;
  operation_note: string;
  tags: string;
}

interface AttachmentWithSizeLike {
  size_bytes: number;
}

interface IncomingAttachmentLike {
  size: number;
}

export interface AttachmentSelectionRejection {
  index: number;
  reason: "count" | "size";
}

export interface AttachmentSelectionPlan {
  acceptedIndexes: number[];
  nextTotalBytes: number;
  rejected: AttachmentSelectionRejection[];
}

export const RECORD_STATUSES: OutboundEmailStatus[] = ["sent", "failed", "sending"];
export const DRAFT_STATUSES: OutboundEmailStatus[] = ["draft", "scheduled"];

export const STATUS_TAGS: Record<string, { color: string; label: string }> = {
  draft: { color: "default", label: "草稿" },
  failed: { color: "error", label: "失败" },
  scheduled: { color: "processing", label: "计划发送" },
  sending: { color: "warning", label: "发送中" },
  sent: { color: "success", label: "已发送" },
};

export const INITIAL_SETTINGS: OutboundEmailSettings = {
  allow_external_recipients: false,
  api_key_configured: false,
  configured: false,
  default_from_address: "",
  default_from_name: "",
  default_reply_to: "",
  from_domain: "",
  provider: "resend",
};

export const INITIAL_STATS: OutboundStats = {
  recent_daily: [],
  top_recipient_domains: [],
  total_drafts: 0,
  total_failed: 0,
  total_scheduled: 0,
  total_sent: 0,
};

export function isFormError(error: unknown) {
  return Boolean(error && typeof error === "object" && "errorFields" in (error as Record<string, unknown>));
}

export function renderTemplateString(template: string, variables: Record<string, string>) {
  return String(template || "").replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, rawKey: string) => {
    const key = String(rawKey || "").trim();
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : "";
  });
}

export function parseTemplateVariables(value: string) {
  try {
    const parsed = JSON.parse(value || "{}") as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).map(([key, item]) => [key, String(item ?? "")]));
  } catch {
    return {};
  }
}

export function buildVariableSkeleton(template?: OutboundTemplateRecord | null) {
  if (!template || template.variables.length === 0) return "{}";
  return JSON.stringify(Object.fromEntries(template.variables.map(item => [item, ""])), null, 2);
}

export function buildTrendSeries(
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

export function buildComposeDefaults(settings: OutboundEmailSettings): ComposeFormValues {
  return {
    bcc: [],
    cc: [],
    from_address: settings.default_from_address,
    from_name: settings.default_from_name,
    html_body: "",
    operation_note: "",
    reply_to: settings.default_reply_to,
    scheduled_at: null,
    subject: "",
    template_id: undefined,
    template_variables: "{}",
    text_body: "",
    to: [],
  };
}

export function buildComposePayload(
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
    operation_note: values.operation_note.trim(),
    reply_to: values.reply_to.trim(),
    scheduled_at: values.scheduled_at ? values.scheduled_at.valueOf() : null,
    subject: values.subject.trim(),
    template_id: values.template_id,
    template_variables: values.template_variables.trim() || "{}",
    text_body: values.text_body,
    to: values.to,
  };
}

export function buildComposeValuesFromRecord(record: OutboundEmailRecord): ComposeFormValues {
  return {
    bcc: record.bcc_addresses,
    cc: record.cc_addresses,
    from_address: record.from_address,
    from_name: record.from_name,
    html_body: record.html_body,
    operation_note: "",
    reply_to: record.reply_to,
    scheduled_at: record.scheduled_at ? dayjs(record.scheduled_at) : null,
    subject: record.subject,
    template_id: undefined,
    template_variables: "{}",
    text_body: record.text_body,
    to: record.to_addresses,
  };
}

export function getOutboundAttachmentTotalBytes(
  attachments: AttachmentWithSizeLike[],
) {
  return attachments.reduce(
    (total, item) => total + Math.max(0, Number(item.size_bytes || 0)),
    0,
  );
}

export function planOutboundAttachmentSelection(
  existingAttachments: AttachmentWithSizeLike[],
  incomingAttachments: IncomingAttachmentLike[],
): AttachmentSelectionPlan {
  let totalBytes = getOutboundAttachmentTotalBytes(existingAttachments);
  let currentCount = existingAttachments.length;
  const acceptedIndexes: number[] = [];
  const rejected: AttachmentSelectionRejection[] = [];

  incomingAttachments.forEach((item, index) => {
    const nextSize = Math.max(0, Number(item.size || 0));
    if (currentCount >= MAX_OUTBOUND_ATTACHMENTS) {
      rejected.push({ index, reason: "count" });
      return;
    }
    if (totalBytes + nextSize > MAX_OUTBOUND_ATTACHMENT_TOTAL_BYTES) {
      rejected.push({ index, reason: "size" });
      return;
    }

    acceptedIndexes.push(index);
    currentCount += 1;
    totalBytes += nextSize;
  });

  return {
    acceptedIndexes,
    nextTotalBytes: totalBytes,
    rejected,
  };
}

export function normalizeAttachment(record: OutboundEmailRecord): OutboundEmailAttachmentPayload[] {
  return (record.attachments || []).map(item => ({
    content_base64: item.content_base64 || "",
    content_type: item.content_type,
    filename: item.filename,
    size_bytes: item.size_bytes,
  }));
}

export function downloadOutboundAttachment(
  attachment: Pick<OutboundEmailAttachmentPayload, "content_base64" | "content_type" | "filename">,
) {
  const contentBase64 = String(attachment.content_base64 || "").trim();
  if (!contentBase64) return false;

  downloadBase64File(
    contentBase64,
    attachment.filename || "attachment",
    attachment.content_type || "application/octet-stream",
  );
  return true;
}

export function buildTemplatePayload(values: TemplateFormValues): OutboundTemplatePayload {
  return {
    html_template: values.html_template,
    is_enabled: values.is_enabled,
    name: values.name.trim(),
    operation_note: values.operation_note.trim(),
    subject_template: values.subject_template.trim(),
    text_template: values.text_template,
    variables: values.variables,
  };
}

export function buildContactPayload(values: ContactFormValues): OutboundContactPayload {
  return {
    email: values.email.trim(),
    is_favorite: values.is_favorite,
    name: values.name.trim(),
    note: values.note.trim(),
    operation_note: values.operation_note.trim(),
    tags: values.tags,
  };
}

export function getSendActionText(composeSchedule: Dayjs | null | undefined) {
  return composeSchedule && dayjs.isDayjs(composeSchedule) && composeSchedule.valueOf() > Date.now()
    ? "计划发送"
    : "立即发送";
}

export function buildSettingsItems(settings: OutboundEmailSettings) {
  return [
    { label: "服务商", value: settings.provider },
    { label: "发信域名", value: settings.from_domain || "--" },
    { label: "默认发件人", value: settings.default_from_name || "--" },
    { label: "默认发件地址", value: settings.default_from_address || "--" },
    { label: "Reply-To", value: settings.default_reply_to || "--" },
    { label: "外部发信", value: settings.allow_external_recipients ? "已开启" : "已关闭" },
    { label: "API Key", value: settings.api_key_configured ? "已配置" : "未配置" },
  ];
}

export function buildCompactSettingsItems(settings: OutboundEmailSettings) {
  return [
    { label: "服务商", value: settings.provider },
    { label: "发信域名", value: settings.from_domain || "--" },
    { label: "默认地址", value: settings.default_from_address || "--" },
    { label: "外部发信", value: settings.allow_external_recipients ? "已开启" : "已关闭" },
  ];
}
