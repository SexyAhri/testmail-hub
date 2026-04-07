import {
  createNotificationDeliveryAttemptRecord,
  createNotificationDeliveryRecord,
  getAllNotificationEndpoints,
  getDueNotificationDeliveries,
  getNotificationDeliveryById,
  getNotificationEndpointById,
  updateNotificationDelivery,
  updateNotificationDeliveryRecord,
} from "./db";
import { encodeBase64Url, isSqliteSchemaError } from "../utils/utils";
import type {
  D1Database,
  JsonValue,
  NotificationCustomHeader,
  NotificationDeliveryRecord,
  NotificationDeliveryScope,
  NotificationDeliveryStatus,
  NotificationEndpointRecord,
} from "../server/types";
import type { NotificationEvent } from "../utils/constants";

const encoder = new TextEncoder();
const DEFAULT_MAX_ATTEMPTS = 4;
const RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000];

type NotificationScopeContext = NotificationDeliveryScope;

class NotificationRequestError extends Error {
  responseStatus: number | null;

  constructor(message: string, responseStatus: number | null = null) {
    super(message);
    this.name = "NotificationRequestError";
    this.responseStatus = responseStatus;
  }
}

export async function sendEventNotifications(
  db: D1Database,
  event: NotificationEvent,
  payload: JsonValue,
  scope: NotificationScopeContext = {},
): Promise<void> {
  let endpoints;
  try {
    endpoints = await getAllNotificationEndpoints(db);
  } catch (error) {
    if (isSqliteSchemaError(error)) {
      console.warn("[notification] skipped because schema is outdated:", error);
      return;
    }
    throw error;
  }

  const targets = filterTargets(endpoints, event, scope);

  for (const endpoint of targets) {
    await deliverFreshNotification(db, endpoint, event, payload, scope);
  }
}

export async function sendTestNotification(
  db: D1Database,
  endpoint: NotificationEndpointRecord,
  input: {
    event?: NotificationEvent;
    payload?: JsonValue;
  } = {},
): Promise<void> {
  const scope =
    endpoint.access_scope === "bound"
      ? {
          project_id: endpoint.projects[0]?.id || null,
          project_ids: endpoint.projects.map(project => project.id),
        }
      : {};
  const event = input.event || "email.received";
  const payload = input.payload || {
    event,
    source: "testmail-hub",
    test: true,
    timestamp: Date.now(),
  };

  await deliverFreshNotification(
    db,
    endpoint,
    event,
    payload,
    scope,
  );
}

export async function retryNotificationDelivery(
  db: D1Database,
  deliveryId: number,
): Promise<NotificationDeliveryRecord | null> {
  const source = await getNotificationDeliveryById(db, deliveryId);
  if (!source) return null;

  const endpoint = await getNotificationEndpointById(db, source.notification_endpoint_id);
  if (!endpoint) {
    throw new Error("notification endpoint not found");
  }

  const replay = await createNotificationDeliveryRecord(db, {
    event: source.event,
    max_attempts: source.max_attempts,
    notification_endpoint_id: source.notification_endpoint_id,
    payload: source.payload,
    scope: source.scope,
  });

  return attemptNotificationDelivery(db, endpoint, replay);
}

export async function processDueNotificationRetries(
  db: D1Database,
  limit = 20,
): Promise<{ failed: number; processed: number; retrying: number; success: number }> {
  let deliveries: NotificationDeliveryRecord[];
  try {
    deliveries = await getDueNotificationDeliveries(db, limit);
  } catch (error) {
    if (isSqliteSchemaError(error)) {
      return { failed: 0, processed: 0, retrying: 0, success: 0 };
    }
    throw error;
  }

  let failed = 0;
  let processed = 0;
  let retrying = 0;
  let success = 0;

  for (const delivery of deliveries) {
    const endpoint = await getNotificationEndpointById(db, delivery.notification_endpoint_id);
    if (!endpoint || !endpoint.is_enabled) {
      processed += 1;
      failed += 1;
      await markDeliveryAsTerminalFailure(
        db,
        delivery,
        endpoint ? "notification endpoint is disabled" : "notification endpoint not found",
        endpoint?.id || null,
      );
      continue;
    }

    const result = await attemptNotificationDelivery(db, endpoint, delivery);
    processed += 1;
    if (result.status === "success") success += 1;
    else if (result.status === "retrying") retrying += 1;
    else failed += 1;
  }

  return { failed, processed, retrying, success };
}

