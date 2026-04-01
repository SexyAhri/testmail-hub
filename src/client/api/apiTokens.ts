import type {
  ApiTokenIssueResult,
  ApiTokenMutationPayload,
  ApiTokenRecord,
  AuditOperationPayload,
  PaginationPayload,
} from "../types";
import { request, withJsonBody, withOptionalJsonBody } from "./core";

export async function getApiTokens(page: number) {
  return request<PaginationPayload<ApiTokenRecord>>(`/admin/api-tokens?page=${page}`);
}

export async function createApiToken(payload: ApiTokenMutationPayload) {
  return request<ApiTokenIssueResult>("/admin/api-tokens", withJsonBody("POST", payload));
}

export async function updateApiToken(id: string, payload: ApiTokenMutationPayload) {
  return request<{ ok: true }>(`/admin/api-tokens/${id}`, withJsonBody("PUT", payload));
}

export async function removeApiToken(id: string, payload?: AuditOperationPayload) {
  return request<{ ok: true }>(`/admin/api-tokens/${id}`, withOptionalJsonBody("DELETE", payload));
}
