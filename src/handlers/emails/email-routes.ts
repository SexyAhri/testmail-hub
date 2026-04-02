import {
  addAuditLog,
  archiveEmail,
  getAttachmentContent,
  getEmailByMessageIdScoped,
  getEmailProjectIds,
  getEmails,
  purgeEmail,
  restoreEmail,
  softDeleteEmail,
  unarchiveEmail,
  updateEmailMetadata,
} from "../../core/db";
import { sendEventNotifications } from "../../core/notifications";
import { PAGE_SIZE } from "../../utils/constants";
import {
  binaryResponse,
  clampNumber,
  clampPage,
  decodeBase64,
  json,
  jsonError,
  maybeBoolean,
  parseArchivedFilter,
  parseDeletedFilter,
  readJsonBody,
} from "../../utils/utils";
import type { AuthSession, D1Database } from "../../server/types";
import {
  ensureActorCanWrite,
  ensureActorHasPermission,
  getActorProjectIds,
} from "../access-control";
import {
  buildResourceDeleteAuditDetail,
  readRequestAuditOperationNote,
  toEmailAuditSnapshot,
} from "../audit";
import { normalizeNullable, validateEmailMetadataBody } from "../validation";

export async function handleAdminEmails(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorHasPermission(actor, "emails:read");
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const page = clampPage(url.searchParams.get("page"));
  const payload = await getEmails(
    db,
    page,
    PAGE_SIZE,
    {
      address: normalizeNullable(url.searchParams.get("address")),
      archived: parseArchivedFilter(url.searchParams.get("archived")),
      date_from: clampNumber(url.searchParams.get("date_from"), { min: 0 }),
      date_to: clampNumber(url.searchParams.get("date_to"), { min: 0 }),
      deleted: parseDeletedFilter(url.searchParams.get("deleted")),
      domain: normalizeNullable(url.searchParams.get("domain")),
      environment_id: clampNumber(url.searchParams.get("environment_id"), {
        min: 1,
      }),
      has_attachments: maybeBoolean(url.searchParams.get("has_attachments")),
      has_matches: maybeBoolean(url.searchParams.get("has_matches")),
      mailbox_pool_id: clampNumber(url.searchParams.get("mailbox_pool_id"), {
        min: 1,
      }),
      project_id: clampNumber(url.searchParams.get("project_id"), { min: 1 }),
      sender: normalizeNullable(url.searchParams.get("sender")),
      subject: normalizeNullable(url.searchParams.get("subject")),
    },
    getActorProjectIds(actor),
  );
  return json(payload);
}

export async function handleAdminEmailDetail(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorHasPermission(actor, "emails:read");
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const messageId = decodeURIComponent(
    pathname.replace("/admin/emails/", "").split("/")[0] || "",
  );
  if (!messageId) return jsonError("invalid email id", 400);

  const email = await getEmailByMessageIdScoped(
    db,
    messageId,
    getActorProjectIds(actor),
  );
  if (!email) return jsonError("email not found", 404);
  return json(email);
}

export async function handleAdminEmailMetadataPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
    ensureActorHasPermission(actor, "emails:write");
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const messageId = decodeURIComponent(
    pathname.replace("/admin/emails/", "").replace("/metadata", ""),
  );
  if (!messageId) return jsonError("invalid email id", 400);

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateEmailMetadataBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const existing = await getEmailByMessageIdScoped(
    db,
    messageId,
    getActorProjectIds(actor),
  );
  if (!existing) return jsonError("email not found", 404);

  const email = await updateEmailMetadata(db, messageId, validation.data);
  if (!email) return jsonError("email not found", 404);

  await addAuditLog(db, {
    action: "email.metadata.update",
    actor,
    detail: { message_id: messageId, ...validation.data },
    entity_id: messageId,
    entity_type: "email",
  });
  return json(email);
}

export async function handleAdminEmailDelete(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
    ensureActorHasPermission(actor, "emails:delete");
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const messageId = decodeURIComponent(
    pathname.replace("/admin/emails/", "").split("/")[0] || "",
  );
  if (!messageId) return jsonError("invalid email id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const existing = await getEmailByMessageIdScoped(
    db,
    messageId,
    getActorProjectIds(actor),
  );
  if (!existing) return jsonError("email not found", 404);

  await softDeleteEmail(db, messageId, actor.username);
  await addAuditLog(db, {
    action: "email.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toEmailAuditSnapshot(existing),
      operation_note,
      {
        deletion_kind: "soft_delete",
        message_id: messageId,
      },
    ),
    entity_id: messageId,
    entity_type: "email",
  });
  const project_ids = await getEmailProjectIds(db, messageId);
  await sendEventNotifications(
    db,
    "email.deleted",
    {
      actor: actor.username,
      message_id: messageId,
      project_id: existing.project_id,
      project_ids,
    },
    {
      environment_id: existing.environment_id,
      mailbox_pool_id: existing.mailbox_pool_id,
      project_id: existing.project_id,
      project_ids,
    },
  );
  return json({ ok: true });
}