function filterTargets(
  endpoints: NotificationEndpointRecord[],
  event: NotificationEvent,
  scope: NotificationScopeContext,
): NotificationEndpointRecord[] {
  const scopedProjectIds = Array.from(
    new Set(
      [
        ...((Array.isArray(scope.project_ids) ? scope.project_ids : []).map(item => Number(item))),
        Number(scope.project_id || 0),
      ].filter(item => Number.isFinite(item) && item > 0),
    ),
  );

  return endpoints.filter(item =>
    item.is_enabled
    && (item.events.includes(event) || item.events.includes("*"))
    && (
      item.access_scope !== "bound"
      || (scopedProjectIds.length > 0 && item.projects.some(project => scopedProjectIds.includes(project.id)))
    ),
  );
}

async function deliverFreshNotification(
  db: D1Database,
  endpoint: NotificationEndpointRecord,
  event: NotificationEvent,
  payload: JsonValue,
  scope: NotificationScopeContext,
): Promise<void> {
  try {
    const delivery = await createNotificationDeliveryRecord(db, {
      event,
      max_attempts: DEFAULT_MAX_ATTEMPTS,
      notification_endpoint_id: endpoint.id,
      payload,
      scope,
    });
    await attemptNotificationDelivery(db, endpoint, delivery);
    return;
  } catch (error) {
    if (!isSqliteSchemaError(error)) throw error;
  }

  await deliverWithoutLog(db, endpoint, event, payload, scope);
}

async function attemptNotificationDelivery(
  db: D1Database,
  endpoint: NotificationEndpointRecord,
  delivery: NotificationDeliveryRecord,
): Promise<NotificationDeliveryRecord> {
  const startedAt = Date.now();
  const attemptCount = delivery.attempt_count + 1;

  try {
    const response_status = await sendNotification(
      endpoint.target,
      delivery.event,
      delivery.payload,
      delivery.scope,
      endpoint.secret || "",
      endpoint.custom_headers || [],
    );
    const attemptedAt = Date.now();
    const durationMs = attemptedAt - startedAt;

    await updateNotificationDeliveryRecord(db, delivery.id, {
      attempt_count: attemptCount,
      dead_letter_reason: "",
      is_dead_letter: false,
      last_attempt_at: attemptedAt,
      last_error: "",
      next_retry_at: null,
      response_status,
      resolved_at: null,
      resolved_by: "",
      status: "success",
    });
    await recordNotificationAttemptSafely(db, {
      attempt_number: attemptCount,
      attempted_at: attemptedAt,
      duration_ms: durationMs,
      error_message: "",
      next_retry_at: null,
      notification_delivery_id: delivery.id,
      notification_endpoint_id: endpoint.id,
      response_status,
      status: "success",
    });
    await updateNotificationDelivery(db, endpoint.id, "success", "");

    return {
      ...delivery,
      attempt_count: attemptCount,
      dead_letter_reason: "",
      is_dead_letter: false,
      last_attempt_at: attemptedAt,
      last_error: "",
      next_retry_at: null,
      response_status,
      resolved_at: null,
      resolved_by: "",
      status: "success",
      updated_at: attemptedAt,
    };
  } catch (error) {
    const attemptedAt = Date.now();
    const durationMs = attemptedAt - startedAt;
    const response_status = error instanceof NotificationRequestError ? error.responseStatus : null;
    const last_error = error instanceof Error ? error.message : "notification delivery failed";
    const status = attemptCount < delivery.max_attempts ? "retrying" : "failed";
    const next_retry_at = status === "retrying" ? attemptedAt + getRetryDelay(attemptCount) : null;
    const isDeadLetter = status === "failed";

    await updateNotificationDeliveryRecord(db, delivery.id, {
      attempt_count: attemptCount,
      dead_letter_reason: isDeadLetter ? last_error : "",
      is_dead_letter: isDeadLetter,
      last_attempt_at: attemptedAt,
      last_error,
      next_retry_at,
      response_status,
      resolved_at: null,
      resolved_by: "",
      status,
    });
    await recordNotificationAttemptSafely(db, {
      attempt_number: attemptCount,
      attempted_at: attemptedAt,
      duration_ms: durationMs,
      error_message: last_error,
      next_retry_at,
      notification_delivery_id: delivery.id,
      notification_endpoint_id: endpoint.id,
      response_status,
      status,
    });
    await updateNotificationDelivery(db, endpoint.id, status, last_error);

    return {
      ...delivery,
      attempt_count: attemptCount,
      dead_letter_reason: isDeadLetter ? last_error : "",
      is_dead_letter: isDeadLetter,
      last_attempt_at: attemptedAt,
      last_error,
      next_retry_at,
      response_status,
      resolved_at: null,
      resolved_by: "",
      status,
      updated_at: attemptedAt,
    };
  }
}

