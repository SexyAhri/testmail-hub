import type {
  AuditOperationPayload,
  PaginationPayload,
  RetentionJobAction,
  RetentionJobRunRecord,
  RetentionJobRunSummary,
  RetentionPolicyPayload,
  RetentionPolicyRecord,
} from "../types";
import { request, withJsonBody, withOptionalJsonBody } from "./core";

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

export async function getRetentionJobRunSummary() {
  return request<RetentionJobRunSummary>("/admin/retention-jobs/summary");
}

export async function triggerRetentionJob(actions?: RetentionJobAction[]) {
  return request<{ detail: Record<string, unknown>; job_id: number; ok: true }>(
    "/admin/retention-jobs/run",
    actions?.length ? withJsonBody("POST", { actions }) : { method: "POST" },
  );
}

export async function createRetentionPolicy(payload: RetentionPolicyPayload) {
  return request<RetentionPolicyRecord>("/admin/retention-policies", withJsonBody("POST", payload));
}

export async function updateRetentionPolicy(id: number, payload: RetentionPolicyPayload) {
  return request<RetentionPolicyRecord>(`/admin/retention-policies/${id}`, withJsonBody("PUT", payload));
}

export async function removeRetentionPolicy(id: number, payload?: AuditOperationPayload) {
  return request<{ ok: true }>(`/admin/retention-policies/${id}`, withOptionalJsonBody("DELETE", payload));
}
