import {
  createOutboundEmailRecord,
  getDueScheduledOutboundEmails,
  getOutboundEmailById,
  updateOutboundEmailDelivery,
  updateOutboundEmailRecord,
} from "./db";
import { captureError } from "./errors";
import { sendResendEmail, type NormalizedOutboundEmailPayload } from "./outbound";
import type {
  D1Database,
  OutboundEmailRecord,
  WorkerEnv,
} from "../server/types";

interface PersistInput {
  existing_id?: number;
  payload: NormalizedOutboundEmailPayload;
  provider: string;
  username: string;
}

export class PersistOutboundSendError extends Error {
  recordId: number;

  constructor(message: string, recordId: number) {
    super(message);
    this.name = "PersistOutboundSendError";
    this.recordId = recordId;
  }
}

export interface PersistOutcome {
  action: "draft" | "scheduled" | "sent";
  record: OutboundEmailRecord | null;
}

export interface ProcessScheduledOutcome {
  failed: OutboundEmailRecord[];
  sent: OutboundEmailRecord[];
}

export async function persistOutboundEmail(
  db: D1Database,
  env: Pick<WorkerEnv, "RESEND_API_KEY">,
  input: PersistInput,
): Promise<PersistOutcome> {
  const targetStatus = resolveTargetStatus(input.payload);
  const recordId = input.existing_id
    ? await updateExisting(db, input.existing_id, input, targetStatus)
    : await createNew(db, input, targetStatus);

  if (targetStatus === "draft" || targetStatus === "scheduled") {
    return {
      action: targetStatus,
      record: await getOutboundEmailById(db, recordId),
    };
  }

  await updateOutboundEmailDelivery(db, recordId, {
    error_message: "",
    last_attempt_at: Date.now(),
    status: "sending",
  });

  try {
    const providerResult = await sendResendEmail(env.RESEND_API_KEY, input.payload);
    await updateOutboundEmailDelivery(db, recordId, {
      error_message: "",
      last_attempt_at: Date.now(),
      provider_message_id: providerResult.id,
      sent_at: Date.now(),
      status: "sent",
    });
    return {
      action: "sent",
      record: await getOutboundEmailById(db, recordId),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to send outbound email";
    await updateOutboundEmailDelivery(db, recordId, {
      error_message: message,
      last_attempt_at: Date.now(),
      status: "failed",
    });
    await captureError(db, "outbound.resend_send_failed", new Error(message), {
      email_id: recordId,
      from_address: input.payload.from_address,
      subject: input.payload.subject,
      to: input.payload.to,
      trigger: "manual",
    });
    throw new PersistOutboundSendError(message, recordId);
  }
}

export async function processDueOutboundEmails(
  db: D1Database,
  env: Pick<WorkerEnv, "RESEND_API_KEY">,
  limit = 10,
): Promise<ProcessScheduledOutcome> {
  const due = await getDueScheduledOutboundEmails(db, limit);
  const sent: OutboundEmailRecord[] = [];
  const failed: OutboundEmailRecord[] = [];

  for (const record of due) {
    await updateOutboundEmailDelivery(db, record.id, {
      error_message: "",
      last_attempt_at: Date.now(),
      status: "sending",
    });

    try {
      const providerResult = await sendResendEmail(env.RESEND_API_KEY, {
        attachments: (record.attachments || []).filter(
          (item): item is typeof item & { content_base64: string } => Boolean(item.content_base64),
        ),
        bcc: record.bcc_addresses,
        cc: record.cc_addresses,
        from_address: record.from_address,
        from_name: record.from_name,
        html_body: record.html_body,
        reply_to: record.reply_to,
        subject: record.subject,
        text_body: record.text_body,
        to: record.to_addresses,
      });

      await updateOutboundEmailDelivery(db, record.id, {
        error_message: "",
        last_attempt_at: Date.now(),
        provider_message_id: providerResult.id,
        sent_at: Date.now(),
        status: "sent",
      });

      const latest = await getOutboundEmailById(db, record.id);
      if (latest) sent.push(latest);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to send outbound email";
      await updateOutboundEmailDelivery(db, record.id, {
        error_message: message,
        last_attempt_at: Date.now(),
        status: "failed",
      });
      await captureError(db, "outbound.resend_send_failed", new Error(message), {
        email_id: record.id,
        from_address: record.from_address,
        subject: record.subject,
        to: record.to_addresses,
        trigger: "scheduled",
      });

      const latest = await getOutboundEmailById(db, record.id);
      if (latest) failed.push(latest);
    }
  }

  return { failed, sent };
}

function resolveTargetStatus(payload: NormalizedOutboundEmailPayload): OutboundEmailRecord["status"] {
  if (payload.mode === "draft") return "draft";
  if (payload.scheduled_at && payload.scheduled_at > Date.now()) return "scheduled";
  return "sending";
}

async function createNew(
  db: D1Database,
  input: PersistInput,
  status: OutboundEmailRecord["status"],
): Promise<number> {
  return createOutboundEmailRecord(db, {
    attachment_count: input.payload.attachments.length,
    attachments: input.payload.attachments,
    bcc_addresses: input.payload.bcc,
    cc_addresses: input.payload.cc,
    created_by: input.username,
    from_address: input.payload.from_address,
    from_name: input.payload.from_name,
    html_body: input.payload.html_body,
    provider: input.provider,
    reply_to: input.payload.reply_to,
    scheduled_at: status === "scheduled" ? input.payload.scheduled_at : null,
    sent_at: null,
    status,
    subject: input.payload.subject,
    text_body: input.payload.text_body,
    to_addresses: input.payload.to,
  });
}

async function updateExisting(
  db: D1Database,
  id: number,
  input: PersistInput,
  status: OutboundEmailRecord["status"],
): Promise<number> {
  await updateOutboundEmailRecord(db, id, {
    attachment_count: input.payload.attachments.length,
    attachments: input.payload.attachments,
    bcc_addresses: input.payload.bcc,
    cc_addresses: input.payload.cc,
    from_address: input.payload.from_address,
    from_name: input.payload.from_name,
    html_body: input.payload.html_body,
    provider: input.provider,
    reply_to: input.payload.reply_to,
    scheduled_at: status === "scheduled" ? input.payload.scheduled_at : null,
    status,
    subject: input.payload.subject,
    text_body: input.payload.text_body,
    to_addresses: input.payload.to,
  });
  return id;
}
