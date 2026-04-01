import type {
  AuditOperationPayload,
  PaginationPayload,
  RuleMutationPayload,
  RuleRecord,
  RuleTestResult,
} from "../types";
import { request, withJsonBody, withOptionalJsonBody } from "./core";

export async function getRules(page: number) {
  return request<PaginationPayload<RuleRecord>>(`/admin/rules?page=${page}`);
}

export async function createRule(payload: RuleMutationPayload) {
  return request<{ ok: true }>("/admin/rules", withJsonBody("POST", payload));
}

export async function updateRule(id: number, payload: RuleMutationPayload) {
  return request<{ ok: true }>(`/admin/rules/${id}`, withJsonBody("PUT", payload));
}

export async function removeRule(id: number, payload?: AuditOperationPayload) {
  return request<{ ok: true }>(`/admin/rules/${id}`, withOptionalJsonBody("DELETE", payload));
}

export async function testRules(payload: { content: string; sender: string }) {
  return request<RuleTestResult>("/admin/rules/test", withJsonBody("POST", payload));
}
