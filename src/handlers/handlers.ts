import {
  addAuditLog,
  applyMailboxSyncCandidate,
  createAdminUser,
  createMailbox,
  createNotificationEndpoint,
  createOutboundContact,
  createOutboundTemplate,
  createRule,
  createWhitelistEntry,
  deleteMailbox,
  deleteNotificationEndpoint,
  deleteOutboundContact,
  deleteOutboundEmailRecord,
  deleteOutboundTemplate,
  deleteRule,
  deleteWhitelistEntry,
  findAdminUserByUsername,
  getAdminUsersPaged,
  getAllNotificationEndpoints,
  getAttachmentContent,
  getAuditLogsPaged,
  getAvailableDomains,
  getEmailByMessageId,
  getEmails,
  getEmails as getEmailsPaged,
  getErrorEventsPaged,
  getExportRows,
  getLatestEmail,
  getMailboxById,
  getMailboxesPaged,
  getNotificationEndpointsPaged,
  getObservedMailboxStats,
  getOutboundContacts,
  getOutboundEmailById,
  getOutboundEmailSettings,
  getOutboundEmailsPaged,
  getOutboundStats,
  getOutboundTemplates,
  getOverviewStats,
  getRulesPaged,
  getWhitelistSettings,
  getWhitelistPaged,
  purgeEmail,
  restoreEmail,
  softDeleteEmail,
  touchAdminUserLogin,
  updateAdminUser,
  updateEmailMetadata,
  updateMailbox,
  updateNotificationEndpoint,
  updateOutboundContact,
  updateOutboundEmailSettings,
  updateOutboundTemplate,
  updateRule,
  updateWhitelistSettings,
  updateWhitelistEntry,
} from "../core/db";
import {
  deleteCloudflareMailboxRoute,
  getCloudflareMailboxSyncSnapshot,
  isCloudflareMailboxSyncConfigured,
  upsertCloudflareMailboxRoute,
} from "../core/mailbox-sync";
import { captureError } from "../core/errors";
import {
  clearAdminSessionCookie,
  createBootstrapSessionCookie,
  createSessionCookie,
  hashPassword,
  verifyPassword,
} from "../core/auth";
import {
  applyOutboundTemplate,
  type NormalizedOutboundEmailPayload,
  parseTemplateVariables,
  validateOutboundContactInput,
  validateOutboundEmailInput,
  validateOutboundSettingsInput,
  validateOutboundTemplateInput,
} from "../core/outbound";
import { persistOutboundEmail } from "../core/outbound-service";
import { sendEventNotifications, sendTestNotification } from "../core/notifications";
import { testRules } from "../core/logic";
import {
  ADMIN_PAGE_SIZE,
  AUDIT_PAGE_SIZE,
  MAILBOX_PAGE_SIZE,
  MAX_EMAIL_NOTE_LENGTH,
  MAX_MAILBOX_ADDRESS_LENGTH,
  MAX_MAILBOX_NOTE_LENGTH,
  MAX_MAILBOX_TAGS,
  OUTBOUND_EMAIL_PAGE_SIZE,
  MAX_RULE_PATTERN_LENGTH,
  MAX_RULE_REMARK_LENGTH,
  MAX_SENDER_FILTER_LENGTH,
  MAX_SENDER_PATTERN_LENGTH,
  NOTIFICATION_EVENTS,
  PAGE_SIZE,
  RULES_PAGE_SIZE,
} from "../utils/constants";
import {
  base64ByteLength,
  binaryResponse,
  clampNumber,
  clampPage,
  downloadResponse,
  extractVerificationCode,
  isValidEmailAddress,
  json,
  jsonError,
  maybeBoolean,
  normalizeEmailAddress,
  normalizeTags,
  parseDeletedFilter,
  readJsonBody,
  safeParseJson,
  decodeBase64,
  toCsv,
  createRandomMailboxLocalPart,
  isSqliteConstraintError,
} from "../utils/utils";
import type { AdminRole, AuthSession, D1Database, WorkerEnv } from "../server/types";

const PASSWORD_MIN_LENGTH = 8;
const NOTIFICATION_EVENT_SET = new Set<string>(NOTIFICATION_EVENTS);

