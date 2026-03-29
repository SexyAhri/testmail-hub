import { addErrorEvent } from "./db";
import type { D1Database, JsonValue } from "../server/types";

export async function captureError(
  db: D1Database | null | undefined,
  source: string,
  error: unknown,
  context: JsonValue = {},
  errorWebhookUrl?: string,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error || "unknown error");
  const stack = error instanceof Error ? error.stack || "" : "";

  try {
    if (db) {
      await addErrorEvent(db, { context, message, source, stack });
    }
  } catch (loggingError) {
    console.error("[error-log] failed:", loggingError);
  }

  if (errorWebhookUrl) {
    try {
      await fetch(errorWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          message,
          source,
          stack,
          timestamp: Date.now(),
          type: "error.raised",
        }),
      });
    } catch (webhookError) {
      console.error("[error-webhook] failed:", webhookError);
    }
  }
}
