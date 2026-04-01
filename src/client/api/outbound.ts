import type {
  AuditOperationPayload,
  OutboundContactPayload,
  OutboundContactRecord,
  OutboundEmailPayload,
  OutboundEmailRecord,
  OutboundEmailSettings,
  OutboundEmailSettingsPayload,
  OutboundStats,
  OutboundTemplatePayload,
  OutboundTemplateRecord,
  PaginationPayload,
} from "../types";
import { request, withJsonBody, withOptionalJsonBody } from "./core";

export async function getOutboundSettings() {
  return request<OutboundEmailSettings>("/admin/outbound/settings");
}

export async function updateOutboundSettings(payload: OutboundEmailSettingsPayload) {
  return request<OutboundEmailSettings>("/admin/outbound/settings", withJsonBody("PUT", payload));
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
  return request<OutboundEmailRecord>("/admin/outbound/emails", withJsonBody("POST", payload));
}

export async function updateOutboundEmail(id: number, payload: OutboundEmailPayload) {
  return request<OutboundEmailRecord>(`/admin/outbound/emails/${id}`, withJsonBody("PUT", payload));
}

export async function sendStoredOutboundEmail(id: number) {
  return request<OutboundEmailRecord>(`/admin/outbound/emails/${id}/send`, { method: "POST" });
}

export async function deleteOutboundEmail(id: number, payload?: AuditOperationPayload) {
  return request<{ ok: true }>(`/admin/outbound/emails/${id}`, withOptionalJsonBody("DELETE", payload));
}

export async function getOutboundStats() {
  return request<OutboundStats>("/admin/outbound/stats");
}

export async function getOutboundTemplates() {
  return request<OutboundTemplateRecord[]>("/admin/outbound/templates");
}

export async function createOutboundTemplate(payload: OutboundTemplatePayload) {
  return request<{ ok: true }>("/admin/outbound/templates", withJsonBody("POST", payload));
}

export async function updateOutboundTemplate(id: number, payload: OutboundTemplatePayload) {
  return request<{ ok: true }>(`/admin/outbound/templates/${id}`, withJsonBody("PUT", payload));
}

export async function removeOutboundTemplate(id: number, payload?: AuditOperationPayload) {
  return request<{ ok: true }>(`/admin/outbound/templates/${id}`, withOptionalJsonBody("DELETE", payload));
}

export async function getOutboundContacts() {
  return request<OutboundContactRecord[]>("/admin/outbound/contacts");
}

export async function createOutboundContact(payload: OutboundContactPayload) {
  return request<{ ok: true }>("/admin/outbound/contacts", withJsonBody("POST", payload));
}

export async function updateOutboundContact(id: number, payload: OutboundContactPayload) {
  return request<{ ok: true }>(`/admin/outbound/contacts/${id}`, withJsonBody("PUT", payload));
}

export async function removeOutboundContact(id: number, payload?: AuditOperationPayload) {
  return request<{ ok: true }>(`/admin/outbound/contacts/${id}`, withOptionalJsonBody("DELETE", payload));
}