export async function handleAdminLogin(request: Request, env: WorkerEnv): Promise<Response> {
  const parsed = await readJsonBody<{ password?: string; token?: string; username?: string }>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const token = String(parsed.data?.token || "").trim();
  if (token && env.ADMIN_TOKEN && token === env.ADMIN_TOKEN) {
    const response = json({
      ok: true,
      user: {
        display_name: "初始管理员",
        role: "owner",
        username: "bootstrap-owner",
      },
    });
    response.headers.set("Set-Cookie", await createBootstrapSessionCookie(request, env.ADMIN_TOKEN, env.SESSION_SECRET));
    await addAuditLog(env.DB, {
      action: "admin.login",
      actor: { display_name: "初始管理员", role: "owner", user_id: "bootstrap-owner" },
      detail: { auth_kind: "bootstrap_token" },
      entity_type: "admin_session",
    });
    await sendEventNotifications(env.DB, "admin.login", { auth_kind: "bootstrap_token", username: "bootstrap-owner" });
    return response;
  }

  const username = String(parsed.data?.username || "").trim().toLowerCase();
  const password = String(parsed.data?.password || "");
  if (!username || !password) {
    if (token) {
      await captureError(env.DB, "auth.login_failed", new Error("invalid bootstrap token"), {
        reason: "invalid_bootstrap_token",
      }, env.ERROR_WEBHOOK_URL);
    }
    return jsonError("token or username/password is required", 400);
  }

  const adminUser = await findAdminUserByUsername(env.DB, username);
  if (!adminUser || !adminUser.is_enabled) {
    await captureError(env.DB, "auth.login_failed", new Error("invalid credentials"), {
      reason: !adminUser ? "user_not_found" : "user_disabled",
      username,
    }, env.ERROR_WEBHOOK_URL);
    return jsonError("invalid credentials", 401);
  }

  const verified = await verifyPassword(password, adminUser.password_hash, adminUser.password_salt);
  if (!verified) {
    await captureError(env.DB, "auth.login_failed", new Error("invalid credentials"), {
      reason: "password_mismatch",
      username,
    }, env.ERROR_WEBHOOK_URL);
    return jsonError("invalid credentials", 401);
  }

  const response = json({
    ok: true,
    user: {
      display_name: adminUser.display_name,
      role: adminUser.role,
      username: adminUser.username,
    },
  });

  response.headers.set(
    "Set-Cookie",
    await createSessionCookie(
      request,
      {
        auth_kind: "admin_user",
        display_name: adminUser.display_name,
        expires_at: Date.now(),
        role: adminUser.role,
        user_agent_hash: "",
        user_id: adminUser.id,
        username: adminUser.username,
      },
      env.ADMIN_TOKEN || env.SESSION_SECRET || "temp-mail-console",
      env.SESSION_SECRET,
    ),
  );

  await touchAdminUserLogin(env.DB, adminUser.id);
  await addAuditLog(env.DB, {
    action: "admin.login",
    actor: { display_name: adminUser.display_name, role: adminUser.role, user_id: adminUser.id },
    detail: { auth_kind: "admin_user", username: adminUser.username },
    entity_type: "admin_session",
  });
  await sendEventNotifications(env.DB, "admin.login", { auth_kind: "admin_user", username: adminUser.username });
  return response;
}

export function handleAdminSession(env: WorkerEnv, session: AuthSession): Response {
  return json({
    ok: true,
    mailbox_domain: env.MAILBOX_DOMAIN || "",
    user: {
      display_name: session.display_name,
      role: session.role,
      username: session.username,
    },
  });
}

export function handleAdminLogout(request: Request): Response {
  const response = json({ ok: true });
  response.headers.set("Set-Cookie", clearAdminSessionCookie(request));
  return response;
}

export async function handleEmailsLatest(url: URL, db: D1Database): Promise<Response> {
  const address = normalizeEmailAddress(url.searchParams.get("address"));
  if (!address) return jsonError("address is required", 400);

  const row = await getLatestEmail(db, address);
  if (!row) return jsonError("message not found", 404);

  return json({
    from_address: row.from_address,
    message_id: row.message_id,
    received_at: row.received_at,
    results: safeParseJson(row.extracted_json, []) || [],
    subject: row.subject,
    to_address: row.to_address,
    verification_code: extractVerificationCode({
      htmlBody: row.html_body,
      results: safeParseJson(row.extracted_json, []) || [],
      subject: row.subject,
      textBody: row.text_body,
    }),
  });
}

export async function handleAdminEmails(url: URL, db: D1Database): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  const payload = await getEmails(db, page, PAGE_SIZE, {
    address: normalizeNullable(url.searchParams.get("address")),
    date_from: clampNumber(url.searchParams.get("date_from"), { min: 0 }),
    date_to: clampNumber(url.searchParams.get("date_to"), { min: 0 }),
    deleted: parseDeletedFilter(url.searchParams.get("deleted")),
    domain: normalizeNullable(url.searchParams.get("domain")),
    has_attachments: maybeBoolean(url.searchParams.get("has_attachments")),
    has_matches: maybeBoolean(url.searchParams.get("has_matches")),
    sender: normalizeNullable(url.searchParams.get("sender")),
    subject: normalizeNullable(url.searchParams.get("subject")),
  });
  return json(payload);
}

export async function handleAdminEmailDetail(pathname: string, db: D1Database): Promise<Response> {
  const messageId = decodeURIComponent(pathname.replace("/admin/emails/", "").split("/")[0] || "");
  if (!messageId) return jsonError("invalid email id", 400);

  const email = await getEmailByMessageId(db, messageId);
  if (!email) return jsonError("email not found", 404);
  return json(email);
}

export async function handleAdminEmailMetadataPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const messageId = decodeURIComponent(pathname.replace("/admin/emails/", "").replace("/metadata", ""));
  if (!messageId) return jsonError("invalid email id", 400);

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateEmailMetadataBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

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
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const messageId = decodeURIComponent(pathname.replace("/admin/emails/", "").split("/")[0] || "");
  if (!messageId) return jsonError("invalid email id", 400);

  await softDeleteEmail(db, messageId, actor.username);
  await addAuditLog(db, {
    action: "email.delete",
    actor,
    detail: { message_id: messageId },
    entity_id: messageId,
    entity_type: "email",
  });
  await sendEventNotifications(db, "email.deleted", { message_id: messageId, actor: actor.username });
  return json({ ok: true });
}

