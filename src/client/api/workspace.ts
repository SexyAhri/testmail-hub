import type {
  AuditOperationPayload,
  MailboxPoolPayload,
  WorkspaceCatalog,
  WorkspaceEnvironmentPayload,
  WorkspaceProjectPayload,
} from "../types";
import { request, withJsonBody, withOptionalJsonBody } from "./core";

export async function getWorkspaceCatalog(includeDisabled = true) {
  const params = new URLSearchParams();
  if (includeDisabled) params.set("include_disabled", "1");
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<WorkspaceCatalog>(`/admin/workspace/catalog${suffix}`);
}

export async function createProject(payload: WorkspaceProjectPayload) {
  return request<{ ok: true }>("/admin/projects", withJsonBody("POST", payload));
}

export async function updateProject(id: number, payload: WorkspaceProjectPayload) {
  return request<{ ok: true }>(`/admin/projects/${id}`, withJsonBody("PUT", payload));
}

export async function removeProject(id: number, payload?: AuditOperationPayload) {
  return request<{ ok: true }>(`/admin/projects/${id}`, withOptionalJsonBody("DELETE", payload));
}

export async function createEnvironment(payload: WorkspaceEnvironmentPayload) {
  return request<{ ok: true }>("/admin/environments", withJsonBody("POST", payload));
}

export async function updateEnvironment(id: number, payload: WorkspaceEnvironmentPayload) {
  return request<{ ok: true }>(`/admin/environments/${id}`, withJsonBody("PUT", payload));
}

export async function removeEnvironment(id: number, payload?: AuditOperationPayload) {
  return request<{ ok: true }>(`/admin/environments/${id}`, withOptionalJsonBody("DELETE", payload));
}

export async function createMailboxPool(payload: MailboxPoolPayload) {
  return request<{ ok: true }>("/admin/mailbox-pools", withJsonBody("POST", payload));
}

export async function updateMailboxPool(id: number, payload: MailboxPoolPayload) {
  return request<{ ok: true }>(`/admin/mailbox-pools/${id}`, withJsonBody("PUT", payload));
}

export async function removeMailboxPool(id: number, payload?: AuditOperationPayload) {
  return request<{ ok: true }>(`/admin/mailbox-pools/${id}`, withOptionalJsonBody("DELETE", payload));
}
