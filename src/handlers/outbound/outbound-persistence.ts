import {
  addAuditLog,
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
import { persistOutboundEmail } from "../../core/outbound-service";
import type { AuthSession, D1Database, WorkerEnv } from "../../server/types";
import { json, jsonError } from "../../utils/utils";

export async function persistOutboundFromHandler(
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
  provider: string,
  payload: NormalizedOutboundEmailPayload,
  existingId?: number,
): Promise<Response> {
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

    await addAuditLog(db, {
      action,
      actor,
      detail: {
        attachment_count: payload.attachments.length,
        bcc_count: payload.bcc.length,
        cc_count: payload.cc.length,
        from_address: payload.from_address,
        scheduled_at: payload.scheduled_at,
        subject: payload.subject,
        to: payload.to,
      },
      entity_id: outcome.record
        ? String(outcome.record.id)
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

    await addAuditLog(db, {
      action: "outbound.email.send_failed",
      actor,
      detail: {
        error: message,
        from_address: payload.from_address,
        subject: payload.subject,
        to: payload.to,
      },
      entity_id: existingId ? String(existingId) : undefined,
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
    settings,
  };
}
