import type {
  AdminMutationPayload,
  AdminUserRecord,
  ApiEnvelope,
  AuditLogRecord,
  DomainsPayload,
  EmailDetail,
  EmailMetadataPayload,
  EmailSearchPayload,
  ErrorEventsPayload,
  EmailSummary,
  LoginPayload,
  MailboxPayload,
  MailboxRecord,
  MailboxSyncResult,
  NotificationEndpointRecord,
  NotificationMutationPayload,
  OutboundContactPayload,
  OutboundContactRecord,
  OutboundEmailPayload,
  OutboundEmailRecord,
  OutboundEmailSettings,
  OutboundEmailSettingsPayload,
  OutboundStats,
  OutboundTemplatePayload,
  OutboundTemplateRecord,
  OverviewStats,
  PaginationPayload,
  RuleMutationPayload,
  RuleRecord,
  RuleTestResult,
  SessionPayload,
  WhitelistMutationPayload,
  WhitelistSettings,
  WhitelistRecord,
} from "./types";

export type { MailboxPayload } from "./types";

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }

  if (response.status === 403) {
    throw new Error("FORBIDDEN");
  }

  const contentType = response.headers.get("Content-Type") || "";
  const payload = contentType.includes("application/json")
    ? ((await response.json().catch(() => null)) as ApiEnvelope<T> | null)
    : null;

  if (!response.ok || !payload) {
    throw new Error(payload?.message || "请求失败");
  }

  return payload.data;
}

