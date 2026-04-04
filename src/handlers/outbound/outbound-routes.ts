import {
  addAuditLog,
  createOutboundContact,
  createOutboundTemplate,
  deleteOutboundContact,
  deleteOutboundEmailRecord,
  deleteOutboundTemplate,
  getOutboundContactById,
  getOutboundContacts,
  getOutboundEmailById,
  getOutboundEmailSettings,
  getOutboundEmailsPaged,
  getOutboundStats,
  getOutboundTemplateById,
  getOutboundTemplates,
  updateOutboundContact,
  updateOutboundEmailSettings,
  updateOutboundTemplate,
} from "../../core/db";
import { captureError } from "../../core/errors";
import {
  validateOutboundContactInput,
  validateOutboundEmailInput,
  validateOutboundSettingsInput,
  validateOutboundTemplateInput,
} from "../../core/outbound";
import { OUTBOUND_EMAIL_PAGE_SIZE } from "../../utils/constants";
import {
  clampPage,
  json,
  jsonError,
  readJsonBody,
} from "../../utils/utils";
import type { AuthSession, D1Database, WorkerEnv } from "../../server/types";
import {
  ensureActorCanManageGlobalSettings,
  ensureActorCanWrite,
} from "../access-control";
import {
  buildResourceDeleteAuditDetail,
  buildResourceUpdateAuditDetail,
  readAuditOperationNote,
  readRequestAuditOperationNote,
  toOutboundContactAuditSnapshot,
  toOutboundEmailAuditSnapshot,
  toOutboundTemplateAuditSnapshot,
  withAuditOperationNote,
} from "../audit";
import {
  persistOutboundFromHandler,
  prepareOutboundPersistencePayload,
} from "./outbound-persistence";
import { normalizeNullable } from "../validation";

export async function handleAdminOutboundSettingsGet(
  db: D1Database,
  env: WorkerEnv,
): Promise<Response> {
  return json(await getOutboundEmailSettings(db, env));
}

export async function handleAdminOutboundSettingsPut(
  request: Request,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageGlobalSettings(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateOutboundSettingsInput(
    parsed.data || {},
    String(env.RESEND_FROM_DOMAIN || "")
      .trim()
      .toLowerCase(),
  );
  if (!validation.ok) return jsonError(validation.error, 400);

  await updateOutboundEmailSettings(db, validation.data);
  await addAuditLog(db, {
    action: "outbound.settings.update",
    actor,
    detail: {
      ...validation.data,
      api_key_configured: Boolean(String(env.RESEND_API_KEY || "").trim()),
    },
    entity_type: "outbound_settings",
  });

  return json(await getOutboundEmailSettings(db, env));
}

export async function handleAdminOutboundStatsGet(
  db: D1Database,
): Promise<Response> {
  return json(await getOutboundStats(db));
}

export async function handleAdminOutboundEmailsGet(
  url: URL,
  db: D1Database,
): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  const statuses = String(url.searchParams.get("status") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean) as Array<
    "draft" | "failed" | "scheduled" | "sending" | "sent"
  >;
  const keyword = normalizeNullable(url.searchParams.get("keyword"));
  return json(
    await getOutboundEmailsPaged(db, page, OUTBOUND_EMAIL_PAGE_SIZE, {
      keyword,
      statuses,
    }),
  );
}

export async function handleAdminOutboundEmailDetail(
  pathname: string,
  db: D1Database,
): Promise<Response> {
  const id = Number(
    pathname.replace("/admin/outbound/emails/", "").split("/")[0] || "",
  );
  if (!Number.isFinite(id)) return jsonError("invalid outbound email id", 400);

  const record = await getOutboundEmailById(db, id);
  if (!record) return jsonError("outbound email not found", 404);
  return json(record);
}

export async function handleAdminOutboundEmailsPost(
  request: Request,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const prepared = await prepareOutboundPersistencePayload(
    parsed.data || {},
    db,
    env,
  );
  if (!prepared.ok) return jsonError(prepared.error, 400);

  if (!prepared.settings.api_key_configured && prepared.data.mode !== "draft") {
    await captureError(
      db,
      "outbound.resend_send_failed",
      new Error("RESEND_API_KEY is not configured"),
      {
        actor: actor.username,
        reason: "missing_resend_api_key",
        subject: prepared.data.subject,
        to: prepared.data.to,
        trigger: "manual",
      },
    );
    return jsonError("RESEND_API_KEY is not configured", 400);
  }

  return persistOutboundFromHandler(
    db,
    env,
    actor,
    prepared.settings.provider,
    prepared.data,
    undefined,
    prepared.operation_note,
  );
}

