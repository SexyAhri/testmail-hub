import {
  addAuditLog,
  createNotificationEndpoint,
  deleteNotificationEndpoint,
  getNotificationDeliveriesPaged,
  getNotificationDeliveryAttemptsPaged,
  getNotificationDeliveryById,
  getNotificationEndpointById,
  getNotificationEndpointsPaged,
  resolveNotificationDeliveryDeadLetter,
  updateNotificationEndpoint,
} from "../../core/db";
import {
  retryNotificationDelivery,
  sendTestNotification,
} from "../../core/notifications";
import { normalizeNotificationEventValue } from "../../utils/constants";
import { ADMIN_PAGE_SIZE } from "../../utils/constants";
import { clampPage, json, jsonError, readJsonBody } from "../../utils/utils";
import type { AuthSession, D1Database, JsonValue } from "../../server/types";
import {
  ensureActorCanAccessAnyProject,
  ensureActorCanAccessProject,
  ensureActorCanWrite,
  getActorProjectIds,
} from "../access-control";
import {
  buildResourceDeleteAuditDetail,
  buildResourceUpdateAuditDetail,
  readRequestAuditOperationNote,
  toNotificationAuditSnapshot,
  withAuditOperationNote,
} from "../audit";
import { parseNotificationDeliveryIds } from "../request-helpers";
import { validateNotificationBody } from "../validation";

export async function handleAdminNotificationsGet(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  const payload = await getNotificationEndpointsPaged(
    db,
    page,
    ADMIN_PAGE_SIZE,
    getActorProjectIds(actor),
  );
  return json(payload);
}