export async function handleAdminEmailRestore(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const messageId = decodeURIComponent(pathname.replace("/admin/emails/", "").replace("/restore", ""));
  if (!messageId) return jsonError("invalid email id", 400);

  await restoreEmail(db, messageId);
  await addAuditLog(db, {
    action: "email.restore",
    actor,
    detail: { message_id: messageId },
    entity_id: messageId,
    entity_type: "email",
  });
  await sendEventNotifications(db, "email.restored", { message_id: messageId, actor: actor.username });
  return json({ ok: true });
}

export async function handleAdminEmailPurge(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const messageId = decodeURIComponent(pathname.replace("/admin/emails/", "").replace("/purge", ""));
  if (!messageId) return jsonError("invalid email id", 400);

  await purgeEmail(db, messageId);
  await addAuditLog(db, {
    action: "email.purge",
    actor,
    detail: { message_id: messageId },
    entity_id: messageId,
    entity_type: "email",
  });
  return json({ ok: true });
}

export async function handleAdminEmailAttachment(
  pathname: string,
  db: D1Database,
): Promise<Response> {
  const match = pathname.match(/^\/admin\/emails\/([^/]+)\/attachments\/(\d+)$/);
  if (!match) return jsonError("invalid attachment path", 400);

  const messageId = decodeURIComponent(match[1]);
  const attachmentId = Number(match[2]);
  const attachment = await getAttachmentContent(db, messageId, attachmentId);

  if (!attachment) return jsonError("attachment not found", 404);
  if (!attachment.is_stored || !attachment.content_base64) {
    return jsonError("attachment metadata exists but binary content was not retained", 422);
  }

  const filename = attachment.filename || `attachment-${attachment.id}`;
  return binaryResponse(decodeBase64(attachment.content_base64), {
    contentDisposition: `attachment; filename="${filename}"`,
    contentType: attachment.mime_type,
  });
}

export async function handleAdminDomains(_url: URL, db: D1Database): Promise<Response> {
  const domains = await getAvailableDomains(db);
  return json({ domains });
}

export async function handleAdminRulesGet(url: URL, db: D1Database): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  const payload = await getRulesPaged(db, page, RULES_PAGE_SIZE);
  return json(payload);
}

export async function handleAdminRulesPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateRuleBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await createRule(db, validation.data);
  await addAuditLog(db, {
    action: "rule.create",
    actor,
    detail: validation.data,
    entity_type: "rule",
  });
  await sendEventNotifications(db, "rule.updated", { action: "create", remark: validation.data.remark });
  return json({ ok: true });
}

export async function handleAdminRulesPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/rules/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid rule id", 400);

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateRuleBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await updateRule(db, id, validation.data);
  await addAuditLog(db, {
    action: "rule.update",
    actor,
    detail: { id, ...validation.data },
    entity_id: String(id),
    entity_type: "rule",
  });
  await sendEventNotifications(db, "rule.updated", { action: "update", id, remark: validation.data.remark });
  return json({ ok: true });
}

export async function handleAdminRulesDelete(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/rules/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid rule id", 400);
  await deleteRule(db, id);
  await addAuditLog(db, {
    action: "rule.delete",
    actor,
    detail: { id },
    entity_id: String(id),
    entity_type: "rule",
  });
  await sendEventNotifications(db, "rule.updated", { action: "delete", id });
  return json({ ok: true });
}

export async function handleAdminRulesTest(request: Request, db: D1Database): Promise<Response> {
  const parsed = await readJsonBody<{ content?: string; sender?: string }>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const sender = String(parsed.data?.sender || "").trim().toLowerCase();
  const content = String(parsed.data?.content || "");
  const rules = await getRulesPaged(db, 1, 10_000);
  const result = testRules(
    sender,
    content,
    rules.items.map(rule => ({
      id: rule.id,
      pattern: rule.pattern,
      remark: rule.remark,
      sender_filter: rule.sender_filter,
    })),
  );
  return json(result);
}

export async function handleAdminWhitelistGet(url: URL, db: D1Database): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  const payload = await getWhitelistPaged(db, page, RULES_PAGE_SIZE);
  return json(payload);
}

export async function handleAdminWhitelistPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateWhitelistBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await createWhitelistEntry(db, validation.data);
  await addAuditLog(db, {
    action: "whitelist.create",
    actor,
    detail: validation.data,
    entity_type: "whitelist",
  });
  return json({ ok: true });
}

export async function handleAdminWhitelistPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/whitelist/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid whitelist id", 400);

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateWhitelistBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await updateWhitelistEntry(db, id, validation.data);
  await addAuditLog(db, {
    action: "whitelist.update",
    actor,
    detail: { id, ...validation.data },
    entity_id: String(id),
    entity_type: "whitelist",
  });
  return json({ ok: true });
}

export async function handleAdminWhitelistDelete(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/whitelist/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid whitelist id", 400);
  await deleteWhitelistEntry(db, id);
  await addAuditLog(db, {
    action: "whitelist.delete",
    actor,
    detail: { id },
    entity_id: String(id),
    entity_type: "whitelist",
  });
  return json({ ok: true });
}

