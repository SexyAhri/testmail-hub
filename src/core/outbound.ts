import {
  MAX_OUTBOUND_ATTACHMENTS,
  MAX_OUTBOUND_ATTACHMENT_TOTAL_BYTES,
  MAX_OUTBOUND_BODY_LENGTH,
  MAX_OUTBOUND_CONTACT_NOTE_LENGTH,
  MAX_OUTBOUND_FROM_NAME_LENGTH,
  MAX_OUTBOUND_RECIPIENTS,
  MAX_OUTBOUND_SUBJECT_LENGTH,
  MAX_OUTBOUND_TEMPLATE_NAME_LENGTH,
} from "../utils/constants";
import {
  base64ByteLength,
  isValidEmailAddress,
  normalizeEmailAddress,
  normalizeTags,
  stripHtml,
} from "../utils/utils";
import type {
  OutboundContactRecord,
  OutboundEmailAttachmentRecord,
  OutboundEmailSettings,
  OutboundTemplateRecord,
} from "../server/types";

interface OutboundEmailInput {
  attachments?: Array<{
    content_base64?: string;
    content_type?: string;
    filename?: string;
    size_bytes?: number;
  }> | unknown;
  bcc?: string[] | string;
  cc?: string[] | string;
  from_address?: string;
  from_name?: string;
  html_body?: string;
  mode?: string;
  reply_to?: string;
  scheduled_at?: number | string | null;
  subject?: string;
  text_body?: string;
  to?: string[] | string;
}

interface OutboundSettingsInput {
  allow_external_recipients?: boolean;
  default_from_address?: string;
  default_from_name?: string;
  default_reply_to?: string;
}

interface OutboundTemplateInput {
  html_template?: string;
  is_enabled?: boolean;
  name?: string;
  subject_template?: string;
  text_template?: string;
  variables?: string[] | string;
}

interface OutboundContactInput {
  email?: string;
  is_favorite?: boolean;
  name?: string;
  note?: string;
  tags?: string[] | string;
}

export interface NormalizedOutboundAttachmentPayload {
  content_base64: string;
  content_type: string;
  filename: string;
  size_bytes: number;
}

export interface NormalizedOutboundEmailPayload {
  attachments: NormalizedOutboundAttachmentPayload[];
  bcc: string[];
  cc: string[];
  from_address: string;
  from_name: string;
  html_body: string;
  mode: "draft" | "send";
  reply_to: string;
  scheduled_at: number | null;
  subject: string;
  text_body: string;
  to: string[];
}

export interface NormalizedOutboundSettingsPayload {
  allow_external_recipients: boolean;
  default_from_address: string;
  default_from_name: string;
  default_reply_to: string;
}

export interface NormalizedOutboundTemplatePayload {
  html_template: string;
  is_enabled: boolean;
  name: string;
  subject_template: string;
  text_template: string;
  variables: string[];
}

export interface NormalizedOutboundContactPayload {
  email: string;
  is_favorite: boolean;
  name: string;
  note: string;
  tags: string[];
}

export function parseEmailList(value: unknown): string[] {
  const rawItems = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[\n,;]+/)
        .map(item => item.trim());

  return Array.from(
    new Set(
      rawItems
        .map(item => normalizeEmailAddress(item))
        .filter(Boolean),
    ),
  );
}

