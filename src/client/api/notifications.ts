import type {
  AuditOperationPayload,
  NotificationDeliveryAttemptRecord,
  NotificationDeliveryBulkActionResult,
  NotificationDeliveryRecord,
  NotificationDeliveriesPayload,
  NotificationEndpointRecord,
  NotificationMutationPayload,
  PaginationPayload,
} from "../types";
import { request, withJsonBody, withOptionalJsonBody } from "./core";

export async function getNotifications(page: number) {
  return request<PaginationPayload<NotificationEndpointRecord>>(`/admin/notifications?page=${page}`);
}

export async function createNotification(payload: NotificationMutationPayload) {
  return request<{ ok: true }>("/admin/notifications", withJsonBody("POST", payload));
}

export async function updateNotification(id: number, payload: NotificationMutationPayload) {
  return request<{ ok: true }>(`/admin/notifications/${id}`, withJsonBody("PUT", payload));
}

export async function removeNotification(id: number, payload?: AuditOperationPayload) {
  return request<{ ok: true }>(`/admin/notifications/${id}`, withOptionalJsonBody("DELETE", payload));
}

export async function testNotification(id: number, payload?: { event: string; payload: unknown }) {
  return request<{ ok: true }>(
    `/admin/notifications/${id}/test`,
    payload ? withJsonBody("POST", payload) : { method: "POST" },
  );
}

export async function getNotificationDeliveries(
  id: number,
  page: number,
  filters: {
    dead_letter_only?: boolean;
  } = {},
) {
  const params = new URLSearchParams({ page: String(page) });
  if (filters.dead_letter_only) params.set("dead_letter_only", "1");
  return request<NotificationDeliveriesPayload>(`/admin/notifications/${id}/deliveries?${params.toString()}`);
}

export async function retryNotificationDelivery(id: number) {
  return request<{ delivery: NotificationDeliveryRecord; ok: true }>(
    `/admin/notifications/deliveries/${id}/retry`,
    { method: "POST" },
  );
}

export async function getNotificationDeliveryAttempts(id: number, page: number) {
  return request<PaginationPayload<NotificationDeliveryAttemptRecord>>(
    `/admin/notifications/deliveries/${id}/attempts?page=${page}`,
  );
}

export async function resolveNotificationDelivery(id: number) {
  return request<{ ok: true }>(`/admin/notifications/deliveries/${id}/resolve`, { method: "POST" });
}

export async function retryNotificationDeliveries(ids: number[]) {
  return request<NotificationDeliveryBulkActionResult>(
    "/admin/notifications/deliveries/bulk-retry",
    withJsonBody("POST", { delivery_ids: ids }),
  );
}

export async function resolveNotificationDeliveries(ids: number[]) {
  return request<NotificationDeliveryBulkActionResult>(
    "/admin/notifications/deliveries/bulk-resolve",
    withJsonBody("POST", { delivery_ids: ids }),
  );
}