export async function login(payload: LoginPayload | string) {
  const body = typeof payload === "string" ? { token: payload } : payload;
  return request<{ ok: true; user: SessionPayload["user"] }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function logout() {
  return request<{ ok: true }>("/auth/logout", { method: "POST" });
}

export async function getSession() {
  return request<SessionPayload>("/auth/session");
}

export async function getDomains() {
  return request<DomainsPayload>("/admin/domains");
}

export async function getOverviewStats() {
  return request<OverviewStats>("/admin/stats/overview");
}

export async function getEmails(params: URLSearchParams) {
  return request<PaginationPayload<EmailSummary>>(`/admin/emails?${params.toString()}`);
}

export async function getEmailDetail(messageId: string) {
  return request<EmailDetail>(`/admin/emails/${encodeURIComponent(messageId)}`);
}

export async function updateEmailMetadata(messageId: string, payload: EmailMetadataPayload) {
  return request<EmailDetail>(`/admin/emails/${encodeURIComponent(messageId)}/metadata`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteEmail(messageId: string) {
  return request<{ ok: true }>(`/admin/emails/${encodeURIComponent(messageId)}`, { method: "DELETE" });
}

export async function restoreEmail(messageId: string) {
  return request<{ ok: true }>(`/admin/emails/${encodeURIComponent(messageId)}/restore`, { method: "POST" });
}

export async function purgeEmail(messageId: string) {
  return request<{ ok: true }>(`/admin/emails/${encodeURIComponent(messageId)}/purge`, { method: "DELETE" });
}

export function buildAttachmentDownloadUrl(messageId: string, attachmentId: number) {
  return `/admin/emails/${encodeURIComponent(messageId)}/attachments/${attachmentId}`;
}

export async function getRules(page: number) {
  return request<PaginationPayload<RuleRecord>>(`/admin/rules?page=${page}`);
}

export async function createRule(payload: RuleMutationPayload) {
  return request<{ ok: true }>("/admin/rules", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateRule(id: number, payload: RuleMutationPayload) {
  return request<{ ok: true }>(`/admin/rules/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function removeRule(id: number) {
  return request<{ ok: true }>(`/admin/rules/${id}`, { method: "DELETE" });
}

export async function testRules(payload: { content: string; sender: string }) {
  return request<RuleTestResult>("/admin/rules/test", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getWhitelist(page: number) {
  return request<PaginationPayload<WhitelistRecord>>(`/admin/whitelist?page=${page}`);
}

export async function createWhitelist(payload: WhitelistMutationPayload) {
  return request<{ ok: true }>("/admin/whitelist", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateWhitelist(id: number, payload: WhitelistMutationPayload) {
  return request<{ ok: true }>(`/admin/whitelist/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function removeWhitelist(id: number) {
  return request<{ ok: true }>(`/admin/whitelist/${id}`, { method: "DELETE" });
}

export async function getWhitelistSettings() {
  return request<WhitelistSettings>("/admin/whitelist/settings");
}

export async function updateWhitelistSettings(payload: WhitelistSettings) {
  return request<WhitelistSettings>("/admin/whitelist/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getMailboxes(page: number, includeDeleted = false) {
  const params = new URLSearchParams({ page: String(page) });
  if (includeDeleted) params.set("include_deleted", "1");
  return request<PaginationPayload<MailboxRecord>>(`/admin/mailboxes?${params.toString()}`);
}

export async function createMailbox(payload: MailboxPayload) {
  return request<{ count: number; ok: true }>("/admin/mailboxes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateMailbox(id: number, payload: MailboxPayload) {
  return request<{ ok: true }>(`/admin/mailboxes/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function removeMailbox(id: number) {
  return request<{ ok: true }>(`/admin/mailboxes/${id}`, { method: "DELETE" });
}

export async function syncMailboxes() {
  return request<MailboxSyncResult>("/admin/mailboxes/sync", { method: "POST" });
}

export async function getAdmins(page: number) {
  return request<PaginationPayload<AdminUserRecord>>(`/admin/admins?page=${page}`);
}

export async function createAdmin(payload: AdminMutationPayload) {
  return request<{ ok: true; user: AdminUserRecord }>("/admin/admins", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdmin(id: string, payload: AdminMutationPayload) {
  return request<{ ok: true }>(`/admin/admins/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getNotifications(page: number) {
  return request<PaginationPayload<NotificationEndpointRecord>>(`/admin/notifications?page=${page}`);
}

export async function createNotification(payload: NotificationMutationPayload) {
  return request<{ ok: true }>("/admin/notifications", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateNotification(id: number, payload: NotificationMutationPayload) {
  return request<{ ok: true }>(`/admin/notifications/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function removeNotification(id: number) {
  return request<{ ok: true }>(`/admin/notifications/${id}`, { method: "DELETE" });
}

export async function testNotification(id: number) {
  return request<{ ok: true }>(`/admin/notifications/${id}/test`, { method: "POST" });
}

export async function getOutboundSettings() {
  return request<OutboundEmailSettings>("/admin/outbound/settings");
}

export async function updateOutboundSettings(payload: OutboundEmailSettingsPayload) {
  return request<OutboundEmailSettings>("/admin/outbound/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getOutboundEmails(page: number) {
  return request<PaginationPayload<OutboundEmailRecord>>(`/admin/outbound/emails?page=${page}`);
}

export async function getOutboundEmailDetail(id: number) {
  return request<OutboundEmailRecord>(`/admin/outbound/emails/${id}`);
}

export async function getOutboundEmailsPaged(params: URLSearchParams) {
  return request<PaginationPayload<OutboundEmailRecord>>(`/admin/outbound/emails?${params.toString()}`);
}

export async function createOutboundEmail(payload: OutboundEmailPayload) {
  return request<OutboundEmailRecord>("/admin/outbound/emails", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateOutboundEmail(id: number, payload: OutboundEmailPayload) {
  return request<OutboundEmailRecord>(`/admin/outbound/emails/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function sendStoredOutboundEmail(id: number) {
  return request<OutboundEmailRecord>(`/admin/outbound/emails/${id}/send`, {
    method: "POST",
  });
}

export async function deleteOutboundEmail(id: number) {
  return request<{ ok: true }>(`/admin/outbound/emails/${id}`, { method: "DELETE" });
}

export async function getOutboundStats() {
  return request<OutboundStats>("/admin/outbound/stats");
}

export async function getOutboundTemplates() {
  return request<OutboundTemplateRecord[]>("/admin/outbound/templates");
}

export async function createOutboundTemplate(payload: OutboundTemplatePayload) {
  return request<{ ok: true }>("/admin/outbound/templates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateOutboundTemplate(id: number, payload: OutboundTemplatePayload) {
  return request<{ ok: true }>(`/admin/outbound/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function removeOutboundTemplate(id: number) {
  return request<{ ok: true }>(`/admin/outbound/templates/${id}`, { method: "DELETE" });
}

export async function getOutboundContacts() {
  return request<OutboundContactRecord[]>("/admin/outbound/contacts");
}

export async function createOutboundContact(payload: OutboundContactPayload) {
  return request<{ ok: true }>("/admin/outbound/contacts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateOutboundContact(id: number, payload: OutboundContactPayload) {
  return request<{ ok: true }>(`/admin/outbound/contacts/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function removeOutboundContact(id: number) {
  return request<{ ok: true }>(`/admin/outbound/contacts/${id}`, { method: "DELETE" });
}

export async function getAuditLogs(page: number) {
  return request<PaginationPayload<AuditLogRecord>>(`/admin/audit?page=${page}`);
}

export async function getErrorEvents(params: { keyword?: string; page: number; source?: string }) {
  const searchParams = new URLSearchParams({ page: String(params.page) });
  if (params.source) searchParams.set("source", params.source);
  if (params.keyword) searchParams.set("keyword", params.keyword);
  return request<ErrorEventsPayload>(`/admin/errors?${searchParams.toString()}`);
}

export function buildExportUrl(resource: string, format: "csv" | "json" = "csv") {
  return `/admin/export/${resource}?format=${format}`;
}

export function buildEmailSearchParams(filters: EmailSearchPayload) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  return params;
}