export async function handleAdminOutboundEmailsPut(
  pathname: string,
  request: Request,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = Number(
    pathname.replace("/admin/outbound/emails/", "").split("/")[0] || "",
  );
  if (!Number.isFinite(id)) return jsonError("invalid outbound email id", 400);

  const existing = await getOutboundEmailById(db, id);
  if (!existing) return jsonError("outbound email not found", 404);
  if (existing.status === "sent" || existing.status === "sending") {
    return jsonError("sent email cannot be edited", 400);
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const prepared = await prepareOutboundPersistencePayload(
    parsed.data || {},
    db,
    env,
  );
  if (!prepared.ok) return jsonError(prepared.error, 400);

  if (!prepared.settings.api_key_configured && prepared.data.mode !== "draft") {
    await captureError(
      db,
      "outbound.resend_send_failed",
      new Error("RESEND_API_KEY is not configured"),
      {
        actor: actor.username,
        email_id: id,
        reason: "missing_resend_api_key",
        subject: prepared.data.subject,
        to: prepared.data.to,
        trigger: "manual",
      },
    );
    return jsonError("RESEND_API_KEY is not configured", 400);
  }

  return persistOutboundFromHandler(
    db,
    env,
    actor,
    prepared.settings.provider,
    prepared.data,
    id,
    prepared.operation_note,
  );
}

export async function handleAdminOutboundEmailSendExisting(
  pathname: string,
  request: Request,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = Number(
    pathname.replace("/admin/outbound/emails/", "").replace("/send", ""),
  );
  if (!Number.isFinite(id)) return jsonError("invalid outbound email id", 400);

  const existing = await getOutboundEmailById(db, id);
  if (!existing) return jsonError("outbound email not found", 404);
  if (existing.status === "sending") {
    return jsonError("email is already sending", 409);
  }
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;
  if (!String(env.RESEND_API_KEY || "").trim()) {
    await captureError(
      db,
      "outbound.resend_send_failed",
      new Error("RESEND_API_KEY is not configured"),
      {
        actor: actor.username,
        email_id: id,
        reason: "missing_resend_api_key",
        subject: existing.subject,
        to: existing.to_addresses,
        trigger: "manual",
      },
    );
    return jsonError("RESEND_API_KEY is not configured", 400);
  }

  const validation = validateOutboundEmailInput(
    {
      attachments: existing.attachments || [],
      bcc: existing.bcc_addresses,
      cc: existing.cc_addresses,
      from_address: existing.from_address,
      from_name: existing.from_name,
      html_body: existing.html_body,
      mode: "send",
      reply_to: existing.reply_to,
      subject: existing.subject,
      text_body: existing.text_body,
      to: existing.to_addresses,
    },
    await getOutboundEmailSettings(db, env),
  );
  if (!validation.ok) return jsonError(validation.error, 400);

  return persistOutboundFromHandler(
    db,
    env,
    actor,
    "resend",
    validation.data,
    id,
    operation_note,
  );
}

export async function handleAdminOutboundEmailsDelete(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = Number(pathname.replace("/admin/outbound/emails/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid outbound email id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;
  const existing = await getOutboundEmailById(db, id);
  if (!existing) return jsonError("outbound email not found", 404);
  await deleteOutboundEmailRecord(db, id);
  await addAuditLog(db, {
    action: "outbound.email.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toOutboundEmailAuditSnapshot(existing),
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "outbound_email",
  });
  return json({ ok: true });
}

export async function handleAdminOutboundTemplatesGet(
  db: D1Database,
): Promise<Response> {
  return json(await getOutboundTemplates(db));
}

export async function handleAdminOutboundTemplatesPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);
  const operationNoteValidation = readAuditOperationNote(parsed.data || {});
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const validation = validateOutboundTemplateInput(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const id = await createOutboundTemplate(db, {
    ...validation.data,
    created_by: actor.username,
  });
  const created = await getOutboundTemplateById(db, id);
  const next = toOutboundTemplateAuditSnapshot(
    created || {
      ...validation.data,
      created_by: actor.username,
    },
  );
  await addAuditLog(db, {
    action: "outbound.template.create",
    actor,
    detail: withAuditOperationNote(
      {
        id,
        ...next,
      },
      operationNoteValidation.operation_note,
    ),
    entity_id: String(id),
    entity_type: "outbound_template",
  });
  return json({ ok: true });
}

export async function handleAdminOutboundTemplatesPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = Number(pathname.replace("/admin/outbound/templates/", ""));
  if (!Number.isFinite(id)) {
    return jsonError("invalid outbound template id", 400);
  }
  const existing = await getOutboundTemplateById(db, id);
  if (!existing) return jsonError("outbound template not found", 404);
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);
  const operationNoteValidation = readAuditOperationNote(parsed.data || {});
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const validation = validateOutboundTemplateInput(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const previous = toOutboundTemplateAuditSnapshot(existing);
  await updateOutboundTemplate(db, id, validation.data);
  const latest = await getOutboundTemplateById(db, id);
  const next = toOutboundTemplateAuditSnapshot(
    latest || {
      ...validation.data,
      created_by: existing.created_by,
    },
  );
  await addAuditLog(db, {
    action: "outbound.template.update",
    actor,
    detail: buildResourceUpdateAuditDetail(
      previous,
      next,
      [
        "html_template_length",
        "is_enabled",
        "name",
        "subject_template",
        "text_template_length",
        "variables",
      ],
      operationNoteValidation.operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "outbound_template",
  });
  return json({ ok: true });
}

export async function handleAdminOutboundTemplatesDelete(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = Number(pathname.replace("/admin/outbound/templates/", ""));
  if (!Number.isFinite(id)) {
    return jsonError("invalid outbound template id", 400);
  }
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;
  const existing = await getOutboundTemplateById(db, id);
  if (!existing) return jsonError("outbound template not found", 404);
  await deleteOutboundTemplate(db, id);
  await addAuditLog(db, {
    action: "outbound.template.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toOutboundTemplateAuditSnapshot(existing),
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "outbound_template",
  });
  return json({ ok: true });
}

export async function handleAdminOutboundContactsGet(
  db: D1Database,
): Promise<Response> {
  return json(await getOutboundContacts(db));
}

export async function handleAdminOutboundContactsPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);
  const operationNoteValidation = readAuditOperationNote(parsed.data || {});
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const validation = validateOutboundContactInput(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const id = await createOutboundContact(db, validation.data);
  const created = await getOutboundContactById(db, id);
  const next = toOutboundContactAuditSnapshot(created || validation.data);
  await addAuditLog(db, {
    action: "outbound.contact.create",
    actor,
    detail: withAuditOperationNote(
      {
        id,
        ...next,
      },
      operationNoteValidation.operation_note,
    ),
    entity_id: String(id),
    entity_type: "outbound_contact",
  });
  return json({ ok: true });
}

export async function handleAdminOutboundContactsPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = Number(pathname.replace("/admin/outbound/contacts/", ""));
  if (!Number.isFinite(id)) {
    return jsonError("invalid outbound contact id", 400);
  }
  const existing = await getOutboundContactById(db, id);
  if (!existing) return jsonError("outbound contact not found", 404);
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);
  const operationNoteValidation = readAuditOperationNote(parsed.data || {});
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const validation = validateOutboundContactInput(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const previous = toOutboundContactAuditSnapshot(existing);
  await updateOutboundContact(db, id, validation.data);
  const latest = await getOutboundContactById(db, id);
  const next = toOutboundContactAuditSnapshot(latest || validation.data);
  await addAuditLog(db, {
    action: "outbound.contact.update",
    actor,
    detail: buildResourceUpdateAuditDetail(
      previous,
      next,
      ["email", "is_favorite", "name", "note", "tags"],
      operationNoteValidation.operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "outbound_contact",
  });
  return json({ ok: true });
}

export async function handleAdminOutboundContactsDelete(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = Number(pathname.replace("/admin/outbound/contacts/", ""));
  if (!Number.isFinite(id)) {
    return jsonError("invalid outbound contact id", 400);
  }
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;
  const existing = await getOutboundContactById(db, id);
  if (!existing) return jsonError("outbound contact not found", 404);
  await deleteOutboundContact(db, id);
  await addAuditLog(db, {
    action: "outbound.contact.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toOutboundContactAuditSnapshot(existing),
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "outbound_contact",
  });
  return json({ ok: true });
}