async function markDeliveryAsTerminalFailure(
  db: D1Database,
  delivery: NotificationDeliveryRecord,
  errorMessage: string,
  endpointId: number | null,
): Promise<void> {
  const attemptedAt = Date.now();
  await updateNotificationDeliveryRecord(db, delivery.id, {
    attempt_count: delivery.attempt_count,
    dead_letter_reason: errorMessage,
    is_dead_letter: true,
    last_attempt_at: attemptedAt,
    last_error: errorMessage,
    next_retry_at: null,
    response_status: null,
    resolved_at: null,
    resolved_by: "",
    status: "failed",
  });
  await recordNotificationAttemptSafely(db, {
    attempt_number: Math.max(1, delivery.attempt_count + 1),
    attempted_at: attemptedAt,
    duration_ms: 0,
    error_message: errorMessage,
    next_retry_at: null,
    notification_delivery_id: delivery.id,
    notification_endpoint_id: delivery.notification_endpoint_id,
    response_status: null,
    status: "failed",
  });

  if (endpointId) {
    await updateNotificationDelivery(db, endpointId, "failed", errorMessage);
  }
}

async function recordNotificationAttemptSafely(
  db: D1Database,
  input: {
    attempt_number: number;
    attempted_at: number;
    duration_ms: number | null;
    error_message: string;
    next_retry_at: number | null;
    notification_delivery_id: number;
    notification_endpoint_id: number;
    response_status: number | null;
    status: NotificationDeliveryStatus;
  },
): Promise<void> {
  try {
    await createNotificationDeliveryAttemptRecord(db, input);
  } catch (error) {
    if (isSqliteSchemaError(error)) return;
    throw error;
  }
}

async function deliverWithoutLog(
  db: D1Database,
  endpoint: NotificationEndpointRecord,
  event: NotificationEvent,
  payload: JsonValue,
  scope: NotificationScopeContext,
): Promise<void> {
  try {
    await sendNotification(
      endpoint.target,
      event,
      payload,
      scope,
      endpoint.secret || "",
      endpoint.custom_headers || [],
    );
    try {
      await updateNotificationDelivery(db, endpoint.id, "success", "");
    } catch (error) {
      if (!isSqliteSchemaError(error)) throw error;
    }
  } catch (error) {
    try {
      await updateNotificationDelivery(
        db,
        endpoint.id,
        "failed",
        error instanceof Error ? error.message : "notification delivery failed",
      );
    } catch (deliveryError) {
      if (!isSqliteSchemaError(deliveryError)) throw deliveryError;
    }
  }
}

function getRetryDelay(attemptCount: number): number {
  const index = Math.max(0, Math.min(RETRY_BACKOFF_MS.length - 1, attemptCount - 1));
  return RETRY_BACKOFF_MS[index] || RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1] || 60_000;
}

async function sendNotification(
  target: string,
  event: string,
  payload: JsonValue,
  scope: NotificationScopeContext,
  secret: string,
  customHeaders: NotificationCustomHeader[],
): Promise<number> {
  const body = JSON.stringify({
    event,
    payload,
    scope,
    sent_at: Date.now(),
    source: "testmail-hub",
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Temp-Mail-Event": event,
  };

  if (secret) {
    headers["X-Temp-Mail-Signature"] = await signBody(body, secret);
  }

  for (const item of customHeaders) {
    const key = String(item?.key || "").trim();
    if (!key) continue;
    headers[key] = String(item?.value || "");
  }

  let response: Response;
  try {
    response = await fetch(target, {
      method: "POST",
      headers,
      body,
    });
  } catch (error) {
    throw new NotificationRequestError(
      error instanceof Error ? error.message : "notification request failed",
      null,
    );
  }

  if (!response.ok) {
    const responseText = await readResponsePreview(response);
    throw new NotificationRequestError(
      responseText
        ? `notification failed with status ${response.status}: ${responseText}`
        : `notification failed with status ${response.status}`,
      response.status,
    );
  }

  return response.status;
}

async function readResponsePreview(response: Response): Promise<string> {
  try {
    const text = (await response.text()).trim();
    if (!text) return "";
    return text.length > 180 ? `${text.slice(0, 180)}...` : text;
  } catch {
    return "";
  }
}

async function signBody(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return encodeBase64Url(new Uint8Array(signature));
}
