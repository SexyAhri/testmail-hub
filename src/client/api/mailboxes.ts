import type {
  AuditOperationPayload,
  MailboxRecord,
  MailboxSyncRunRecord,
  MailboxSyncStartResult,
  PaginationPayload,
} from "../types";
import type { MailboxPayload } from "../types";
import { request, withJsonBody, withOptionalJsonBody } from "./core";

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
  return request<{ count: number; ok: true }>("/admin/mailboxes", withJsonBody("POST", payload));
}

export async function updateMailbox(id: number, payload: MailboxPayload) {
  return request<{ ok: true }>(`/admin/mailboxes/${id}`, withJsonBody("PUT", payload));
}

export async function removeMailbox(id: number, payload?: AuditOperationPayload) {
  return request<{ ok: true }>(`/admin/mailboxes/${id}`, withOptionalJsonBody("DELETE", payload));
}

export async function syncMailboxes() {
  return request<MailboxSyncStartResult>("/admin/mailboxes/sync", { method: "POST" });
}

export async function getMailboxSyncRun(id: number) {
  return request<MailboxSyncRunRecord>(`/admin/mailboxes/sync-runs/${id}`, {
    trackActivity: false,
  });
}

export async function getLatestMailboxSyncRun() {
  return request<MailboxSyncRunRecord | null>("/admin/mailboxes/sync-runs/latest", {
    trackActivity: false,
  });
}
