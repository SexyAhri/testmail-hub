import type {
  AuditOperationPayload,
  EmailDetail,
  EmailMetadataPayload,
  EmailSearchPayload,
  EmailSummary,
  PaginationPayload,
} from "../types";
import { request, withJsonBody, withOptionalJsonBody } from "./core";

export async function getEmails(params: URLSearchParams) {
  return request<PaginationPayload<EmailSummary>>(`/admin/emails?${params.toString()}`);
}

export async function getEmailDetail(messageId: string) {
  return request<EmailDetail>(`/admin/emails/${encodeURIComponent(messageId)}`);
}

export async function updateEmailMetadata(messageId: string, payload: EmailMetadataPayload) {
  return request<EmailDetail>(`/admin/emails/${encodeURIComponent(messageId)}/metadata`, withJsonBody("PUT", payload));
}

export async function deleteEmail(messageId: string, payload?: AuditOperationPayload) {
  return request<{ ok: true }>(`/admin/emails/${encodeURIComponent(messageId)}`, withOptionalJsonBody("DELETE", payload));
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

export async function purgeEmail(messageId: string, payload?: AuditOperationPayload) {
  return request<{ ok: true }>(
    `/admin/emails/${encodeURIComponent(messageId)}/purge`,
    withOptionalJsonBody("DELETE", payload),
  );
}

export function buildAttachmentDownloadUrl(messageId: string, attachmentId: number) {
  return `/admin/emails/${encodeURIComponent(messageId)}/attachments/${attachmentId}`;
}

export function buildEmailSearchParams(filters: EmailSearchPayload) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  return params;
}
