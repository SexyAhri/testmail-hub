import { getAllNotificationEndpoints, updateNotificationDelivery } from "./db";
import { encodeBase64Url, isSqliteSchemaError } from "../utils/utils";
import type { D1Database, JsonValue } from "../server/types";
import type { NotificationEvent } from "../utils/constants";

const encoder = new TextEncoder();

export async function sendEventNotifications(
  db: D1Database,
  event: NotificationEvent,
  payload: JsonValue,
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

  const targets = endpoints.filter(item => item.is_enabled && (item.events.includes(event) || item.events.includes("*")));

  for (const endpoint of targets) {
    try {
      await sendNotification(endpoint.target, event, payload, endpoint.secret || "");
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
}

export async function sendTestNotification(target: string, secret: string): Promise<void> {
  await sendNotification(
    target,
    "email.received",
    {
      source: "temp-mail-console",
      test: true,
      timestamp: Date.now(),
    },
    secret,
  );
}

async function sendNotification(
  target: string,
  event: NotificationEvent,
  payload: JsonValue,
  secret: string,
): Promise<void> {
  const body = JSON.stringify({
    event,
    payload,
    sent_at: Date.now(),
    source: "temp-mail-console",
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Temp-Mail-Event": event,
  };

  if (secret) {
    headers["X-Temp-Mail-Signature"] = await signBody(body, secret);
  }

  const response = await fetch(target, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    throw new Error(`notification failed with status ${response.status}`);
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
