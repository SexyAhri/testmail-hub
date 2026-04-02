import {
  MAX_WORKSPACE_DESCRIPTION_LENGTH,
  MAX_WORKSPACE_NAME_LENGTH,
} from "../../utils/constants";
import { readAuditOperationNote } from "../audit";
import { parseNullableHours, parseOptionalId } from "./shared";

export function validateRetentionPolicyBody(body: Record<string, unknown>) {
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const is_enabled = body.is_enabled !== false;
  const operationNoteValidation = readAuditOperationNote(body);
  const project_id = parseOptionalId(body.project_id);
  const environment_id = parseOptionalId(body.environment_id);
  const mailbox_pool_id = parseOptionalId(body.mailbox_pool_id);
  const archiveEmail = parseNullableHours(
    body.archive_email_hours,
    "archive_email_hours",
  );
  const mailboxTtl = parseNullableHours(
    body.mailbox_ttl_hours,
    "mailbox_ttl_hours",
  );
  const emailRetention = parseNullableHours(
    body.email_retention_hours,
    "email_retention_hours",
  );
  const deletedEmailRetention = parseNullableHours(
    body.deleted_email_retention_hours,
    "deleted_email_retention_hours",
  );

  if (!name) return { ok: false as const, error: "name is required" };
  if (name.length > MAX_WORKSPACE_NAME_LENGTH) {
    return { ok: false as const, error: "name is too long" };
  }
  if (description.length > MAX_WORKSPACE_DESCRIPTION_LENGTH) {
    return { ok: false as const, error: "description is too long" };
  }
  if (!operationNoteValidation.ok) return operationNoteValidation;
  if (!archiveEmail.ok) return { ok: false as const, error: archiveEmail.error };
  if (!mailboxTtl.ok) return { ok: false as const, error: mailboxTtl.error };
  if (!emailRetention.ok) {
    return { ok: false as const, error: emailRetention.error };
  }
  if (!deletedEmailRetention.ok) {
    return { ok: false as const, error: deletedEmailRetention.error };
  }
  if (
    archiveEmail.value === null &&
    mailboxTtl.value === null &&
    emailRetention.value === null &&
    deletedEmailRetention.value === null
  ) {
    return {
      ok: false as const,
      error: "at least one retention setting is required",
    };
  }
  if (
    archiveEmail.value !== null &&
    emailRetention.value !== null &&
    archiveEmail.value >= emailRetention.value
  ) {
    return {
      ok: false as const,
      error: "archive_email_hours must be smaller than email_retention_hours",
    };
  }

  return {
    ok: true as const,
    data: {
      archive_email_hours: archiveEmail.value,
      deleted_email_retention_hours: deletedEmailRetention.value,
      description,
      email_retention_hours: emailRetention.value,
      environment_id,
      is_enabled,
      mailbox_pool_id,
      mailbox_ttl_hours: mailboxTtl.value,
      name,
      operation_note: operationNoteValidation.operation_note,
      project_id,
    },
  };
}
