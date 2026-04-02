import type { AuthSession } from "../../server/types";
import {
  normalizeNotificationAlertConfig,
  normalizeNotificationEventValues,
} from "../../utils/constants";
import { safeParseJson } from "../../utils/utils";
import { isActorProjectScoped } from "../access-control";
import { readAuditOperationNote } from "../audit";
import { validateAccessScopeInput } from "./shared";

export function validateNotificationBody(
  body: Record<string, unknown>,
  actor: AuthSession,
) {
  const name = String(body.name || "").trim();
  const type = String(body.type || "webhook").trim();
  const target = String(body.target || "").trim();
  const secret = String(body.secret || "").trim();
  const is_enabled = body.is_enabled !== false;
  const operationNoteValidation = readAuditOperationNote(body);
  const scopeValidation = validateAccessScopeInput(body, actor, {
    allowGlobalScope: !isActorProjectScoped(actor),
  });
  const events = Array.isArray(body.events)
    ? body.events.map((item) => String(item).trim()).filter(Boolean)
    : String(body.events || "")
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
  const normalizedEvents = normalizeNotificationEventValues(events);
  const alert_config = normalizeNotificationAlertConfig(
    safeParseJson<Record<string, unknown>>(
      typeof body.alert_config === "string"
        ? body.alert_config
        : JSON.stringify(body.alert_config || {}),
      {},
    ) || {},
  );

  if (!name) return { ok: false as const, error: "name is required" };
  if (type !== "webhook") {
    return {
      ok: false as const,
      error: "only webhook notifications are supported",
    };
  }
  if (!target || !target.startsWith("http")) {
    return { ok: false as const, error: "target must be a valid URL" };
  }
  if (!operationNoteValidation.ok) return operationNoteValidation;
  if (!scopeValidation.ok) return scopeValidation;
  if (events.length === 0) {
    return { ok: false as const, error: "at least one event is required" };
  }
  if (normalizedEvents.values.length === 0) {
    return {
      ok: false as const,
      error: "at least one valid event is required",
    };
  }
  if (normalizedEvents.invalid.length > 0) {
    return {
      ok: false as const,
      error: `unknown event in notification events: ${normalizedEvents.invalid.join(", ")}`,
    };
  }

  return {
    ok: true as const,
    data: {
      access_scope: scopeValidation.data.access_scope,
      alert_config,
      events: normalizedEvents.values,
      is_enabled,
      name,
      operation_note: operationNoteValidation.operation_note,
      project_ids: scopeValidation.data.project_ids,
      secret,
      target,
      type,
    },
  };
}
