import {
  getAttachmentContent,
  getEmailByMessageIdScoped,
  getLatestEmail,
} from "../../core/db";
import {
  binaryResponse,
  decodeBase64,
  json,
  jsonError,
  normalizeEmailAddress,
} from "../../utils/utils";
import type { D1Database } from "../../server/types";
import {
  buildLatestEmailExtractionPayload,
  buildPublicEmailCodePayload,
  buildPublicEmailDetailPayload,
  buildPublicEmailExtractionsPayload,
} from "./public-email";

export async function handleEmailsLatest(
  url: URL,
  db: D1Database,
  allowedProjectIds?: number[] | null,
): Promise<Response> {
  const address = normalizeEmailAddress(url.searchParams.get("address"));
  if (!address) return jsonError("address is required", 400);

  const row = await getLatestEmail(db, address, allowedProjectIds);
  if (!row) return jsonError("message not found", 404);

  return json(buildLatestEmailExtractionPayload(row));
}

export async function handleEmailsCode(
  url: URL,
  db: D1Database,
  allowedProjectIds?: number[] | null,
): Promise<Response> {
  const messageId = String(url.searchParams.get("message_id") || "").trim();
  if (messageId) {
    const email = await getEmailByMessageIdScoped(
      db,
      messageId,
      allowedProjectIds,
    );
    if (!email) return jsonError("message not found", 404);
    if (!email.verification_code) {
      return jsonError("verification code not found", 404);
    }
    return json(buildPublicEmailCodePayload(email));
  }

  const address = normalizeEmailAddress(url.searchParams.get("address"));
  if (!address) return jsonError("address or message_id is required", 400);

  const row = await getLatestEmail(db, address, allowedProjectIds);
  if (!row) return jsonError("message not found", 404);

  const payload = buildLatestEmailExtractionPayload(row);
  if (!payload.verification_code) {
    return jsonError("verification code not found", 404);
  }
  return json(
    buildPublicEmailCodePayload({
      from_address: String(payload.from_address || ""),
      message_id: String(payload.message_id || ""),
      received_at: Number(payload.received_at || 0),
      subject: String(payload.subject || ""),
      to_address: String(payload.to_address || ""),
      verification_code: payload.verification_code,
    }),
  );
}

export async function handleEmailsLatestExtraction(
  url: URL,
  db: D1Database,
  allowedProjectIds?: number[] | null,
): Promise<Response> {
  const address = normalizeEmailAddress(url.searchParams.get("address"));
  if (!address) return jsonError("address is required", 400);

  const row = await getLatestEmail(db, address, allowedProjectIds);
  if (!row) return jsonError("message not found", 404);

  const payload = buildLatestEmailExtractionPayload(row);
  return json({
    extraction: payload.extraction,
    message_id: payload.message_id,
    preview: payload.preview,
    received_at: payload.received_at,
    result_count: payload.result_count,
    result_insights: payload.result_insights,
    subject: payload.subject,
    verification_code: payload.verification_code,
  });
}

export async function handlePublicEmailDetail(
  pathname: string,
  db: D1Database,
  allowedProjectIds?: number[] | null,
): Promise<Response> {
  const match = pathname.match(/^\/api\/emails\/([^/]+)$/);
  if (!match) return jsonError("invalid email id", 400);

  const messageId = decodeURIComponent(match[1]);
  const email = await getEmailByMessageIdScoped(
    db,
    messageId,
    allowedProjectIds,
  );
  if (!email) return jsonError("message not found", 404);

  return json(buildPublicEmailDetailPayload(email));
}

export async function handlePublicEmailExtractions(
  pathname: string,
  db: D1Database,
  allowedProjectIds?: number[] | null,
): Promise<Response> {
  const match = pathname.match(/^\/api\/emails\/([^/]+)\/extractions$/);
  if (!match) return jsonError("invalid email id", 400);

  const messageId = decodeURIComponent(match[1]);
  const email = await getEmailByMessageIdScoped(
    db,
    messageId,
    allowedProjectIds,
  );
  if (!email) return jsonError("message not found", 404);

  return json(buildPublicEmailExtractionsPayload(email));
}

export async function handlePublicEmailAttachment(
  pathname: string,
  db: D1Database,
  allowedProjectIds?: number[] | null,
): Promise<Response> {
  const match = pathname.match(/^\/api\/emails\/([^/]+)\/attachments\/(\d+)$/);
  if (!match) return jsonError("invalid attachment path", 400);

  const messageId = decodeURIComponent(match[1]);
  const attachmentId = Number(match[2]);
  const email = await getEmailByMessageIdScoped(
    db,
    messageId,
    allowedProjectIds,
  );
  if (!email) return jsonError("message not found", 404);

  const attachment = await getAttachmentContent(db, messageId, attachmentId);
  if (!attachment) return jsonError("attachment not found", 404);
  if (!attachment.is_stored || !attachment.content_base64) {
    return jsonError(
      "attachment metadata exists but binary content was not retained",
      422,
    );
  }

  const filename = attachment.filename || `attachment-${attachment.id}`;
  return binaryResponse(decodeBase64(attachment.content_base64), {
    contentDisposition: `attachment; filename="${filename}"`,
    contentType: attachment.mime_type,
  });
}