export async function handleAdminWhitelistSettingsGet(db: D1Database): Promise<Response> {
  return json(await getWhitelistSettings(db));
}

export async function handleAdminWhitelistSettingsPut(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const parsed = await readJsonBody<{ enabled?: boolean }>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);
  const enabled = parsed.data?.enabled !== false;

  const settings = await updateWhitelistSettings(db, enabled);
  await addAuditLog(db, {
    action: "whitelist.settings.update",
    actor,
    detail: { enabled: settings.enabled },
    entity_type: "whitelist_settings",
  });
  return json(settings);
}

export async function handleAdminMailboxesGet(url: URL, db: D1Database): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  const includeDeleted = url.searchParams.get("include_deleted") === "1";
  const payload = await getMailboxesPaged(db, page, MAILBOX_PAGE_SIZE, includeDeleted);
  return json(payload);
}

export async function handleAdminMailboxesSync(
  db: D1Database,
  env: WorkerEnv,
): Promise<Response> {
  const observed = await getObservedMailboxStats(db, env.MAILBOX_DOMAIN || "");
  let cloudflare: Awaited<ReturnType<typeof getCloudflareMailboxSyncSnapshot>>;
  try {
    cloudflare = await getCloudflareMailboxSyncSnapshot(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to sync Cloudflare email routes";
    await captureError(db, "mailbox.cloudflare_sync_failed", new Error(message), {
      action: "snapshot",
      route: "admin/mailboxes/sync",
    });
    return jsonError(message, 502);
  }
  const candidates = [
    ...observed.map(item => ({
      address: item.address,
      created_by: "system:observed-mailbox-sync",
      is_enabled: true,
      last_received_at: item.last_received_at,
      receive_count: item.receive_count,
    })),
    ...cloudflare.candidates.map(item => ({
      address: item.address,
      created_by: "system:cloudflare-mailbox-sync",
      is_enabled: item.is_enabled,
      last_received_at: item.last_received_at,
      receive_count: item.receive_count,
    })),
  ];

  let created_count = 0;
  let skipped_count = 0;
  let updated_count = 0;

  for (const candidate of candidates) {
    const outcome = await applyMailboxSyncCandidate(db, candidate);
    if (outcome === "created") created_count += 1;
    else if (outcome === "updated") updated_count += 1;
    else skipped_count += 1;
  }

  return json({
    catch_all_enabled: cloudflare.catch_all_enabled,
    cloudflare_configured: cloudflare.configured,
    cloudflare_routes_total: cloudflare.candidates.length,
    created_count,
    observed_total: observed.length,
    skipped_count,
    updated_count,
  });
}

export async function handleAdminMailboxesPost(
  request: Request,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateMailboxBody(parsed.data || {}, env.MAILBOX_DOMAIN || "");
  if (!validation.ok) return jsonError(validation.error, 400);

  const syncToCloudflare = isCloudflareMailboxSyncConfigured(env);
  for (const mailbox of validation.data) {
    if (syncToCloudflare) {
      try {
        await upsertCloudflareMailboxRoute(env, {
          address: mailbox.address,
          is_enabled: mailbox.is_enabled,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to sync mailbox route to Cloudflare";
        await captureError(db, "mailbox.cloudflare_sync_failed", new Error(message), {
          action: "create",
          address: mailbox.address,
          actor: actor.username,
        });
        return jsonError(message, 502);
      }
    }
    await createMailbox(db, { ...mailbox, created_by: actor.username });
  }

  await addAuditLog(db, {
    action: "mailbox.create",
    actor,
    detail: { count: validation.data.length, addresses: validation.data.map(item => item.address) },
    entity_type: "mailbox",
  });
  return json({ count: validation.data.length, mailboxes: validation.data, ok: true });
}

export async function handleAdminMailboxesPut(
  pathname: string,
  request: Request,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/mailboxes/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid mailbox id", 400);
  const existing = await getMailboxById(db, id);
  if (!existing || existing.deleted_at !== null) return jsonError("mailbox not found", 404);

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateMailboxBody(parsed.data || {}, env.MAILBOX_DOMAIN || "", false);
  if (!validation.ok) return jsonError(validation.error, 400);

  const nextMailbox = validation.data[0];
  const syncToCloudflare = isCloudflareMailboxSyncConfigured(env);
  if (syncToCloudflare) {
    try {
      await upsertCloudflareMailboxRoute(env, {
        address: nextMailbox.address,
        is_enabled: nextMailbox.is_enabled,
      });

      const existingAddress = normalizeEmailAddress(existing.address);
      const nextAddress = normalizeEmailAddress(nextMailbox.address);
      if (existingAddress && nextAddress && existingAddress !== nextAddress) {
        await deleteCloudflareMailboxRoute(env, existingAddress);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to sync mailbox route to Cloudflare";
      await captureError(db, "mailbox.cloudflare_sync_failed", new Error(message), {
        action: "update",
        actor: actor.username,
        mailbox_id: id,
        next_address: nextMailbox.address,
        previous_address: existing.address,
      });
      return jsonError(message, 502);
    }
  }

  await updateMailbox(db, id, nextMailbox);
  await addAuditLog(db, {
    action: "mailbox.update",
    actor,
    detail: { id, ...nextMailbox },
    entity_id: String(id),
    entity_type: "mailbox",
  });
  return json({ mailbox: nextMailbox, ok: true });
}

export async function handleAdminMailboxesDelete(
  pathname: string,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/mailboxes/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid mailbox id", 400);
  const existing = await getMailboxById(db, id);
  if (!existing || existing.deleted_at !== null) return jsonError("mailbox not found", 404);

  if (isCloudflareMailboxSyncConfigured(env)) {
    try {
      await deleteCloudflareMailboxRoute(env, existing.address);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to delete Cloudflare mailbox route";
      await captureError(db, "mailbox.cloudflare_sync_failed", new Error(message), {
        action: "delete",
        actor: actor.username,
        address: existing.address,
        mailbox_id: id,
      });
      return jsonError(message, 502);
    }
  }

  await deleteMailbox(db, id);
  await addAuditLog(db, {
    action: "mailbox.delete",
    actor,
    detail: { id, address: existing.address },
    entity_id: String(id),
    entity_type: "mailbox",
  });
  return json({ ok: true });
}

export async function handleAdminAdminsGet(url: URL, db: D1Database): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  const payload = await getAdminUsersPaged(db, page, ADMIN_PAGE_SIZE);
  return json(payload);
}

export async function handleAdminAdminsPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = await validateAdminBody(parsed.data || {}, true);
  if (!validation.ok) return jsonError(validation.error, 400);
  if (!("username" in validation.data) || !("password_hash" in validation.data) || !("password_salt" in validation.data)) {
    return jsonError("password is required", 400);
  }

  const createData = validation.data as {
    display_name: string;
    is_enabled: boolean;
    password_hash: string;
    password_salt: string;
    role: AdminRole;
    username: string;
  };

  const existingUser = await findAdminUserByUsername(db, createData.username);
  if (existingUser) {
    await captureError(db, "admin.create_failed", new Error("username already exists"), {
      actor: actor.username,
      reason: "duplicate_username",
      username: createData.username,
    });
    return jsonError("username already exists", 409);
  }

  let user: Awaited<ReturnType<typeof createAdminUser>>;
  try {
    user = await createAdminUser(db, {
      display_name: createData.display_name,
      is_enabled: createData.is_enabled,
      password_hash: createData.password_hash,
      password_salt: createData.password_salt,
      role: createData.role,
      username: createData.username,
    });
  } catch (error) {
    if (isSqliteConstraintError(error)) {
      await captureError(db, "admin.create_failed", new Error("username already exists"), {
        actor: actor.username,
        reason: "duplicate_username",
        username: createData.username,
      });
      return jsonError("username already exists", 409);
    }
    await captureError(db, "admin.create_failed", error, {
      actor: actor.username,
      username: createData.username,
    });
    throw error;
  }

  await addAuditLog(db, {
    action: "admin.create",
    actor,
    detail: { ...user },
    entity_id: user.id,
    entity_type: "admin_user",
  });
  return json({ ok: true, user });
}

export async function handleAdminAdminsPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = pathname.replace("/admin/admins/", "").trim();
  if (!id) return jsonError("invalid admin id", 400);

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = await validateAdminBody(parsed.data || {}, false);
  if (!validation.ok) return jsonError(validation.error, 400);

  await updateAdminUser(db, id, validation.data);
  await addAuditLog(db, {
    action: "admin.update",
    actor,
    detail: { id, ...parsed.data },
    entity_id: id,
    entity_type: "admin_user",
  });
  return json({ ok: true });
}

export async function handleAdminNotificationsGet(url: URL, db: D1Database): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  const payload = await getNotificationEndpointsPaged(db, page, ADMIN_PAGE_SIZE);
  return json(payload);
}

