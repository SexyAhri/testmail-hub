import {
  addAuditLog,
  applyMailboxSyncCandidate,
  backfillMailboxWorkspaceScope,
  createApiToken,
  createAdminUser,
  createDomainAsset,
  createEnvironment,
  createMailbox,
  createMailboxPool,
  createNotificationEndpoint,
  createOutboundContact,
  createOutboundTemplate,
  createProject,
  createRule,
  createWhitelistEntry,
  deleteApiToken,
  deleteDomainAsset,
  deleteEnvironment,
  deleteMailbox,
  deleteMailboxPool,
  deleteNotificationEndpoint,
  deleteOutboundContact,
  deleteOutboundEmailRecord,
  deleteProject,
  deleteOutboundTemplate,
  deleteRule,
  deleteWhitelistEntry,
  findAdminUserByUsername,
  getApiTokenById,
  getApiTokensPaged,
  getAdminUsersPaged,
  getAttachmentContent,
  getAuditLogsPaged,
  getAvailableDomains,
  getAllDomainAssets,
  getDomainAssetById,
  getDomainAssetByName,
  getDomainAssetsPaged,
  getDomainAssetUsageStats,
  getEmailByMessageIdScoped,
  getEmailProjectIds,
  getEmails,
  getEnvironmentById,
  getErrorEventsPaged,
  getExportRows,
  getLatestEmail,
  getMailboxById,
  getMailboxPoolById,
  getMailboxesPaged,
  getNotificationEndpointById,
  getNotificationDeliveriesPaged,
  getNotificationDeliveryById,
  getNotificationEndpointsPaged,
  getObservedMailboxStats,
  getOutboundContacts,
  getOutboundEmailById,
  getOutboundEmailSettings,
  getOutboundEmailsPaged,
  getOutboundStats,
  getOutboundTemplates,
  getProjectById,
  getOverviewStats,
  getRulesPaged,
  getWhitelistSettings,
  getWhitelistPaged,
  getWorkspaceCatalog,
  purgeEmail,
  restoreEmail,
  softDeleteEmail,
  touchAdminUserLogin,
  updateApiToken,
  updateAdminUser,
  updateDomainAsset,
  updateEnvironment,
  updateEmailMetadata,
  updateMailbox,
  updateMailboxPool,
  updateNotificationEndpoint,
  updateOutboundContact,
  updateOutboundEmailSettings,
  updateOutboundTemplate,
  updateProject,
  updateRule,
  validateWorkspaceAssignment,
  updateWhitelistSettings,
  updateWhitelistEntry,
} from "../core/db";
import {
  deleteCloudflareMailboxRouteByConfig,
  getCloudflareMailboxSyncSnapshotByConfig,
  isCloudflareMailboxRouteConfigConfigured,
  resolveCloudflareMailboxRouteConfig,
  updateCloudflareCatchAllRuleByConfig,
  upsertCloudflareMailboxRouteByConfig,
} from "../core/mailbox-sync";
import { captureError } from "../core/errors";
import {
  clearAdminSessionCookie,
  createManagedApiTokenValue,
  createBootstrapSessionCookie,
  createSessionCookie,
  hashApiTokenValue,
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
import {
  retryNotificationDelivery,
  sendEventNotifications,
  sendTestNotification,
} from "../core/notifications";
import { testRules } from "../core/logic";
import {
  ACCESS_SCOPES,
  ADMIN_PAGE_SIZE,
  API_TOKEN_PERMISSIONS,
  AUDIT_PAGE_SIZE,
  MAILBOX_PAGE_SIZE,
  MAX_API_TOKEN_DESCRIPTION_LENGTH,
  MAX_API_TOKEN_NAME_LENGTH,
  MAX_EMAIL_NOTE_LENGTH,
  MAX_MAILBOX_ADDRESS_LENGTH,
  MAX_MAILBOX_NOTE_LENGTH,
  MAX_MAILBOX_TAGS,
  MAX_SCOPE_BINDINGS,
  MAX_WORKSPACE_DESCRIPTION_LENGTH,
  MAX_WORKSPACE_NAME_LENGTH,
  MAX_WORKSPACE_SLUG_LENGTH,
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
  buildEmailPreview,
  buildRuleMatchInsights,
  clampNumber,
  clampPage,
  downloadResponse,
  extractEmailExtraction,
  isValidEmailAddress,
  json,
  jsonError,
  maybeBoolean,
  normalizeEmailAddress,
  normalizeTags,
  parseDeletedFilter,
  readJsonBody,
  safeParseJson,
  slugifyIdentifier,
  decodeBase64,
  toCsv,
  createRandomMailboxLocalPart,
  isSqliteConstraintError,
  isSqliteSchemaError,
} from "../utils/utils";
import type {
  AccessScope,
  AdminRole,
  ApiTokenPermission,
  CatchAllMode,
  AuthSession,
  D1Database,
  DomainAssetRecord,
  DomainAssetStatusRecord,
  EmailDetail,
  MailboxSyncResult,
  ProjectBindingRecord,
  WorkerEnv,
} from "../server/types";

const PASSWORD_MIN_LENGTH = 8;
const DOMAIN_MAX_LENGTH = 253;
const NOTIFICATION_EVENT_SET = new Set<string>(NOTIFICATION_EVENTS);
const ACCESS_SCOPE_SET = new Set<string>(ACCESS_SCOPES);
const API_TOKEN_PERMISSION_SET = new Set<string>(API_TOKEN_PERMISSIONS);

interface DomainWorkspaceScope {
  environment_id: number | null;
  project_id: number | null;
}

function getActorProjectIds(actor: AuthSession): number[] {
  return Array.isArray(actor.project_ids)
    ? actor.project_ids.filter(projectId => Number.isFinite(projectId) && projectId > 0)
    : [];
}

function isActorProjectScoped(actor: AuthSession): boolean {
  return actor.access_scope === "bound";
}

function getScopedProjectIds(actor?: AuthSession | null): number[] | null {
  if (!actor || !isActorProjectScoped(actor)) return null;
  return getActorProjectIds(actor);
}

function actorProjectScopePayload(actor: AuthSession) {
  return isActorProjectScoped(actor)
    ? { access_scope: "bound" as const, project_ids: getActorProjectIds(actor) }
    : { access_scope: "all" as const, project_ids: [] };
}

function canAccessProject(actor: AuthSession, projectId: number | null | undefined): boolean {
  if (!projectId) return !isActorProjectScoped(actor);
  return !isActorProjectScoped(actor) || getActorProjectIds(actor).includes(projectId);
}

function ensureActorCanAccessProject(actor: AuthSession, projectId: number | null | undefined) {
  if (!canAccessProject(actor, projectId)) {
    throw new Error("project access denied");
  }
}

function ensureActorCanCreateProject(actor: AuthSession) {
  if (isActorProjectScoped(actor)) {
    throw new Error("project-scoped admin cannot create project");
  }
}

function ensureActorCanDeleteProject(actor: AuthSession) {
  if (isActorProjectScoped(actor)) {
    throw new Error("project-scoped admin cannot delete project");
  }
}

function ensureActorCanAccessAnyProject(actor: AuthSession, projectIds: number[]) {
  const normalizedProjectIds = Array.from(
    new Set(projectIds.filter(projectId => Number.isFinite(projectId) && projectId > 0)),
  );
  if (normalizedProjectIds.length === 0) {
    if (isActorProjectScoped(actor)) {
      throw new Error("project access denied");
    }
    return;
  }

  if (isActorProjectScoped(actor) && !normalizedProjectIds.some(projectId => getActorProjectIds(actor).includes(projectId))) {
    throw new Error("project access denied");
  }
}

function normalizeDomainValue(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
}

function isValidDomainValue(domain: string): boolean {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,}$/i.test(domain);
}

function ensureActorCanManageDomains(actor: AuthSession) {
  if (isActorProjectScoped(actor)) {
    throw new Error("project-scoped admin cannot manage domains");
  }
}

function domainMatchesWorkspace(
  asset: Pick<DomainAssetRecord, "environment_id" | "project_id">,
  workspace?: DomainWorkspaceScope | null,
): boolean {
  if (!workspace) return true;
  if (!workspace.project_id) {
    return asset.project_id === null && asset.environment_id === null;
  }
  if (asset.project_id === null) return true;
  if (asset.project_id !== workspace.project_id) return false;
  if (asset.environment_id === null) return true;
  return asset.environment_id === workspace.environment_id;
}

async function getDomainPool(
  db: D1Database,
  env: WorkerEnv,
  actor?: AuthSession,
  workspace?: DomainWorkspaceScope | null,
): Promise<string[]> {
  const domains = new Set<string>();

  try {
    const configured = await getAllDomainAssets(
      db,
      false,
      getScopedProjectIds(actor),
    );
    for (const item of configured) {
      if (item.is_enabled && domainMatchesWorkspace(item, workspace)) {
        domains.add(item.domain);
      }
    }
  } catch (error) {
    if (!isSqliteSchemaError(error)) throw error;
  }

  const fallbackDomain = normalizeDomainValue(env.MAILBOX_DOMAIN);
  if (fallbackDomain) {
    try {
      const fallbackAsset = await getDomainAssetByName(db, fallbackDomain);
      if (
        !fallbackAsset
        || (
          fallbackAsset.is_enabled
          && domainMatchesWorkspace(fallbackAsset, workspace)
          && (!actor || canAccessProject(actor, fallbackAsset.project_id))
        )
      ) {
        domains.add(fallbackDomain);
      }
    } catch (error) {
      if (!isSqliteSchemaError(error)) throw error;
      domains.add(fallbackDomain);
    }
  }

  if (domains.size === 0) {
    const observed = await getAvailableDomains(db, getScopedProjectIds(actor));
    for (const item of observed) domains.add(item);
  }

  return Array.from(domains).sort();
}

