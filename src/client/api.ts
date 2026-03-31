import type {
  AdminMutationPayload,
  AdminListFilters,
  AdminUserRecord,
  AuditLogListFilters,
  ApiTokenIssueResult,
  ApiTokenMutationPayload,
  ApiTokenRecord,
  ApiEnvelope,
  AuditLogRecord,
  DomainAssetRecord,
  DomainRoutingProfileMutationPayload,
  DomainRoutingProfileRecord,
  DomainAssetStatusRecord,
  DomainMutationPayload,
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
  MailboxPoolPayload,
  NotificationDeliveryAttemptRecord,
  NotificationDeliveriesPayload,
  NotificationDeliveryBulkActionResult,
  NotificationDeliveryRecord,
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
  RetentionJobRunRecord,
  RetentionPolicyPayload,
  RetentionPolicyRecord,
  RuleMutationPayload,
  RuleRecord,
  RuleTestResult,
  SessionPayload,
  WorkspaceCatalog,
  WorkspaceEnvironmentPayload,
  WorkspaceProjectPayload,
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

export async function getDomains(filters?: {
  environment_id?: number | null;
  project_id?: number | null;
  purpose?: "mailbox_create";
}) {
  const params = new URLSearchParams();
  if (filters?.project_id) params.set("project_id", String(filters.project_id));
  if (filters?.environment_id) params.set("environment_id", String(filters.environment_id));
  if (filters?.purpose) params.set("purpose", filters.purpose);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<DomainsPayload>(`/admin/domains${suffix}`);
}

export async function getDomainAssets(page: number) {
  return request<PaginationPayload<DomainAssetRecord>>(`/admin/domain-assets?page=${page}`);
}

export async function getDomainAssetStatuses() {
  return request<DomainAssetStatusRecord[]>("/admin/domain-assets/status");
}

export async function getDomainProviders() {
  return request<Array<import("../shared/domain-providers").DomainProviderDefinition>>("/admin/domain-providers");
}

export async function getDomainRoutingProfiles(page: number) {
  return request<PaginationPayload<DomainRoutingProfileRecord>>(`/admin/domain-routing-profiles?page=${page}`);
}

export async function createDomainAsset(payload: DomainMutationPayload) {
  return request<{ ok: true }>("/admin/domain-assets", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDomainAsset(id: number, payload: DomainMutationPayload) {
  return request<{ ok: true }>(`/admin/domain-assets/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function removeDomainAsset(id: number) {
  return request<{ ok: true }>(`/admin/domain-assets/${id}`, { method: "DELETE" });
}

export async function syncDomainAssetCatchAll(id: number) {
  return request<{ catch_all_enabled: boolean; catch_all_forward_to: string; configured: boolean; ok: true }>(
    `/admin/domain-assets/${id}/sync-catch-all`,
    { method: "POST" },
  );
}

export async function createDomainRoutingProfile(payload: DomainRoutingProfileMutationPayload) {
  return request<{ ok: true }>("/admin/domain-routing-profiles", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDomainRoutingProfile(id: number, payload: DomainRoutingProfileMutationPayload) {
  return request<{ ok: true }>(`/admin/domain-routing-profiles/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function removeDomainRoutingProfile(id: number) {
  return request<{ ok: true }>(`/admin/domain-routing-profiles/${id}`, { method: "DELETE" });
}

export async function getWorkspaceCatalog(includeDisabled = true) {
  const params = new URLSearchParams();
  if (includeDisabled) params.set("include_disabled", "1");
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<WorkspaceCatalog>(`/admin/workspace/catalog${suffix}`);
}

export async function getRetentionPolicies(
  page: number,
  filters: {
    environment_id?: number | null;
    is_enabled?: boolean | null;
    keyword?: string;
    mailbox_pool_id?: number | null;
    project_id?: number | null;
  } = {},
) {
  const params = new URLSearchParams({ page: String(page) });
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.project_id) params.set("project_id", String(filters.project_id));
  if (filters.environment_id) params.set("environment_id", String(filters.environment_id));
  if (filters.mailbox_pool_id) params.set("mailbox_pool_id", String(filters.mailbox_pool_id));
  if (filters.is_enabled !== null && filters.is_enabled !== undefined) {
    params.set("is_enabled", filters.is_enabled ? "1" : "0");
  }
  return request<PaginationPayload<RetentionPolicyRecord>>(`/admin/retention-policies?${params.toString()}`);
}

export async function getRetentionJobRuns(
  page: number,
  filters: {
    status?: "failed" | "success" | null;
    trigger_source?: string | null;
  } = {},
) {
  const params = new URLSearchParams({ page: String(page) });
  if (filters.status) params.set("status", filters.status);
  if (filters.trigger_source) params.set("trigger_source", filters.trigger_source);
  return request<PaginationPayload<RetentionJobRunRecord>>(`/admin/retention-jobs?${params.toString()}`);
}

export async function triggerRetentionJob() {
  return request<{ detail: Record<string, unknown>; job_id: number; ok: true }>("/admin/retention-jobs/run", {
    method: "POST",
  });
}

export async function createRetentionPolicy(payload: RetentionPolicyPayload) {
  return request<RetentionPolicyRecord>("/admin/retention-policies", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateRetentionPolicy(id: number, payload: RetentionPolicyPayload) {
  return request<RetentionPolicyRecord>(`/admin/retention-policies/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function removeRetentionPolicy(id: number) {
  return request<{ ok: true }>(`/admin/retention-policies/${id}`, { method: "DELETE" });
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

export async function archiveEmail(messageId: string) {
  return request<{ ok: true }>(`/admin/emails/${encodeURIComponent(messageId)}/archive`, { method: "POST" });
}

export async function unarchiveEmail(messageId: string) {
  return request<{ ok: true }>(`/admin/emails/${encodeURIComponent(messageId)}/unarchive`, { method: "POST" });
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

export async function getMailboxes(
  page: number,
  includeDeleted = false,
  filters: {
    environment_id?: number | null;
    keyword?: string;
    mailbox_pool_id?: number | null;
    project_id?: number | null;
  } = {},
) {
  const params = new URLSearchParams({ page: String(page) });
  if (includeDeleted) params.set("include_deleted", "1");
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.project_id) params.set("project_id", String(filters.project_id));
  if (filters.environment_id) params.set("environment_id", String(filters.environment_id));
  if (filters.mailbox_pool_id) params.set("mailbox_pool_id", String(filters.mailbox_pool_id));
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

export async function createProject(payload: WorkspaceProjectPayload) {
  return request<{ ok: true }>("/admin/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateProject(id: number, payload: WorkspaceProjectPayload) {
  return request<{ ok: true }>(`/admin/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function removeProject(id: number) {
  return request<{ ok: true }>(`/admin/projects/${id}`, { method: "DELETE" });
}

export async function createEnvironment(payload: WorkspaceEnvironmentPayload) {
  return request<{ ok: true }>("/admin/environments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateEnvironment(id: number, payload: WorkspaceEnvironmentPayload) {
  return request<{ ok: true }>(`/admin/environments/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function removeEnvironment(id: number) {
  return request<{ ok: true }>(`/admin/environments/${id}`, { method: "DELETE" });
}

export async function createMailboxPool(payload: MailboxPoolPayload) {
  return request<{ ok: true }>("/admin/mailbox-pools", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateMailboxPool(id: number, payload: MailboxPoolPayload) {
  return request<{ ok: true }>(`/admin/mailbox-pools/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function removeMailboxPool(id: number) {
  return request<{ ok: true }>(`/admin/mailbox-pools/${id}`, { method: "DELETE" });
}

export async function getAdmins(
  page: number,
  filters: AdminListFilters = {},
) {
  const params = new URLSearchParams({ page: String(page) });
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.role) params.set("role", filters.role);
  if (filters.access_scope) params.set("access_scope", filters.access_scope);
  if (filters.project_id) params.set("project_id", String(filters.project_id));
  if (filters.is_enabled !== null && filters.is_enabled !== undefined) {
    params.set("is_enabled", filters.is_enabled ? "1" : "0");
  }
  return request<PaginationPayload<AdminUserRecord>>(`/admin/admins?${params.toString()}`);
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

export async function getNotificationDeliveries(
  id: number,
  page: number,
  filters: {
    dead_letter_only?: boolean;
  } = {},
) {
  const params = new URLSearchParams({ page: String(page) });
  if (filters.dead_letter_only) params.set("dead_letter_only", "1");
  return request<NotificationDeliveriesPayload>(
    `/admin/notifications/${id}/deliveries?${params.toString()}`,
  );
}

export async function retryNotificationDelivery(id: number) {
  return request<{ delivery: NotificationDeliveryRecord; ok: true }>(
    `/admin/notifications/deliveries/${id}/retry`,
    { method: "POST" },
  );
}

export async function getNotificationDeliveryAttempts(id: number, page: number) {
  return request<PaginationPayload<NotificationDeliveryAttemptRecord>>(
    `/admin/notifications/deliveries/${id}/attempts?page=${page}`,
  );
}

export async function resolveNotificationDelivery(id: number) {
  return request<{ ok: true }>(
    `/admin/notifications/deliveries/${id}/resolve`,
    { method: "POST" },
  );
}

export async function retryNotificationDeliveries(ids: number[]) {
  return request<NotificationDeliveryBulkActionResult>(
    "/admin/notifications/deliveries/bulk-retry",
    {
      method: "POST",
      body: JSON.stringify({ delivery_ids: ids }),
    },
  );
}

export async function resolveNotificationDeliveries(ids: number[]) {
  return request<NotificationDeliveryBulkActionResult>(
    "/admin/notifications/deliveries/bulk-resolve",
    {
      method: "POST",
      body: JSON.stringify({ delivery_ids: ids }),
    },
  );
}

export async function getApiTokens(page: number) {
  return request<PaginationPayload<ApiTokenRecord>>(`/admin/api-tokens?page=${page}`);
}

export async function createApiToken(payload: ApiTokenMutationPayload) {
  return request<ApiTokenIssueResult>("/admin/api-tokens", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateApiToken(id: string, payload: ApiTokenMutationPayload) {
  return request<{ ok: true }>(`/admin/api-tokens/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function removeApiToken(id: string) {
  return request<{ ok: true }>(`/admin/api-tokens/${id}`, { method: "DELETE" });
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

export async function getAuditLogs(
  page: number,
  filters: AuditLogListFilters = {},
) {
  const params = new URLSearchParams({ page: String(page) });
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.entity_type) params.set("entity_type", filters.entity_type);
  if (filters.entity_id) params.set("entity_id", filters.entity_id);
  if (filters.action) params.set("action", filters.action);
  if (filters.action_prefix) params.set("action_prefix", filters.action_prefix);
  return request<PaginationPayload<AuditLogRecord>>(`/admin/audit?${params.toString()}`);
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
