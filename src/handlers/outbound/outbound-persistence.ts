import {
  addAuditLog,
  getOutboundEmailById,
  getOutboundEmailSettings,
  getOutboundTemplates,
} from "../../core/db";
import { sendEventNotifications } from "../../core/notifications";
import {
  applyOutboundTemplate,
  type NormalizedOutboundEmailPayload,
  parseTemplateVariables,
  validateOutboundEmailInput,
} from "../../core/outbound";
import {
  PersistOutboundSendError,
  persistOutboundEmail,
} from "../../core/outbound-service";
import type { AuthSession, D1Database, WorkerEnv } from "../../server/types";
import { json, jsonError } from "../../utils/utils";
import {
  buildResourceUpdateAuditDetail,
  readAuditOperationNote,
  toOutboundEmailAuditSnapshot,
  withAuditOperationNote,
} from "../audit";

const OUTBOUND_EMAIL_AUDIT_FIELDS = [
  "attachment_count",
  "bcc_addresses",
  "cc_addresses",
  "from_address",
  "from_name",
  "html_body_length",
  "last_attempt_at",
  "provider",
  "reply_to",
  "scheduled_at",
  "sent_at",
  "status",
  "subject",
  "text_body_length",
  "to_addresses",
];

function buildOutboundFallbackAuditDetail(
  provider: string,
  payload: NormalizedOutboundEmailPayload,
) {
  return {
    attachment_count: payload.attachments.length,
    bcc_addresses: payload.bcc,
    cc_addresses: payload.cc,
    from_address: payload.from_address,
    from_name: payload.from_name,
    html_body_length: payload.html_body.length,
    provider,
    reply_to: payload.reply_to,
    scheduled_at: payload.scheduled_at,
    subject: payload.subject,
    text_body_length: payload.text_body.length,
    to_addresses: payload.to,
  };
}

function buildOutboundAuditDetail(
  previous: ReturnType<typeof toOutboundEmailAuditSnapshot> | null,
  next: ReturnType<typeof toOutboundEmailAuditSnapshot> | null,
  operation_note: string,
  extra: Record<string, unknown> = {},
) {
  if (previous && next) {
    return buildResourceUpdateAuditDetail(
      previous,
      next,
      OUTBOUND_EMAIL_AUDIT_FIELDS,
      operation_note,
      extra,
    );
  }

  return withAuditOperationNote(
    {
      ...extra,
      ...(next || {}),
    },
    operation_note,
  );
}

export async function persistOutboundFromHandler(
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
  provider: string,
  payload: NormalizedOutboundEmailPayload,
  existingId?: number,
  operation_note = "",
): Promise<Response> {
  const previousRecord = existingId
    ? await getOutboundEmailById(db, existingId)
    : null;
  const previousSnapshot = previousRecord
    ? toOutboundEmailAuditSnapshot(previousRecord)
    : null;

  try {
    const outcome = await persistOutboundEmail(db, env, {
      existing_id: existingId,
      payload,
      provider,
      username: actor.username,
    });

    const action =
      outcome.action === "draft"
        ? "outbound.email.save_draft"
        : outcome.action === "scheduled"
          ? "outbound.email.schedule"
          : "outbound.email.send";
    const nextRecord = outcome.record
      || (existingId ? await getOutboundEmailById(db, existingId) : null);
    const nextSnapshot = nextRecord
      ? toOutboundEmailAuditSnapshot(nextRecord)
      : null;
    const nextStatus =
      outcome.action === "draft"
        ? "draft"
        : outcome.action === "scheduled"
          ? "scheduled"
          : "sent";

    await addAuditLog(db, {
      action,
      actor,
      detail: buildOutboundAuditDetail(previousSnapshot, nextSnapshot, operation_note, {
        delivery_action: outcome.action,
        id: nextRecord?.id || existingId,
        status: nextStatus,
        ...buildOutboundFallbackAuditDetail(provider, payload),
      }),
      entity_id: nextRecord
        ? String(nextRecord.id)
        : existingId
          ? String(existingId)
          : undefined,
      entity_type: "outbound_email",
    });

    if (outcome.action === "sent") {
      await sendEventNotifications(db, "email.sent", {
        provider,
        subject: payload.subject,
        to: payload.to,
      });
    }

    return json(outcome.record || { ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "failed to process outbound email";
    const failedRecordId =
      error instanceof PersistOutboundSendError
        ? error.recordId
        : existingId;
    const failedRecord = failedRecordId
      ? await getOutboundEmailById(db, failedRecordId)
      : null;
    const failedSnapshot = failedRecord
      ? toOutboundEmailAuditSnapshot(failedRecord)
      : null;

    await addAuditLog(db, {
      action: "outbound.email.send_failed",
      actor,
      detail: buildOutboundAuditDetail(previousSnapshot, failedSnapshot, operation_note, {
        error: message,
        failed_action: "send",
        id: failedRecord?.id || failedRecordId,
        status: "failed",
        ...buildOutboundFallbackAuditDetail(provider, payload),
      }),
      entity_id: failedRecordId ? String(failedRecordId) : undefined,
      entity_type: "outbound_email",
    });

    await sendEventNotifications(db, "email.send_failed", {
      error: message,
      provider,
      subject: payload.subject,
      to: payload.to,
    });

    return jsonError(message, 502);
  }
}

export async function prepareOutboundPersistencePayload(
  body: Record<string, unknown>,
  db: D1Database,
  env: WorkerEnv,
) {
  const operationNoteValidation = readAuditOperationNote(body);
  if (!operationNoteValidation.ok) return operationNoteValidation;

  const settings = await getOutboundEmailSettings(db, env);
  const templateId = Number(body.template_id || 0);

  let mergedBody: Record<string, unknown> = { ...body };
  if (Number.isFinite(templateId) && templateId > 0) {
    const template = (await getOutboundTemplates(db)).find(
      (item) => item.id === templateId,
    );
    if (!template || !template.is_enabled) {
      return { ok: false as const, error: "template not found or disabled" };
    }

    const applied = applyOutboundTemplate(
      template,
      parseTemplateVariables(body.template_variables),
    );
    mergedBody = {
      ...mergedBody,
      html_body: String(body.html_body || "").trim() || applied.html_body,
      subject: String(body.subject || "").trim() || applied.subject,
      text_body: String(body.text_body || "").trim() || applied.text_body,
    };
  }

  const validation = validateOutboundEmailInput(mergedBody, settings);
  if (!validation.ok) return validation;

  return {
    ok: true as const,
    data: validation.data,
    operation_note: operationNoteValidation.operation_note,
    settings,
  };
}