async function getDefaultMailboxDomain(
  db: D1Database,
  env: WorkerEnv,
  actor?: AuthSession,
  workspace?: DomainWorkspaceScope | null,
): Promise<string> {
  try {
    const all = await getAllDomainAssets(db, false, getScopedProjectIds(actor));
    const matching = all.filter(item => item.is_enabled && domainMatchesWorkspace(item, workspace));
    const primary = matching.find(item => item.is_primary);
    if (primary?.domain) return primary.domain;
    if (matching[0]?.domain) return matching[0].domain;
  } catch (error) {
    if (!isSqliteSchemaError(error)) throw error;
  }

  const fallbackDomain = normalizeDomainValue(env.MAILBOX_DOMAIN);
  if (!fallbackDomain) return "";

  try {
    const fallbackAsset = await getDomainAssetByName(db, fallbackDomain);
    if (
      !fallbackAsset
      || (
        fallbackAsset.is_enabled
        && domainMatchesWorkspace(fallbackAsset, workspace)
        && (!actor || canAccessProject(actor, fallbackAsset.project_id))
      )
    ) {
      return fallbackDomain;
    }
    return "";
  } catch (error) {
    if (!isSqliteSchemaError(error)) throw error;
    return fallbackDomain;
  }
}

async function resolveMailboxSyncConfig(
  db: D1Database,
  env: WorkerEnv,
  domain: string,
) {
  const normalizedDomain = normalizeDomainValue(domain);
  if (!normalizedDomain) return null;

  try {
    const asset = await getDomainAssetByName(db, normalizedDomain);
    if (asset && asset.is_enabled && asset.provider === "cloudflare") {
      return resolveCloudflareMailboxRouteConfig(env, {
        domain: asset.domain,
        email_worker: asset.email_worker,
        zone_id: asset.zone_id,
      });
    }
  } catch (error) {
    if (!isSqliteSchemaError(error)) throw error;
  }

  if (normalizedDomain === normalizeDomainValue(env.MAILBOX_DOMAIN)) {
    return resolveCloudflareMailboxRouteConfig(env, { domain: normalizedDomain });
  }

  return null;
}

async function getCloudflareDomainConfigs(
  db: D1Database,
  env: WorkerEnv,
): Promise<Array<{ config: ReturnType<typeof resolveCloudflareMailboxRouteConfig>; domain: string }>> {
  const output = new Map<string, ReturnType<typeof resolveCloudflareMailboxRouteConfig>>();

  try {
    const configured = await getAllDomainAssets(db, false);
    for (const item of configured) {
      const config =
        item.provider === "cloudflare"
          ? resolveCloudflareMailboxRouteConfig(env, {
              domain: item.domain,
              email_worker: item.email_worker,
              zone_id: item.zone_id,
            })
          : null;
      output.set(item.domain, config);
    }
  } catch (error) {
    if (!isSqliteSchemaError(error)) throw error;
  }

  const fallbackDomain = normalizeDomainValue(env.MAILBOX_DOMAIN);
  if (fallbackDomain && !output.has(fallbackDomain)) {
    output.set(fallbackDomain, resolveCloudflareMailboxRouteConfig(env, { domain: fallbackDomain }));
  }

  return Array.from(output.entries()).map(([domain, config]) => ({ config, domain }));
}

function isCatchAllDrifted(
  mode: CatchAllMode,
  configuredForwardTo: string,
  snapshot: { catch_all_enabled: boolean; catch_all_forward_to: string },
): boolean {
  if (mode === "inherit") return false;
  if (mode === "disabled") return snapshot.catch_all_enabled;
  return (
    !snapshot.catch_all_enabled
    || normalizeEmailAddress(configuredForwardTo) !== normalizeEmailAddress(snapshot.catch_all_forward_to)
  );
}

async function listDomainAssetStatusRecords(
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<DomainAssetStatusRecord[]> {
  let assets: Awaited<ReturnType<typeof getAllDomainAssets>> = [];
  try {
    assets = await getAllDomainAssets(
      db,
      true,
      getScopedProjectIds(actor),
    );
  } catch (error) {
    if (!isSqliteSchemaError(error)) throw error;
  }

  const assetMap = new Map(assets.map(item => [item.domain, item] as const));
  const domains: string[] = [];
  const pushDomain = (value: unknown) => {
    const normalized = normalizeDomainValue(value);
    if (!normalized || domains.includes(normalized)) return;
    domains.push(normalized);
  };

  for (const asset of assets) pushDomain(asset.domain);
  pushDomain(env.MAILBOX_DOMAIN);

  if (domains.length === 0) {
    const observedDomains = await getAvailableDomains(db, getScopedProjectIds(actor));
    for (const domain of observedDomains) pushDomain(domain);
  }

  const usageStats = await getDomainAssetUsageStats(db, domains, getScopedProjectIds(actor));
  const usageMap = new Map(usageStats.map(item => [item.domain, item] as const));

  return Promise.all(domains.map(async domain => {
    const asset = assetMap.get(domain);
    const config =
      asset?.provider === "cloudflare"
        ? resolveCloudflareMailboxRouteConfig(env, {
            domain: asset.domain,
            email_worker: asset.email_worker,
            zone_id: asset.zone_id,
          })
        : domain === normalizeDomainValue(env.MAILBOX_DOMAIN)
          ? resolveCloudflareMailboxRouteConfig(env, { domain })
          : null;

    const usage = usageMap.get(domain);

    if (!isCloudflareMailboxRouteConfigConfigured(config)) {
      return {
        active_mailbox_total: usage?.active_mailbox_total || 0,
        catch_all_drift: asset?.catch_all_mode === "enabled",
        catch_all_enabled: false,
        catch_all_forward_to: asset?.catch_all_forward_to || "",
        catch_all_forward_to_actual: "",
        catch_all_mode: asset?.catch_all_mode || "inherit",
        cloudflare_configured: false,
        cloudflare_error: "",
        cloudflare_routes_total: 0,
        domain,
        email_total: usage?.email_total || 0,
        observed_mailbox_total: usage?.observed_mailbox_total || 0,
      } satisfies DomainAssetStatusRecord;
    }

    try {
      const snapshot = await getCloudflareMailboxSyncSnapshotByConfig(config);
      return {
        active_mailbox_total: usage?.active_mailbox_total || 0,
        catch_all_drift: isCatchAllDrifted(
          asset?.catch_all_mode || "inherit",
          asset?.catch_all_forward_to || "",
          snapshot,
        ),
        catch_all_enabled: snapshot.catch_all_enabled,
        catch_all_forward_to: asset?.catch_all_forward_to || "",
        catch_all_forward_to_actual: snapshot.catch_all_forward_to,
        catch_all_mode: asset?.catch_all_mode || "inherit",
        cloudflare_configured: snapshot.configured,
        cloudflare_error: "",
        cloudflare_routes_total: snapshot.candidates.length,
        domain,
        email_total: usage?.email_total || 0,
        observed_mailbox_total: usage?.observed_mailbox_total || 0,
      } satisfies DomainAssetStatusRecord;
    } catch (error) {
      return {
        active_mailbox_total: usage?.active_mailbox_total || 0,
        catch_all_drift: asset?.catch_all_mode === "enabled",
        catch_all_enabled: false,
        catch_all_forward_to: asset?.catch_all_forward_to || "",
        catch_all_forward_to_actual: "",
        catch_all_mode: asset?.catch_all_mode || "inherit",
        cloudflare_configured: true,
        cloudflare_error: error instanceof Error ? error.message : "failed to fetch Cloudflare status",
        cloudflare_routes_total: 0,
        domain,
        email_total: usage?.email_total || 0,
        observed_mailbox_total: usage?.observed_mailbox_total || 0,
      } satisfies DomainAssetStatusRecord;
    }
  }));
}

function toAuditDetail(value: unknown) {
  return JSON.parse(JSON.stringify(value || {}));
}

export async function handleAdminLogin(
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  const parsed = await readJsonBody<{
    password?: string;
    token?: string;
    username?: string;
  }>(request);
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
    response.headers.set(
      "Set-Cookie",
      await createBootstrapSessionCookie(
        request,
        env.ADMIN_TOKEN,
        env.SESSION_SECRET,
      ),
    );
    await addAuditLog(env.DB, {
      action: "admin.login",
      actor: {
        display_name: "初始管理员",
        role: "owner",
        user_id: "bootstrap-owner",
      },
      detail: { auth_kind: "bootstrap_token" },
      entity_type: "admin_session",
    });
    await sendEventNotifications(env.DB, "admin.login", {
      auth_kind: "bootstrap_token",
      username: "bootstrap-owner",
    });
    return response;
  }

  const username = String(parsed.data?.username || "")
    .trim()
    .toLowerCase();
  const password = String(parsed.data?.password || "");
  if (!username || !password) {
    if (token) {
      await captureError(
        env.DB,
        "auth.login_failed",
        new Error("invalid bootstrap token"),
        {
          reason: "invalid_bootstrap_token",
        },
        env.ERROR_WEBHOOK_URL,
      );
    }
    return jsonError("token or username/password is required", 400);
  }

  const adminUser = await findAdminUserByUsername(env.DB, username);
  if (!adminUser || !adminUser.is_enabled) {
    await captureError(
      env.DB,
      "auth.login_failed",
      new Error("invalid credentials"),
      {
        reason: !adminUser ? "user_not_found" : "user_disabled",
        username,
      },
      env.ERROR_WEBHOOK_URL,
    );
    return jsonError("invalid credentials", 401);
  }

  const verified = await verifyPassword(
    password,
    adminUser.password_hash,
    adminUser.password_salt,
  );
  if (!verified) {
    await captureError(
      env.DB,
      "auth.login_failed",
      new Error("invalid credentials"),
      {
        reason: "password_mismatch",
        username,
      },
      env.ERROR_WEBHOOK_URL,
    );
    return jsonError("invalid credentials", 401);
  }

  const response = json({
    ok: true,
    user: {
      access_scope: adminUser.access_scope,
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
        access_scope: adminUser.access_scope,
        auth_kind: "admin_user",
        display_name: adminUser.display_name,
        expires_at: Date.now(),
        project_ids: adminUser.projects.map((project) => project.id),
        role: adminUser.role,
        user_agent_hash: "",
        user_id: adminUser.id,
        username: adminUser.username,
      },
      env.ADMIN_TOKEN || env.SESSION_SECRET || "testmail-hub",
      env.SESSION_SECRET,
    ),
  );

  await touchAdminUserLogin(env.DB, adminUser.id);
  await addAuditLog(env.DB, {
    action: "admin.login",
    actor: {
      display_name: adminUser.display_name,
      role: adminUser.role,
      user_id: adminUser.id,
    },
    detail: { auth_kind: "admin_user", username: adminUser.username },
    entity_type: "admin_session",
  });
  await sendEventNotifications(env.DB, "admin.login", {
    auth_kind: "admin_user",
    username: adminUser.username,
  });
  return response;
}