export async function handleAdminNotificationsPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateNotificationBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await createNotificationEndpoint(db, validation.data);
  await addAuditLog(db, {
    action: "notification.create",
    actor,
    detail: validation.data,
    entity_type: "notification_endpoint",
  });
  return json({ ok: true });
}

export async function handleAdminNotificationsPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/notifications/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid notification id", 400);

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateNotificationBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await updateNotificationEndpoint(db, id, validation.data);
  await addAuditLog(db, {
    action: "notification.update",
    actor,
    detail: { id, ...validation.data },
    entity_id: String(id),
    entity_type: "notification_endpoint",
  });
  return json({ ok: true });
}

export async function handleAdminNotificationsDelete(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/notifications/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid notification id", 400);
  await deleteNotificationEndpoint(db, id);
  await addAuditLog(db, {
    action: "notification.delete",
    actor,
    detail: { id },
    entity_id: String(id),
    entity_type: "notification_endpoint",
  });
  return json({ ok: true });
}

export async function handleAdminNotificationsTest(
  pathname: string,
  db: D1Database,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/notifications/", "").replace("/test", ""));
  if (!Number.isFinite(id)) return jsonError("invalid notification id", 400);
  const endpoints = await getAllNotificationEndpoints(db);
  const endpoint = endpoints.find(item => item.id === id);
  if (!endpoint) return jsonError("notification endpoint not found", 404);
  await sendTestNotification(endpoint.target, endpoint.secret || "");
  return json({ ok: true });
}

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
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateOutboundSettingsInput(parsed.data || {}, String(env.RESEND_FROM_DOMAIN || "").trim().toLowerCase());
  if (!validation.ok) return jsonError(validation.error, 400);

  await updateOutboundEmailSettings(db, validation.data);
  await addAuditLog(db, {
    action: "outbound.settings.update",
    actor,
    detail: { ...validation.data, api_key_configured: Boolean(String(env.RESEND_API_KEY || "").trim()) },
    entity_type: "outbound_settings",
  });

  return json(await getOutboundEmailSettings(db, env));
}