export function formatFromHeader(name: string, address: string): string {
  const safeName = String(name || "").trim().replace(/"/g, "");
  return safeName ? `${safeName} <${address}>` : address;
}

export function matchesSenderDomain(address: string, fromDomain: string): boolean {
  const normalizedAddress = normalizeEmailAddress(address);
  const normalizedDomain = String(fromDomain || "").trim().toLowerCase().replace(/^@+/, "");
  if (!normalizedAddress || !normalizedDomain) return false;
  return normalizedAddress.endsWith(`@${normalizedDomain}`);
}

export function validateOutboundSettingsInput(
  input: OutboundSettingsInput,
  fromDomain: string,
): { data: NormalizedOutboundSettingsPayload; ok: true } | { error: string; ok: false } {
  const default_from_name = String(input.default_from_name || "").trim();
  const default_from_address = normalizeEmailAddress(input.default_from_address);
  const default_reply_to = normalizeEmailAddress(input.default_reply_to);
  const allow_external_recipients = input.allow_external_recipients !== false;

  if (!default_from_name) return { ok: false, error: "default_from_name is required" };
  if (default_from_name.length > MAX_OUTBOUND_FROM_NAME_LENGTH) {
    return { ok: false, error: "default_from_name is too long" };
  }
  if (!default_from_address) return { ok: false, error: "default_from_address is required" };
  if (!isValidEmailAddress(default_from_address)) return { ok: false, error: "default_from_address is invalid" };
  if (fromDomain && !matchesSenderDomain(default_from_address, fromDomain)) {
    return { ok: false, error: `default_from_address must use @${fromDomain}` };
  }
  if (default_reply_to && !isValidEmailAddress(default_reply_to)) {
    return { ok: false, error: "default_reply_to is invalid" };
  }

  return {
    ok: true,
    data: {
      allow_external_recipients,
      default_from_address,
      default_from_name,
      default_reply_to,
    },
  };
}

export function validateOutboundEmailInput(
  input: OutboundEmailInput,
  settings: OutboundEmailSettings,
): { data: NormalizedOutboundEmailPayload; ok: true } | { error: string; ok: false } {
  const to = parseEmailList(input.to);
  const cc = parseEmailList(input.cc);
  const bcc = parseEmailList(input.bcc);
  const from_name = String(input.from_name || settings.default_from_name || "").trim();
  const from_address = normalizeEmailAddress(input.from_address || settings.default_from_address);
  const reply_to = normalizeEmailAddress(input.reply_to || settings.default_reply_to);
  const subject = String(input.subject || "").trim();
  const html_body = String(input.html_body || "").trim();
  const mode = String(input.mode || "send") === "draft" ? "draft" : "send";
  const scheduled_at = parseNullableTimestamp(input.scheduled_at);
  let text_body = String(input.text_body || "").trim();

  if (!from_name) return { ok: false, error: "from_name is required" };
  if (from_name.length > MAX_OUTBOUND_FROM_NAME_LENGTH) return { ok: false, error: "from_name is too long" };
  if (!from_address) return { ok: false, error: "from_address is required" };
  if (!isValidEmailAddress(from_address)) return { ok: false, error: "from_address is invalid" };
  if (settings.from_domain && !matchesSenderDomain(from_address, settings.from_domain)) {
    return { ok: false, error: `from_address must use @${settings.from_domain}` };
  }
  if (reply_to && !isValidEmailAddress(reply_to)) return { ok: false, error: "reply_to is invalid" };
  if (!subject) return { ok: false, error: "subject is required" };
  if (subject.length > MAX_OUTBOUND_SUBJECT_LENGTH) return { ok: false, error: "subject is too long" };

  const totalRecipients = to.length + cc.length + bcc.length;
  if (to.length === 0) return { ok: false, error: "at least one to recipient is required" };
  if (totalRecipients > MAX_OUTBOUND_RECIPIENTS) return { ok: false, error: "too many recipients" };
  if ([...to, ...cc, ...bcc].some(address => !isValidEmailAddress(address))) {
    return { ok: false, error: "recipient contains invalid email address" };
  }

  if (!settings.allow_external_recipients && settings.from_domain) {
    const externalRecipients = [...to, ...cc, ...bcc].filter(address => !matchesSenderDomain(address, settings.from_domain));
    if (externalRecipients.length > 0) {
      return { ok: false, error: "external recipients are disabled" };
    }
  }

  if (!text_body && html_body) {
    text_body = stripHtml(html_body).trim();
  }

  if (!text_body && !html_body) return { ok: false, error: "text_body or html_body is required" };
  if (text_body.length > MAX_OUTBOUND_BODY_LENGTH) return { ok: false, error: "text_body is too long" };
  if (html_body.length > MAX_OUTBOUND_BODY_LENGTH) return { ok: false, error: "html_body is too long" };

  const attachments = normalizeOutboundAttachments(input.attachments);
  if ("error" in attachments) return attachments;

  return {
    ok: true,
    data: {
      attachments: attachments.data,
      bcc,
      cc,
      from_address,
      from_name,
      html_body,
      mode,
      reply_to,
      scheduled_at,
      subject,
      text_body,
      to,
    },
  };
}

export function validateOutboundTemplateInput(
  input: OutboundTemplateInput,
): { data: NormalizedOutboundTemplatePayload; ok: true } | { error: string; ok: false } {
  const name = String(input.name || "").trim();
  const subject_template = String(input.subject_template || "").trim();
  const text_template = String(input.text_template || "");
  const html_template = String(input.html_template || "");
  const variables = normalizeTemplateVariableNames(input.variables);
  const is_enabled = input.is_enabled !== false;

  if (!name) return { ok: false, error: "name is required" };
  if (name.length > MAX_OUTBOUND_TEMPLATE_NAME_LENGTH) return { ok: false, error: "name is too long" };
  if (!subject_template) return { ok: false, error: "subject_template is required" };
  if (!text_template.trim() && !html_template.trim()) {
    return { ok: false, error: "text_template or html_template is required" };
  }
  if (subject_template.length > MAX_OUTBOUND_BODY_LENGTH) return { ok: false, error: "subject_template is too long" };
  if (text_template.length > MAX_OUTBOUND_BODY_LENGTH) return { ok: false, error: "text_template is too long" };
  if (html_template.length > MAX_OUTBOUND_BODY_LENGTH) return { ok: false, error: "html_template is too long" };

  return {
    ok: true,
    data: {
      html_template,
      is_enabled,
      name,
      subject_template,
      text_template,
      variables,
    },
  };
}

export function validateOutboundContactInput(
  input: OutboundContactInput,
): { data: NormalizedOutboundContactPayload; ok: true } | { error: string; ok: false } {
  const name = String(input.name || "").trim();
  const email = normalizeEmailAddress(input.email);
  const note = String(input.note || "").trim();
  const tags = normalizeTags(input.tags);
  const is_favorite = input.is_favorite === true;

  if (!name) return { ok: false, error: "name is required" };
  if (!email) return { ok: false, error: "email is required" };
  if (!isValidEmailAddress(email)) return { ok: false, error: "email is invalid" };
  if (note.length > MAX_OUTBOUND_CONTACT_NOTE_LENGTH) return { ok: false, error: "note is too long" };

  return {
    ok: true,
    data: {
      email,
      is_favorite,
      name,
      note,
      tags,
    },
  };
}

export function renderTemplateString(template: string, variables: Record<string, string>): string {
  return String(template || "").replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, rawKey: string) => {
    const key = String(rawKey || "").trim();
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : "";
  });
}