export async function handleAdminNotificationDeliveriesGet(
  pathname: string,
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const match = pathname.match(/^\/admin\/notifications\/(\d+)\/deliveries$/);
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0) {
    return jsonError("invalid notification id", 400);
  }

  const endpoint = await getNotificationEndpointById(db, id);
  if (!endpoint) return jsonError("notification endpoint not found", 404);
  try {
    if (endpoint.access_scope === "all") {
      ensureActorCanAccessProject(actor, null);
    } else {
      ensureActorCanAccessAnyProject(
        actor,
        endpoint.projects.map((project) => project.id),
      );
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const page = clampPage(url.searchParams.get("page"));
  const deadLetterOnly =
    url.searchParams.get("dead_letter_only") === "1" ||
    url.searchParams.get("dead_letter_only") === "true";
  return json(
    await getNotificationDeliveriesPaged(db, page, ADMIN_PAGE_SIZE, id, {
      dead_letter_only: deadLetterOnly,
    }),
  );
}

export async function handleAdminNotificationDeliveryAttemptsGet(
  pathname: string,
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const match = pathname.match(
    /^\/admin\/notifications\/deliveries\/(\d+)\/attempts$/,
  );
  const deliveryId = Number(match?.[1] || 0);
  if (!Number.isFinite(deliveryId) || deliveryId <= 0) {
    return jsonError("invalid notification delivery id", 400);
  }

  const delivery = await getNotificationDeliveryById(db, deliveryId);
  if (!delivery) return jsonError("notification delivery not found", 404);

  const endpoint = await getNotificationEndpointById(
    db,
    delivery.notification_endpoint_id,
  );
  if (!endpoint) return jsonError("notification endpoint not found", 404);
  try {
    if (endpoint.access_scope === "all") {
      ensureActorCanAccessProject(actor, null);
    } else {
      ensureActorCanAccessAnyProject(
        actor,
        endpoint.projects.map((project) => project.id),
      );
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const page = clampPage(url.searchParams.get("page"));
  return json(
    await getNotificationDeliveryAttemptsPaged(
      db,
      page,
      ADMIN_PAGE_SIZE,
      deliveryId,
    ),
  );
}

export async function handleAdminNotificationsPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateNotificationBody(parsed.data || {}, actor);
  if (!validation.ok) return jsonError(validation.error, 400);

  const { operation_note, ...createData } = validation.data;
  const id = await createNotificationEndpoint(db, createData);
  await addAuditLog(db, {
    action: "notification.create",
    actor,
    detail: withAuditOperationNote(
      {
        id,
        ...toNotificationAuditSnapshot(createData),
      },
      operation_note,
    ),
    entity_id: String(id),
    entity_type: "notification_endpoint",
  });
  return json({ ok: true });
}

export async function handleAdminNotificationsPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = Number(pathname.replace("/admin/notifications/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid notification id", 400);

  const existing = await getNotificationEndpointById(db, id);
  if (!existing) return jsonError("notification endpoint not found", 404);
  try {
    if (existing.access_scope === "all") {
      ensureActorCanAccessProject(actor, null);
    } else {
      ensureActorCanAccessAnyProject(
        actor,
        existing.projects.map((project) => project.id),
      );
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateNotificationBody(parsed.data || {}, actor);
  if (!validation.ok) return jsonError(validation.error, 400);

  const { operation_note, ...updateData } = validation.data;
  const previous = toNotificationAuditSnapshot(existing);
  const next = toNotificationAuditSnapshot(updateData);
  await updateNotificationEndpoint(db, id, updateData);
  await addAuditLog(db, {
    action: "notification.update",
    actor,
    detail: buildResourceUpdateAuditDetail(
      previous,
      next,
      [
        "access_scope",
        "alert_config",
        "custom_header_keys",
        "events",
        "is_enabled",
        "name",
        "project_ids",
        "secret_configured",
        "target",
        "type",
      ],
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "notification_endpoint",
  });
  return json({ ok: true });
}

export async function handleAdminNotificationsDelete(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = Number(pathname.replace("/admin/notifications/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid notification id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;
  const existing = await getNotificationEndpointById(db, id);
  if (!existing) return jsonError("notification endpoint not found", 404);
  try {
    if (existing.access_scope === "all") {
      ensureActorCanAccessProject(actor, null);
    } else {
      ensureActorCanAccessAnyProject(
        actor,
        existing.projects.map((project) => project.id),
      );
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }
  await deleteNotificationEndpoint(db, id);
  await addAuditLog(db, {
    action: "notification.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toNotificationAuditSnapshot(existing),
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "notification_endpoint",
  });
  return json({ ok: true });
}

export async function handleAdminNotificationsTest(
  request: Request,
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = Number(
    pathname.replace("/admin/notifications/", "").replace("/test", ""),
  );
  if (!Number.isFinite(id)) return jsonError("invalid notification id", 400);
  const endpoint = await getNotificationEndpointById(db, id);
  if (!endpoint) return jsonError("notification endpoint not found", 404);
  try {
    if (endpoint.access_scope === "all") {
      ensureActorCanAccessProject(actor, null);
    } else {
      ensureActorCanAccessAnyProject(
        actor,
        endpoint.projects.map((project) => project.id),
      );
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }
  const contentLength = Number(request.headers.get("content-length") || "0");
  const parsed = contentLength > 0
    ? await readJsonBody<Record<string, JsonValue>>(request)
    : { ok: true as const, data: {} as Record<string, JsonValue> };
  if (!parsed.ok) {
    return jsonError(parsed.error || "invalid JSON body", 400);
  }
  const parsedBody = parsed.data || {};

  const requestedEvent = normalizeNotificationEventValue(String(parsedBody.event || "").trim() || "email.received");
  if (!requestedEvent) {
    return jsonError("invalid notification test event", 400);
  }

  await sendTestNotification(db, endpoint, {
    event: requestedEvent === "*" ? "email.received" : requestedEvent,
    payload: parsedBody.payload,
  });
  return json({ ok: true });
}

export async function handleAdminNotificationDeliveryRetry(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const match = pathname.match(
    /^\/admin\/notifications\/deliveries\/(\d+)\/retry$/,
  );
  const deliveryId = Number(match?.[1] || 0);
  if (!Number.isFinite(deliveryId) || deliveryId <= 0) {
    return jsonError("invalid notification delivery id", 400);
  }

  const sourceDelivery = await getNotificationDeliveryById(db, deliveryId);
  if (!sourceDelivery) return jsonError("notification delivery not found", 404);

  const endpoint = await getNotificationEndpointById(
    db,
    sourceDelivery.notification_endpoint_id,
  );
  if (!endpoint) return jsonError("notification endpoint not found", 404);
  try {
    if (endpoint.access_scope === "all") {
      ensureActorCanAccessProject(actor, null);
    } else {
      ensureActorCanAccessAnyProject(
        actor,
        endpoint.projects.map((project) => project.id),
      );
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const delivery = await retryNotificationDelivery(db, deliveryId);
  if (!delivery) return jsonError("notification delivery not found", 404);

  if (sourceDelivery.is_dead_letter) {
    await resolveNotificationDeliveryDeadLetter(
      db,
      sourceDelivery.id,
      actor.username,
    );
  }

  await addAuditLog(db, {
    action: "notification.delivery.retry",
    actor,
    detail: {
      delivery_id: delivery.id,
      event: delivery.event,
      notification_endpoint_id: delivery.notification_endpoint_id,
      source_delivery_id: deliveryId,
      status: delivery.status,
    },
    entity_id: String(delivery.id),
    entity_type: "notification_delivery",
  });
  return json({ delivery, ok: true });
}

export async function handleAdminNotificationDeliveryResolve(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const match = pathname.match(
    /^\/admin\/notifications\/deliveries\/(\d+)\/resolve$/,
  );
  const deliveryId = Number(match?.[1] || 0);
  if (!Number.isFinite(deliveryId) || deliveryId <= 0) {
    return jsonError("invalid notification delivery id", 400);
  }

  const delivery = await getNotificationDeliveryById(db, deliveryId);
  if (!delivery) return jsonError("notification delivery not found", 404);

  const endpoint = await getNotificationEndpointById(
    db,
    delivery.notification_endpoint_id,
  );
  if (!endpoint) return jsonError("notification endpoint not found", 404);
  try {
    if (endpoint.access_scope === "all") {
      ensureActorCanAccessProject(actor, null);
    } else {
      ensureActorCanAccessAnyProject(
        actor,
        endpoint.projects.map((project) => project.id),
      );
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  if (!delivery.is_dead_letter) {
    return jsonError("notification delivery is not in dead letter queue", 409);
  }

  await resolveNotificationDeliveryDeadLetter(db, delivery.id, actor.username);
  await addAuditLog(db, {
    action: "notification.delivery.resolve",
    actor,
    detail: {
      delivery_id: delivery.id,
      event: delivery.event,
      notification_endpoint_id: delivery.notification_endpoint_id,
    },
    entity_id: String(delivery.id),
    entity_type: "notification_delivery",
  });
  return json({ ok: true });
}

export async function handleAdminNotificationDeliveryBulkRetry(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = parseNotificationDeliveryIds(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const status_breakdown = {
    failed: 0,
    pending: 0,
    retrying: 0,
    success: 0,
  } as Record<"failed" | "pending" | "retrying" | "success", number>;
  const errors: Array<{ delivery_id: number; message: string }> = [];
  let success_count = 0;

  for (const deliveryId of validation.data) {
    try {
      const sourceDelivery = await getNotificationDeliveryById(db, deliveryId);
      if (!sourceDelivery) {
        errors.push({
          delivery_id: deliveryId,
          message: "notification delivery not found",
        });
        continue;
      }

      const endpoint = await getNotificationEndpointById(
        db,
        sourceDelivery.notification_endpoint_id,
      );
      if (!endpoint) {
        errors.push({
          delivery_id: deliveryId,
          message: "notification endpoint not found",
        });
        continue;
      }

      if (endpoint.access_scope === "all") {
        ensureActorCanAccessProject(actor, null);
      } else {
        ensureActorCanAccessAnyProject(
          actor,
          endpoint.projects.map((project) => project.id),
        );
      }

      if (!sourceDelivery.is_dead_letter) {
        errors.push({
          delivery_id: deliveryId,
          message: "notification delivery is not in dead letter queue",
        });
        continue;
      }

      const delivery = await retryNotificationDelivery(db, deliveryId);
      if (!delivery) {
        errors.push({
          delivery_id: deliveryId,
          message: "notification delivery not found",
        });
        continue;
      }

      await resolveNotificationDeliveryDeadLetter(
        db,
        sourceDelivery.id,
        actor.username,
      );
      status_breakdown[delivery.status] += 1;
      success_count += 1;
    } catch (error) {
      errors.push({
        delivery_id: deliveryId,
        message:
          error instanceof Error
            ? error.message
            : "notification delivery retry failed",
      });
    }
  }

  await addAuditLog(db, {
    action: "notification.delivery.bulk_retry",
    actor,
    detail: {
      delivery_ids: validation.data,
      failed_count: errors.length,
      requested_count: validation.data.length,
      status_breakdown,
      success_count,
    },
    entity_id: "",
    entity_type: "notification_delivery",
  });

  return json({
    errors,
    failed_count: errors.length,
    ok: true,
    requested_count: validation.data.length,
    status_breakdown,
    success_count,
  });
}

export async function handleAdminNotificationDeliveryBulkResolve(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = parseNotificationDeliveryIds(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const errors: Array<{ delivery_id: number; message: string }> = [];
  let success_count = 0;

  for (const deliveryId of validation.data) {
    try {
      const delivery = await getNotificationDeliveryById(db, deliveryId);
      if (!delivery) {
        errors.push({
          delivery_id: deliveryId,
          message: "notification delivery not found",
        });
        continue;
      }

      const endpoint = await getNotificationEndpointById(
        db,
        delivery.notification_endpoint_id,
      );
      if (!endpoint) {
        errors.push({
          delivery_id: deliveryId,
          message: "notification endpoint not found",
        });
        continue;
      }

      if (endpoint.access_scope === "all") {
        ensureActorCanAccessProject(actor, null);
      } else {
        ensureActorCanAccessAnyProject(
          actor,
          endpoint.projects.map((project) => project.id),
        );
      }

      if (!delivery.is_dead_letter) {
        errors.push({
          delivery_id: deliveryId,
          message: "notification delivery is not in dead letter queue",
        });
        continue;
      }

      await resolveNotificationDeliveryDeadLetter(
        db,
        delivery.id,
        actor.username,
      );
      success_count += 1;
    } catch (error) {
      errors.push({
        delivery_id: deliveryId,
        message:
          error instanceof Error
            ? error.message
            : "notification delivery resolve failed",
      });
    }
  }

  await addAuditLog(db, {
    action: "notification.delivery.bulk_resolve",
    actor,
    detail: {
      delivery_ids: validation.data,
      failed_count: errors.length,
      requested_count: validation.data.length,
      success_count,
    },
    entity_id: "",
    entity_type: "notification_delivery",
  });

  return json({
    errors,
    failed_count: errors.length,
    ok: true,
    requested_count: validation.data.length,
    success_count,
  });
}