export async function handleAdminOutboundStatsGet(db: D1Database): Promise<Response> {
  return json(await getOutboundStats(db));
}

export async function handleAdminOutboundEmailsGet(url: URL, db: D1Database): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  const statuses = String(url.searchParams.get("status") || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean) as Array<"draft" | "failed" | "scheduled" | "sending" | "sent">;
  const keyword = normalizeNullable(url.searchParams.get("keyword"));
  return json(await getOutboundEmailsPaged(db, page, OUTBOUND_EMAIL_PAGE_SIZE, { keyword, statuses }));
}

export async function handleAdminOutboundEmailDetail(pathname: string, db: D1Database): Promise<Response> {
  const id = Number(pathname.replace("/admin/outbound/emails/", "").split("/")[0] || "");
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
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const prepared = await prepareOutboundPersistencePayload(parsed.data || {}, db, env);
  if (!prepared.ok) return jsonError(prepared.error, 400);

  if (!prepared.settings.api_key_configured && prepared.data.mode !== "draft") {
    await captureError(db, "outbound.resend_send_failed", new Error("RESEND_API_KEY is not configured"), {
      actor: actor.username,
      reason: "missing_resend_api_key",
      subject: prepared.data.subject,
      to: prepared.data.to,
      trigger: "manual",
    });
    return jsonError("RESEND_API_KEY is not configured", 400);
  }

  return persistOutboundFromHandler(db, env, actor, prepared.settings.provider, prepared.data);
}

