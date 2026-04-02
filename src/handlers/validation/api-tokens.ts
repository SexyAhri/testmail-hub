import type { ApiTokenPermission, AuthSession } from "../../server/types";
import {
  MAX_API_TOKEN_DESCRIPTION_LENGTH,
  MAX_API_TOKEN_NAME_LENGTH,
} from "../../utils/constants";
import { isActorProjectScoped } from "../access-control";
import { readAuditOperationNote } from "../audit";
import {
  API_TOKEN_PERMISSION_SET,
  parseNullableTimestamp,
  validateAccessScopeInput,
} from "./shared";

export function validateApiTokenBody(
  body: Record<string, unknown>,
  actor: AuthSession,
) {
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const is_enabled = body.is_enabled !== false;
  const expires_at = parseNullableTimestamp(body.expires_at);
  const operationNoteValidation = readAuditOperationNote(body);
  const scopeValidation = validateAccessScopeInput(body, actor, {
    allowGlobalScope: !isActorProjectScoped(actor),
  });
  const permissions = Array.isArray(body.permissions)
    ? body.permissions.map((item) => String(item).trim()).filter(Boolean)
    : String(body.permissions || "")
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);

  if (!name) return { ok: false as const, error: "name is required" };
  if (name.length > MAX_API_TOKEN_NAME_LENGTH) {
    return { ok: false as const, error: "name is too long" };
  }
  if (description.length > MAX_API_TOKEN_DESCRIPTION_LENGTH) {
    return { ok: false as const, error: "description is too long" };
  }
  if (!operationNoteValidation.ok) return operationNoteValidation;
  if (!scopeValidation.ok) return scopeValidation;
  if (permissions.length === 0) {
    return { ok: false as const, error: "at least one permission is required" };
  }
  if (
    permissions.some((permission) => !API_TOKEN_PERMISSION_SET.has(permission))
  ) {
    return { ok: false as const, error: "unknown api token permission" };
  }
  if (expires_at !== null && expires_at <= Date.now()) {
    return { ok: false as const, error: "expires_at must be in the future" };
  }

  return {
    ok: true as const,
    data: {
      access_scope: scopeValidation.data.access_scope,
      description,
      expires_at,
      is_enabled,
      name,
      operation_note: operationNoteValidation.operation_note,
      permissions: permissions as ApiTokenPermission[],
      project_ids: scopeValidation.data.project_ids,
    },
  };
}
