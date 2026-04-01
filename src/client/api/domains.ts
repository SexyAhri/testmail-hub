import type {
  AuditOperationPayload,
  DomainAssetRecord,
  DomainAssetStatusRecord,
  DomainMutationPayload,
  DomainRoutingProfileMutationPayload,
  DomainRoutingProfileRecord,
  DomainSyncPayload,
  DomainsPayload,
  PaginationPayload,
} from "../types";
import type { DomainProviderDefinition } from "../../shared/domain-providers";
import { request, withJsonBody, withOptionalJsonBody } from "./core";

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
  return request<DomainProviderDefinition[]>("/admin/domain-providers");
}

export async function getDomainRoutingProfiles(page: number) {
  return request<PaginationPayload<DomainRoutingProfileRecord>>(`/admin/domain-routing-profiles?page=${page}`);
}

export async function createDomainAsset(payload: DomainMutationPayload) {
  return request<{ ok: true }>("/admin/domain-assets", withJsonBody("POST", payload));
}

export async function updateDomainAsset(id: number, payload: DomainMutationPayload) {
  return request<{ ok: true }>(`/admin/domain-assets/${id}`, withJsonBody("PUT", payload));
}

export async function removeDomainAsset(id: number, payload?: AuditOperationPayload) {
  return request<{ ok: true }>(`/admin/domain-assets/${id}`, withOptionalJsonBody("DELETE", payload));
}

export async function syncDomainAssetCatchAll(id: number, payload?: DomainSyncPayload) {
  return request<{ catch_all_enabled: boolean; catch_all_forward_to: string; configured: boolean; ok: true }>(
    `/admin/domain-assets/${id}/sync-catch-all`,
    withOptionalJsonBody("POST", payload),
  );
}

export async function syncDomainAssetMailboxRoutes(id: number, payload?: DomainSyncPayload) {
  return request<{
    cloudflare_routes_total: number;
    configured: boolean;
    created_count: number;
    deleted_count: number;
    enabled_routes_total: number;
    expected_total: number;
    ok: true;
    skipped_count: number;
    updated_count: number;
  }>(
    `/admin/domain-assets/${id}/sync-mailbox-routes`,
    withOptionalJsonBody("POST", payload),
  );
}

export async function createDomainRoutingProfile(payload: DomainRoutingProfileMutationPayload) {
  return request<{ ok: true }>("/admin/domain-routing-profiles", withJsonBody("POST", payload));
}

export async function updateDomainRoutingProfile(id: number, payload: DomainRoutingProfileMutationPayload) {
  return request<{ ok: true }>(`/admin/domain-routing-profiles/${id}`, withJsonBody("PUT", payload));
}

export async function removeDomainRoutingProfile(id: number, payload?: AuditOperationPayload) {
  return request<{ ok: true }>(`/admin/domain-routing-profiles/${id}`, withOptionalJsonBody("DELETE", payload));
}
