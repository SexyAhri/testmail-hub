import type {
  AuditLogListFilters,
  AuditLogRecord,
  ErrorEventsPayload,
  OverviewStats,
  PaginationPayload,
} from "../types";
import { request } from "./core";

export async function getOverviewStats() {
  return request<OverviewStats>("/admin/stats/overview");
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