export async function handleAdminOutboundEmailsPut(
  pathname: string,
  request: Request,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/outbound/emails/", "").split("/")[0] || "");
  if (!Number.isFinite(id)) return jsonError("invalid outbound email id", 400);

  const existing = await getOutboundEmailById(db, id);
  if (!existing) return jsonError("outbound email not found", 404);
  if (existing.status === "sent" || existing.status === "sending") {
    return jsonError("sent email cannot be edited", 400);
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const prepared = await prepareOutboundPersistencePayload(parsed.data || {}, db, env);
  if (!prepared.ok) return jsonError(prepared.error, 400);

  if (!prepared.settings.api_key_configured && prepared.data.mode !== "draft") {
    await captureError(db, "outbound.resend_send_failed", new Error("RESEND_API_KEY is not configured"), {
      actor: actor.username,
      email_id: id,
      reason: "missing_resend_api_key",
      subject: prepared.data.subject,
      to: prepared.data.to,
      trigger: "manual",
    });
    return jsonError("RESEND_API_KEY is not configured", 400);
  }

  return persistOutboundFromHandler(db, env, actor, prepared.settings.provider, prepared.data, id);
}

export async function handleAdminOutboundEmailSendExisting(
  pathname: string,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/outbound/emails/", "").replace("/send", ""));
  if (!Number.isFinite(id)) return jsonError("invalid outbound email id", 400);

  const existing = await getOutboundEmailById(db, id);
  if (!existing) return jsonError("outbound email not found", 404);
  if (existing.status === "sending") return jsonError("email is already sending", 409);
  if (!String(env.RESEND_API_KEY || "").trim()) {
    await captureError(db, "outbound.resend_send_failed", new Error("RESEND_API_KEY is not configured"), {
      actor: actor.username,
      email_id: id,
      reason: "missing_resend_api_key",
      subject: existing.subject,
      to: existing.to_addresses,
      trigger: "manual",
    });
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

  return persistOutboundFromHandler(db, env, actor, "resend", validation.data, id);
}

export async function handleAdminOutboundEmailsDelete(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/outbound/emails/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid outbound email id", 400);
  await deleteOutboundEmailRecord(db, id);
  await addAuditLog(db, {
    action: "outbound.email.delete",
    actor,
    detail: { id },
    entity_id: String(id),
    entity_type: "outbound_email",
  });
  return json({ ok: true });
}

export async function handleAdminOutboundTemplatesGet(db: D1Database): Promise<Response> {
  return json(await getOutboundTemplates(db));
}

export async function handleAdminOutboundTemplatesPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);
  const validation = validateOutboundTemplateInput(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await createOutboundTemplate(db, { ...validation.data, created_by: actor.username });
  await addAuditLog(db, {
    action: "outbound.template.create",
    actor,
    detail: { ...validation.data },
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
  const id = Number(pathname.replace("/admin/outbound/templates/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid outbound template id", 400);
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);
  const validation = validateOutboundTemplateInput(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await updateOutboundTemplate(db, id, validation.data);
  await addAuditLog(db, {
    action: "outbound.template.update",
    actor,
    detail: { id, ...validation.data },
    entity_id: String(id),
    entity_type: "outbound_template",
  });
  return json({ ok: true });
}

export async function handleAdminOutboundTemplatesDelete(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/outbound/templates/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid outbound template id", 400);
  await deleteOutboundTemplate(db, id);
  await addAuditLog(db, {
    action: "outbound.template.delete",
    actor,
    detail: { id },
    entity_id: String(id),
    entity_type: "outbound_template",
  });
  return json({ ok: true });
}

export async function handleAdminOutboundContactsGet(db: D1Database): Promise<Response> {
  return json(await getOutboundContacts(db));
}

export async function handleAdminOutboundContactsPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);
  const validation = validateOutboundContactInput(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await createOutboundContact(db, validation.data);
  await addAuditLog(db, {
    action: "outbound.contact.create",
    actor,
    detail: { ...validation.data },
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
  const id = Number(pathname.replace("/admin/outbound/contacts/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid outbound contact id", 400);
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);
  const validation = validateOutboundContactInput(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await updateOutboundContact(db, id, validation.data);
  await addAuditLog(db, {
    action: "outbound.contact.update",
    actor,
    detail: { id, ...validation.data },
    entity_id: String(id),
    entity_type: "outbound_contact",
  });
  return json({ ok: true });
}

export async function handleAdminOutboundContactsDelete(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/outbound/contacts/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid outbound contact id", 400);
  await deleteOutboundContact(db, id);
  await addAuditLog(db, {
    action: "outbound.contact.delete",
    actor,
    detail: { id },
    entity_id: String(id),
    entity_type: "outbound_contact",
  });
  return json({ ok: true });
}

async function persistOutboundFromHandler(
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
      outcome.action === "draft" ? "outbound.email.save_draft"
      : outcome.action === "scheduled" ? "outbound.email.schedule"
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
      entity_id: outcome.record ? String(outcome.record.id) : existingId ? String(existingId) : undefined,
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
    const message = error instanceof Error ? error.message : "failed to process outbound email";

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

async function prepareOutboundPersistencePayload(
  body: Record<string, unknown>,
  db: D1Database,
  env: WorkerEnv,
) {
  const settings = await getOutboundEmailSettings(db, env);
  const templateId = Number(body.template_id || 0);

  let mergedBody: Record<string, unknown> = { ...body };
  if (Number.isFinite(templateId) && templateId > 0) {
    const template = (await getOutboundTemplates(db)).find(item => item.id === templateId);
    if (!template || !template.is_enabled) {
      return { ok: false as const, error: "template not found or disabled" };
    }

    const applied = applyOutboundTemplate(template, parseTemplateVariables(body.template_variables));
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

export async function handleAdminOverviewStats(db: D1Database): Promise<Response> {
  return json(await getOverviewStats(db));
}

export async function handleAdminAuditLogs(url: URL, db: D1Database): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  return json(await getAuditLogsPaged(db, page, AUDIT_PAGE_SIZE));
}

export async function handleAdminErrors(url: URL, db: D1Database): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  return json(
    await getErrorEventsPaged(db, page, AUDIT_PAGE_SIZE, {
      keyword: normalizeNullable(url.searchParams.get("keyword")),
      source: normalizeNullable(url.searchParams.get("source")),
    }),
  );
}

export async function handleAdminExport(resource: string, db: D1Database, format: string): Promise<Response> {
  const normalized = normalizeExportResource(resource);
  if (!normalized) return jsonError("invalid export resource", 400);
  const rows = await getExportRows(db, normalized);

  if (format === "json") {
    return downloadResponse(JSON.stringify(rows, null, 2), `${normalized}.json`, "application/json");
  }

  return downloadResponse(toCsv(rows), `${normalized}.csv`, "text/csv; charset=utf-8");
}

function validateRuleBody(body: Record<string, unknown>) {
  const remark = String(body.remark || "").trim();
  const sender_filter = String(body.sender_filter || "").trim();
  const pattern = String(body.pattern || "").trim();
  const is_enabled = body.is_enabled !== false;

  if (!pattern) return { ok: false as const, error: "pattern is required" };
  if (pattern.length > MAX_RULE_PATTERN_LENGTH) return { ok: false as const, error: "pattern is too long" };
  if (remark.length > MAX_RULE_REMARK_LENGTH) return { ok: false as const, error: "remark is too long" };
  if (sender_filter.length > MAX_SENDER_FILTER_LENGTH) return { ok: false as const, error: "sender_filter is too long" };

  return {
    ok: true as const,
    data: {
      is_enabled,
      pattern,
      remark,
      sender_filter,
    },
  };
}

function validateWhitelistBody(body: Record<string, unknown>) {
  const sender_pattern = String(body.sender_pattern || "").trim();
  const note = String(body.note || "").trim();
  const is_enabled = body.is_enabled !== false;

  if (!sender_pattern) return { ok: false as const, error: "sender_pattern is required" };
  if (sender_pattern.length > MAX_SENDER_PATTERN_LENGTH) return { ok: false as const, error: "sender_pattern is too long" };
  if (note.length > MAX_RULE_REMARK_LENGTH) return { ok: false as const, error: "note is too long" };

  return {
    ok: true as const,
    data: {
      is_enabled,
      note,
      sender_pattern,
    },
  };
}

function validateMailboxBody(
  body: Record<string, unknown>,
  defaultDomain: string,
  allowBatch = true,
): { data: Array<{ address: string; expires_at: number | null; is_enabled: boolean; note: string; tags: string[] }>; ok: true } | { error: string; ok: false } {
  const directAddress = normalizeEmailAddress(body.address);
  const localPart = String(body.local_part || "").trim().toLowerCase();
  const domain = String(body.domain || defaultDomain || "").trim().toLowerCase();
  const note = String(body.note || "").trim();
  const is_enabled = body.is_enabled !== false;
  const generateRandom = body.generate_random === true;
  const batch_count = allowBatch ? Number(body.batch_count || 1) : 1;
  const expires_at = parseNullableTimestamp(body.expires_at);
  const tags = normalizeTags(body.tags);

  if (note.length > MAX_MAILBOX_NOTE_LENGTH) return { ok: false, error: "note is too long" };
  if (tags.length > MAX_MAILBOX_TAGS) return { ok: false, error: "too many tags" };

  if (!directAddress && !domain) return { ok: false, error: "domain is required" };

  const addresses: string[] = [];
  if (directAddress) {
    addresses.push(directAddress);
  } else {
    const count = Number.isFinite(batch_count) && batch_count > 0 ? Math.min(50, Math.floor(batch_count)) : 1;
    for (let index = 0; index < count; index += 1) {
      const finalLocalPart = localPart || (generateRandom ? createRandomMailboxLocalPart() : "");
      if (!finalLocalPart) return { ok: false, error: "local_part is required" };
      addresses.push(`${finalLocalPart}${count > 1 ? `-${index + 1}` : ""}@${domain}`);
    }
  }

  const normalized = addresses.map(address => normalizeEmailAddress(address));
  if (normalized.some(address => address.length > MAX_MAILBOX_ADDRESS_LENGTH)) {
    return { ok: false, error: "address is too long" };
  }
  if (normalized.some(address => !isValidEmailAddress(address))) {
    return { ok: false, error: "address is invalid" };
  }

  return {
    ok: true,
    data: normalized.map(address => ({
      address,
      expires_at,
      is_enabled,
      note,
      tags,
    })),
  };
}

async function validateAdminBody(body: Record<string, unknown>, isCreate: boolean) {
  const username = String(body.username || "").trim().toLowerCase();
  const display_name = String(body.display_name || "").trim();
  const role = String(body.role || "analyst") as AdminRole;
  const password = String(body.password || "");
  const is_enabled = body.is_enabled !== false;

  if (isCreate && !username) return { ok: false as const, error: "username is required" };
  if (!display_name) return { ok: false as const, error: "display_name is required" };
  if (!["owner", "admin", "analyst"].includes(role)) return { ok: false as const, error: "invalid role" };

  if (password) {
    if (password.length < PASSWORD_MIN_LENGTH) {
      return { ok: false as const, error: `password must be at least ${PASSWORD_MIN_LENGTH} characters` };
    }
    const { hash, salt } = await hashPassword(password);
    return {
      ok: true as const,
      data: {
        display_name,
        is_enabled,
        password_hash: hash,
        password_salt: salt,
        role,
        username,
      },
    };
  }

  if (isCreate) return { ok: false as const, error: "password is required" };

  return {
    ok: true as const,
    data: {
      display_name,
      is_enabled,
      role,
    },
  };
}

function validateNotificationBody(body: Record<string, unknown>) {
  const name = String(body.name || "").trim();
  const type = String(body.type || "webhook").trim();
  const target = String(body.target || "").trim();
  const secret = String(body.secret || "").trim();
  const is_enabled = body.is_enabled !== false;
  const events = Array.isArray(body.events)
    ? body.events.map(item => String(item).trim()).filter(Boolean)
    : String(body.events || "")
        .split(/[,\n]/)
        .map(item => item.trim())
        .filter(Boolean);

  if (!name) return { ok: false as const, error: "name is required" };
  if (type !== "webhook") return { ok: false as const, error: "only webhook notifications are supported" };
  if (!target || !target.startsWith("http")) return { ok: false as const, error: "target must be a valid URL" };
  if (events.length === 0) return { ok: false as const, error: "at least one event is required" };
  if (events.some(event => event !== "*" && !NOTIFICATION_EVENT_SET.has(event))) {
    return { ok: false as const, error: "unknown event in notification events" };
  }

  return {
    ok: true as const,
    data: {
      events,
      is_enabled,
      name,
      secret,
      target,
      type,
    },
  };
}

function validateEmailMetadataBody(body: Record<string, unknown>) {
  const note = String(body.note || "").trim();
  const tags = normalizeTags(body.tags);

  if (note.length > MAX_EMAIL_NOTE_LENGTH) {
    return { ok: false as const, error: "note is too long" };
  }

  return {
    ok: true as const,
    data: {
      note,
      tags,
    },
  };
}

function parseNullableTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

function normalizeNullable(value: string | null): string | null {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

function normalizeExportResource(value: string) {
  const resource = String(value || "").trim().toLowerCase();
  if (["emails", "trash", "rules", "whitelist", "mailboxes", "admins", "notifications", "audit"].includes(resource)) {
    return resource as "admins" | "audit" | "emails" | "mailboxes" | "notifications" | "rules" | "trash" | "whitelist";
  }
  return null;
}
