import type {
  AuditOperationPayload,
  PaginationPayload,
  WhitelistMutationPayload,
  WhitelistRecord,
  WhitelistSettings,
} from "../types";
import { request, withJsonBody, withOptionalJsonBody } from "./core";

export async function getWhitelist(page: number) {
  return request<PaginationPayload<WhitelistRecord>>(`/admin/whitelist?page=${page}`);
}

export async function createWhitelist(payload: WhitelistMutationPayload) {
  return request<{ ok: true }>("/admin/whitelist", withJsonBody("POST", payload));
}

export async function updateWhitelist(id: number, payload: WhitelistMutationPayload) {
  return request<{ ok: true }>(`/admin/whitelist/${id}`, withJsonBody("PUT", payload));
}

export async function removeWhitelist(id: number, payload?: AuditOperationPayload) {
  return request<{ ok: true }>(`/admin/whitelist/${id}`, withOptionalJsonBody("DELETE", payload));
}

export async function getWhitelistSettings() {
  return request<WhitelistSettings>("/admin/whitelist/settings");
}

export async function updateWhitelistSettings(payload: WhitelistSettings) {
  return request<WhitelistSettings>("/admin/whitelist/settings", withJsonBody("PUT", payload));
}