export async function handleAdminEmailRestore(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
    ensureActorHasPermission(actor, "emails:restore");
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const messageId = decodeURIComponent(
    pathname.replace("/admin/emails/", "").replace("/restore", ""),
  );
  if (!messageId) return jsonError("invalid email id", 400);

  const existing = await getEmailByMessageIdScoped(
    db,
    messageId,
    getActorProjectIds(actor),
  );
  if (!existing) return jsonError("email not found", 404);

  await restoreEmail(db, messageId);
  await addAuditLog(db, {
    action: "email.restore",
    actor,
    detail: { message_id: messageId },
    entity_id: messageId,
    entity_type: "email",
  });
  const project_ids = await getEmailProjectIds(db, messageId);
  await sendEventNotifications(
    db,
    "email.restored",
    {
      actor: actor.username,
      message_id: messageId,
      project_id: existing.project_id,
      project_ids,
    },
    {
      environment_id: existing.environment_id,
      mailbox_pool_id: existing.mailbox_pool_id,
      project_id: existing.project_id,
      project_ids,
    },
  );
  return json({ ok: true });
}

export async function handleAdminEmailPurge(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
    ensureActorHasPermission(actor, "emails:delete");
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const messageId = decodeURIComponent(
    pathname.replace("/admin/emails/", "").replace("/purge", ""),
  );
  if (!messageId) return jsonError("invalid email id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const existing = await getEmailByMessageIdScoped(
    db,
    messageId,
    getActorProjectIds(actor),
  );
  if (!existing) return jsonError("email not found", 404);

  await purgeEmail(db, messageId);
  await addAuditLog(db, {
    action: "email.purge",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toEmailAuditSnapshot(existing),
      operation_note,
      {
        deletion_kind: "purge",
        message_id: messageId,
      },
    ),
    entity_id: messageId,
    entity_type: "email",
  });
  return json({ ok: true });
}

export async function handleAdminEmailArchive(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
    ensureActorHasPermission(actor, "emails:write");
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const messageId = decodeURIComponent(
    pathname.replace("/admin/emails/", "").replace("/archive", ""),
  );
  if (!messageId) return jsonError("invalid email id", 400);

  const existing = await getEmailByMessageIdScoped(
    db,
    messageId,
    getActorProjectIds(actor),
  );
  if (!existing) return jsonError("email not found", 404);
  if (existing.deleted_at) {
    return jsonError("deleted email cannot be archived", 409);
  }
  if (existing.archived_at) return jsonError("email is already archived", 409);

  await archiveEmail(db, messageId, {
    archive_reason: "manual",
    archived_by: actor.username,
  });
  await addAuditLog(db, {
    action: "email.archive",
    actor,
    detail: { archive_reason: "manual", message_id: messageId },
    entity_id: messageId,
    entity_type: "email",
  });
  const project_ids = await getEmailProjectIds(db, messageId);
  const scopedProjectIds =
    project_ids.length > 0
      ? project_ids
      : existing.project_id
        ? [existing.project_id]
        : [];
  await sendEventNotifications(
    db,
    "email.archived",
    {
      actor: actor.username,
      archive_reason: "manual",
      message_id: messageId,
      project_id: existing.project_id,
      project_ids: scopedProjectIds,
      source: "admin_action",
    },
    {
      environment_id: existing.environment_id,
      mailbox_pool_id: existing.mailbox_pool_id,
      project_id: existing.project_id,
      project_ids: scopedProjectIds,
    },
  );
  return json({ ok: true });
}

export async function handleAdminEmailUnarchive(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
    ensureActorHasPermission(actor, "emails:restore");
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const messageId = decodeURIComponent(
    pathname.replace("/admin/emails/", "").replace("/unarchive", ""),
  );
  if (!messageId) return jsonError("invalid email id", 400);

  const existing = await getEmailByMessageIdScoped(
    db,
    messageId,
    getActorProjectIds(actor),
  );
  if (!existing) return jsonError("email not found", 404);
  if (!existing.archived_at) return jsonError("email is not archived", 409);

  await unarchiveEmail(db, messageId);
  await addAuditLog(db, {
    action: "email.unarchive",
    actor,
    detail: { message_id: messageId },
    entity_id: messageId,
    entity_type: "email",
  });
  const project_ids = await getEmailProjectIds(db, messageId);
  const scopedProjectIds =
    project_ids.length > 0
      ? project_ids
      : existing.project_id
        ? [existing.project_id]
        : [];
  await sendEventNotifications(
    db,
    "email.unarchived",
    {
      actor: actor.username,
      message_id: messageId,
      project_id: existing.project_id,
      project_ids: scopedProjectIds,
      source: "admin_action",
    },
    {
      environment_id: existing.environment_id,
      mailbox_pool_id: existing.mailbox_pool_id,
      project_id: existing.project_id,
      project_ids: scopedProjectIds,
    },
  );
  return json({ ok: true });
}

export async function handleAdminEmailAttachment(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorHasPermission(actor, "emails:read");
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const match = pathname.match(
    /^\/admin\/emails\/([^/]+)\/attachments\/(\d+)$/,
  );
  if (!match) return jsonError("invalid attachment path", 400);

  const messageId = decodeURIComponent(match[1]);
  const attachmentId = Number(match[2]);
  const existing = await getEmailByMessageIdScoped(
    db,
    messageId,
    getActorProjectIds(actor),
  );
  if (!existing) return jsonError("email not found", 404);

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