export function handleAdminSession(
  env: WorkerEnv,
  session: AuthSession,
): Response {
  return json({
    ok: true,
    mailbox_domain: env.MAILBOX_DOMAIN || "",
    user: {
      access_scope: session.access_scope || "all",
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

function buildLatestEmailExtractionPayload(row: Record<string, unknown>) {
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

function buildPublicAttachmentDownloadPath(messageId: string, attachmentId: number) {
  return `/api/emails/${encodeURIComponent(messageId)}/attachments/${attachmentId}`;
}

function buildPublicEmailCodePayload(payload: {
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

function buildPublicEmailDetailPayload(email: EmailDetail) {
  return {
    attachment_count: email.attachments.length,
    attachments: email.attachments.map(attachment => ({
      ...attachment,
      download_url: buildPublicAttachmentDownloadPath(email.message_id, attachment.id),
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

function buildPublicEmailExtractionsPayload(email: EmailDetail) {
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
    const email = await getEmailByMessageIdScoped(db, messageId, allowedProjectIds);
    if (!email) return jsonError("message not found", 404);
    if (!email.verification_code) return jsonError("verification code not found", 404);
    return json(buildPublicEmailCodePayload(email));
  }

  const address = normalizeEmailAddress(url.searchParams.get("address"));
  if (!address) return jsonError("address or message_id is required", 400);

  const row = await getLatestEmail(db, address, allowedProjectIds);
  if (!row) return jsonError("message not found", 404);

  const payload = buildLatestEmailExtractionPayload(row);
  if (!payload.verification_code) return jsonError("verification code not found", 404);
  return json(buildPublicEmailCodePayload({
    from_address: String(payload.from_address || ""),
    message_id: String(payload.message_id || ""),
    received_at: Number(payload.received_at || 0),
    subject: String(payload.subject || ""),
    to_address: String(payload.to_address || ""),
    verification_code: payload.verification_code,
  }));
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
  const email = await getEmailByMessageIdScoped(db, messageId, allowedProjectIds);
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
  const email = await getEmailByMessageIdScoped(db, messageId, allowedProjectIds);
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
  const email = await getEmailByMessageIdScoped(db, messageId, allowedProjectIds);
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

export async function handleAdminEmails(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  const payload = await getEmails(db, page, PAGE_SIZE, {
    address: normalizeNullable(url.searchParams.get("address")),
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
  }, getActorProjectIds(actor));
  return json(payload);
}

export async function handleAdminEmailDetail(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const messageId = decodeURIComponent(
    pathname.replace("/admin/emails/", "").split("/")[0] || "",
  );
  if (!messageId) return jsonError("invalid email id", 400);

  const email = await getEmailByMessageIdScoped(db, messageId, getActorProjectIds(actor));
  if (!email) return jsonError("email not found", 404);
  return json(email);
}

export async function handleAdminEmailMetadataPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
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
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const messageId = decodeURIComponent(
    pathname.replace("/admin/emails/", "").split("/")[0] || "",
  );
  if (!messageId) return jsonError("invalid email id", 400);

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
    detail: { message_id: messageId },
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
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const messageId = decodeURIComponent(
    pathname.replace("/admin/emails/", "").replace("/purge", ""),
  );
  if (!messageId) return jsonError("invalid email id", 400);

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
    detail: { message_id: messageId },
    entity_id: messageId,
    entity_type: "email",
  });
  return json({ ok: true });
}

export async function handleAdminEmailAttachment(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
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

export async function handleAdminDomains(
  url: URL,
  db: D1Database,
  actor: AuthSession,
  env: WorkerEnv,
): Promise<Response> {
  const requestedScope = {
    environment_id: clampNumber(url.searchParams.get("environment_id"), { min: 1 }),
    project_id: clampNumber(url.searchParams.get("project_id"), { min: 1 }),
  };
  const hasWorkspaceFilter = requestedScope.project_id !== null || requestedScope.environment_id !== null;

  let workspace: DomainWorkspaceScope | null | undefined;
  if (hasWorkspaceFilter) {
    const resolvedScope = await resolveWorkspaceAssignment(db, requestedScope);
    if (!resolvedScope.ok) return jsonError(resolvedScope.error, 400);
    try {
      ensureActorCanAccessProject(actor, resolvedScope.data.project_id);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "project access denied",
        403,
      );
    }
    workspace = {
      environment_id: resolvedScope.data.environment_id,
      project_id: resolvedScope.data.project_id,
    };
  }

  const domains = await getDomainPool(db, env, actor, workspace);
  const default_domain = await getDefaultMailboxDomain(db, env, actor, workspace);
  return json({ default_domain, domains });
}

export async function handleAdminDomainAssetsGet(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  return json(
    await getDomainAssetsPaged(
      db,
      page,
      ADMIN_PAGE_SIZE,
      getScopedProjectIds(actor),
    ),
  );
}

export async function handleAdminDomainAssetsStatusGet(
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  return json(await listDomainAssetStatusRecords(db, env, actor));
}

export async function handleAdminDomainAssetsPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "domain access denied", 403);
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateDomainAssetBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const workspaceScope = await resolveWorkspaceAssignment(db, validation.scope);
  if (!workspaceScope.ok) return jsonError(workspaceScope.error, 400);
  try {
    ensureActorCanAccessProject(actor, workspaceScope.data.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const nextAsset = {
    ...validation.data,
    ...workspaceScope.data,
  };
  const id = await createDomainAsset(db, nextAsset);
  await addAuditLog(db, {
    action: "domain.create",
    actor,
    detail: { id, ...nextAsset },
    entity_id: String(id),
    entity_type: "domain",
  });
  return json({ ok: true });
}

export async function handleAdminDomainAssetsPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "domain access denied", 403);
  }

  const match = pathname.match(/^\/admin\/domain-assets\/(\d+)$/);
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0) return jsonError("invalid domain id", 400);

  const existing = await getDomainAssetById(db, id);
  if (!existing) return jsonError("domain not found", 404);

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateDomainAssetBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const workspaceScope = await resolveWorkspaceAssignment(db, validation.scope);
  if (!workspaceScope.ok) return jsonError(workspaceScope.error, 400);
  try {
    ensureActorCanAccessProject(actor, workspaceScope.data.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const nextAsset = {
    ...validation.data,
    ...workspaceScope.data,
  };
  await updateDomainAsset(db, id, nextAsset);
  await addAuditLog(db, {
    action: "domain.update",
    actor,
    detail: { id, previous_scope: { environment_id: existing.environment_id, project_id: existing.project_id }, ...nextAsset },
    entity_id: String(id),
    entity_type: "domain",
  });
  return json({ ok: true });
}

export async function handleAdminDomainAssetsDelete(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "domain access denied", 403);
  }

  const match = pathname.match(/^\/admin\/domain-assets\/(\d+)$/);
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0) return jsonError("invalid domain id", 400);

  const existing = await getDomainAssetById(db, id);
  if (!existing) return jsonError("domain not found", 404);

  await deleteDomainAsset(db, id);
  await addAuditLog(db, {
    action: "domain.delete",
    actor,
    detail: { domain: existing.domain, id },
    entity_id: String(id),
    entity_type: "domain",
  });
  return json({ ok: true });
}

export async function handleAdminDomainAssetsSyncCatchAll(
  pathname: string,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "domain access denied", 403);
  }

  const match = pathname.match(/^\/admin\/domain-assets\/(\d+)\/sync-catch-all$/);
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0) return jsonError("invalid domain id", 400);

  const asset = await getDomainAssetById(db, id);
  if (!asset) return jsonError("domain not found", 404);
  if (asset.catch_all_mode === "inherit") {
    return jsonError("catch-all policy is set to inherit", 400);
  }

  const config =
    asset.provider === "cloudflare"
      ? resolveCloudflareMailboxRouteConfig(env, {
          domain: asset.domain,
          email_worker: asset.email_worker,
          zone_id: asset.zone_id,
        })
      : null;
  if (!isCloudflareMailboxRouteConfigConfigured(config)) {
    return jsonError("Cloudflare routing is not configured for this domain", 400);
  }

  try {
    const snapshot = await updateCloudflareCatchAllRuleByConfig(config, {
      enabled: asset.catch_all_mode === "enabled",
      forward_to: asset.catch_all_mode === "enabled" ? asset.catch_all_forward_to : null,
    });
    await addAuditLog(db, {
      action: "domain.catch_all_sync",
      actor,
      detail: {
        catch_all_enabled: snapshot.catch_all_enabled,
        catch_all_forward_to: snapshot.catch_all_forward_to,
        catch_all_mode: asset.catch_all_mode,
        domain: asset.domain,
        id,
      },
      entity_id: String(id),
      entity_type: "domain",
    });
    return json({
      catch_all_enabled: snapshot.catch_all_enabled,
      catch_all_forward_to: snapshot.catch_all_forward_to,
      configured: snapshot.configured,
      ok: true,
    });
  } catch (error) {
    await captureError(
      db,
      "cloudflare.catch_all_sync_failed",
      error,
      {
        domain: asset.domain,
        domain_id: id,
      },
    );
    return jsonError(error instanceof Error ? error.message : "failed to sync catch-all", 502);
  }
}

export async function handleAdminWorkspaceCatalog(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const includeDisabled = url.searchParams.get("include_disabled") === "1";
  return json(await getWorkspaceCatalog(db, includeDisabled, getScopedProjectIds(actor)));
}

export async function handleAdminProjectsPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanCreateProject(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateProjectBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await createProject(db, validation.data);
  await addAuditLog(db, {
    action: "workspace.project.create",
    actor,
    detail: validation.data,
    entity_type: "workspace_project",
  });
  return json({ ok: true });
}

export async function handleAdminProjectsPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/projects/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid project id", 400);

  const project = await getProjectById(db, id);
  if (!project) return jsonError("project not found", 404);
  try {
    ensureActorCanAccessProject(actor, project.id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateProjectBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await updateProject(db, id, validation.data);
  await addAuditLog(db, {
    action: "workspace.project.update",
    actor,
    detail: { id, ...validation.data },
    entity_id: String(id),
    entity_type: "workspace_project",
  });
  return json({ ok: true });
}

export async function handleAdminProjectsDelete(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/projects/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid project id", 400);

  const project = await getProjectById(db, id);
  if (!project) return jsonError("project not found", 404);
  try {
    ensureActorCanDeleteProject(actor);
    ensureActorCanAccessProject(actor, project.id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  await deleteProject(db, id);
  await addAuditLog(db, {
    action: "workspace.project.delete",
    actor,
    detail: { id },
    entity_id: String(id),
    entity_type: "workspace_project",
  });
  return json({ ok: true });
}

export async function handleAdminEnvironmentsPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateEnvironmentBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);
  try {
    ensureActorCanAccessProject(actor, validation.data.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const scope = await resolveWorkspaceAssignment(db, {
    project_id: validation.data.project_id,
  });
  if (!scope.ok) return jsonError(scope.error, 400);
  await createEnvironment(db, {
    ...validation.data,
    project_id: scope.data.project_id!,
  });
  await addAuditLog(db, {
    action: "workspace.environment.create",
    actor,
    detail: validation.data,
    entity_type: "workspace_environment",
  });
  return json({ ok: true });
}

export async function handleAdminEnvironmentsPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/environments/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid environment id", 400);

  const existing = await getEnvironmentById(db, id);
  if (!existing) return jsonError("environment not found", 404);
  try {
    ensureActorCanAccessProject(actor, existing.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateEnvironmentBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);
  try {
    ensureActorCanAccessProject(actor, validation.data.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const scope = await resolveWorkspaceAssignment(db, {
    project_id: validation.data.project_id,
  });
  if (!scope.ok) return jsonError(scope.error, 400);
  await updateEnvironment(db, id, {
    ...validation.data,
    project_id: scope.data.project_id!,
  });
  await addAuditLog(db, {
    action: "workspace.environment.update",
    actor,
    detail: { id, ...validation.data },
    entity_id: String(id),
    entity_type: "workspace_environment",
  });
  return json({ ok: true });
}

export async function handleAdminEnvironmentsDelete(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/environments/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid environment id", 400);

  const existing = await getEnvironmentById(db, id);
  if (!existing) return jsonError("environment not found", 404);
  try {
    ensureActorCanAccessProject(actor, existing.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  await deleteEnvironment(db, id);
  await addAuditLog(db, {
    action: "workspace.environment.delete",
    actor,
    detail: { id },
    entity_id: String(id),
    entity_type: "workspace_environment",
  });
  return json({ ok: true });
}

export async function handleAdminMailboxPoolsPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateMailboxPoolBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);
  try {
    ensureActorCanAccessProject(actor, validation.data.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const scope = await resolveWorkspaceAssignment(db, {
    environment_id: validation.data.environment_id,
    project_id: validation.data.project_id,
  });
  if (!scope.ok) return jsonError(scope.error, 400);

  await createMailboxPool(db, {
    ...validation.data,
    environment_id: scope.data.environment_id!,
    project_id: scope.data.project_id!,
  });
  await addAuditLog(db, {
    action: "workspace.mailbox_pool.create",
    actor,
    detail: validation.data,
    entity_type: "workspace_mailbox_pool",
  });
  return json({ ok: true });
}

export async function handleAdminMailboxPoolsPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/mailbox-pools/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid mailbox pool id", 400);

  const existing = await getMailboxPoolById(db, id);
  if (!existing) return jsonError("mailbox pool not found", 404);
  try {
    ensureActorCanAccessProject(actor, existing.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateMailboxPoolBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);
  try {
    ensureActorCanAccessProject(actor, validation.data.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const scope = await resolveWorkspaceAssignment(db, {
    environment_id: validation.data.environment_id,
    project_id: validation.data.project_id,
  });
  if (!scope.ok) return jsonError(scope.error, 400);

  await updateMailboxPool(db, id, {
    ...validation.data,
    environment_id: scope.data.environment_id!,
    project_id: scope.data.project_id!,
  });
  await addAuditLog(db, {
    action: "workspace.mailbox_pool.update",
    actor,
    detail: { id, ...validation.data },
    entity_id: String(id),
    entity_type: "workspace_mailbox_pool",
  });
  return json({ ok: true });
}

export async function handleAdminMailboxPoolsDelete(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/mailbox-pools/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid mailbox pool id", 400);

  const existing = await getMailboxPoolById(db, id);
  if (!existing) return jsonError("mailbox pool not found", 404);
  try {
    ensureActorCanAccessProject(actor, existing.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  await deleteMailboxPool(db, id);
  await addAuditLog(db, {
    action: "workspace.mailbox_pool.delete",
    actor,
    detail: { id },
    entity_id: String(id),
    entity_type: "workspace_mailbox_pool",
  });
  return json({ ok: true });
}

export async function handleAdminRulesGet(
  url: URL,
  db: D1Database,
): Promise<Response> {
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
  await sendEventNotifications(db, "rule.updated", {
    action: "create",
    remark: validation.data.remark,
  });
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
  await sendEventNotifications(db, "rule.updated", {
    action: "update",
    id,
    remark: validation.data.remark,
  });
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

export async function handleAdminRulesTest(
  request: Request,
  db: D1Database,
): Promise<Response> {
  const parsed = await readJsonBody<{ content?: string; sender?: string }>(
    request,
  );
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const sender = String(parsed.data?.sender || "")
    .trim()
    .toLowerCase();
  const content = String(parsed.data?.content || "");
  const rules = await getRulesPaged(db, 1, 10_000);
  const result = testRules(
    sender,
    content,
    rules.items.map((rule) => ({
      id: rule.id,
      pattern: rule.pattern,
      remark: rule.remark,
      sender_filter: rule.sender_filter,
    })),
  );
  return json(result);
}

export async function handleAdminWhitelistGet(
  url: URL,
  db: D1Database,
): Promise<Response> {
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

export async function handleAdminWhitelistSettingsGet(
  db: D1Database,
): Promise<Response> {
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

export async function handleAdminMailboxesGet(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  const payload = await getMailboxesPaged(db, page, MAILBOX_PAGE_SIZE, {
    environment_id: clampNumber(url.searchParams.get("environment_id"), {
      min: 1,
    }),
    includeDeleted: url.searchParams.get("include_deleted") === "1",
    keyword: normalizeNullable(url.searchParams.get("keyword")),
    mailbox_pool_id: clampNumber(url.searchParams.get("mailbox_pool_id"), {
      min: 1,
    }),
    project_id: clampNumber(url.searchParams.get("project_id"), { min: 1 }),
  }, getActorProjectIds(actor));
  return json(payload);
}

export async function handleAdminMailboxesSync(
  db: D1Database,
  env: WorkerEnv,
  actor?: AuthSession,
): Promise<Response> {
  if (actor && isActorProjectScoped(actor)) {
    return jsonError("project-scoped admin cannot run mailbox sync", 403);
  }
  const configuredDomains = await getDomainPool(db, env, actor);
  const observed = await getObservedMailboxStats(db, configuredDomains);
  const domainConfigs = await getCloudflareDomainConfigs(db, env);
  const domainSummaries: MailboxSyncResult["domain_summaries"] = [];
  const cloudflareCandidates: Array<{
    address: string;
    created_by: string;
    is_enabled: boolean;
    last_received_at: number | null;
    receive_count: number;
  }> = [];

  for (const item of domainConfigs) {
    let snapshot: Awaited<ReturnType<typeof getCloudflareMailboxSyncSnapshotByConfig>>;
    try {
      snapshot = await getCloudflareMailboxSyncSnapshotByConfig(item.config);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "failed to sync Cloudflare email routes";
      await captureError(
        db,
        "mailbox.cloudflare_sync_failed",
        new Error(message),
        {
          action: "snapshot",
          domain: item.domain,
          route: "admin/mailboxes/sync",
        },
      );
      return jsonError(message, 502);
    }

    domainSummaries?.push({
      catch_all_enabled: snapshot.catch_all_enabled,
      cloudflare_configured: snapshot.configured,
      cloudflare_routes_total: snapshot.candidates.length,
      domain: item.domain,
    });

    cloudflareCandidates.push(
      ...snapshot.candidates.map((candidate: { address: string; is_enabled: boolean; last_received_at: number | null; receive_count: number }) => ({
        address: candidate.address,
        created_by: `system:cloudflare-mailbox-sync:${item.domain}`,
        is_enabled: candidate.is_enabled,
        last_received_at: candidate.last_received_at,
        receive_count: candidate.receive_count,
      })),
    );
  }

  const candidates = [
    ...observed.map((item) => ({
      address: item.address,
      created_by: "system:observed-mailbox-sync",
      is_enabled: true,
      last_received_at: item.last_received_at,
      receive_count: item.receive_count,
    })),
    ...cloudflareCandidates,
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
    catch_all_enabled: domainSummaries?.some(item => item.catch_all_enabled) || false,
    cloudflare_configured: domainSummaries?.some(item => item.cloudflare_configured) || false,
    cloudflare_routes_total: domainSummaries?.reduce((sum, item) => sum + item.cloudflare_routes_total, 0) || 0,
    created_count,
    domain_summaries: domainSummaries,
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

  const requestedScope = {
    environment_id: parseOptionalId(parsed.data?.environment_id),
    mailbox_pool_id: parseOptionalId(parsed.data?.mailbox_pool_id),
    project_id: parseOptionalId(parsed.data?.project_id),
  };
  const workspaceScope = await resolveWorkspaceAssignment(db, requestedScope);
  if (!workspaceScope.ok) return jsonError(workspaceScope.error, 400);
  try {
    ensureActorCanAccessProject(actor, workspaceScope.data.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const defaultDomain = await getDefaultMailboxDomain(db, env, actor, workspaceScope.data);

  const validation = validateMailboxBody(
    parsed.data || {},
    defaultDomain,
  );
  if (!validation.ok) return jsonError(validation.error, 400);
  const domainPool = new Set(await getDomainPool(db, env, actor, workspaceScope.data));
  if (
    domainPool.size > 0
    && validation.data.some(item => !domainPool.has(normalizeEmailAddress(item.address).split("@")[1] || ""))
  ) {
    return jsonError("domain is not configured", 400);
  }

  for (const mailbox of validation.data) {
    const mailboxDomain = normalizeEmailAddress(mailbox.address).split("@")[1] || "";
    const syncConfig = await resolveMailboxSyncConfig(db, env, mailboxDomain);
    if (isCloudflareMailboxRouteConfigConfigured(syncConfig)) {
      try {
        await upsertCloudflareMailboxRouteByConfig(syncConfig, {
          address: mailbox.address,
          is_enabled: mailbox.is_enabled,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "failed to sync mailbox route to Cloudflare";
        await captureError(
          db,
          "mailbox.cloudflare_sync_failed",
          new Error(message),
          {
            action: "create",
            address: mailbox.address,
            actor: actor.username,
          },
        );
        return jsonError(message, 502);
      }
    }
    const createdMailbox = await createMailbox(db, {
      ...mailbox,
      ...workspaceScope.data,
      created_by: actor.username,
    });
    await backfillMailboxWorkspaceScope(db, createdMailbox, [
      createdMailbox.address,
    ]);
  }

  await addAuditLog(db, {
    action: "mailbox.create",
    actor,
    detail: {
      addresses: validation.data.map((item) => item.address),
      count: validation.data.length,
      ...workspaceScope.data,
    },
    entity_type: "mailbox",
  });
  return json({
    count: validation.data.length,
    mailboxes: validation.data,
    ok: true,
  });
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
  const existing = await getMailboxById(db, id, getActorProjectIds(actor));
  if (!existing || existing.deleted_at !== null)
    return jsonError("mailbox not found", 404);

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const requestedScope = {
    environment_id: parseOptionalId(parsed.data?.environment_id),
    mailbox_pool_id: parseOptionalId(parsed.data?.mailbox_pool_id),
    project_id: parseOptionalId(parsed.data?.project_id),
  };
  const workspaceScope = await resolveWorkspaceAssignment(db, requestedScope);
  if (!workspaceScope.ok) return jsonError(workspaceScope.error, 400);
  try {
    ensureActorCanAccessProject(actor, workspaceScope.data.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const defaultDomain = await getDefaultMailboxDomain(db, env, actor, workspaceScope.data);

  const validation = validateMailboxBody(
    parsed.data || {},
    defaultDomain,
    false,
  );
  if (!validation.ok) return jsonError(validation.error, 400);
  const domainPool = new Set(await getDomainPool(db, env, actor, workspaceScope.data));
  if (
    domainPool.size > 0
    && validation.data.some(item => !domainPool.has(normalizeEmailAddress(item.address).split("@")[1] || ""))
  ) {
    return jsonError("domain is not configured", 400);
  }

  const nextMailbox = validation.data[0];
  const nextDomain = normalizeEmailAddress(nextMailbox.address).split("@")[1] || "";
  const existingDomain = normalizeEmailAddress(existing.address).split("@")[1] || "";
  const nextSyncConfig = await resolveMailboxSyncConfig(db, env, nextDomain);
  const existingSyncConfig = await resolveMailboxSyncConfig(db, env, existingDomain);
  if (
    isCloudflareMailboxRouteConfigConfigured(nextSyncConfig)
    || isCloudflareMailboxRouteConfigConfigured(existingSyncConfig)
  ) {
    try {
      if (isCloudflareMailboxRouteConfigConfigured(nextSyncConfig)) {
        await upsertCloudflareMailboxRouteByConfig(nextSyncConfig, {
          address: nextMailbox.address,
          is_enabled: nextMailbox.is_enabled,
        });
      }

      const existingAddress = normalizeEmailAddress(existing.address);
      const nextAddress = normalizeEmailAddress(nextMailbox.address);
      if (
        existingAddress
        && nextAddress
        && existingAddress !== nextAddress
        && isCloudflareMailboxRouteConfigConfigured(existingSyncConfig)
      ) {
        await deleteCloudflareMailboxRouteByConfig(existingSyncConfig, existingAddress);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "failed to sync mailbox route to Cloudflare";
      await captureError(
        db,
        "mailbox.cloudflare_sync_failed",
        new Error(message),
        {
          action: "update",
          actor: actor.username,
          mailbox_id: id,
          next_address: nextMailbox.address,
          previous_address: existing.address,
        },
      );
      return jsonError(message, 502);
    }
  }

  const updatedMailbox = await updateMailbox(db, id, {
    ...nextMailbox,
    ...workspaceScope.data,
  });
  await backfillMailboxWorkspaceScope(db, updatedMailbox, [
    existing.address,
    updatedMailbox.address,
  ]);
  await addAuditLog(db, {
    action: "mailbox.update",
    actor,
    detail: { id, ...nextMailbox, ...workspaceScope.data },
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
  const existing = await getMailboxById(db, id, getActorProjectIds(actor));
  if (!existing || existing.deleted_at !== null)
    return jsonError("mailbox not found", 404);

  const existingDomain = normalizeEmailAddress(existing.address).split("@")[1] || "";
  const syncConfig = await resolveMailboxSyncConfig(db, env, existingDomain);
  if (isCloudflareMailboxRouteConfigConfigured(syncConfig)) {
    try {
      await deleteCloudflareMailboxRouteByConfig(syncConfig, existing.address);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "failed to delete Cloudflare mailbox route";
      await captureError(
        db,
        "mailbox.cloudflare_sync_failed",
        new Error(message),
        {
          action: "delete",
          actor: actor.username,
          address: existing.address,
          mailbox_id: id,
        },
      );
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

export async function handleAdminAdminsGet(
  url: URL,
  db: D1Database,
): Promise<Response> {
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
  if (
    !("username" in validation.data) ||
    !("password_hash" in validation.data) ||
    !("password_salt" in validation.data)
  ) {
    return jsonError("password is required", 400);
  }

  const createData = validation.data as {
    access_scope: AccessScope;
    display_name: string;
    is_enabled: boolean;
    password_hash: string;
    password_salt: string;
    project_ids: number[];
    role: AdminRole;
    username: string;
  };

  const existingUser = await findAdminUserByUsername(db, createData.username);
  if (existingUser) {
    await captureError(
      db,
      "admin.create_failed",
      new Error("username already exists"),
      {
        actor: actor.username,
        reason: "duplicate_username",
        username: createData.username,
      },
    );
    return jsonError("username already exists", 409);
  }

  let user: Awaited<ReturnType<typeof createAdminUser>>;
  try {
    user = await createAdminUser(db, {
      access_scope: createData.access_scope,
      display_name: createData.display_name,
      is_enabled: createData.is_enabled,
      password_hash: createData.password_hash,
      password_salt: createData.password_salt,
      project_ids: createData.project_ids,
      role: createData.role,
      username: createData.username,
    });
  } catch (error) {
    if (isSqliteConstraintError(error)) {
      await captureError(
        db,
        "admin.create_failed",
        new Error("username already exists"),
        {
          actor: actor.username,
          reason: "duplicate_username",
          username: createData.username,
        },
      );
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
    detail: toAuditDetail(user),
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

export async function handleAdminNotificationsGet(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  const payload = await getNotificationEndpointsPaged(
    db,
    page,
    ADMIN_PAGE_SIZE,
    getActorProjectIds(actor),
  );
  return json(payload);
}

export async function handleAdminNotificationDeliveriesGet(
  pathname: string,
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const match = pathname.match(/^\/admin\/notifications\/(\d+)\/deliveries$/);
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0) return jsonError("invalid notification id", 400);

  const endpoint = await getNotificationEndpointById(db, id);
  if (!endpoint) return jsonError("notification endpoint not found", 404);
  try {
    if (endpoint.access_scope === "all") ensureActorCanAccessProject(actor, null);
    else ensureActorCanAccessAnyProject(actor, endpoint.projects.map(project => project.id));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "project access denied", 403);
  }

  const page = clampPage(url.searchParams.get("page"));
  return json(await getNotificationDeliveriesPaged(db, page, ADMIN_PAGE_SIZE, id));
}

export async function handleAdminNotificationsPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateNotificationBody(parsed.data || {}, actor);
  if (!validation.ok) return jsonError(validation.error, 400);

  const id = await createNotificationEndpoint(db, validation.data);
  await addAuditLog(db, {
    action: "notification.create",
    actor,
    detail: { id, ...validation.data },
    entity_id: String(id),
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

  const existing = await getNotificationEndpointById(db, id);
  if (!existing) return jsonError("notification endpoint not found", 404);
  try {
    if (existing.access_scope === "all") ensureActorCanAccessProject(actor, null);
    else ensureActorCanAccessAnyProject(actor, existing.projects.map(project => project.id));
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateNotificationBody(parsed.data || {}, actor);
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
  const existing = await getNotificationEndpointById(db, id);
  if (!existing) return jsonError("notification endpoint not found", 404);
  try {
    if (existing.access_scope === "all") ensureActorCanAccessProject(actor, null);
    else ensureActorCanAccessAnyProject(actor, existing.projects.map(project => project.id));
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }
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
  actor: AuthSession,
): Promise<Response> {
  const id = Number(
    pathname.replace("/admin/notifications/", "").replace("/test", ""),
  );
  if (!Number.isFinite(id)) return jsonError("invalid notification id", 400);
  const endpoint = await getNotificationEndpointById(db, id);
  if (!endpoint) return jsonError("notification endpoint not found", 404);
  try {
    if (endpoint.access_scope === "all") ensureActorCanAccessProject(actor, null);
    else ensureActorCanAccessAnyProject(actor, endpoint.projects.map(project => project.id));
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }
  await sendTestNotification(db, endpoint);
  return json({ ok: true });
}

export async function handleAdminNotificationDeliveryRetry(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const match = pathname.match(/^\/admin\/notifications\/deliveries\/(\d+)\/retry$/);
  const deliveryId = Number(match?.[1] || 0);
  if (!Number.isFinite(deliveryId) || deliveryId <= 0) return jsonError("invalid notification delivery id", 400);

  const sourceDelivery = await getNotificationDeliveryById(db, deliveryId);
  if (!sourceDelivery) return jsonError("notification delivery not found", 404);

  const endpoint = await getNotificationEndpointById(db, sourceDelivery.notification_endpoint_id);
  if (!endpoint) return jsonError("notification endpoint not found", 404);
  try {
    if (endpoint.access_scope === "all") ensureActorCanAccessProject(actor, null);
    else ensureActorCanAccessAnyProject(actor, endpoint.projects.map(project => project.id));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "project access denied", 403);
  }

  const delivery = await retryNotificationDelivery(db, deliveryId);
  if (!delivery) return jsonError("notification delivery not found", 404);

  await addAuditLog(db, {
    action: "notification.delivery.retry",
    actor,
    detail: {
      delivery_id: delivery.id,
      event: delivery.event,
      notification_endpoint_id: delivery.notification_endpoint_id,
      source_delivery_id: deliveryId,
      status: delivery.status,
    },
    entity_id: String(delivery.id),
    entity_type: "notification_delivery",
  });
  return json({ delivery, ok: true });
}

export async function handleAdminApiTokensGet(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  return json(
    await getApiTokensPaged(db, page, ADMIN_PAGE_SIZE, getActorProjectIds(actor)),
  );
}

export async function handleAdminApiTokensPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateApiTokenBody(parsed.data || {}, actor);
  if (!validation.ok) return jsonError(validation.error, 400);

  const issuedTokenId = crypto.randomUUID();
  const issuedToken = createManagedApiTokenValue(issuedTokenId);
  const token = await createApiToken(db, {
    ...validation.data,
    created_by: actor.username,
    id: issuedTokenId,
    token_hash: await hashApiTokenValue(issuedToken),
    token_prefix: issuedToken.slice(0, 18),
  });

  await addAuditLog(db, {
    action: "api_token.create",
    actor,
    detail: toAuditDetail({ ...token, plain_text_token_issued: true }),
    entity_id: token.id,
    entity_type: "api_token",
  });

  return json({
    plain_text_token: issuedToken,
    token,
  });
}

export async function handleAdminApiTokensPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = pathname.replace("/admin/api-tokens/", "").trim();
  if (!id) return jsonError("invalid api token id", 400);

  const existing = await getApiTokenById(db, id);
  if (!existing) return jsonError("api token not found", 404);
  try {
    if (existing.access_scope === "all") ensureActorCanAccessProject(actor, null);
    else ensureActorCanAccessAnyProject(actor, existing.projects.map(project => project.id));
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateApiTokenBody(parsed.data || {}, actor);
  if (!validation.ok) return jsonError(validation.error, 400);

  await updateApiToken(db, id, validation.data);
  await addAuditLog(db, {
    action: "api_token.update",
    actor,
    detail: { id, ...validation.data },
    entity_id: id,
    entity_type: "api_token",
  });
  return json({ ok: true });
}

export async function handleAdminApiTokensDelete(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = pathname.replace("/admin/api-tokens/", "").trim();
  if (!id) return jsonError("invalid api token id", 400);

  const existing = await getApiTokenById(db, id);
  if (!existing) return jsonError("api token not found", 404);
  try {
    if (existing.access_scope === "all") ensureActorCanAccessProject(actor, null);
    else ensureActorCanAccessAnyProject(actor, existing.projects.map(project => project.id));
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  await deleteApiToken(db, id);
  await addAuditLog(db, {
    action: "api_token.delete",
    actor,
    detail: { id },
    entity_id: id,
    entity_type: "api_token",
  });
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
  );
}

export async function handleAdminOutboundEmailsPut(
  pathname: string,
  request: Request,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
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
  );
}

export async function handleAdminOutboundEmailSendExisting(
  pathname: string,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(
    pathname.replace("/admin/outbound/emails/", "").replace("/send", ""),
  );
  if (!Number.isFinite(id)) return jsonError("invalid outbound email id", 400);

  const existing = await getOutboundEmailById(db, id);
  if (!existing) return jsonError("outbound email not found", 404);
  if (existing.status === "sending")
    return jsonError("email is already sending", 409);
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
  );
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
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);
  const validation = validateOutboundTemplateInput(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await createOutboundTemplate(db, {
    ...validation.data,
    created_by: actor.username,
  });
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
  if (!Number.isFinite(id))
    return jsonError("invalid outbound template id", 400);
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
  if (!Number.isFinite(id))
    return jsonError("invalid outbound template id", 400);
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
  if (!Number.isFinite(id))
    return jsonError("invalid outbound contact id", 400);
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
  if (!Number.isFinite(id))
    return jsonError("invalid outbound contact id", 400);
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

async function prepareOutboundPersistencePayload(
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

export async function handleAdminOverviewStats(
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  return json(await getOverviewStats(db, getActorProjectIds(actor)));
}

export async function handleAdminAuditLogs(
  url: URL,
  db: D1Database,
): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  return json(await getAuditLogsPaged(db, page, AUDIT_PAGE_SIZE));
}

export async function handleAdminErrors(
  url: URL,
  db: D1Database,
): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  return json(
    await getErrorEventsPaged(db, page, AUDIT_PAGE_SIZE, {
      keyword: normalizeNullable(url.searchParams.get("keyword")),
      source: normalizeNullable(url.searchParams.get("source")),
    }),
  );
}

export async function handleAdminExport(
  resource: string,
  db: D1Database,
  format: string,
  actor: AuthSession,
): Promise<Response> {
  const normalized = normalizeExportResource(resource);
  if (!normalized) return jsonError("invalid export resource", 400);
  if (
    isActorProjectScoped(actor)
    && !["emails", "trash", "mailboxes", "notifications"].includes(normalized)
  ) {
    return jsonError("project-scoped admin cannot export this resource", 403);
  }
  const rows = await getExportRows(db, normalized, getActorProjectIds(actor));

  if (format === "json") {
    return downloadResponse(
      JSON.stringify(rows, null, 2),
      `${normalized}.json`,
      "application/json",
    );
  }

  return downloadResponse(
    toCsv(rows),
    `${normalized}.csv`,
    "text/csv; charset=utf-8",
  );
}

async function resolveWorkspaceAssignment(
  db: D1Database,
  input: {
    environment_id?: number | null;
    mailbox_pool_id?: number | null;
    project_id?: number | null;
  },
) {
  try {
    return {
      ok: true as const,
      data: await validateWorkspaceAssignment(db, input),
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "invalid workspace assignment",
    };
  }
}

function validateRuleBody(body: Record<string, unknown>) {
  const remark = String(body.remark || "").trim();
  const sender_filter = String(body.sender_filter || "").trim();
  const pattern = String(body.pattern || "").trim();
  const is_enabled = body.is_enabled !== false;

  if (!pattern) return { ok: false as const, error: "pattern is required" };
  if (pattern.length > MAX_RULE_PATTERN_LENGTH)
    return { ok: false as const, error: "pattern is too long" };
  if (remark.length > MAX_RULE_REMARK_LENGTH)
    return { ok: false as const, error: "remark is too long" };
  if (sender_filter.length > MAX_SENDER_FILTER_LENGTH)
    return { ok: false as const, error: "sender_filter is too long" };

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

function validateProjectBody(body: Record<string, unknown>) {
  const name = String(body.name || "").trim();
  const slug = slugifyIdentifier(
    body.slug || body.name || "project",
    "project",
  ).slice(0, MAX_WORKSPACE_SLUG_LENGTH);
  const description = String(body.description || "").trim();
  const is_enabled = body.is_enabled !== false;

  if (!name) return { ok: false as const, error: "name is required" };
  if (name.length > MAX_WORKSPACE_NAME_LENGTH)
    return { ok: false as const, error: "name is too long" };
  if (!slug) return { ok: false as const, error: "slug is required" };
  if (slug.length > MAX_WORKSPACE_SLUG_LENGTH)
    return { ok: false as const, error: "slug is too long" };
  if (description.length > MAX_WORKSPACE_DESCRIPTION_LENGTH) {
    return { ok: false as const, error: "description is too long" };
  }

  return {
    ok: true as const,
    data: {
      description,
      is_enabled,
      name,
      slug,
    },
  };
}

function validateEnvironmentBody(body: Record<string, unknown>) {
  const name = String(body.name || "").trim();
  const slug = slugifyIdentifier(
    body.slug || body.name || "environment",
    "environment",
  ).slice(0, MAX_WORKSPACE_SLUG_LENGTH);
  const description = String(body.description || "").trim();
  const project_id = parseOptionalId(body.project_id);
  const is_enabled = body.is_enabled !== false;

  if (!project_id)
    return { ok: false as const, error: "project_id is required" };
  if (!name) return { ok: false as const, error: "name is required" };
  if (name.length > MAX_WORKSPACE_NAME_LENGTH)
    return { ok: false as const, error: "name is too long" };
  if (!slug) return { ok: false as const, error: "slug is required" };
  if (slug.length > MAX_WORKSPACE_SLUG_LENGTH)
    return { ok: false as const, error: "slug is too long" };
  if (description.length > MAX_WORKSPACE_DESCRIPTION_LENGTH) {
    return { ok: false as const, error: "description is too long" };
  }

  return {
    ok: true as const,
    data: {
      description,
      is_enabled,
      name,
      project_id,
      slug,
    },
  };
}

function validateMailboxPoolBody(body: Record<string, unknown>) {
  const name = String(body.name || "").trim();
  const slug = slugifyIdentifier(
    body.slug || body.name || "mailbox-pool",
    "mailbox-pool",
  ).slice(0, MAX_WORKSPACE_SLUG_LENGTH);
  const description = String(body.description || "").trim();
  const project_id = parseOptionalId(body.project_id);
  const environment_id = parseOptionalId(body.environment_id);
  const is_enabled = body.is_enabled !== false;

  if (!project_id)
    return { ok: false as const, error: "project_id is required" };
  if (!environment_id)
    return { ok: false as const, error: "environment_id is required" };
  if (!name) return { ok: false as const, error: "name is required" };
  if (name.length > MAX_WORKSPACE_NAME_LENGTH)
    return { ok: false as const, error: "name is too long" };
  if (!slug) return { ok: false as const, error: "slug is required" };
  if (slug.length > MAX_WORKSPACE_SLUG_LENGTH)
    return { ok: false as const, error: "slug is too long" };
  if (description.length > MAX_WORKSPACE_DESCRIPTION_LENGTH) {
    return { ok: false as const, error: "description is too long" };
  }

  return {
    ok: true as const,
    data: {
      description,
      environment_id,
      is_enabled,
      name,
      project_id,
      slug,
    },
  };
}

function validateWhitelistBody(body: Record<string, unknown>) {
  const sender_pattern = String(body.sender_pattern || "").trim();
  const note = String(body.note || "").trim();
  const is_enabled = body.is_enabled !== false;

  if (!sender_pattern)
    return { ok: false as const, error: "sender_pattern is required" };
  if (sender_pattern.length > MAX_SENDER_PATTERN_LENGTH)
    return { ok: false as const, error: "sender_pattern is too long" };
  if (note.length > MAX_RULE_REMARK_LENGTH)
    return { ok: false as const, error: "note is too long" };

  return {
    ok: true as const,
    data: {
      is_enabled,
      note,
      sender_pattern,
    },
  };
}

function validateDomainAssetBody(body: Record<string, unknown>) {
  const catch_all_mode = String(body.catch_all_mode || "inherit").trim().toLowerCase() as CatchAllMode;
  const catch_all_forward_to = normalizeEmailAddress(body.catch_all_forward_to);
  const domain = normalizeDomainValue(body.domain);
  const provider = String(body.provider || "cloudflare").trim().toLowerCase();
  const zone_id = String(body.zone_id || "").trim();
  const email_worker = String(body.email_worker || "").trim();
  const note = String(body.note || "").trim();
  const project_id = parseOptionalId(body.project_id);
  const environment_id = parseOptionalId(body.environment_id);
  const is_enabled = body.is_enabled !== false;
  const is_primary = body.is_primary === true;

  if (!domain) return { ok: false as const, error: "domain is required" };
  if (domain.length > DOMAIN_MAX_LENGTH) return { ok: false as const, error: "domain is too long" };
  if (!isValidDomainValue(domain)) return { ok: false as const, error: "domain is invalid" };
  if (!provider) return { ok: false as const, error: "provider is required" };
  if (provider !== "cloudflare") return { ok: false as const, error: "only cloudflare provider is supported" };
  if (!["inherit", "enabled", "disabled"].includes(catch_all_mode)) {
    return { ok: false as const, error: "invalid catch_all_mode" };
  }
  if (zone_id.length > 128) return { ok: false as const, error: "zone_id is too long" };
  if (email_worker.length > 128) return { ok: false as const, error: "email_worker is too long" };
  if (catch_all_forward_to.length > 320) {
    return { ok: false as const, error: "catch_all_forward_to is too long" };
  }
  if (catch_all_forward_to && !isValidEmailAddress(catch_all_forward_to)) {
    return { ok: false as const, error: "catch_all_forward_to must be a valid email address" };
  }
  if (catch_all_mode === "enabled" && !catch_all_forward_to) {
    return { ok: false as const, error: "catch_all_forward_to is required when catch_all_mode is enabled" };
  }
  if (note.length > MAX_WORKSPACE_DESCRIPTION_LENGTH) return { ok: false as const, error: "note is too long" };

  return {
    ok: true as const,
    data: {
      catch_all_forward_to,
      catch_all_mode,
      domain,
      email_worker,
      is_enabled,
      is_primary,
      note,
      provider,
      zone_id,
    },
    scope: {
      environment_id,
      project_id,
    },
  };
}

function validateMailboxBody(
  body: Record<string, unknown>,
  defaultDomain: string,
  allowBatch = true,
):
  | {
      data: Array<{
        address: string;
        expires_at: number | null;
        is_enabled: boolean;
        note: string;
        tags: string[];
      }>;
      ok: true;
      scope: {
        environment_id: number | null;
        mailbox_pool_id: number | null;
        project_id: number | null;
      };
    }
  | { error: string; ok: false } {
  const directAddress = normalizeEmailAddress(body.address);
  const localPart = String(body.local_part || "")
    .trim()
    .toLowerCase();
  const domain = String(body.domain || defaultDomain || "")
    .trim()
    .toLowerCase();
  const note = String(body.note || "").trim();
  const is_enabled = body.is_enabled !== false;
  const generateRandom = body.generate_random === true;
  const batch_count = allowBatch ? Number(body.batch_count || 1) : 1;
  const expires_at = parseNullableTimestamp(body.expires_at);
  const tags = normalizeTags(body.tags);
  const project_id = parseOptionalId(body.project_id);
  const environment_id = parseOptionalId(body.environment_id);
  const mailbox_pool_id = parseOptionalId(body.mailbox_pool_id);

  if (note.length > MAX_MAILBOX_NOTE_LENGTH)
    return { ok: false, error: "note is too long" };
  if (tags.length > MAX_MAILBOX_TAGS)
    return { ok: false, error: "too many tags" };

  if (!directAddress && !domain)
    return { ok: false, error: "domain is required" };

  const addresses: string[] = [];
  if (directAddress) {
    addresses.push(directAddress);
  } else {
    const count =
      Number.isFinite(batch_count) && batch_count > 0
        ? Math.min(50, Math.floor(batch_count))
        : 1;
    for (let index = 0; index < count; index += 1) {
      const finalLocalPart =
        localPart || (generateRandom ? createRandomMailboxLocalPart() : "");
      if (!finalLocalPart)
        return { ok: false, error: "local_part is required" };
      addresses.push(
        `${finalLocalPart}${count > 1 ? `-${index + 1}` : ""}@${domain}`,
      );
    }
  }

  const normalized = addresses.map((address) => normalizeEmailAddress(address));
  if (
    normalized.some((address) => address.length > MAX_MAILBOX_ADDRESS_LENGTH)
  ) {
    return { ok: false, error: "address is too long" };
  }
  if (normalized.some((address) => !isValidEmailAddress(address))) {
    return { ok: false, error: "address is invalid" };
  }

  return {
    ok: true,
    data: normalized.map((address) => ({
      address,
      expires_at,
      is_enabled,
      note,
      tags,
    })),
    scope: {
      environment_id,
      mailbox_pool_id,
      project_id,
    },
  };
}

async function validateAdminBody(
  body: Record<string, unknown>,
  isCreate: boolean,
) {
  const username = String(body.username || "")
    .trim()
    .toLowerCase();
  const display_name = String(body.display_name || "").trim();
  const role = String(body.role || "analyst") as AdminRole;
  const password = String(body.password || "");
  const is_enabled = body.is_enabled !== false;
  const scopeValidation = validateAccessScopeInput(body, null, {
    allowGlobalScope: true,
  });

  if (isCreate && !username)
    return { ok: false as const, error: "username is required" };
  if (!display_name)
    return { ok: false as const, error: "display_name is required" };
  if (!["owner", "admin", "analyst"].includes(role))
    return { ok: false as const, error: "invalid role" };
  if (!scopeValidation.ok) return scopeValidation;
  if (role === "owner" && scopeValidation.data.access_scope !== "all") {
    return { ok: false as const, error: "owner must keep global scope" };
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
      project_ids: scopeValidation.data.project_ids,
      role,
    },
  };
}

function validateNotificationBody(
  body: Record<string, unknown>,
  actor: AuthSession,
) {
  const name = String(body.name || "").trim();
  const type = String(body.type || "webhook").trim();
  const target = String(body.target || "").trim();
  const secret = String(body.secret || "").trim();
  const is_enabled = body.is_enabled !== false;
  const scopeValidation = validateAccessScopeInput(body, actor, {
    allowGlobalScope: !isActorProjectScoped(actor),
  });
  const events = Array.isArray(body.events)
    ? body.events.map((item) => String(item).trim()).filter(Boolean)
    : String(body.events || "")
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);

  if (!name) return { ok: false as const, error: "name is required" };
  if (type !== "webhook")
    return {
      ok: false as const,
      error: "only webhook notifications are supported",
    };
  if (!target || !target.startsWith("http"))
    return { ok: false as const, error: "target must be a valid URL" };
  if (!scopeValidation.ok) return scopeValidation;
  if (events.length === 0)
    return { ok: false as const, error: "at least one event is required" };
  if (
    events.some((event) => event !== "*" && !NOTIFICATION_EVENT_SET.has(event))
  ) {
    return {
      ok: false as const,
      error: "unknown event in notification events",
    };
  }

  return {
    ok: true as const,
    data: {
      access_scope: scopeValidation.data.access_scope,
      events,
      is_enabled,
      name,
      project_ids: scopeValidation.data.project_ids,
      secret,
      target,
      type,
    },
  };
}

function validateApiTokenBody(body: Record<string, unknown>, actor: AuthSession) {
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const is_enabled = body.is_enabled !== false;
  const expires_at = parseNullableTimestamp(body.expires_at);
  const scopeValidation = validateAccessScopeInput(body, actor, {
    allowGlobalScope: !isActorProjectScoped(actor),
  });
  const permissions = Array.isArray(body.permissions)
    ? body.permissions.map((item) => String(item).trim()).filter(Boolean)
    : String(body.permissions || "")
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);

  if (!name) return { ok: false as const, error: "name is required" };
  if (name.length > MAX_API_TOKEN_NAME_LENGTH)
    return { ok: false as const, error: "name is too long" };
  if (description.length > MAX_API_TOKEN_DESCRIPTION_LENGTH) {
    return { ok: false as const, error: "description is too long" };
  }
  if (!scopeValidation.ok) return scopeValidation;
  if (permissions.length === 0) {
    return { ok: false as const, error: "at least one permission is required" };
  }
  if (permissions.some((permission) => !API_TOKEN_PERMISSION_SET.has(permission))) {
    return { ok: false as const, error: "unknown api token permission" };
  }
  if (expires_at !== null && expires_at <= Date.now()) {
    return { ok: false as const, error: "expires_at must be in the future" };
  }

  return {
    ok: true as const,
    data: {
      access_scope: scopeValidation.data.access_scope,
      description,
      expires_at,
      is_enabled,
      name,
      permissions: permissions as ApiTokenPermission[],
      project_ids: scopeValidation.data.project_ids,
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

function parseOptionalId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function parseProjectIdsInput(value: unknown): number[] {
  const parsed = Array.isArray(value)
    ? value.map((item) => parseOptionalId(item))
    : String(value || "")
        .split(/[,\n]/)
        .map((item) => parseOptionalId(item.trim()));

  return Array.from(
    new Set(
      parsed.filter((item): item is number => item !== null && Number.isFinite(item) && item > 0),
    ),
  );
}

function validateAccessScopeInput(
  body: Record<string, unknown>,
  actor: AuthSession | null,
  options: { allowGlobalScope: boolean },
) {
  const access_scope = String(body.access_scope || "all").trim().toLowerCase();
  const project_ids = parseProjectIdsInput(body.project_ids);

  if (!ACCESS_SCOPE_SET.has(access_scope)) {
    return { ok: false as const, error: "invalid access_scope" };
  }
  if (project_ids.length > MAX_SCOPE_BINDINGS) {
    return { ok: false as const, error: "too many project bindings" };
  }
  if (access_scope === "all") {
    if (!options.allowGlobalScope) {
      return { ok: false as const, error: "project-scoped resource must use bound access_scope" };
    }
    return {
      ok: true as const,
      data: {
        access_scope: "all" as AccessScope,
        project_ids: [],
      },
    };
  }

  if (project_ids.length === 0) {
    return { ok: false as const, error: "project_ids is required when access_scope is bound" };
  }

  if (actor && isActorProjectScoped(actor)) {
    const actorProjectIds = getActorProjectIds(actor);
    if (project_ids.some((projectId) => !actorProjectIds.includes(projectId))) {
      return { ok: false as const, error: "project binding is outside your scope" };
    }
  }

  return {
    ok: true as const,
    data: {
      access_scope: "bound" as AccessScope,
      project_ids,
    },
  };
}

function normalizeNullable(value: string | null): string | null {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

function normalizeExportResource(value: string) {
  const resource = String(value || "")
    .trim()
    .toLowerCase();
  if (
    [
      "emails",
      "trash",
      "rules",
      "whitelist",
      "mailboxes",
      "admins",
      "notifications",
      "audit",
    ].includes(resource)
  ) {
    return resource as
      | "admins"
      | "audit"
      | "emails"
      | "mailboxes"
      | "notifications"
      | "rules"
      | "trash"
      | "whitelist";
  }
  return null;
}
