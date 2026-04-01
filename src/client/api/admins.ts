import type {
  AdminListFilters,
  AdminMutationPayload,
  AdminUserRecord,
  PaginationPayload,
} from "../types";
import { request, withJsonBody } from "./core";

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
  return request<{ ok: true; user: AdminUserRecord }>("/admin/admins", withJsonBody("POST", payload));
}

export async function updateAdmin(id: string, payload: AdminMutationPayload) {
  return request<{ ok: true }>(`/admin/admins/${id}`, withJsonBody("PUT", payload));
}
