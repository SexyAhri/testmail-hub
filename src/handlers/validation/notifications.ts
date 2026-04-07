import type { AuthSession } from "../../server/types";
import {
  normalizeNotificationAlertConfig,
  normalizeNotificationEventValues,
} from "../../utils/constants";
import { safeParseJson } from "../../utils/utils";
import { isActorProjectScoped } from "../access-control";
import { readAuditOperationNote } from "../audit";
import { validateAccessScopeInput } from "./shared";

function normalizeNotificationCustomHeaders(input: unknown) {
  const rawItems = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? safeParseJson<unknown[]>(input, [])
      : [];
  const reservedNames = new Set([
    "content-type",
    "content-length",
    "x-temp-mail-event",
    "x-temp-mail-signature",
  ]);
  const normalized: Array<{ key: string; value: string }> = [];
  const seen = new Set<string>();

  for (const item of rawItems || []) {
    const key = String((item as { key?: unknown })?.key || "").trim();
    const value = String((item as { value?: unknown })?.value || "").trim();
    if (!key && !value) continue;
    if (!key) {
      return { ok: false as const, error: "custom header key is required" };
    }
    if (!/^[A-Za-z0-9-]+$/.test(key)) {
      return { ok: false as const, error: `invalid custom header key: ${key}` };
    }
    if (reservedNames.has(key.toLowerCase())) {
      return { ok: false as const, error: `custom header key is reserved: ${key}` };
    }
    if (seen.has(key.toLowerCase())) {
      return { ok: false as const, error: `duplicate custom header key: ${key}` };
    }
    seen.add(key.toLowerCase());
    normalized.push({ key, value });
  }

  if (normalized.length > 20) {
    return { ok: false as const, error: "custom headers cannot exceed 20 entries" };
  }

  return { ok: true as const, data: normalized };
}

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
  const customHeadersValidation = normalizeNotificationCustomHeaders(body.custom_headers);

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
  if (!customHeadersValidation.ok) return customHeadersValidation;
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
      custom_headers: customHeadersValidation.data,
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