export function applyOutboundTemplate(
  template: Pick<OutboundTemplateRecord, "html_template" | "subject_template" | "text_template">,
  variables: Record<string, string>,
): { html_body: string; subject: string; text_body: string } {
  return {
    html_body: renderTemplateString(template.html_template, variables),
    subject: renderTemplateString(template.subject_template, variables),
    text_body: renderTemplateString(template.text_template, variables),
  };
}

export function parseTemplateVariables(value: unknown): Record<string, string> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [String(key), String(item ?? "")]),
    );
  }

  try {
    const parsed = JSON.parse(String(value)) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([key, item]) => [String(key), String(item ?? "")]),
    );
  } catch {
    return {};
  }
}

export async function sendResendEmail(
  apiKey: string | undefined,
  payload: Pick<
    NormalizedOutboundEmailPayload,
    "attachments" | "bcc" | "cc" | "from_address" | "from_name" | "html_body" | "reply_to" | "subject" | "text_body" | "to"
  >,
): Promise<{ id: string }> {
  const trimmedApiKey = String(apiKey || "").trim();
  if (!trimmedApiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${trimmedApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      attachments: payload.attachments.map(item => ({
        content: item.content_base64,
        filename: item.filename,
      })),
      bcc: payload.bcc.length > 0 ? payload.bcc : undefined,
      cc: payload.cc.length > 0 ? payload.cc : undefined,
      from: formatFromHeader(payload.from_name, payload.from_address),
      html: payload.html_body || undefined,
      replyTo: payload.reply_to || undefined,
      subject: payload.subject,
      text: payload.text_body || undefined,
      to: payload.to,
    }),
  });

  const responseText = await response.text();
  const responseJson = responseText ? safeJsonParse(responseText) : null;

  if (!response.ok) {
    const message =
      (responseJson && typeof responseJson.message === "string" && responseJson.message) ||
      (responseJson && typeof responseJson.error === "string" && responseJson.error) ||
      `Resend request failed with status ${response.status}`;
    throw new Error(message);
  }

  const providerMessageId =
    (responseJson && typeof responseJson.id === "string" && responseJson.id) || "";

  if (!providerMessageId) {
    throw new Error("Resend response did not include an email id");
  }

  return { id: providerMessageId };
}

export function cloneAttachmentsForResponse(
  attachments: Array<OutboundEmailAttachmentRecord & { content_base64?: string }>,
): OutboundEmailAttachmentRecord[] {
  return attachments.map(item => ({ ...item }));
}

function normalizeOutboundAttachments(
  value: unknown,
): { data: NormalizedOutboundAttachmentPayload[]; ok: true } | { error: string; ok: false } {
  const items = Array.isArray(value) ? value : [];
  if (items.length > MAX_OUTBOUND_ATTACHMENTS) return { ok: false, error: "too many attachments" };

  const attachments: NormalizedOutboundAttachmentPayload[] = [];
  let totalBytes = 0;

  for (const item of items) {
    const filename = String((item as Record<string, unknown>)?.filename || "").trim();
    const content_base64 = String((item as Record<string, unknown>)?.content_base64 || "").trim();
    const content_type = String((item as Record<string, unknown>)?.content_type || "application/octet-stream").trim();
    const providedSize = Number((item as Record<string, unknown>)?.size_bytes || 0);
    const computedSize = base64ByteLength(content_base64);
    const size_bytes = Number.isFinite(providedSize) && providedSize > 0 ? Math.max(providedSize, computedSize) : computedSize;

    if (!filename) return { ok: false, error: "attachment filename is required" };
    if (!content_base64) return { ok: false, error: "attachment content is required" };
    if (!/^[A-Za-z0-9+/=]+$/.test(content_base64)) return { ok: false, error: "attachment content is invalid" };

    totalBytes += size_bytes;
    if (totalBytes > MAX_OUTBOUND_ATTACHMENT_TOTAL_BYTES) {
      return { ok: false, error: "attachments are too large" };
    }

    attachments.push({
      content_base64,
      content_type,
      filename,
      size_bytes,
    });
  }

  return { ok: true, data: attachments };
}

function normalizeTemplateVariableNames(value: unknown): string[] {
  const rawItems = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[,\n]/)
        .map(item => item.trim());

  return Array.from(
    new Set(
      rawItems
        .map(item => String(item).trim())
        .filter(Boolean),
    ),
  ).slice(0, 50);
}

function parseNullableTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
