import type { EmailDetail } from "../../server/types";
import {
  buildEmailPreview,
  buildRuleMatchInsights,
  extractEmailExtraction,
  safeParseJson,
} from "../../utils/utils";

export function buildLatestEmailExtractionPayload(row: Record<string, unknown>) {
  const results = safeParseJson(row.extracted_json, []) || [];
  const preview = buildEmailPreview(row.text_body, row.html_body);
  const extraction = extractEmailExtraction({
    fromAddress: row.from_address,
    htmlBody: row.html_body,
    preview,
    results,
    subject: row.subject,
    textBody: row.text_body,
  });

  return {
    extraction,
    from_address: row.from_address,
    message_id: row.message_id,
    preview,
    received_at: row.received_at,
    result_count: Array.isArray(results) ? results.length : 0,
    result_insights: buildRuleMatchInsights(results, extraction),
    results,
    subject: row.subject,
    to_address: row.to_address,
    verification_code: extraction.verification_code,
  };
}

function buildPublicAttachmentDownloadPath(
  messageId: string,
  attachmentId: number,
) {
  return `/api/emails/${encodeURIComponent(messageId)}/attachments/${attachmentId}`;
}

export function buildPublicEmailCodePayload(payload: {
  from_address: string;
  message_id: string;
  received_at: number;
  subject: string;
  to_address: string;
  verification_code: string | null;
}) {
  return {
    from_address: payload.from_address,
    message_id: payload.message_id,
    received_at: payload.received_at,
    subject: payload.subject,
    to_address: payload.to_address,
    verification_code: payload.verification_code,
  };
}

export function buildPublicEmailDetailPayload(email: EmailDetail) {
  return {
    attachment_count: email.attachments.length,
    attachments: email.attachments.map((attachment) => ({
      ...attachment,
      download_url: buildPublicAttachmentDownloadPath(
        email.message_id,
        attachment.id,
      ),
    })),
    from_address: email.from_address,
    has_attachments: email.has_attachments,
    html_body: email.html_body,
    message_id: email.message_id,
    preview: email.preview,
    primary_mailbox_address: email.primary_mailbox_address,
    raw_headers: email.raw_headers,
    received_at: email.received_at,
    scope: {
      environment_id: email.environment_id,
      environment_name: email.environment_name,
      mailbox_pool_id: email.mailbox_pool_id,
      mailbox_pool_name: email.mailbox_pool_name,
      project_id: email.project_id,
      project_name: email.project_name,
    },
    subject: email.subject,
    text_body: email.text_body,
    to_address: email.to_address,
  };
}

export function buildPublicEmailExtractionsPayload(email: EmailDetail) {
  return {
    extraction: email.extraction,
    from_address: email.from_address,
    message_id: email.message_id,
    preview: email.preview,
    received_at: email.received_at,
    result_count: email.result_count,
    result_insights: email.result_insights,
    results: email.results,
    subject: email.subject,
    to_address: email.to_address,
    verification_code: email.verification_code,
  };
}
