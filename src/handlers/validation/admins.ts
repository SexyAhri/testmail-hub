import { hashPassword } from "../../core/auth";
import type { AuthSession } from "../../server/types";
import {
  MAX_WORKSPACE_DESCRIPTION_LENGTH,
  normalizeAdminRole,
  requiresBoundAdminScope,
  requiresGlobalAdminScope,
} from "../../utils/constants";
import { isActorProjectScoped } from "../access-control";
import { readAuditOperationNote } from "../audit";
import { PASSWORD_MIN_LENGTH, validateAccessScopeInput } from "./shared";

export async function validateAdminBody(
  body: Record<string, unknown>,
  isCreate: boolean,
  actor: AuthSession | null,
) {
  const username = String(body.username || "")
    .trim()
    .toLowerCase();
  const display_name = String(body.display_name || "").trim();
  const note = String(body.note || "").trim();
  const operationNoteValidation = readAuditOperationNote(body);
  const password = String(body.password || "");
  const is_enabled = body.is_enabled !== false;
  const scopeValidation = validateAccessScopeInput(body, actor, {
    allowGlobalScope: !actor || !isActorProjectScoped(actor),
  });

  if (isCreate && !username) {
    return { ok: false as const, error: "username is required" };
  }
  if (!display_name) {
    return { ok: false as const, error: "display_name is required" };
  }
  if (note.length > MAX_WORKSPACE_DESCRIPTION_LENGTH) {
    return { ok: false as const, error: "note is too long" };
  }
  if (!operationNoteValidation.ok) return operationNoteValidation;
  if (!scopeValidation.ok) return scopeValidation;

  const role = normalizeAdminRole(
    body.role ? String(body.role) : "viewer",
    scopeValidation.data.access_scope,
  );
  if (!role) {
    return { ok: false as const, error: "invalid role" };
  }
  if (
    requiresGlobalAdminScope(role, scopeValidation.data.access_scope) &&
    scopeValidation.data.access_scope !== "all"
  ) {
    return {
      ok: false as const,
      error: "platform_admin and owner must keep global scope",
    };
  }
  if (
    requiresBoundAdminScope(role, scopeValidation.data.access_scope) &&
    scopeValidation.data.access_scope !== "bound"
  ) {
    return {
      ok: false as const,
      error: "project_admin must use bound access_scope",
    };
  }
  if (
    actor &&
    isActorProjectScoped(actor) &&
    !["project_admin", "operator", "viewer"].includes(role)
  ) {
    return {
      ok: false as const,
      error:
        "project-scoped admin can only manage project_admin, operator, or viewer roles",
    };
  }

  if (password) {
    if (password.length < PASSWORD_MIN_LENGTH) {
      return {
        ok: false as const,
        error: `password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      };
    }
    const { hash, salt } = await hashPassword(password);
    return {
      ok: true as const,
      data: {
        access_scope: scopeValidation.data.access_scope,
        display_name,
        is_enabled,
        note,
        operation_note: operationNoteValidation.operation_note,
        password_hash: hash,
        password_salt: salt,
        project_ids: scopeValidation.data.project_ids,
        role,
        username,
      },
    };
  }

  if (isCreate) return { ok: false as const, error: "password is required" };

  return {
    ok: true as const,
    data: {
      access_scope: scopeValidation.data.access_scope,
      display_name,
      is_enabled,
      note,
      operation_note: operationNoteValidation.operation_note,
      project_ids: scopeValidation.data.project_ids,
      role,
    },
  };
}
