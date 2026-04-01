import {
  addAuditLog,
  archiveEmail,
  applyMailboxSyncCandidate,
  backfillMailboxWorkspaceScope,
  buildRetentionPolicyScopeKey,
  createApiToken,
  createAdminUser,
  createDomainAsset,
  createDomainRoutingProfile,
  createEnvironment,
  createMailbox,
  createMailboxSyncRun,
  createMailboxPool,
  createNotificationEndpoint,
  createOutboundContact,
  createOutboundTemplate,
  createProject,
  createRetentionPolicy,
  createRule,
  createWhitelistEntry,
  deleteApiToken,
  deleteDomainAsset,
  deleteDomainRoutingProfile,
  deleteEnvironment,
  deleteMailbox,
  deleteMailboxPool,
  deleteNotificationEndpoint,
  deleteOutboundContact,
  deleteOutboundEmailRecord,
  deleteProject,
  deleteOutboundTemplate,
  deleteRetentionPolicy,
  deleteRule,
  deleteWhitelistEntry,
  findAdminUserByUsername,
  getApiTokenById,
  getApiTokensPaged,
  getAdminAccessContext,
  getAdminUsersPaged,
  getAttachmentContent,
  getAuditLogsPaged,
  getAvailableDomains,
  getAllDomainAssets,
  getAllDomainAssetsWithSecrets,
  getDomainAssetById,
  getDomainAssetByName,
  getDomainAssetWithSecretById,
  getDomainAssetWithSecretByName,
  getDomainAssetsPaged,
  getDomainRoutingProfileById,
  getDomainRoutingProfilesPaged,
  getDomainAssetUsageStats,
  getEmailByMessageIdScoped,
  getEmailProjectIds,
  getEmails,
  getEnvironmentById,
  getErrorEventsPaged,
  getExportRows,
  getLatestEmail,
  getMailboxById,
  getMailboxSyncRunById,
  getMailboxPoolById,
  getMailboxesPaged,
  getLatestMailboxSyncRun,
  getNotificationEndpointById,
  getNotificationDeliveriesPaged,
  getNotificationDeliveryAttemptsPaged,
  getNotificationDeliveryById,
  getNotificationEndpointsPaged,
  getObservedMailboxStats,
  getOutboundContactById,
  getOutboundContacts,
  getOutboundEmailById,
  getOutboundEmailSettings,
  getOutboundEmailsPaged,
  getOutboundStats,
  getOutboundTemplateById,
  getOutboundTemplates,
  getProjectById,
  getRetentionJobRunSummary,
  getRetentionJobRunsPaged,
  getOverviewStats,
  getActiveMailboxSyncRun,
  getRetentionPolicyById,
  getRetentionPoliciesPaged,
  getRulesPaged,
  getRuleById,
  getWhitelistSettings,
  getWhitelistById,
  getWhitelistPaged,
  getWorkspaceCatalog,
  purgeEmail,
  resolveMailboxExpirationTimestamp,
  resolveRetentionPolicyConfig,
  restoreEmail,
  resolveNotificationDeliveryDeadLetter,
  softDeleteEmail,
  touchAdminUserLogin,
  updateApiToken,
  updateAdminUser,
  updateDomainAsset,
  updateDomainRoutingProfile,
  updateEnvironment,
  updateEmailMetadata,
  updateMailbox,
  updateMailboxPool,
  updateNotificationEndpoint,
  updateOutboundContact,
  updateOutboundEmailSettings,
  updateOutboundTemplate,
  updateProject,
  updateRetentionPolicy,
  updateRule,
  updateWhitelistSettings,
  updateWhitelistEntry,
  unarchiveEmail,
  validateWorkspaceAssignment,
  markMailboxSyncRunRunning,
  completeMailboxSyncRun,
  failMailboxSyncRun,
  touchMailboxSyncRunHeartbeat,
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
  hasPermission,
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
  domainProviderSupports,
  getDomainProviderDefinition,
  getDomainProviderLabel,
  listDomainProviders,
} from "../shared/domain-providers";
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
  MAX_AUDIT_OPERATION_NOTE_LENGTH,
  MAX_API_TOKEN_DESCRIPTION_LENGTH,
  MAX_API_TOKEN_NAME_LENGTH,
  MAX_EMAIL_NOTE_LENGTH,
  MAX_MAILBOX_ADDRESS_LENGTH,
  MAX_MAILBOX_NOTE_LENGTH,
  MAX_MAILBOX_TAGS,
  MAX_RETENTION_HOURS,
  MAX_SCOPE_BINDINGS,
  MAX_WORKSPACE_DESCRIPTION_LENGTH,
  MAX_WORKSPACE_NAME_LENGTH,
  MAX_WORKSPACE_SLUG_LENGTH,
  normalizeAdminRole,
  OUTBOUND_EMAIL_PAGE_SIZE,
  RETENTION_JOB_PAGE_SIZE,
  RETENTION_POLICY_PAGE_SIZE,
  requiresBoundAdminScope,
  requiresGlobalAdminScope,
  isReadOnlyAdminRole,
  type AdminPermission,
  MAX_RULE_PATTERN_LENGTH,
  MAX_RULE_REMARK_LENGTH,
  MAX_SENDER_FILTER_LENGTH,
  MAX_SENDER_PATTERN_LENGTH,
  normalizeNotificationAlertConfig,
  normalizeNotificationEventValues,
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
  parseArchivedFilter,
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
  CloudflareApiTokenMode,
  AuthSession,
  D1Database,
  DomainAssetRecord,
  DomainAssetSecretRecord,
  DomainAssetStatusRecord,
  DomainCatchAllSource,
  DomainRoutingProfileRecord,
  EmailDetail,
  JsonValue,
  MailboxSyncRunRecord,
  MailboxSyncResult,
  NotificationAlertConfig,
  ProjectBindingRecord,
  WorkerExecutionContext,
  WorkerEnv,
} from "../server/types";

const PASSWORD_MIN_LENGTH = 8;
const DOMAIN_MAX_LENGTH = 253;
const ACCESS_SCOPE_SET = new Set<string>(ACCESS_SCOPES);
const API_TOKEN_PERMISSION_SET = new Set<string>(API_TOKEN_PERMISSIONS);
const MAILBOX_SYNC_HEARTBEAT_INTERVAL_MS = 5_000;
const MAILBOX_SYNC_STALE_MS = 15 * 60 * 1000;
const MAILBOX_SYNC_STALE_ERROR =
  "mailbox sync job timed out without heartbeat; please retry";

interface DomainWorkspaceScope {
  environment_id: number | null;
  project_id: number | null;
}

interface ValidatedDomainAssetMutation {
  allow_catch_all_sync: boolean;
  allow_mailbox_route_sync: boolean;
  allow_new_mailboxes: boolean;
  catch_all_forward_to: string;
  catch_all_mode: CatchAllMode;
  cloudflare_api_token: string;
  cloudflare_api_token_mode: CloudflareApiTokenMode;
  domain: string;
  email_worker: string;
  is_enabled: boolean;
  is_primary: boolean;
  mailbox_route_forward_to: string;
  note: string;
  operation_note: string;
  provider: string;
  routing_profile_id: number | null;
  zone_id: string;
}

function getActorProjectIds(actor: AuthSession): number[] {
  return Array.isArray(actor.project_ids)
    ? actor.project_ids.filter(
        (projectId) => Number.isFinite(projectId) && projectId > 0,
      )
    : [];
}

function isActorProjectScoped(actor: AuthSession): boolean {
  return actor.access_scope === "bound";
}

function isActorReadOnly(actor: AuthSession): boolean {
  return isReadOnlyAdminRole(actor.role, actor.access_scope || "all");
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

function canAccessProject(
  actor: AuthSession,
  projectId: number | null | undefined,
): boolean {
  if (!projectId) return !isActorProjectScoped(actor);
  return (
    !isActorProjectScoped(actor) ||
    getActorProjectIds(actor).includes(projectId)
  );
}

function ensureActorCanAccessProject(
  actor: AuthSession,
  projectId: number | null | undefined,
) {
  if (!canAccessProject(actor, projectId)) {
    throw new Error("project access denied");
  }
}

function ensureActorCanWrite(actor: AuthSession) {
  if (isActorReadOnly(actor)) {
    throw new Error("read-only role cannot modify resources");
  }
}

function ensureActorHasPermission(
  actor: AuthSession,
  permission: AdminPermission,
) {
  if (!hasPermission(actor.role, permission)) {
    throw new Error("permission denied");
  }
}

function ensureActorCanManageGlobalSettings(actor: AuthSession) {
  ensureActorCanWrite(actor);
  if (isActorProjectScoped(actor)) {
    throw new Error("project-scoped admin cannot manage global settings");
  }
}

function ensureActorCanReadGlobalSettings(actor: AuthSession) {
  if (isActorProjectScoped(actor)) {
    throw new Error("project-scoped admin cannot access global observability");
  }
}

function ensureActorCanCreateProject(actor: AuthSession) {
  ensureActorCanManageGlobalSettings(actor);
}

function ensureActorCanDeleteProject(actor: AuthSession) {
  ensureActorCanManageGlobalSettings(actor);
}

function ensureActorCanAccessAnyProject(
  actor: AuthSession,
  projectIds: number[],
) {
  const normalizedProjectIds = Array.from(
    new Set(
      projectIds.filter(
        (projectId) => Number.isFinite(projectId) && projectId > 0,
      ),
    ),
  );
  if (normalizedProjectIds.length === 0) {
    if (isActorProjectScoped(actor)) {
      throw new Error("project access denied");
    }
    return;
  }

  if (
    isActorProjectScoped(actor) &&
    !normalizedProjectIds.some((projectId) =>
      getActorProjectIds(actor).includes(projectId),
    )
  ) {
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
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,}$/i.test(
    domain,
  );
}

function ensureActorCanManageDomains(actor: AuthSession) {
  ensureActorCanWrite(actor);
  if (isActorProjectScoped(actor) && getActorProjectIds(actor).length === 0) {
    throw new Error("project-scoped admin has no bound projects");
  }
}

function ensureActorCanManageAdmins(actor: AuthSession) {
  if (!hasPermission(actor.role, "admins:write")) {
    throw new Error("permission denied");
  }
  if (isActorProjectScoped(actor) && getActorProjectIds(actor).length === 0) {
    throw new Error("project-scoped admin has no bound projects");
  }
}

function ensureActorCanManageOwnerAccount(
  actor: AuthSession,
  nextRole?: AdminRole | null,
  existingRole?: AdminRole | null,
) {
  if (
    (nextRole === "owner" || existingRole === "owner") &&
    actor.role !== "owner"
  ) {
    throw new Error("only owner can manage owner accounts");
  }
}

function ensureActorCanManageAdminRecord(
  actor: AuthSession,
  record: {
    access_scope: AccessScope;
    project_ids: number[];
    role: AdminRole;
  },
) {
  ensureActorCanManageAdmins(actor);
  ensureActorCanManageOwnerAccount(actor, null, record.role);

  if (!isActorProjectScoped(actor)) return;

  const actorProjectIds = getActorProjectIds(actor);
  if (record.access_scope !== "bound") {
    throw new Error("project-scoped admin cannot manage global admin accounts");
  }
  if (record.project_ids.length === 0) {
    throw new Error("admin user has no bound projects");
  }
  if (
    record.project_ids.some((projectId) => !actorProjectIds.includes(projectId))
  ) {
    throw new Error("admin user is outside your scope");
  }
}

function ensureActorCanAssignAdminRole(
  actor: AuthSession,
  role: AdminRole,
  access_scope: AccessScope,
) {
  ensureActorCanManageOwnerAccount(actor, role, null);

  if (requiresGlobalAdminScope(role, access_scope) && access_scope !== "all") {
    throw new Error("platform_admin and owner must keep global scope");
  }
  if (requiresBoundAdminScope(role, access_scope) && access_scope !== "bound") {
    throw new Error("project_admin must use bound access_scope");
  }

  if (!isActorProjectScoped(actor)) {
    if (actor.role !== "owner" && role === "owner") {
      throw new Error("only owner can manage owner accounts");
    }
    return;
  }

  if (access_scope !== "bound") {
    throw new Error("project-scoped admin cannot manage global admin accounts");
  }
  if (!["project_admin", "operator", "viewer"].includes(role)) {
    throw new Error(
      "project-scoped admin can only manage project_admin, operator, or viewer roles",
    );
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

function routingProfileMatchesWorkspace(
  profile: Pick<DomainRoutingProfileRecord, "environment_id" | "project_id">,
  workspace: Pick<DomainAssetRecord, "environment_id" | "project_id">,
): boolean {
  if (profile.project_id === null) return true;
  if (workspace.project_id === null) return false;
  if (profile.project_id !== workspace.project_id) return false;
  if (profile.environment_id === null) return true;
  return workspace.environment_id === profile.environment_id;
}

function resolveEffectiveDomainCatchAllPolicy(
  asset: Pick<
    DomainAssetRecord,
    | "catch_all_forward_to"
    | "catch_all_mode"
    | "routing_profile_catch_all_forward_to"
    | "routing_profile_catch_all_mode"
    | "routing_profile_enabled"
    | "routing_profile_id"
  >,
): {
  catch_all_forward_to: string;
  catch_all_mode: CatchAllMode;
  catch_all_source: DomainCatchAllSource;
} {
  if (asset.catch_all_mode !== "inherit") {
    return {
      catch_all_forward_to: asset.catch_all_forward_to,
      catch_all_mode: asset.catch_all_mode,
      catch_all_source: "domain",
    };
  }

  if (
    asset.routing_profile_id &&
    asset.routing_profile_enabled &&
    asset.routing_profile_catch_all_mode !== "inherit"
  ) {
    return {
      catch_all_forward_to: asset.routing_profile_catch_all_forward_to,
      catch_all_mode: asset.routing_profile_catch_all_mode,
      catch_all_source: "routing_profile",
    };
  }

  return {
    catch_all_forward_to: "",
    catch_all_mode: "inherit",
    catch_all_source: "inherit",
  };
}

function domainAllowsMailboxCreation(
  asset: Pick<DomainAssetRecord, "allow_new_mailboxes" | "is_enabled">,
) {
  return asset.is_enabled && asset.allow_new_mailboxes;
}

function domainAllowsMailboxRouteSync(
  asset: Pick<
    DomainAssetRecord,
    "allow_mailbox_route_sync" | "is_enabled" | "provider"
  >,
) {
  return (
    asset.is_enabled &&
    asset.allow_mailbox_route_sync &&
    domainProviderSupports(asset.provider, "mailbox_route_sync")
  );
}

function domainAllowsCatchAllSync(
  asset: Pick<
    DomainAssetRecord,
    "allow_catch_all_sync" | "is_enabled" | "provider"
  >,
) {
  return (
    asset.is_enabled &&
    asset.allow_catch_all_sync &&
    domainProviderSupports(asset.provider, "catch_all_sync")
  );
}

function describeActiveMailboxCount(total: number) {
  return `${total} active mailbox${total === 1 ? "" : "es"}`;
}

async function getDomainActiveMailboxTotal(
  db: D1Database,
  domain: string,
): Promise<number> {
  const usageStats = await getDomainAssetUsageStats(db, [domain]);
  return usageStats[0]?.active_mailbox_total || 0;
}

function describeDomainCloudflareToken(input: {
  provider: string;
  cloudflare_api_token?: string | null;
  cloudflare_api_token_configured?: boolean;
}) {
  const configured =
    input.provider === "cloudflare" &&
    (typeof input.cloudflare_api_token_configured === "boolean"
      ? input.cloudflare_api_token_configured
      : Boolean(String(input.cloudflare_api_token || "").trim()));
  return {
    cloudflare_api_token_configured: configured,
    cloudflare_api_token_mode: (configured
      ? "domain"
      : "global") as CloudflareApiTokenMode,
  };
}

function buildAuditedDomainAssetSnapshot(input: {
  allow_catch_all_sync: boolean;
  allow_mailbox_route_sync: boolean;
  allow_new_mailboxes: boolean;
  catch_all_forward_to: string;
  catch_all_mode: CatchAllMode;
  cloudflare_api_token?: string | null;
  cloudflare_api_token_configured?: boolean;
  domain: string;
  email_worker: string;
  environment_id: number | null;
  is_enabled: boolean;
  is_primary: boolean;
  mailbox_route_forward_to: string;
  note: string;
  project_id: number | null;
  provider: string;
  routing_profile_id: number | null;
  zone_id: string;
}) {
  const {
    cloudflare_api_token: _cloudflareApiToken,
    cloudflare_api_token_configured: _cloudflareApiTokenConfigured,
    ...rest
  } = input;
  return {
    ...rest,
    ...describeDomainCloudflareToken(input),
  };
}

function resolveDomainCloudflareApiToken(
  existing: Pick<DomainAssetSecretRecord, "cloudflare_api_token"> | null,
  input: Pick<
    ValidatedDomainAssetMutation,
    "cloudflare_api_token" | "cloudflare_api_token_mode" | "provider"
  >,
) {
  if (input.provider !== "cloudflare") {
    return { ok: true as const, value: "" };
  }

  if (input.cloudflare_api_token_mode === "global") {
    return { ok: true as const, value: "" };
  }

  if (input.cloudflare_api_token) {
    return { ok: true as const, value: input.cloudflare_api_token };
  }

  if (existing?.cloudflare_api_token) {
    return { ok: true as const, value: existing.cloudflare_api_token };
  }

  return {
    ok: false as const,
    error:
      "cloudflare_api_token is required when cloudflare_api_token_mode is domain",
  };
}

interface DomainPoolOptions {
  allowMailboxCreationOnly?: boolean;
}

async function getDomainPool(
  db: D1Database,
  env: WorkerEnv,
  actor?: AuthSession,
  workspace?: DomainWorkspaceScope | null,
  options: DomainPoolOptions = {},
): Promise<string[]> {
  const domains = new Set<string>();

  try {
    const configured = await getAllDomainAssets(
      db,
      false,
      getScopedProjectIds(actor),
    );
    for (const item of configured) {
      const matchesGovernance = options.allowMailboxCreationOnly
        ? domainAllowsMailboxCreation(item)
        : item.is_enabled;
      if (matchesGovernance && domainMatchesWorkspace(item, workspace)) {
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
      const matchesGovernance =
        !fallbackAsset ||
        (options.allowMailboxCreationOnly
          ? domainAllowsMailboxCreation(fallbackAsset)
          : fallbackAsset.is_enabled);
      if (
        !fallbackAsset ||
        (matchesGovernance &&
          fallbackAsset.is_enabled &&
          domainMatchesWorkspace(fallbackAsset, workspace) &&
          (!actor || canAccessProject(actor, fallbackAsset.project_id)))
      ) {
        domains.add(fallbackDomain);
      }
    } catch (error) {
      if (!isSqliteSchemaError(error)) throw error;
      domains.add(fallbackDomain);
    }
  }

  if (domains.size === 0 && !options.allowMailboxCreationOnly) {
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
  options: DomainPoolOptions = {},
): Promise<string> {
  try {
    const all = await getAllDomainAssets(db, false, getScopedProjectIds(actor));
    const matching = all.filter((item) => {
      const matchesGovernance = options.allowMailboxCreationOnly
        ? domainAllowsMailboxCreation(item)
        : item.is_enabled;
      return matchesGovernance && domainMatchesWorkspace(item, workspace);
    });
    const primary = matching.find((item) => item.is_primary);
    if (primary?.domain) return primary.domain;
    if (matching[0]?.domain) return matching[0].domain;
  } catch (error) {
    if (!isSqliteSchemaError(error)) throw error;
  }

  const fallbackDomain = normalizeDomainValue(env.MAILBOX_DOMAIN);
  if (!fallbackDomain) return "";

  try {
    const fallbackAsset = await getDomainAssetByName(db, fallbackDomain);
    const matchesGovernance =
      !fallbackAsset ||
      (options.allowMailboxCreationOnly
        ? domainAllowsMailboxCreation(fallbackAsset)
        : fallbackAsset.is_enabled);
    if (
      !fallbackAsset ||
      (matchesGovernance &&
        fallbackAsset.is_enabled &&
        domainMatchesWorkspace(fallbackAsset, workspace) &&
        (!actor || canAccessProject(actor, fallbackAsset.project_id)))
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
    const asset = await getDomainAssetWithSecretByName(db, normalizedDomain);
    if (asset && domainAllowsMailboxRouteSync(asset)) {
      return resolveCloudflareMailboxRouteConfig(env, {
        api_token: asset.cloudflare_api_token,
        domain: asset.domain,
        email_worker: asset.email_worker,
        mailbox_route_forward_to: asset.mailbox_route_forward_to,
        zone_id: asset.zone_id,
      });
    }
  } catch (error) {
    if (!isSqliteSchemaError(error)) throw error;
  }

  if (normalizedDomain === normalizeDomainValue(env.MAILBOX_DOMAIN)) {
    return resolveCloudflareMailboxRouteConfig(env, {
      domain: normalizedDomain,
    });
  }

  return null;
}

async function getCloudflareDomainConfigs(
  db: D1Database,
  env: WorkerEnv,
): Promise<
  Array<{
    config: ReturnType<typeof resolveCloudflareMailboxRouteConfig>;
    domain: string;
  }>
> {
  const output = new Map<
    string,
    ReturnType<typeof resolveCloudflareMailboxRouteConfig>
  >();

  try {
    const configured = await getAllDomainAssetsWithSecrets(db, false);
    for (const item of configured) {
      const config = domainAllowsMailboxRouteSync(item)
        ? resolveCloudflareMailboxRouteConfig(env, {
            api_token: item.cloudflare_api_token,
            domain: item.domain,
            email_worker: item.email_worker,
            mailbox_route_forward_to: item.mailbox_route_forward_to,
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
    output.set(
      fallbackDomain,
      resolveCloudflareMailboxRouteConfig(env, { domain: fallbackDomain }),
    );
  }

  return Array.from(output.entries()).map(([domain, config]) => ({
    config,
    domain,
  }));
}

function isCatchAllDrifted(
  mode: CatchAllMode,
  configuredForwardTo: string,
  snapshot: { catch_all_enabled: boolean; catch_all_forward_to: string },
): boolean {
  if (mode === "inherit") return false;
  if (mode === "disabled") return snapshot.catch_all_enabled;
  return (
    !snapshot.catch_all_enabled ||
    normalizeEmailAddress(configuredForwardTo) !==
      normalizeEmailAddress(snapshot.catch_all_forward_to)
  );
}

async function listDomainAssetStatusRecords(
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<DomainAssetStatusRecord[]> {
  let assets: Awaited<ReturnType<typeof getAllDomainAssetsWithSecrets>> = [];
  try {
    assets = await getAllDomainAssetsWithSecrets(
      db,
      true,
      getScopedProjectIds(actor),
    );
  } catch (error) {
    if (!isSqliteSchemaError(error)) throw error;
  }

  const assetMap = new Map(assets.map((item) => [item.domain, item] as const));
  const domains: string[] = [];
  const pushDomain = (value: unknown) => {
    const normalized = normalizeDomainValue(value);
    if (!normalized || domains.includes(normalized)) return;
    domains.push(normalized);
  };

  for (const asset of assets) pushDomain(asset.domain);
  pushDomain(env.MAILBOX_DOMAIN);

  if (domains.length === 0) {
    const observedDomains = await getAvailableDomains(
      db,
      getScopedProjectIds(actor),
    );
    for (const domain of observedDomains) pushDomain(domain);
  }

  const usageStats = await getDomainAssetUsageStats(
    db,
    domains,
    getScopedProjectIds(actor),
  );
  const usageMap = new Map(
    usageStats.map((item) => [item.domain, item] as const),
  );

  return Promise.all(
    domains.map(async (domain) => {
      const asset = assetMap.get(domain);
      const effectivePolicy = asset
        ? resolveEffectiveDomainCatchAllPolicy(asset)
        : {
            catch_all_forward_to: "",
            catch_all_mode: "inherit" as CatchAllMode,
            catch_all_source: "inherit" as DomainCatchAllSource,
          };
      const provider =
        asset?.provider ||
        (domain === normalizeDomainValue(env.MAILBOX_DOMAIN)
          ? "cloudflare"
          : "");
      const canReadProviderStatus = domainProviderSupports(
        provider,
        "status_read",
      );
      const config =
        asset?.provider && domainProviderSupports(asset.provider, "status_read")
          ? resolveCloudflareMailboxRouteConfig(env, {
              api_token: asset.cloudflare_api_token,
              domain: asset.domain,
              email_worker: asset.email_worker,
              mailbox_route_forward_to: asset.mailbox_route_forward_to,
              zone_id: asset.zone_id,
            })
          : domain === normalizeDomainValue(env.MAILBOX_DOMAIN)
            ? resolveCloudflareMailboxRouteConfig(env, { domain })
            : null;

      const usage = usageMap.get(domain);
      const expectedMailboxRoutes = new Set(
        usage?.active_mailbox_addresses || [],
      );

      if (
        !config ||
        !canReadProviderStatus ||
        !isCloudflareMailboxRouteConfigConfigured(config)
      ) {
        return {
          active_mailbox_total: usage?.active_mailbox_total || 0,
          allow_catch_all_sync: asset?.allow_catch_all_sync ?? true,
          allow_mailbox_route_sync: asset?.allow_mailbox_route_sync ?? true,
          allow_new_mailboxes: asset?.allow_new_mailboxes ?? true,
          catch_all_drift: effectivePolicy.catch_all_mode === "enabled",
          catch_all_enabled: false,
          catch_all_forward_to: effectivePolicy.catch_all_forward_to,
          catch_all_forward_to_actual: "",
          catch_all_mode: effectivePolicy.catch_all_mode,
          catch_all_source: effectivePolicy.catch_all_source,
          cloudflare_configured: false,
          cloudflare_error: "",
          cloudflare_routes_total: 0,
          domain,
          email_total: usage?.email_total || 0,
          mailbox_route_drift: false,
          mailbox_route_enabled_total: 0,
          mailbox_route_expected_total: expectedMailboxRoutes.size,
          mailbox_route_extra_total: 0,
          mailbox_route_missing_total: 0,
          observed_mailbox_total: usage?.observed_mailbox_total || 0,
          provider,
          routing_profile_name: asset?.routing_profile_name || "",
        } satisfies DomainAssetStatusRecord;
      }

      try {
        const snapshot = await getCloudflareMailboxSyncSnapshotByConfig(config);
        const enabledMailboxRoutes = new Set(
          snapshot.candidates
            .filter((candidate) => candidate.is_enabled)
            .map((candidate) => candidate.address),
        );
        let mailbox_route_missing_total = 0;
        let mailbox_route_extra_total = 0;
        for (const address of expectedMailboxRoutes) {
          if (!enabledMailboxRoutes.has(address))
            mailbox_route_missing_total += 1;
        }
        for (const address of enabledMailboxRoutes) {
          if (!expectedMailboxRoutes.has(address))
            mailbox_route_extra_total += 1;
        }
        const mailboxRouteGoverned = asset
          ? domainAllowsMailboxRouteSync(asset)
          : true;
        return {
          active_mailbox_total: usage?.active_mailbox_total || 0,
          allow_catch_all_sync: asset?.allow_catch_all_sync ?? true,
          allow_mailbox_route_sync: asset?.allow_mailbox_route_sync ?? true,
          allow_new_mailboxes: asset?.allow_new_mailboxes ?? true,
          catch_all_drift: isCatchAllDrifted(
            effectivePolicy.catch_all_mode,
            effectivePolicy.catch_all_forward_to,
            snapshot,
          ),
          catch_all_enabled: snapshot.catch_all_enabled,
          catch_all_forward_to: effectivePolicy.catch_all_forward_to,
          catch_all_forward_to_actual: snapshot.catch_all_forward_to,
          catch_all_mode: effectivePolicy.catch_all_mode,
          catch_all_source: effectivePolicy.catch_all_source,
          cloudflare_configured: snapshot.configured,
          cloudflare_error: "",
          cloudflare_routes_total: snapshot.candidates.length,
          domain,
          email_total: usage?.email_total || 0,
          mailbox_route_drift:
            mailboxRouteGoverned &&
            (mailbox_route_missing_total > 0 || mailbox_route_extra_total > 0),
          mailbox_route_enabled_total: enabledMailboxRoutes.size,
          mailbox_route_expected_total: expectedMailboxRoutes.size,
          mailbox_route_extra_total,
          mailbox_route_missing_total,
          observed_mailbox_total: usage?.observed_mailbox_total || 0,
          provider,
          routing_profile_name: asset?.routing_profile_name || "",
        } satisfies DomainAssetStatusRecord;
      } catch (error) {
        return {
          active_mailbox_total: usage?.active_mailbox_total || 0,
          allow_catch_all_sync: asset?.allow_catch_all_sync ?? true,
          allow_mailbox_route_sync: asset?.allow_mailbox_route_sync ?? true,
          allow_new_mailboxes: asset?.allow_new_mailboxes ?? true,
          catch_all_drift: effectivePolicy.catch_all_mode === "enabled",
          catch_all_enabled: false,
          catch_all_forward_to: effectivePolicy.catch_all_forward_to,
          catch_all_forward_to_actual: "",
          catch_all_mode: effectivePolicy.catch_all_mode,
          catch_all_source: effectivePolicy.catch_all_source,
          cloudflare_configured: true,
          cloudflare_error:
            error instanceof Error
              ? error.message
              : "failed to fetch Cloudflare status",
          cloudflare_routes_total: 0,
          domain,
          email_total: usage?.email_total || 0,
          mailbox_route_drift: false,
          mailbox_route_enabled_total: 0,
          mailbox_route_expected_total: expectedMailboxRoutes.size,
          mailbox_route_extra_total: 0,
          mailbox_route_missing_total: 0,
          observed_mailbox_total: usage?.observed_mailbox_total || 0,
          provider,
          routing_profile_name: asset?.routing_profile_name || "",
        } satisfies DomainAssetStatusRecord;
      }
    }),
  );
}

function toAuditDetail(value: unknown) {
  return JSON.parse(JSON.stringify(value || {}));
}

function normalizeAuditProjectIds(project_ids: number[]) {
  return Array.from(
    new Set(
      (Array.isArray(project_ids) ? project_ids : [])
        .filter((projectId) => Number.isFinite(projectId) && projectId > 0)
        .map((projectId) => Math.floor(projectId)),
    ),
  ).sort((left, right) => left - right);
}

function normalizeAuditStringList(values: string[]) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function buildAuditChangedFields(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  fields: string[],
) {
  return fields.filter(
    (field) => JSON.stringify(previous[field]) !== JSON.stringify(next[field]),
  );
}

function withAuditOperationNote<T extends Record<string, unknown>>(
  detail: T,
  operation_note = "",
) {
  return toAuditDetail(operation_note ? { ...detail, operation_note } : detail);
}

function buildResourceUpdateAuditDetail<T extends Record<string, unknown>>(
  previous: T,
  next: T,
  fields: string[],
  operation_note = "",
  extra: Record<string, unknown> = {},
) {
  return withAuditOperationNote(
    {
      changed_fields: buildAuditChangedFields(previous, next, fields),
      previous,
      next,
      ...extra,
      ...next,
    },
    operation_note,
  );
}

function buildResourceDeleteAuditDetail<T extends Record<string, unknown>>(
  deleted: T,
  operation_note = "",
  extra: Record<string, unknown> = {},
) {
  return withAuditOperationNote(
    {
      deleted,
      ...extra,
      ...deleted,
    },
    operation_note,
  );
}

function readAuditOperationNote(body: Record<string, unknown>) {
  const operation_note = String(body.operation_note || "").trim();
  if (operation_note.length > MAX_AUDIT_OPERATION_NOTE_LENGTH) {
    return { ok: false as const, error: "operation_note is too long" };
  }
  return { ok: true as const, operation_note };
}

async function readRequestAuditOperationNote(request: Request) {
  const contentType = String(
    request.headers.get("Content-Type") || "",
  ).toLowerCase();
  if (!contentType.includes("application/json")) {
    return { ok: true as const, operation_note: "" };
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) {
    return { ok: false as const, error: parsed.error || "invalid JSON body" };
  }

  return readAuditOperationNote(parsed.data || {});
}

function toAdminAuditSnapshot(input: {
  access_scope: AccessScope;
  display_name: string;
  is_enabled: boolean;
  note: string;
  project_ids: number[];
  role: AdminRole;
  username: string;
}) {
  return {
    access_scope: input.access_scope,
    display_name: input.display_name,
    is_enabled: input.is_enabled,
    note: input.note,
    project_ids: normalizeAuditProjectIds(input.project_ids),
    role: input.role,
    username: input.username,
  };
}

function buildAdminUpdateAuditDetail(
  previous: ReturnType<typeof toAdminAuditSnapshot>,
  next: ReturnType<typeof toAdminAuditSnapshot>,
  operation_note = "",
) {
  const changed_fields: string[] = [];

  if (previous.display_name !== next.display_name)
    changed_fields.push("display_name");
  if (previous.role !== next.role) changed_fields.push("role");
  if (previous.access_scope !== next.access_scope)
    changed_fields.push("access_scope");
  if (previous.is_enabled !== next.is_enabled)
    changed_fields.push("is_enabled");
  if (previous.note !== next.note) changed_fields.push("note");
  if (
    JSON.stringify(previous.project_ids) !== JSON.stringify(next.project_ids)
  ) {
    changed_fields.push("project_ids");
  }

  return withAuditOperationNote(
    {
      changed_fields,
      display_name: next.display_name,
      next,
      previous,
      username: next.username,
    },
    operation_note,
  );
}

function toNotificationAuditSnapshot(input: {
  access_scope: AccessScope;
  alert_config: NotificationAlertConfig;
  events: string[];
  is_enabled: boolean;
  name: string;
  project_ids?: number[];
  projects?: ProjectBindingRecord[];
  secret?: string;
  target: string;
  type: string;
}) {
  return {
    access_scope: input.access_scope,
    alert_config: normalizeNotificationAlertConfig(input.alert_config),
    events: normalizeAuditStringList(input.events),
    is_enabled: input.is_enabled,
    name: input.name,
    project_ids: normalizeAuditProjectIds(
      input.project_ids || input.projects?.map((project) => project.id) || [],
    ),
    secret_configured: Boolean(String(input.secret || "").trim()),
    target: input.target,
    type: input.type,
  };
}

function toApiTokenAuditSnapshot(input: {
  access_scope: AccessScope;
  description: string;
  expires_at: number | null;
  is_enabled: boolean;
  name: string;
  permissions: string[];
  project_ids?: number[];
  projects?: ProjectBindingRecord[];
}) {
  return {
    access_scope: input.access_scope,
    description: input.description,
    expires_at: input.expires_at ?? null,
    is_enabled: input.is_enabled,
    name: input.name,
    permissions: normalizeAuditStringList(input.permissions),
    project_ids: normalizeAuditProjectIds(
      input.project_ids || input.projects?.map((project) => project.id) || [],
    ),
  };
}

function toRetentionPolicyAuditSnapshot(input: {
  archive_email_hours: number | null;
  deleted_email_retention_hours: number | null;
  description: string;
  email_retention_hours: number | null;
  environment_id: number | null;
  is_enabled: boolean;
  mailbox_pool_id: number | null;
  mailbox_ttl_hours: number | null;
  name: string;
  project_id: number | null;
  scope_key: string;
  scope_level?: string;
}) {
  return {
    archive_email_hours: input.archive_email_hours ?? null,
    deleted_email_retention_hours: input.deleted_email_retention_hours ?? null,
    description: input.description,
    email_retention_hours: input.email_retention_hours ?? null,
    environment_id: input.environment_id ?? null,
    is_enabled: input.is_enabled,
    mailbox_pool_id: input.mailbox_pool_id ?? null,
    mailbox_ttl_hours: input.mailbox_ttl_hours ?? null,
    name: input.name,
    project_id: input.project_id ?? null,
    scope_key: input.scope_key,
    scope_level:
      input.scope_level ||
      (input.mailbox_pool_id
        ? "mailbox_pool"
        : input.environment_id
          ? "environment"
          : input.project_id
            ? "project"
            : "global"),
  };
}

function toDomainRoutingProfileAuditSnapshot(input: {
  catch_all_forward_to: string;
  catch_all_mode: CatchAllMode;
  environment_id: number | null;
  is_enabled: boolean;
  name: string;
  note: string;
  project_id: number | null;
  provider: string;
  slug: string;
}) {
  return {
    catch_all_forward_to: input.catch_all_forward_to,
    catch_all_mode: input.catch_all_mode,
    environment_id: input.environment_id ?? null,
    is_enabled: input.is_enabled,
    name: input.name,
    note: input.note,
    project_id: input.project_id ?? null,
    provider: input.provider,
    slug: input.slug,
  };
}

function toWorkspaceProjectAuditSnapshot(input: {
  description: string;
  environment_count?: number;
  is_enabled: boolean;
  mailbox_count?: number;
  mailbox_pool_count?: number;
  name: string;
  slug: string;
}) {
  return {
    description: input.description,
    environment_count: input.environment_count ?? 0,
    is_enabled: input.is_enabled,
    mailbox_count: input.mailbox_count ?? 0,
    mailbox_pool_count: input.mailbox_pool_count ?? 0,
    name: input.name,
    slug: input.slug,
  };
}

function toWorkspaceEnvironmentAuditSnapshot(input: {
  description: string;
  is_enabled: boolean;
  mailbox_count?: number;
  mailbox_pool_count?: number;
  name: string;
  project_id: number;
  project_name: string;
  project_slug: string;
  slug: string;
}) {
  return {
    description: input.description,
    is_enabled: input.is_enabled,
    mailbox_count: input.mailbox_count ?? 0,
    mailbox_pool_count: input.mailbox_pool_count ?? 0,
    name: input.name,
    project_id: input.project_id,
    project_name: input.project_name,
    project_slug: input.project_slug,
    slug: input.slug,
  };
}

function toWorkspaceMailboxPoolAuditSnapshot(input: {
  description: string;
  environment_id: number;
  environment_name: string;
  environment_slug: string;
  is_enabled: boolean;
  mailbox_count?: number;
  name: string;
  project_id: number;
  project_name: string;
  project_slug: string;
  slug: string;
}) {
  return {
    description: input.description,
    environment_id: input.environment_id,
    environment_name: input.environment_name,
    environment_slug: input.environment_slug,
    is_enabled: input.is_enabled,
    mailbox_count: input.mailbox_count ?? 0,
    name: input.name,
    project_id: input.project_id,
    project_name: input.project_name,
    project_slug: input.project_slug,
    slug: input.slug,
  };
}

function toMailboxAuditSnapshot(input: {
  address: string;
  created_by: string;
  environment_id: number | null;
  environment_name: string;
  environment_slug: string;
  expires_at: number | null;
  is_enabled: boolean;
  last_received_at: number | null;
  mailbox_pool_id: number | null;
  mailbox_pool_name: string;
  mailbox_pool_slug: string;
  note: string;
  project_id: number | null;
  project_name: string;
  project_slug: string;
  receive_count: number;
  tags: string[];
}) {
  return {
    address: input.address,
    created_by: input.created_by,
    environment_id: input.environment_id ?? null,
    environment_name: input.environment_name,
    environment_slug: input.environment_slug,
    expires_at: input.expires_at ?? null,
    is_enabled: input.is_enabled,
    last_received_at: input.last_received_at ?? null,
    mailbox_pool_id: input.mailbox_pool_id ?? null,
    mailbox_pool_name: input.mailbox_pool_name,
    mailbox_pool_slug: input.mailbox_pool_slug,
    note: input.note,
    project_id: input.project_id ?? null,
    project_name: input.project_name,
    project_slug: input.project_slug,
    receive_count: input.receive_count,
    tags: normalizeAuditStringList(input.tags),
  };
}

function toRuleAuditSnapshot(input: {
  is_enabled: boolean;
  pattern: string;
  remark: string;
  sender_filter: string;
}) {
  return {
    is_enabled: input.is_enabled,
    pattern: input.pattern,
    remark: input.remark,
    sender_filter: input.sender_filter,
  };
}

function toWhitelistAuditSnapshot(input: {
  is_enabled: boolean;
  note: string;
  sender_pattern: string;
}) {
  return {
    is_enabled: input.is_enabled,
    note: input.note,
    sender_pattern: input.sender_pattern,
  };
}

function toOutboundEmailAuditSnapshot(input: {
  attachment_count: number;
  bcc_addresses: string[];
  cc_addresses: string[];
  created_by: string;
  from_address: string;
  from_name: string;
  last_attempt_at: number | null;
  provider: string;
  reply_to: string;
  scheduled_at: number | null;
  sent_at: number | null;
  status: string;
  subject: string;
  to_addresses: string[];
}) {
  return {
    attachment_count: input.attachment_count,
    bcc_addresses: normalizeAuditStringList(input.bcc_addresses),
    cc_addresses: normalizeAuditStringList(input.cc_addresses),
    created_by: input.created_by,
    from_address: input.from_address,
    from_name: input.from_name,
    last_attempt_at: input.last_attempt_at ?? null,
    provider: input.provider,
    reply_to: input.reply_to,
    scheduled_at: input.scheduled_at ?? null,
    sent_at: input.sent_at ?? null,
    status: input.status,
    subject: input.subject,
    to_addresses: normalizeAuditStringList(input.to_addresses),
  };
}

function toOutboundTemplateAuditSnapshot(input: {
  created_by: string;
  html_template: string;
  is_enabled: boolean;
  name: string;
  subject_template: string;
  text_template: string;
  variables: string[];
}) {
  return {
    created_by: input.created_by,
    html_template_length: input.html_template.length,
    is_enabled: input.is_enabled,
    name: input.name,
    subject_template: input.subject_template,
    text_template_length: input.text_template.length,
    variables: normalizeAuditStringList(input.variables),
  };
}

function toOutboundContactAuditSnapshot(input: {
  email: string;
  is_favorite: boolean;
  name: string;
  note: string;
  tags: string[];
}) {
  return {
    email: input.email,
    is_favorite: input.is_favorite,
    name: input.name,
    note: input.note,
    tags: normalizeAuditStringList(input.tags),
  };
}

function toEmailAuditSnapshot(input: {
  archive_reason: string;
  archived_at: number | null;
  archived_by: string;
  deleted_at: number | null;
  environment_id: number | null;
  environment_name: string;
  environment_slug: string;
  extraction: { platform?: string | null };
  from_address: string;
  has_attachments: boolean;
  mailbox_pool_id: number | null;
  mailbox_pool_name: string;
  mailbox_pool_slug: string;
  note: string;
  primary_mailbox_address: string;
  project_id: number | null;
  project_name: string;
  project_slug: string;
  received_at: number;
  result_count: number;
  subject: string;
  tags: string[];
  to_address: string;
  verification_code: string | null;
}) {
  return {
    archive_reason: input.archive_reason,
    archived_at: input.archived_at ?? null,
    archived_by: input.archived_by,
    deleted_at: input.deleted_at ?? null,
    environment_id: input.environment_id ?? null,
    environment_name: input.environment_name,
    environment_slug: input.environment_slug,
    extraction_platform: String(input.extraction?.platform || ""),
    from_address: input.from_address,
    has_attachments: input.has_attachments,
    mailbox_pool_id: input.mailbox_pool_id ?? null,
    mailbox_pool_name: input.mailbox_pool_name,
    mailbox_pool_slug: input.mailbox_pool_slug,
    note: input.note,
    primary_mailbox_address: input.primary_mailbox_address,
    project_id: input.project_id ?? null,
    project_name: input.project_name,
    project_slug: input.project_slug,
    received_at: input.received_at,
    result_count: input.result_count,
    subject: input.subject,
    tags: normalizeAuditStringList(input.tags),
    to_address: input.to_address,
    verification_code: input.verification_code,
  };
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

function buildPublicAttachmentDownloadPath(
  messageId: string,
  attachmentId: number,
) {
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
    const email = await getEmailByMessageIdScoped(
      db,
      messageId,
      allowedProjectIds,
    );
    if (!email) return jsonError("message not found", 404);
    if (!email.verification_code)
      return jsonError("verification code not found", 404);
    return json(buildPublicEmailCodePayload(email));
  }

  const address = normalizeEmailAddress(url.searchParams.get("address"));
  if (!address) return jsonError("address or message_id is required", 400);

  const row = await getLatestEmail(db, address, allowedProjectIds);
  if (!row) return jsonError("message not found", 404);

  const payload = buildLatestEmailExtractionPayload(row);
  if (!payload.verification_code)
    return jsonError("verification code not found", 404);
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
  if (existing.deleted_at)
    return jsonError("deleted email cannot be archived", 409);
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

export async function handleAdminDomains(
  url: URL,
  db: D1Database,
  actor: AuthSession,
  env: WorkerEnv,
): Promise<Response> {
  const purpose = String(url.searchParams.get("purpose") || "")
    .trim()
    .toLowerCase();
  const domainPoolOptions: DomainPoolOptions = {
    allowMailboxCreationOnly: purpose === "mailbox_create",
  };
  const requestedScope = {
    environment_id: clampNumber(url.searchParams.get("environment_id"), {
      min: 1,
    }),
    project_id: clampNumber(url.searchParams.get("project_id"), { min: 1 }),
  };
  const hasWorkspaceFilter =
    requestedScope.project_id !== null ||
    requestedScope.environment_id !== null;

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

  const domains = await getDomainPool(
    db,
    env,
    actor,
    workspace,
    domainPoolOptions,
  );
  const default_domain = await getDefaultMailboxDomain(
    db,
    env,
    actor,
    workspace,
    domainPoolOptions,
  );
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

export async function handleAdminDomainProvidersGet(): Promise<Response> {
  return json(listDomainProviders());
}

export async function handleAdminDomainAssetsPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "domain access denied",
      403,
    );
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

  if (validation.data.routing_profile_id) {
    const routingProfile = await getDomainRoutingProfileById(
      db,
      validation.data.routing_profile_id,
    );
    if (!routingProfile) return jsonError("routing profile not found", 404);
    if (routingProfile.provider !== validation.data.provider) {
      return jsonError(
        "routing profile provider does not match domain provider",
        400,
      );
    }
    if (!routingProfileMatchesWorkspace(routingProfile, workspaceScope.data)) {
      return jsonError("routing profile does not match domain workspace", 400);
    }
  }

  const tokenResolution = resolveDomainCloudflareApiToken(
    null,
    validation.data,
  );
  if (!tokenResolution.ok) return jsonError(tokenResolution.error, 400);
  const {
    operation_note,
    cloudflare_api_token: _submittedCloudflareApiToken,
    cloudflare_api_token_mode: _submittedCloudflareApiTokenMode,
    ...validatedAsset
  } = validation.data;
  const nextAsset = {
    ...validatedAsset,
    cloudflare_api_token: tokenResolution.value,
    ...workspaceScope.data,
  };
  const id = await createDomainAsset(db, nextAsset);
  await addAuditLog(db, {
    action: "domain.create",
    actor,
    detail: withAuditOperationNote(
      {
        id,
        ...buildAuditedDomainAssetSnapshot(nextAsset),
      },
      operation_note,
    ),
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
    return jsonError(
      error instanceof Error ? error.message : "domain access denied",
      403,
    );
  }

  const match = pathname.match(/^\/admin\/domain-assets\/(\d+)$/);
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0)
    return jsonError("invalid domain id", 400);

  const existing = await getDomainAssetWithSecretById(db, id);
  if (!existing) return jsonError("domain not found", 404);
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

  if (validation.data.routing_profile_id) {
    const routingProfile = await getDomainRoutingProfileById(
      db,
      validation.data.routing_profile_id,
    );
    if (!routingProfile) return jsonError("routing profile not found", 404);
    if (routingProfile.provider !== validation.data.provider) {
      return jsonError(
        "routing profile provider does not match domain provider",
        400,
      );
    }
    if (!routingProfileMatchesWorkspace(routingProfile, workspaceScope.data)) {
      return jsonError("routing profile does not match domain workspace", 400);
    }
  }

  const tokenResolution = resolveDomainCloudflareApiToken(
    existing,
    validation.data,
  );
  if (!tokenResolution.ok) return jsonError(tokenResolution.error, 400);
  const {
    operation_note,
    cloudflare_api_token: _submittedCloudflareApiToken,
    cloudflare_api_token_mode: _submittedCloudflareApiTokenMode,
    ...validatedAsset
  } = validation.data;
  const nextAsset = {
    ...validatedAsset,
    cloudflare_api_token: tokenResolution.value,
    ...workspaceScope.data,
  };
  const mutatesActiveMailboxOwnership =
    existing.domain !== nextAsset.domain ||
    existing.project_id !== nextAsset.project_id ||
    existing.environment_id !== nextAsset.environment_id;
  const disablesDomain = existing.is_enabled && !nextAsset.is_enabled;
  if (mutatesActiveMailboxOwnership || disablesDomain) {
    const activeMailboxTotal = await getDomainActiveMailboxTotal(
      db,
      existing.domain,
    );
    if (activeMailboxTotal > 0) {
      const mailboxSummary = describeActiveMailboxCount(activeMailboxTotal);
      if (existing.domain !== nextAsset.domain) {
        return jsonError(
          `cannot change domain while ${mailboxSummary} still use ${existing.domain}; disable or delete those mailboxes first`,
          409,
        );
      }
      if (
        existing.project_id !== nextAsset.project_id ||
        existing.environment_id !== nextAsset.environment_id
      ) {
        return jsonError(
          `cannot move domain workspace while ${mailboxSummary} still use ${existing.domain}; migrate or delete those mailboxes first`,
          409,
        );
      }
      if (disablesDomain) {
        return jsonError(
          `cannot disable domain while ${mailboxSummary} still use ${existing.domain}; disable or delete those mailboxes first`,
          409,
        );
      }
    }
  }
  await updateDomainAsset(db, id, nextAsset);
  const governanceChanged =
    existing.allow_new_mailboxes !== nextAsset.allow_new_mailboxes ||
    existing.allow_catch_all_sync !== nextAsset.allow_catch_all_sync ||
    existing.allow_mailbox_route_sync !== nextAsset.allow_mailbox_route_sync;
  const changeKinds = new Set<string>();
  if (governanceChanged) changeKinds.add("governance");
  if (
    existing.domain !== nextAsset.domain ||
    existing.provider !== nextAsset.provider ||
    existing.zone_id !== nextAsset.zone_id ||
    existing.email_worker !== nextAsset.email_worker ||
    existing.mailbox_route_forward_to !== nextAsset.mailbox_route_forward_to ||
    existing.cloudflare_api_token !== nextAsset.cloudflare_api_token ||
    existing.catch_all_mode !== nextAsset.catch_all_mode ||
    existing.catch_all_forward_to !== nextAsset.catch_all_forward_to ||
    existing.routing_profile_id !== nextAsset.routing_profile_id ||
    existing.is_enabled !== nextAsset.is_enabled ||
    existing.is_primary !== nextAsset.is_primary ||
    existing.note !== nextAsset.note ||
    existing.project_id !== nextAsset.project_id ||
    existing.environment_id !== nextAsset.environment_id
  ) {
    changeKinds.add("config");
  }
  const auditAction =
    governanceChanged && changeKinds.size === 1
      ? "domain.governance.update"
      : "domain.update";
  const previous = buildAuditedDomainAssetSnapshot(existing);
  const next = buildAuditedDomainAssetSnapshot(nextAsset);
  await addAuditLog(db, {
    action: auditAction,
    actor,
    detail: buildResourceUpdateAuditDetail(
      previous,
      next,
      [
        "allow_catch_all_sync",
        "allow_mailbox_route_sync",
        "allow_new_mailboxes",
        "catch_all_forward_to",
        "catch_all_mode",
        "cloudflare_api_token_configured",
        "cloudflare_api_token_mode",
        "domain",
        "email_worker",
        "environment_id",
        "is_enabled",
        "is_primary",
        "mailbox_route_forward_to",
        "note",
        "project_id",
        "provider",
        "routing_profile_id",
        "zone_id",
      ],
      operation_note,
      {
        id,
        change_kinds: Array.from(changeKinds),
        previous_governance: {
          allow_catch_all_sync: existing.allow_catch_all_sync,
          allow_mailbox_route_sync: existing.allow_mailbox_route_sync,
          allow_new_mailboxes: existing.allow_new_mailboxes,
        },
        next_governance: {
          allow_catch_all_sync: nextAsset.allow_catch_all_sync,
          allow_mailbox_route_sync: nextAsset.allow_mailbox_route_sync,
          allow_new_mailboxes: nextAsset.allow_new_mailboxes,
        },
        previous_scope: {
          environment_id: existing.environment_id,
          project_id: existing.project_id,
        },
        previous_cloudflare_token: describeDomainCloudflareToken(existing),
        next_cloudflare_token: describeDomainCloudflareToken(nextAsset),
      },
    ),
    entity_id: String(id),
    entity_type: "domain",
  });
  return json({ ok: true });
}

export async function handleAdminDomainAssetsDelete(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "domain access denied",
      403,
    );
  }

  const match = pathname.match(/^\/admin\/domain-assets\/(\d+)$/);
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0)
    return jsonError("invalid domain id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const existing = await getDomainAssetById(db, id);
  if (!existing) return jsonError("domain not found", 404);
  try {
    ensureActorCanAccessProject(actor, existing.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const activeMailboxTotal = await getDomainActiveMailboxTotal(
    db,
    existing.domain,
  );
  if (activeMailboxTotal > 0) {
    const mailboxSummary = describeActiveMailboxCount(activeMailboxTotal);
    return jsonError(
      `cannot delete domain while ${mailboxSummary} still use ${existing.domain}; disable or delete those mailboxes first`,
      409,
    );
  }

  await deleteDomainAsset(db, id);
  await addAuditLog(db, {
    action: "domain.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      buildAuditedDomainAssetSnapshot(existing),
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "domain",
  });
  return json({ ok: true });
}

export async function handleAdminDomainAssetsSyncCatchAll(
  pathname: string,
  request: Request,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "domain access denied",
      403,
    );
  }

  const match = pathname.match(
    /^\/admin\/domain-assets\/(\d+)\/sync-catch-all$/,
  );
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0)
    return jsonError("invalid domain id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const asset = await getDomainAssetWithSecretById(db, id);
  if (!asset) return jsonError("domain not found", 404);
  try {
    ensureActorCanAccessProject(actor, asset.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }
  const effectivePolicy = resolveEffectiveDomainCatchAllPolicy(asset);
  if (effectivePolicy.catch_all_mode === "inherit") {
    return jsonError("catch-all policy is set to inherit", 400);
  }
  if (!domainAllowsCatchAllSync(asset)) {
    return jsonError("catch-all sync is disabled for this domain", 400);
  }

  const config = domainAllowsCatchAllSync(asset)
    ? resolveCloudflareMailboxRouteConfig(env, {
        api_token: asset.cloudflare_api_token,
        domain: asset.domain,
        email_worker: asset.email_worker,
        mailbox_route_forward_to: asset.mailbox_route_forward_to,
        zone_id: asset.zone_id,
      })
    : null;
  if (!isCloudflareMailboxRouteConfigConfigured(config)) {
    return jsonError(
      `${getDomainProviderLabel(asset.provider)} does not expose catch-all sync for this domain`,
      400,
    );
  }

  try {
    const previousSnapshot =
      await getCloudflareMailboxSyncSnapshotByConfig(config);
    const snapshot = await updateCloudflareCatchAllRuleByConfig(config, {
      enabled: effectivePolicy.catch_all_mode === "enabled",
      forward_to:
        effectivePolicy.catch_all_mode === "enabled"
          ? effectivePolicy.catch_all_forward_to
          : null,
    });
    const previous = {
      catch_all_enabled: previousSnapshot.catch_all_enabled,
      catch_all_forward_to: previousSnapshot.catch_all_forward_to,
    };
    const next = {
      catch_all_enabled: snapshot.catch_all_enabled,
      catch_all_forward_to: snapshot.catch_all_forward_to,
    };
    await addAuditLog(db, {
      action: "domain.catch_all_sync",
      actor,
      detail: withAuditOperationNote(
        {
          catch_all_mode: effectivePolicy.catch_all_mode,
          catch_all_source: effectivePolicy.catch_all_source,
          changed_fields: buildAuditChangedFields(previous, next, [
            "catch_all_enabled",
            "catch_all_forward_to",
          ]),
          configured: snapshot.configured,
          domain: asset.domain,
          id,
          next,
          previous,
          ...next,
        },
        operation_note,
      ),
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
    await captureError(db, "cloudflare.catch_all_sync_failed", error, {
      domain: asset.domain,
      domain_id: id,
    });
    return jsonError(
      error instanceof Error ? error.message : "failed to sync catch-all",
      502,
    );
  }
}

export async function handleAdminDomainAssetsSyncMailboxRoutes(
  pathname: string,
  request: Request,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "domain access denied",
      403,
    );
  }

  const match = pathname.match(
    /^\/admin\/domain-assets\/(\d+)\/sync-mailbox-routes$/,
  );
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0)
    return jsonError("invalid domain id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const asset = await getDomainAssetWithSecretById(db, id);
  if (!asset) return jsonError("domain not found", 404);
  try {
    ensureActorCanAccessProject(actor, asset.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }
  if (!domainAllowsMailboxRouteSync(asset)) {
    return jsonError("mailbox route sync is disabled for this domain", 400);
  }

  const config = domainAllowsMailboxRouteSync(asset)
    ? resolveCloudflareMailboxRouteConfig(env, {
        api_token: asset.cloudflare_api_token,
        domain: asset.domain,
        email_worker: asset.email_worker,
        mailbox_route_forward_to: asset.mailbox_route_forward_to,
        zone_id: asset.zone_id,
      })
    : null;
  if (!isCloudflareMailboxRouteConfigConfigured(config)) {
    return jsonError(
      `${getDomainProviderLabel(asset.provider)} does not expose mailbox route sync for this domain`,
      400,
    );
  }

  const usageStats = await getDomainAssetUsageStats(
    db,
    [asset.domain],
    getScopedProjectIds(actor),
  );
  const expectedAddresses = Array.from(
    new Set(
      (usageStats[0]?.active_mailbox_addresses || [])
        .map((address) => normalizeEmailAddress(address))
        .filter(Boolean),
    ),
  ).sort();
  const expectedAddressSet = new Set(expectedAddresses);

  try {
    const snapshot = await getCloudflareMailboxSyncSnapshotByConfig(config);
    const previous = {
      cloudflare_routes_total: snapshot.candidates.length,
      enabled_routes_total: snapshot.candidates.filter(
        (item) => item.is_enabled,
      ).length,
      expected_total: expectedAddresses.length,
      extra_total: 0,
    };
    const extraAddresses = Array.from(
      new Set(
        snapshot.candidates
          .map((candidate) => normalizeEmailAddress(candidate.address))
          .filter((address) => address && !expectedAddressSet.has(address)),
      ),
    ).sort();

    let created_count = 0;
    let deleted_count = 0;
    let skipped_count = 0;
    let updated_count = 0;

    for (const address of expectedAddresses) {
      const outcome = await upsertCloudflareMailboxRouteByConfig(config, {
        address,
        is_enabled: true,
      });
      if (outcome === "created") created_count += 1;
      else if (outcome === "updated") updated_count += 1;
      else skipped_count += 1;
    }

    for (const address of extraAddresses) {
      const outcome = await deleteCloudflareMailboxRouteByConfig(
        config,
        address,
      );
      if (outcome === "deleted") deleted_count += 1;
      else skipped_count += 1;
    }

    const nextSnapshot = await getCloudflareMailboxSyncSnapshotByConfig(config);
    previous.extra_total = extraAddresses.length;
    const next = {
      cloudflare_routes_total: nextSnapshot.candidates.length,
      enabled_routes_total: nextSnapshot.candidates.filter(
        (item) => item.is_enabled,
      ).length,
      expected_total: expectedAddresses.length,
      extra_total: nextSnapshot.candidates.filter(
        (item) => !expectedAddressSet.has(normalizeEmailAddress(item.address)),
      ).length,
    };
    await addAuditLog(db, {
      action: "domain.mailbox_route_sync",
      actor,
      detail: withAuditOperationNote(
        {
          changed_fields: buildAuditChangedFields(previous, next, [
            "cloudflare_routes_total",
            "enabled_routes_total",
            "extra_total",
          ]),
          cloudflare_routes_total: next.cloudflare_routes_total,
          created_count,
          deleted_count,
          domain: asset.domain,
          enabled_routes_total: next.enabled_routes_total,
          expected_total: expectedAddresses.length,
          extra_total: extraAddresses.length,
          id,
          next,
          previous,
          skipped_count,
          updated_count,
        },
        operation_note,
      ),
      entity_id: String(id),
      entity_type: "domain",
    });
    return json({
      cloudflare_routes_total: nextSnapshot.candidates.length,
      configured: nextSnapshot.configured,
      created_count,
      deleted_count,
      enabled_routes_total: nextSnapshot.candidates.filter(
        (item) => item.is_enabled,
      ).length,
      expected_total: expectedAddresses.length,
      ok: true,
      skipped_count,
      updated_count,
    });
  } catch (error) {
    await captureError(db, "cloudflare.mailbox_route_sync_failed", error, {
      domain: asset.domain,
      domain_id: id,
    });
    return jsonError(
      error instanceof Error ? error.message : "failed to sync mailbox routes",
      502,
    );
  }
}

export async function handleAdminDomainRoutingProfilesGet(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  return json(
    await getDomainRoutingProfilesPaged(
      db,
      page,
      ADMIN_PAGE_SIZE,
      getScopedProjectIds(actor),
    ),
  );
}

export async function handleAdminDomainRoutingProfilesPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "domain access denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateDomainRoutingProfileBody(parsed.data || {});
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

  const { operation_note, ...createData } = validation.data;
  const next = toDomainRoutingProfileAuditSnapshot({
    ...createData,
    ...workspaceScope.data,
  });
  const id = await createDomainRoutingProfile(db, {
    ...createData,
    ...workspaceScope.data,
  });
  await addAuditLog(db, {
    action: "domain.routing_profile.create",
    actor,
    detail: withAuditOperationNote({ id, ...next }, operation_note),
    entity_id: String(id),
    entity_type: "domain_routing_profile",
  });
  return json({ ok: true });
}

export async function handleAdminDomainRoutingProfilesPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "domain access denied",
      403,
    );
  }

  const match = pathname.match(/^\/admin\/domain-routing-profiles\/(\d+)$/);
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0)
    return jsonError("invalid routing profile id", 400);

  const existing = await getDomainRoutingProfileById(db, id);
  if (!existing) return jsonError("routing profile not found", 404);
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

  const validation = validateDomainRoutingProfileBody(parsed.data || {});
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

  const { operation_note, ...updateData } = validation.data;
  const previous = toDomainRoutingProfileAuditSnapshot(existing);
  const next = toDomainRoutingProfileAuditSnapshot({
    ...updateData,
    ...workspaceScope.data,
  });
  await updateDomainRoutingProfile(db, id, {
    ...updateData,
    ...workspaceScope.data,
  });
  await addAuditLog(db, {
    action: "domain.routing_profile.update",
    actor,
    detail: buildResourceUpdateAuditDetail(
      previous,
      next,
      [
        "catch_all_forward_to",
        "catch_all_mode",
        "environment_id",
        "is_enabled",
        "name",
        "note",
        "project_id",
        "provider",
        "slug",
      ],
      operation_note,
      {
        id,
        previous_scope: {
          environment_id: existing.environment_id,
          project_id: existing.project_id,
        },
      },
    ),
    entity_id: String(id),
    entity_type: "domain_routing_profile",
  });
  return json({ ok: true });
}

export async function handleAdminDomainRoutingProfilesDelete(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "domain access denied",
      403,
    );
  }

  const match = pathname.match(/^\/admin\/domain-routing-profiles\/(\d+)$/);
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0)
    return jsonError("invalid routing profile id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const existing = await getDomainRoutingProfileById(db, id);
  if (!existing) return jsonError("routing profile not found", 404);
  try {
    ensureActorCanAccessProject(actor, existing.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  await deleteDomainRoutingProfile(db, id);
  await addAuditLog(db, {
    action: "domain.routing_profile.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toDomainRoutingProfileAuditSnapshot(existing),
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "domain_routing_profile",
  });
  return json({ ok: true });
}

export async function handleAdminWorkspaceCatalog(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const includeDisabled = url.searchParams.get("include_disabled") === "1";
  return json(
    await getWorkspaceCatalog(db, includeDisabled, getScopedProjectIds(actor)),
  );
}

export async function handleAdminRetentionPoliciesGet(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  const project_id = parseOptionalId(url.searchParams.get("project_id"));
  const environment_id = parseOptionalId(
    url.searchParams.get("environment_id"),
  );
  const mailbox_pool_id = parseOptionalId(
    url.searchParams.get("mailbox_pool_id"),
  );
  const is_enabled = maybeBoolean(url.searchParams.get("is_enabled"));
  const keyword = normalizeNullable(url.searchParams.get("keyword"));

  try {
    ensureActorCanAccessProject(actor, project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  return json(
    await getRetentionPoliciesPaged(
      db,
      page,
      RETENTION_POLICY_PAGE_SIZE,
      {
        environment_id,
        is_enabled,
        keyword,
        mailbox_pool_id,
        project_id,
      },
      getScopedProjectIds(actor),
    ),
  );
}

export async function handleAdminRetentionJobRunsGet(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanReadGlobalSettings(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const page = clampPage(url.searchParams.get("page"));
  const status = normalizeNullable(url.searchParams.get("status"));
  const trigger_source = normalizeNullable(
    url.searchParams.get("trigger_source"),
  );

  return json(
    await getRetentionJobRunsPaged(db, page, RETENTION_JOB_PAGE_SIZE, {
      status: status === "success" || status === "failed" ? status : null,
      trigger_source,
    }),
  );
}

export async function handleAdminRetentionJobRunSummaryGet(
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanReadGlobalSettings(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  return json(await getRetentionJobRunSummary(db));
}

export async function handleAdminRetentionPoliciesPost(
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

  const validation = validateRetentionPolicyBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const requestedScope = {
    environment_id: validation.data.environment_id,
    mailbox_pool_id: validation.data.mailbox_pool_id,
    project_id: validation.data.project_id,
  };
  if (!requestedScope.project_id && isActorProjectScoped(actor)) {
    return jsonError("project-scoped admin cannot manage global settings", 403);
  }

  const workspaceScope = await resolveWorkspaceAssignment(db, requestedScope);
  if (!workspaceScope.ok) return jsonError(workspaceScope.error, 400);

  try {
    if (workspaceScope.data.project_id === null) {
      ensureActorCanManageGlobalSettings(actor);
    } else {
      ensureActorCanAccessProject(actor, workspaceScope.data.project_id);
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const scope_key = buildRetentionPolicyScopeKey(workspaceScope.data);
  const { operation_note, ...createData } = validation.data;
  const policy = await createRetentionPolicy(db, {
    ...createData,
    ...workspaceScope.data,
    scope_key,
  });
  const next = toRetentionPolicyAuditSnapshot(policy);

  await addAuditLog(db, {
    action: "retention_policy.create",
    actor,
    detail: withAuditOperationNote({ id: policy.id, ...next }, operation_note),
    entity_id: String(policy.id),
    entity_type: "retention_policy",
  });

  return json(policy);
}

export async function handleAdminRetentionPoliciesPut(
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

  const id = Number(pathname.replace("/admin/retention-policies/", ""));
  if (!Number.isFinite(id) || id <= 0)
    return jsonError("invalid retention policy id", 400);

  const existing = await getRetentionPolicyById(
    db,
    id,
    getScopedProjectIds(actor),
  );
  if (!existing) return jsonError("retention policy not found", 404);

  try {
    if (existing.project_id === null) {
      ensureActorCanManageGlobalSettings(actor);
    } else {
      ensureActorCanAccessProject(actor, existing.project_id);
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateRetentionPolicyBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const requestedScope = {
    environment_id: validation.data.environment_id,
    mailbox_pool_id: validation.data.mailbox_pool_id,
    project_id: validation.data.project_id,
  };
  if (!requestedScope.project_id && isActorProjectScoped(actor)) {
    return jsonError("project-scoped admin cannot manage global settings", 403);
  }

  const workspaceScope = await resolveWorkspaceAssignment(db, requestedScope);
  if (!workspaceScope.ok) return jsonError(workspaceScope.error, 400);

  try {
    if (workspaceScope.data.project_id === null) {
      ensureActorCanManageGlobalSettings(actor);
    } else {
      ensureActorCanAccessProject(actor, workspaceScope.data.project_id);
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const scope_key = buildRetentionPolicyScopeKey(workspaceScope.data);
  const { operation_note, ...updateData } = validation.data;
  const previous = toRetentionPolicyAuditSnapshot(existing);
  const policy = await updateRetentionPolicy(db, id, {
    ...updateData,
    ...workspaceScope.data,
    scope_key,
  });
  const next = toRetentionPolicyAuditSnapshot(policy);

  await addAuditLog(db, {
    action: "retention_policy.update",
    actor,
    detail: buildResourceUpdateAuditDetail(
      previous,
      next,
      [
        "archive_email_hours",
        "deleted_email_retention_hours",
        "description",
        "email_retention_hours",
        "environment_id",
        "is_enabled",
        "mailbox_pool_id",
        "mailbox_ttl_hours",
        "name",
        "project_id",
        "scope_key",
        "scope_level",
      ],
      operation_note,
      {
        id: policy.id,
        previous_scope_key: existing.scope_key,
      },
    ),
    entity_id: String(policy.id),
    entity_type: "retention_policy",
  });

  return json(policy);
}

export async function handleAdminRetentionPoliciesDelete(
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

  const id = Number(pathname.replace("/admin/retention-policies/", ""));
  if (!Number.isFinite(id) || id <= 0)
    return jsonError("invalid retention policy id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const existing = await getRetentionPolicyById(
    db,
    id,
    getScopedProjectIds(actor),
  );
  if (!existing) return jsonError("retention policy not found", 404);

  try {
    if (existing.project_id === null) {
      ensureActorCanManageGlobalSettings(actor);
    } else {
      ensureActorCanAccessProject(actor, existing.project_id);
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  await deleteRetentionPolicy(db, id);
  await addAuditLog(db, {
    action: "retention_policy.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toRetentionPolicyAuditSnapshot(existing),
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "retention_policy",
  });

  return json({ ok: true });
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
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

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
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const id = Number(pathname.replace("/admin/projects/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid project id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

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
    detail: buildResourceDeleteAuditDetail(
      toWorkspaceProjectAuditSnapshot(project),
      operation_note,
      { id },
    ),
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
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

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

  const id = Number(pathname.replace("/admin/environments/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid environment id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

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
    detail: buildResourceDeleteAuditDetail(
      toWorkspaceEnvironmentAuditSnapshot(existing),
      operation_note,
      { id },
    ),
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
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

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

  const id = Number(pathname.replace("/admin/mailbox-pools/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid mailbox pool id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

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
    detail: buildResourceDeleteAuditDetail(
      toWorkspaceMailboxPoolAuditSnapshot(existing),
      operation_note,
      { id },
    ),
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
  try {
    ensureActorCanManageGlobalSettings(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

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
  request: Request,
  db: D1Database,
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

  const id = Number(pathname.replace("/admin/rules/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid rule id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;
  const existing = await getRuleById(db, id);
  if (!existing) return jsonError("rule not found", 404);
  await deleteRule(db, id);
  await addAuditLog(db, {
    action: "rule.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toRuleAuditSnapshot(existing),
      operation_note,
      { id },
    ),
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
  try {
    ensureActorCanManageGlobalSettings(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

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
  request: Request,
  db: D1Database,
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

  const id = Number(pathname.replace("/admin/whitelist/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid whitelist id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;
  const existing = await getWhitelistById(db, id);
  if (!existing) return jsonError("whitelist not found", 404);
  await deleteWhitelistEntry(db, id);
  await addAuditLog(db, {
    action: "whitelist.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toWhitelistAuditSnapshot(existing),
      operation_note,
      { id },
    ),
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
  try {
    ensureActorCanManageGlobalSettings(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

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
  const payload = await getMailboxesPaged(
    db,
    page,
    MAILBOX_PAGE_SIZE,
    {
      environment_id: clampNumber(url.searchParams.get("environment_id"), {
        min: 1,
      }),
      includeDeleted: url.searchParams.get("include_deleted") === "1",
      keyword: normalizeNullable(url.searchParams.get("keyword")),
      mailbox_pool_id: clampNumber(url.searchParams.get("mailbox_pool_id"), {
        min: 1,
      }),
      project_id: clampNumber(url.searchParams.get("project_id"), { min: 1 }),
    },
    getActorProjectIds(actor),
  );
  return json(payload);
}

function isMailboxSyncRunActive(
  run: Pick<MailboxSyncRunRecord, "status"> | null | undefined,
): boolean {
  return run?.status === "pending" || run?.status === "running";
}

function isMailboxSyncRunStale(
  run:
    | Pick<
        MailboxSyncRunRecord,
        "created_at" | "started_at" | "status" | "updated_at"
      >
    | null
    | undefined,
  now = Date.now(),
): boolean {
  if (!isMailboxSyncRunActive(run)) return false;
  const heartbeatAt = Math.max(
    run?.updated_at || 0,
    run?.started_at || 0,
    run?.created_at || 0,
  );
  return now - heartbeatAt > MAILBOX_SYNC_STALE_MS;
}

async function finalizeStaleMailboxSyncRun(
  db: D1Database,
  run: MailboxSyncRunRecord | null,
): Promise<MailboxSyncRunRecord | null> {
  if (!run || !isMailboxSyncRunStale(run)) return run;

  const finishedAt = Date.now();
  await failMailboxSyncRun(db, run.id, {
    error_message: MAILBOX_SYNC_STALE_ERROR,
    finished_at: finishedAt,
    started_at: run.started_at,
  });

  return getMailboxSyncRunById(db, run.id);
}

function createMailboxSyncHeartbeat(
  db: D1Database,
  jobId: number,
): (force?: boolean) => Promise<void> {
  let lastHeartbeatAt = 0;

  return async (force = false) => {
    const now = Date.now();
    if (!force && now - lastHeartbeatAt < MAILBOX_SYNC_HEARTBEAT_INTERVAL_MS)
      return;
    lastHeartbeatAt = now;
    await touchMailboxSyncRunHeartbeat(db, jobId, now);
  };
}

async function runMailboxSync(
  db: D1Database,
  env: WorkerEnv,
  heartbeat?: (force?: boolean) => Promise<void>,
): Promise<MailboxSyncResult> {
  const configuredDomains = await getDomainPool(db, env);
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

  const snapshotResults = await Promise.all(
    domainConfigs.map(async (item) => {
      try {
        const snapshot = await getCloudflareMailboxSyncSnapshotByConfig(
          item.config,
        );
        await heartbeat?.();
        return { domain: item.domain, ok: true as const, snapshot };
      } catch (error) {
        await heartbeat?.();
        return {
          domain: item.domain,
          error,
          ok: false as const,
        };
      }
    }),
  );

  for (const result of snapshotResults) {
    if (!result.ok) {
      throw result.error instanceof Error
        ? result.error
        : new Error("failed to sync Cloudflare email routes");
    }

    domainSummaries?.push({
      catch_all_enabled: result.snapshot.catch_all_enabled,
      cloudflare_configured: result.snapshot.configured,
      cloudflare_routes_total: result.snapshot.candidates.length,
      domain: result.domain,
    });

    cloudflareCandidates.push(
      ...result.snapshot.candidates.map(
        (candidate: {
          address: string;
          is_enabled: boolean;
          last_received_at: number | null;
          receive_count: number;
        }) => ({
          address: candidate.address,
          created_by: `system:cloudflare-mailbox-sync:${result.domain}`,
          is_enabled: candidate.is_enabled,
          last_received_at: candidate.last_received_at,
          receive_count: candidate.receive_count,
        }),
      ),
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
  let processedCount = 0;

  for (const candidate of candidates) {
    const outcome = await applyMailboxSyncCandidate(db, candidate);
    if (outcome === "created") created_count += 1;
    else if (outcome === "updated") updated_count += 1;
    else skipped_count += 1;

    processedCount += 1;
    if (processedCount === 1 || processedCount % 25 === 0) {
      await heartbeat?.();
    }
  }

  await heartbeat?.(true);

  return {
    catch_all_enabled:
      domainSummaries?.some((item) => item.catch_all_enabled) || false,
    cloudflare_configured:
      domainSummaries?.some((item) => item.cloudflare_configured) || false,
    cloudflare_routes_total:
      domainSummaries?.reduce(
        (sum, item) => sum + item.cloudflare_routes_total,
        0,
      ) || 0,
    created_count,
    domain_summaries: domainSummaries,
    observed_total: observed.length,
    skipped_count,
    updated_count,
  };
}

async function executeMailboxSyncRun(
  db: D1Database,
  env: WorkerEnv,
  jobId: number,
  requestedBy: string,
) {
  const startedAt = Date.now();
  await markMailboxSyncRunRunning(db, jobId);
  const heartbeat = createMailboxSyncHeartbeat(db, jobId);

  try {
    const result = await runMailboxSync(db, env, heartbeat);
    const finishedAt = Date.now();
    await completeMailboxSyncRun(db, jobId, {
      finished_at: finishedAt,
      result,
      started_at: startedAt,
    });
  } catch (error) {
    const finishedAt = Date.now();
    const message =
      error instanceof Error ? error.message : "failed to sync mailboxes";
    await captureError(
      db,
      "mailbox.cloudflare_sync_failed",
      new Error(message),
      {
        action: "background_sync",
        requested_by: requestedBy,
        route: "admin/mailboxes/sync",
      },
    );
    await failMailboxSyncRun(db, jobId, {
      error_message: message,
      finished_at: finishedAt,
      started_at: startedAt,
    });
  }
}

export async function handleAdminMailboxesSync(
  db: D1Database,
  env: WorkerEnv,
  actor?: AuthSession,
  ctx?: WorkerExecutionContext,
): Promise<Response> {
  if (actor) {
    try {
      ensureActorCanManageGlobalSettings(actor);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "permission denied",
        403,
      );
    }
  }
  const existingRun = await finalizeStaleMailboxSyncRun(
    db,
    await getActiveMailboxSyncRun(db),
  );
  if (existingRun && isMailboxSyncRunActive(existingRun)) {
    return json(
      {
        job_id: existingRun.id,
        started_at: existingRun.started_at,
        status: existingRun.status,
      },
      202,
    );
  }

  const startedAt = Date.now();
  const requestedBy = actor?.username || "system";
  const jobId = await createMailboxSyncRun(db, {
    requested_by: requestedBy,
    started_at: startedAt,
    status: "pending",
    trigger_source: "manual",
  });

  const task = executeMailboxSyncRun(db, env, jobId, requestedBy);
  if (ctx) {
    ctx.waitUntil(task);
  } else {
    await task;
  }

  return json(
    {
      job_id: jobId,
      started_at: startedAt,
      status: "pending",
    },
    202,
  );
}

export async function handleAdminMailboxSyncRunGet(
  pathname: string,
  db: D1Database,
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

  const match = pathname.match(/^\/admin\/mailboxes\/sync-runs\/(\d+)$/);
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0)
    return jsonError("invalid sync job id", 400);

  const record = await finalizeStaleMailboxSyncRun(
    db,
    await getMailboxSyncRunById(db, id),
  );
  if (!record) return jsonError("sync job not found", 404);
  return json(record);
}

export async function handleAdminMailboxSyncRunLatestGet(
  db: D1Database,
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

  return json(
    await finalizeStaleMailboxSyncRun(db, await getLatestMailboxSyncRun(db)),
  );
}

export async function handleAdminMailboxesPost(
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

  const mailboxDomainOptions: DomainPoolOptions = {
    allowMailboxCreationOnly: true,
  };
  const defaultDomain = await getDefaultMailboxDomain(
    db,
    env,
    actor,
    workspaceScope.data,
    mailboxDomainOptions,
  );

  const validation = validateMailboxBody(parsed.data || {}, defaultDomain);
  if (!validation.ok) return jsonError(validation.error, 400);
  const domainPool = new Set(
    await getDomainPool(
      db,
      env,
      actor,
      workspaceScope.data,
      mailboxDomainOptions,
    ),
  );
  if (
    domainPool.size > 0 &&
    validation.data.some(
      (item) =>
        !domainPool.has(
          normalizeEmailAddress(item.address).split("@")[1] || "",
        ),
    )
  ) {
    return jsonError("domain is not configured", 400);
  }

  const resolvedRetention = await resolveRetentionPolicyConfig(
    db,
    workspaceScope.data,
  );
  const mailboxExpiryNow = Date.now();

  for (const mailbox of validation.data) {
    const mailboxDomain =
      normalizeEmailAddress(mailbox.address).split("@")[1] || "";
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
      expires_at: resolveMailboxExpirationTimestamp(
        mailbox.expires_at,
        resolvedRetention,
        mailboxExpiryNow,
      ),
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
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

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

  const mailboxDomainOptions: DomainPoolOptions = {
    allowMailboxCreationOnly: true,
  };
  const defaultDomain = await getDefaultMailboxDomain(
    db,
    env,
    actor,
    workspaceScope.data,
    mailboxDomainOptions,
  );

  const validation = validateMailboxBody(
    parsed.data || {},
    defaultDomain,
    false,
  );
  if (!validation.ok) return jsonError(validation.error, 400);
  const domainPool = new Set(
    await getDomainPool(
      db,
      env,
      actor,
      workspaceScope.data,
      mailboxDomainOptions,
    ),
  );
  if (
    domainPool.size > 0 &&
    validation.data.some((item) => {
      const nextDomain =
        normalizeEmailAddress(item.address).split("@")[1] || "";
      const existingDomain =
        normalizeEmailAddress(existing.address).split("@")[1] || "";
      return nextDomain !== existingDomain && !domainPool.has(nextDomain);
    })
  ) {
    return jsonError("domain is not configured", 400);
  }

  const nextMailbox = validation.data[0];
  const nextDomain =
    normalizeEmailAddress(nextMailbox.address).split("@")[1] || "";
  const existingDomain =
    normalizeEmailAddress(existing.address).split("@")[1] || "";
  const nextSyncConfig = await resolveMailboxSyncConfig(db, env, nextDomain);
  const existingSyncConfig = await resolveMailboxSyncConfig(
    db,
    env,
    existingDomain,
  );
  if (
    isCloudflareMailboxRouteConfigConfigured(nextSyncConfig) ||
    isCloudflareMailboxRouteConfigConfigured(existingSyncConfig)
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
        existingAddress &&
        nextAddress &&
        existingAddress !== nextAddress &&
        isCloudflareMailboxRouteConfigConfigured(existingSyncConfig)
      ) {
        await deleteCloudflareMailboxRouteByConfig(
          existingSyncConfig,
          existingAddress,
        );
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

  const id = Number(pathname.replace("/admin/mailboxes/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid mailbox id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;
  const existing = await getMailboxById(db, id, getActorProjectIds(actor));
  if (!existing || existing.deleted_at !== null)
    return jsonError("mailbox not found", 404);

  const existingDomain =
    normalizeEmailAddress(existing.address).split("@")[1] || "";
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
    detail: buildResourceDeleteAuditDetail(
      toMailboxAuditSnapshot(existing),
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "mailbox",
  });
  return json({ ok: true });
}

export async function handleAdminAdminsGet(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageAdmins(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }
  const page = clampPage(url.searchParams.get("page"));
  const keyword = normalizeNullable(url.searchParams.get("keyword"));
  const accessScopeValue = normalizeNullable(
    url.searchParams.get("access_scope"),
  );
  const roleValue = normalizeNullable(url.searchParams.get("role"));
  const projectIdRaw = url.searchParams.get("project_id");
  const project_id = parseOptionalId(projectIdRaw);

  if (accessScopeValue && !ACCESS_SCOPE_SET.has(accessScopeValue)) {
    return jsonError("invalid access_scope", 400);
  }
  if (projectIdRaw !== null && projectIdRaw !== "" && project_id === null) {
    return jsonError("invalid project_id", 400);
  }

  const access_scope = (accessScopeValue || null) as AccessScope | null;
  const role = roleValue
    ? normalizeAdminRole(roleValue, access_scope || "all")
    : null;
  if (roleValue && !role) {
    return jsonError("invalid role", 400);
  }

  const payload = await getAdminUsersPaged(
    db,
    page,
    ADMIN_PAGE_SIZE,
    {
      access_scope,
      is_enabled: maybeBoolean(url.searchParams.get("is_enabled")),
      keyword,
      project_id,
      role: role as AdminRole | null,
    },
    getScopedProjectIds(actor),
  );
  return json(payload);
}

export async function handleAdminAdminsPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageAdmins(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = await validateAdminBody(parsed.data || {}, true, actor);
  if (!validation.ok) return jsonError(validation.error, 400);
  if (
    !("username" in validation.data) ||
    !("password_hash" in validation.data) ||
    !("password_salt" in validation.data)
  ) {
    return jsonError("password is required", 400);
  }
  try {
    ensureActorCanAssignAdminRole(
      actor,
      validation.data.role,
      validation.data.access_scope,
    );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const createData = validation.data as {
    access_scope: AccessScope;
    display_name: string;
    is_enabled: boolean;
    note: string;
    operation_note: string;
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
      note: createData.note,
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
    detail: withAuditOperationNote(
      toAdminAuditSnapshot({
        access_scope: user.access_scope,
        display_name: user.display_name,
        is_enabled: user.is_enabled,
        note: user.note,
        project_ids: user.projects.map((project) => project.id),
        role: user.role,
        username: user.username,
      }),
      createData.operation_note,
    ),
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
  try {
    ensureActorCanManageAdmins(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = pathname.replace("/admin/admins/", "").trim();
  if (!id) return jsonError("invalid admin id", 400);

  const existing = await getAdminAccessContext(db, id);
  if (!existing) return jsonError("admin user not found", 404);

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = await validateAdminBody(parsed.data || {}, false, actor);
  if (!validation.ok) return jsonError(validation.error, 400);
  try {
    ensureActorCanManageAdminRecord(actor, existing);
    ensureActorCanAssignAdminRole(
      actor,
      validation.data.role,
      validation.data.access_scope,
    );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const previous = toAdminAuditSnapshot({
    access_scope: existing.access_scope,
    display_name: existing.display_name,
    is_enabled: existing.is_enabled,
    note: existing.note,
    project_ids: existing.project_ids,
    role: existing.role,
    username: existing.username,
  });
  const next = toAdminAuditSnapshot({
    access_scope: validation.data.access_scope,
    display_name: validation.data.display_name,
    is_enabled: validation.data.is_enabled,
    note: validation.data.note,
    project_ids: validation.data.project_ids,
    role: validation.data.role,
    username: existing.username,
  });

  const { operation_note, ...updateData } = validation.data;
  await updateAdminUser(db, id, updateData);
  await addAuditLog(db, {
    action: "admin.update",
    actor,
    detail: buildAdminUpdateAuditDetail(previous, next, operation_note),
    entity_id: id,
    entity_type: "admin_user",
  });
  return json({ ok: true });
}

function parseNotificationDeliveryIds(input: Record<string, unknown>):
  | { data: number[]; ok: true }
  | {
      error: string;
      ok: false;
    } {
  const ids = Array.isArray(input.delivery_ids) ? input.delivery_ids : [];
  const normalizedIds = Array.from(
    new Set(
      ids
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.floor(value)),
    ),
  );

  if (normalizedIds.length === 0) {
    return {
      error: "delivery_ids must contain at least one valid id",
      ok: false,
    };
  }

  return { data: normalizedIds, ok: true };
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
  if (!Number.isFinite(id) || id <= 0)
    return jsonError("invalid notification id", 400);

  const endpoint = await getNotificationEndpointById(db, id);
  if (!endpoint) return jsonError("notification endpoint not found", 404);
  try {
    if (endpoint.access_scope === "all")
      ensureActorCanAccessProject(actor, null);
    else
      ensureActorCanAccessAnyProject(
        actor,
        endpoint.projects.map((project) => project.id),
      );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const page = clampPage(url.searchParams.get("page"));
  const deadLetterOnly =
    url.searchParams.get("dead_letter_only") === "1" ||
    url.searchParams.get("dead_letter_only") === "true";
  return json(
    await getNotificationDeliveriesPaged(db, page, ADMIN_PAGE_SIZE, id, {
      dead_letter_only: deadLetterOnly,
    }),
  );
}

export async function handleAdminNotificationDeliveryAttemptsGet(
  pathname: string,
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const match = pathname.match(
    /^\/admin\/notifications\/deliveries\/(\d+)\/attempts$/,
  );
  const deliveryId = Number(match?.[1] || 0);
  if (!Number.isFinite(deliveryId) || deliveryId <= 0) {
    return jsonError("invalid notification delivery id", 400);
  }

  const delivery = await getNotificationDeliveryById(db, deliveryId);
  if (!delivery) return jsonError("notification delivery not found", 404);

  const endpoint = await getNotificationEndpointById(
    db,
    delivery.notification_endpoint_id,
  );
  if (!endpoint) return jsonError("notification endpoint not found", 404);
  try {
    if (endpoint.access_scope === "all")
      ensureActorCanAccessProject(actor, null);
    else
      ensureActorCanAccessAnyProject(
        actor,
        endpoint.projects.map((project) => project.id),
      );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const page = clampPage(url.searchParams.get("page"));
  return json(
    await getNotificationDeliveryAttemptsPaged(
      db,
      page,
      ADMIN_PAGE_SIZE,
      deliveryId,
    ),
  );
}

export async function handleAdminNotificationsPost(
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

  const validation = validateNotificationBody(parsed.data || {}, actor);
  if (!validation.ok) return jsonError(validation.error, 400);

  const { operation_note, ...createData } = validation.data;
  const id = await createNotificationEndpoint(db, createData);
  await addAuditLog(db, {
    action: "notification.create",
    actor,
    detail: withAuditOperationNote(
      {
        id,
        ...toNotificationAuditSnapshot(createData),
      },
      operation_note,
    ),
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
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = Number(pathname.replace("/admin/notifications/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid notification id", 400);

  const existing = await getNotificationEndpointById(db, id);
  if (!existing) return jsonError("notification endpoint not found", 404);
  try {
    if (existing.access_scope === "all")
      ensureActorCanAccessProject(actor, null);
    else
      ensureActorCanAccessAnyProject(
        actor,
        existing.projects.map((project) => project.id),
      );
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

  const { operation_note, ...updateData } = validation.data;
  const previous = toNotificationAuditSnapshot(existing);
  const next = toNotificationAuditSnapshot(updateData);
  await updateNotificationEndpoint(db, id, updateData);
  await addAuditLog(db, {
    action: "notification.update",
    actor,
    detail: buildResourceUpdateAuditDetail(
      previous,
      next,
      [
        "access_scope",
        "alert_config",
        "events",
        "is_enabled",
        "name",
        "project_ids",
        "secret_configured",
        "target",
        "type",
      ],
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "notification_endpoint",
  });
  return json({ ok: true });
}

export async function handleAdminNotificationsDelete(
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

  const id = Number(pathname.replace("/admin/notifications/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid notification id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;
  const existing = await getNotificationEndpointById(db, id);
  if (!existing) return jsonError("notification endpoint not found", 404);
  try {
    if (existing.access_scope === "all")
      ensureActorCanAccessProject(actor, null);
    else
      ensureActorCanAccessAnyProject(
        actor,
        existing.projects.map((project) => project.id),
      );
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
    detail: buildResourceDeleteAuditDetail(
      toNotificationAuditSnapshot(existing),
      operation_note,
      { id },
    ),
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
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = Number(
    pathname.replace("/admin/notifications/", "").replace("/test", ""),
  );
  if (!Number.isFinite(id)) return jsonError("invalid notification id", 400);
  const endpoint = await getNotificationEndpointById(db, id);
  if (!endpoint) return jsonError("notification endpoint not found", 404);
  try {
    if (endpoint.access_scope === "all")
      ensureActorCanAccessProject(actor, null);
    else
      ensureActorCanAccessAnyProject(
        actor,
        endpoint.projects.map((project) => project.id),
      );
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
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const match = pathname.match(
    /^\/admin\/notifications\/deliveries\/(\d+)\/retry$/,
  );
  const deliveryId = Number(match?.[1] || 0);
  if (!Number.isFinite(deliveryId) || deliveryId <= 0)
    return jsonError("invalid notification delivery id", 400);

  const sourceDelivery = await getNotificationDeliveryById(db, deliveryId);
  if (!sourceDelivery) return jsonError("notification delivery not found", 404);

  const endpoint = await getNotificationEndpointById(
    db,
    sourceDelivery.notification_endpoint_id,
  );
  if (!endpoint) return jsonError("notification endpoint not found", 404);
  try {
    if (endpoint.access_scope === "all")
      ensureActorCanAccessProject(actor, null);
    else
      ensureActorCanAccessAnyProject(
        actor,
        endpoint.projects.map((project) => project.id),
      );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const delivery = await retryNotificationDelivery(db, deliveryId);
  if (!delivery) return jsonError("notification delivery not found", 404);

  if (sourceDelivery.is_dead_letter) {
    await resolveNotificationDeliveryDeadLetter(
      db,
      sourceDelivery.id,
      actor.username,
    );
  }

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

export async function handleAdminNotificationDeliveryResolve(
  pathname: string,
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

  const match = pathname.match(
    /^\/admin\/notifications\/deliveries\/(\d+)\/resolve$/,
  );
  const deliveryId = Number(match?.[1] || 0);
  if (!Number.isFinite(deliveryId) || deliveryId <= 0) {
    return jsonError("invalid notification delivery id", 400);
  }

  const delivery = await getNotificationDeliveryById(db, deliveryId);
  if (!delivery) return jsonError("notification delivery not found", 404);

  const endpoint = await getNotificationEndpointById(
    db,
    delivery.notification_endpoint_id,
  );
  if (!endpoint) return jsonError("notification endpoint not found", 404);
  try {
    if (endpoint.access_scope === "all")
      ensureActorCanAccessProject(actor, null);
    else
      ensureActorCanAccessAnyProject(
        actor,
        endpoint.projects.map((project) => project.id),
      );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  if (!delivery.is_dead_letter) {
    return jsonError("notification delivery is not in dead letter queue", 409);
  }

  await resolveNotificationDeliveryDeadLetter(db, delivery.id, actor.username);
  await addAuditLog(db, {
    action: "notification.delivery.resolve",
    actor,
    detail: {
      delivery_id: delivery.id,
      event: delivery.event,
      notification_endpoint_id: delivery.notification_endpoint_id,
    },
    entity_id: String(delivery.id),
    entity_type: "notification_delivery",
  });
  return json({ ok: true });
}

export async function handleAdminNotificationDeliveryBulkRetry(
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

  const validation = parseNotificationDeliveryIds(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const status_breakdown = {
    failed: 0,
    pending: 0,
    retrying: 0,
    success: 0,
  } as Record<"failed" | "pending" | "retrying" | "success", number>;
  const errors: Array<{ delivery_id: number; message: string }> = [];
  let success_count = 0;

  for (const deliveryId of validation.data) {
    try {
      const sourceDelivery = await getNotificationDeliveryById(db, deliveryId);
      if (!sourceDelivery) {
        errors.push({
          delivery_id: deliveryId,
          message: "notification delivery not found",
        });
        continue;
      }

      const endpoint = await getNotificationEndpointById(
        db,
        sourceDelivery.notification_endpoint_id,
      );
      if (!endpoint) {
        errors.push({
          delivery_id: deliveryId,
          message: "notification endpoint not found",
        });
        continue;
      }

      if (endpoint.access_scope === "all")
        ensureActorCanAccessProject(actor, null);
      else
        ensureActorCanAccessAnyProject(
          actor,
          endpoint.projects.map((project) => project.id),
        );

      if (!sourceDelivery.is_dead_letter) {
        errors.push({
          delivery_id: deliveryId,
          message: "notification delivery is not in dead letter queue",
        });
        continue;
      }

      const delivery = await retryNotificationDelivery(db, deliveryId);
      if (!delivery) {
        errors.push({
          delivery_id: deliveryId,
          message: "notification delivery not found",
        });
        continue;
      }

      await resolveNotificationDeliveryDeadLetter(
        db,
        sourceDelivery.id,
        actor.username,
      );
      status_breakdown[delivery.status] += 1;
      success_count += 1;
    } catch (error) {
      errors.push({
        delivery_id: deliveryId,
        message:
          error instanceof Error
            ? error.message
            : "notification delivery retry failed",
      });
    }
  }

  await addAuditLog(db, {
    action: "notification.delivery.bulk_retry",
    actor,
    detail: {
      delivery_ids: validation.data,
      failed_count: errors.length,
      requested_count: validation.data.length,
      status_breakdown,
      success_count,
    },
    entity_id: "",
    entity_type: "notification_delivery",
  });

  return json({
    errors,
    failed_count: errors.length,
    ok: true,
    requested_count: validation.data.length,
    status_breakdown,
    success_count,
  });
}

export async function handleAdminNotificationDeliveryBulkResolve(
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

  const validation = parseNotificationDeliveryIds(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const errors: Array<{ delivery_id: number; message: string }> = [];
  let success_count = 0;

  for (const deliveryId of validation.data) {
    try {
      const delivery = await getNotificationDeliveryById(db, deliveryId);
      if (!delivery) {
        errors.push({
          delivery_id: deliveryId,
          message: "notification delivery not found",
        });
        continue;
      }

      const endpoint = await getNotificationEndpointById(
        db,
        delivery.notification_endpoint_id,
      );
      if (!endpoint) {
        errors.push({
          delivery_id: deliveryId,
          message: "notification endpoint not found",
        });
        continue;
      }

      if (endpoint.access_scope === "all")
        ensureActorCanAccessProject(actor, null);
      else
        ensureActorCanAccessAnyProject(
          actor,
          endpoint.projects.map((project) => project.id),
        );

      if (!delivery.is_dead_letter) {
        errors.push({
          delivery_id: deliveryId,
          message: "notification delivery is not in dead letter queue",
        });
        continue;
      }

      await resolveNotificationDeliveryDeadLetter(
        db,
        delivery.id,
        actor.username,
      );
      success_count += 1;
    } catch (error) {
      errors.push({
        delivery_id: deliveryId,
        message:
          error instanceof Error
            ? error.message
            : "notification delivery resolve failed",
      });
    }
  }

  await addAuditLog(db, {
    action: "notification.delivery.bulk_resolve",
    actor,
    detail: {
      delivery_ids: validation.data,
      failed_count: errors.length,
      requested_count: validation.data.length,
      success_count,
    },
    entity_id: "",
    entity_type: "notification_delivery",
  });

  return json({
    errors,
    failed_count: errors.length,
    ok: true,
    requested_count: validation.data.length,
    success_count,
  });
}

export async function handleAdminApiTokensGet(
  url: URL,
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
  const page = clampPage(url.searchParams.get("page"));
  return json(
    await getApiTokensPaged(
      db,
      page,
      ADMIN_PAGE_SIZE,
      getActorProjectIds(actor),
    ),
  );
}

export async function handleAdminApiTokensPost(
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

  const validation = validateApiTokenBody(parsed.data || {}, actor);
  if (!validation.ok) return jsonError(validation.error, 400);

  const { operation_note, ...createData } = validation.data;
  const issuedTokenId = crypto.randomUUID();
  const issuedToken = createManagedApiTokenValue(issuedTokenId);
  const token = await createApiToken(db, {
    ...createData,
    created_by: actor.username,
    id: issuedTokenId,
    token_hash: await hashApiTokenValue(issuedToken),
    token_prefix: issuedToken.slice(0, 18),
  });

  await addAuditLog(db, {
    action: "api_token.create",
    actor,
    detail: withAuditOperationNote(
      {
        ...toApiTokenAuditSnapshot(token),
        id: token.id,
        plain_text_token_issued: true,
        token_preview: token.token_preview,
      },
      operation_note,
    ),
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
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = pathname.replace("/admin/api-tokens/", "").trim();
  if (!id) return jsonError("invalid api token id", 400);

  const existing = await getApiTokenById(db, id);
  if (!existing) return jsonError("api token not found", 404);
  try {
    if (existing.access_scope === "all")
      ensureActorCanAccessProject(actor, null);
    else
      ensureActorCanAccessAnyProject(
        actor,
        existing.projects.map((project) => project.id),
      );
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

  const { operation_note, ...updateData } = validation.data;
  const previous = toApiTokenAuditSnapshot(existing);
  const next = toApiTokenAuditSnapshot(updateData);
  await updateApiToken(db, id, updateData);
  await addAuditLog(db, {
    action: "api_token.update",
    actor,
    detail: buildResourceUpdateAuditDetail(
      previous,
      next,
      [
        "access_scope",
        "description",
        "expires_at",
        "is_enabled",
        "name",
        "permissions",
        "project_ids",
      ],
      operation_note,
      { id },
    ),
    entity_id: id,
    entity_type: "api_token",
  });
  return json({ ok: true });
}

export async function handleAdminApiTokensDelete(
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

  const id = pathname.replace("/admin/api-tokens/", "").trim();
  if (!id) return jsonError("invalid api token id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const existing = await getApiTokenById(db, id);
  if (!existing) return jsonError("api token not found", 404);
  try {
    if (existing.access_scope === "all")
      ensureActorCanAccessProject(actor, null);
    else
      ensureActorCanAccessAnyProject(
        actor,
        existing.projects.map((project) => project.id),
      );
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
    detail: buildResourceDeleteAuditDetail(
      toApiTokenAuditSnapshot(existing),
      operation_note,
      { id },
    ),
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
  );
}

export async function handleAdminOutboundEmailSendExisting(
  pathname: string,
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
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

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
  if (!Number.isFinite(id))
    return jsonError("invalid outbound template id", 400);
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
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

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
  if (!Number.isFinite(id))
    return jsonError("invalid outbound contact id", 400);
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
  const page = clampPage(url.searchParams.get("page"));
  return json(
    await getAuditLogsPaged(db, page, AUDIT_PAGE_SIZE, {
      action: normalizeNullable(url.searchParams.get("action")),
      action_prefix: normalizeNullable(url.searchParams.get("action_prefix")),
      entity_id: normalizeNullable(url.searchParams.get("entity_id")),
      entity_type: normalizeNullable(url.searchParams.get("entity_type")),
      keyword: normalizeNullable(url.searchParams.get("keyword")),
    }),
  );
}

export async function handleAdminErrors(
  url: URL,
  db: D1Database,
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
    isActorProjectScoped(actor) &&
    !["emails", "trash", "mailboxes", "notifications"].includes(normalized)
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

function validateDomainRoutingProfileBody(body: Record<string, unknown>) {
  const name = String(body.name || "").trim();
  const slug = slugifyIdentifier(
    body.slug || body.name || "routing-profile",
    "routing-profile",
  ).slice(0, MAX_WORKSPACE_SLUG_LENGTH);
  const catch_all_mode = String(body.catch_all_mode || "inherit")
    .trim()
    .toLowerCase() as CatchAllMode;
  const catch_all_forward_to = normalizeEmailAddress(body.catch_all_forward_to);
  const provider = String(body.provider || "cloudflare")
    .trim()
    .toLowerCase();
  const note = String(body.note || "").trim();
  const operationNoteValidation = readAuditOperationNote(body);
  const project_id = parseOptionalId(body.project_id);
  const environment_id = parseOptionalId(body.environment_id);
  const is_enabled = body.is_enabled !== false;

  if (!name) return { ok: false as const, error: "name is required" };
  if (name.length > MAX_WORKSPACE_NAME_LENGTH) {
    return { ok: false as const, error: "name is too long" };
  }
  if (!slug) return { ok: false as const, error: "slug is required" };
  if (slug.length > MAX_WORKSPACE_SLUG_LENGTH) {
    return { ok: false as const, error: "slug is too long" };
  }
  if (!provider) return { ok: false as const, error: "provider is required" };
  const providerDefinition = getDomainProviderDefinition(provider);
  if (!providerDefinition)
    return { ok: false as const, error: "provider is not supported" };
  if (!domainProviderSupports(providerDefinition, "routing_profile")) {
    return {
      ok: false as const,
      error: `${providerDefinition.label} does not support routing profiles`,
    };
  }
  if (!["inherit", "enabled", "disabled"].includes(catch_all_mode)) {
    return { ok: false as const, error: "invalid catch_all_mode" };
  }
  if (catch_all_forward_to.length > 320) {
    return { ok: false as const, error: "catch_all_forward_to is too long" };
  }
  if (catch_all_forward_to && !isValidEmailAddress(catch_all_forward_to)) {
    return {
      ok: false as const,
      error: "catch_all_forward_to must be a valid email address",
    };
  }
  if (catch_all_mode === "enabled" && !catch_all_forward_to) {
    return {
      ok: false as const,
      error: "catch_all_forward_to is required when catch_all_mode is enabled",
    };
  }
  if (note.length > MAX_WORKSPACE_DESCRIPTION_LENGTH) {
    return { ok: false as const, error: "note is too long" };
  }
  if (!operationNoteValidation.ok) return operationNoteValidation;

  return {
    ok: true as const,
    data: {
      catch_all_forward_to,
      catch_all_mode,
      is_enabled,
      name,
      note,
      operation_note: operationNoteValidation.operation_note,
      provider,
      slug,
    },
    scope: {
      environment_id,
      project_id,
    },
  };
}

function validateDomainAssetBody(body: Record<string, unknown>) {
  const allow_catch_all_sync = body.allow_catch_all_sync !== false;
  const allow_new_mailboxes = body.allow_new_mailboxes !== false;
  const allow_mailbox_route_sync = body.allow_mailbox_route_sync !== false;
  const catch_all_mode = String(body.catch_all_mode || "inherit")
    .trim()
    .toLowerCase() as CatchAllMode;
  const catch_all_forward_to = normalizeEmailAddress(body.catch_all_forward_to);
  const cloudflare_api_token = String(body.cloudflare_api_token || "").trim();
  const cloudflare_api_token_mode = String(
    body.cloudflare_api_token_mode || "global",
  )
    .trim()
    .toLowerCase() as CloudflareApiTokenMode;
  const domain = normalizeDomainValue(body.domain);
  const provider = String(body.provider || "cloudflare")
    .trim()
    .toLowerCase();
  const zone_id = String(body.zone_id || "").trim();
  const email_worker = String(body.email_worker || "").trim();
  const mailbox_route_forward_to = normalizeEmailAddress(
    body.mailbox_route_forward_to,
  );
  const note = String(body.note || "").trim();
  const operationNoteValidation = readAuditOperationNote(body);
  const project_id = parseOptionalId(body.project_id);
  const environment_id = parseOptionalId(body.environment_id);
  const routing_profile_id = parseOptionalId(body.routing_profile_id);
  const is_enabled = body.is_enabled !== false;
  const is_primary = body.is_primary === true;

  if (!domain) return { ok: false as const, error: "domain is required" };
  if (domain.length > DOMAIN_MAX_LENGTH)
    return { ok: false as const, error: "domain is too long" };
  if (!isValidDomainValue(domain))
    return { ok: false as const, error: "domain is invalid" };
  if (!provider) return { ok: false as const, error: "provider is required" };
  const providerDefinition = getDomainProviderDefinition(provider);
  if (!providerDefinition)
    return { ok: false as const, error: "provider is not supported" };
  if (!["inherit", "enabled", "disabled"].includes(catch_all_mode)) {
    return { ok: false as const, error: "invalid catch_all_mode" };
  }
  if (!["global", "domain"].includes(cloudflare_api_token_mode)) {
    return { ok: false as const, error: "invalid cloudflare_api_token_mode" };
  }
  if (zone_id.length > 128)
    return { ok: false as const, error: "zone_id is too long" };
  if (email_worker.length > 128)
    return { ok: false as const, error: "email_worker is too long" };
  if (cloudflare_api_token.length > 2048) {
    return { ok: false as const, error: "cloudflare_api_token is too long" };
  }
  if (mailbox_route_forward_to.length > 320) {
    return {
      ok: false as const,
      error: "mailbox_route_forward_to is too long",
    };
  }
  if (catch_all_forward_to.length > 320) {
    return { ok: false as const, error: "catch_all_forward_to is too long" };
  }
  if (
    mailbox_route_forward_to &&
    !isValidEmailAddress(mailbox_route_forward_to)
  ) {
    return {
      ok: false as const,
      error: "mailbox_route_forward_to must be a valid email address",
    };
  }
  if (catch_all_forward_to && !isValidEmailAddress(catch_all_forward_to)) {
    return {
      ok: false as const,
      error: "catch_all_forward_to must be a valid email address",
    };
  }
  if (!domainProviderSupports(providerDefinition, "zone_id") && zone_id) {
    return {
      ok: false as const,
      error: `${providerDefinition.label} does not support zone_id`,
    };
  }
  if (
    !domainProviderSupports(providerDefinition, "email_worker") &&
    email_worker
  ) {
    return {
      ok: false as const,
      error: `${providerDefinition.label} does not support email_worker`,
    };
  }
  if (
    !domainProviderSupports(providerDefinition, "mailbox_route_sync") &&
    mailbox_route_forward_to
  ) {
    return {
      ok: false as const,
      error: `${providerDefinition.label} does not support mailbox_route_forward_to`,
    };
  }
  if (
    providerDefinition.key !== "cloudflare" &&
    (cloudflare_api_token_mode === "domain" || cloudflare_api_token)
  ) {
    return {
      ok: false as const,
      error: `${providerDefinition.label} does not support cloudflare_api_token override`,
    };
  }
  if (!domainProviderSupports(providerDefinition, "catch_all_policy")) {
    if (catch_all_mode !== "inherit" || catch_all_forward_to) {
      return {
        ok: false as const,
        error: `${providerDefinition.label} does not support catch-all policy management`,
      };
    }
  }
  if (catch_all_mode === "enabled" && !catch_all_forward_to) {
    return {
      ok: false as const,
      error: "catch_all_forward_to is required when catch_all_mode is enabled",
    };
  }
  if (
    routing_profile_id &&
    !domainProviderSupports(providerDefinition, "routing_profile")
  ) {
    return {
      ok: false as const,
      error: `${providerDefinition.label} does not support routing profiles`,
    };
  }
  if (note.length > MAX_WORKSPACE_DESCRIPTION_LENGTH)
    return { ok: false as const, error: "note is too long" };
  if (!operationNoteValidation.ok) return operationNoteValidation;

  return {
    ok: true as const,
    data: {
      allow_catch_all_sync,
      allow_mailbox_route_sync,
      allow_new_mailboxes,
      catch_all_forward_to,
      catch_all_mode,
      cloudflare_api_token,
      cloudflare_api_token_mode,
      domain,
      email_worker,
      is_enabled,
      is_primary,
      mailbox_route_forward_to,
      note,
      operation_note: operationNoteValidation.operation_note,
      provider,
      routing_profile_id,
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
  actor: AuthSession | null,
) {
  const username = String(body.username || "")
    .trim()
    .toLowerCase();
  const display_name = String(body.display_name || "").trim();
  const note = String(body.note || "").trim();
  const operationNoteValidation = readAuditOperationNote(body);
  const password = String(body.password || "");
  const is_enabled = body.is_enabled !== false;
  const scopeValidation = validateAccessScopeInput(body, actor, {
    allowGlobalScope: !actor || !isActorProjectScoped(actor),
  });

  if (isCreate && !username)
    return { ok: false as const, error: "username is required" };
  if (!display_name)
    return { ok: false as const, error: "display_name is required" };
  if (note.length > MAX_WORKSPACE_DESCRIPTION_LENGTH) {
    return { ok: false as const, error: "note is too long" };
  }
  if (!operationNoteValidation.ok) return operationNoteValidation;
  if (!scopeValidation.ok) return scopeValidation;
  const role = normalizeAdminRole(
    body.role ? String(body.role) : "viewer",
    scopeValidation.data.access_scope,
  );
  if (!role) {
    return { ok: false as const, error: "invalid role" };
  }
  if (
    requiresGlobalAdminScope(role, scopeValidation.data.access_scope) &&
    scopeValidation.data.access_scope !== "all"
  ) {
    return {
      ok: false as const,
      error: "platform_admin and owner must keep global scope",
    };
  }
  if (
    requiresBoundAdminScope(role, scopeValidation.data.access_scope) &&
    scopeValidation.data.access_scope !== "bound"
  ) {
    return {
      ok: false as const,
      error: "project_admin must use bound access_scope",
    };
  }
  if (
    actor &&
    isActorProjectScoped(actor) &&
    !["project_admin", "operator", "viewer"].includes(role)
  ) {
    return {
      ok: false as const,
      error:
        "project-scoped admin can only manage project_admin, operator, or viewer roles",
    };
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
        note,
        operation_note: operationNoteValidation.operation_note,
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
      note,
      operation_note: operationNoteValidation.operation_note,
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
  const operationNoteValidation = readAuditOperationNote(body);
  const scopeValidation = validateAccessScopeInput(body, actor, {
    allowGlobalScope: !isActorProjectScoped(actor),
  });
  const events = Array.isArray(body.events)
    ? body.events.map((item) => String(item).trim()).filter(Boolean)
    : String(body.events || "")
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
  const normalizedEvents = normalizeNotificationEventValues(events);
  const alert_config = normalizeNotificationAlertConfig(
    safeParseJson<Record<string, unknown>>(
      typeof body.alert_config === "string"
        ? body.alert_config
        : JSON.stringify(body.alert_config || {}),
      {},
    ) || {},
  );

  if (!name) return { ok: false as const, error: "name is required" };
  if (type !== "webhook")
    return {
      ok: false as const,
      error: "only webhook notifications are supported",
    };
  if (!target || !target.startsWith("http"))
    return { ok: false as const, error: "target must be a valid URL" };
  if (!operationNoteValidation.ok) return operationNoteValidation;
  if (!scopeValidation.ok) return scopeValidation;
  if (events.length === 0)
    return { ok: false as const, error: "at least one event is required" };
  if (normalizedEvents.values.length === 0)
    return {
      ok: false as const,
      error: "at least one valid event is required",
    };
  if (normalizedEvents.invalid.length > 0) {
    return {
      ok: false as const,
      error: `unknown event in notification events: ${normalizedEvents.invalid.join(", ")}`,
    };
  }

  return {
    ok: true as const,
    data: {
      access_scope: scopeValidation.data.access_scope,
      alert_config,
      events: normalizedEvents.values,
      is_enabled,
      name,
      operation_note: operationNoteValidation.operation_note,
      project_ids: scopeValidation.data.project_ids,
      secret,
      target,
      type,
    },
  };
}

function validateApiTokenBody(
  body: Record<string, unknown>,
  actor: AuthSession,
) {
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const is_enabled = body.is_enabled !== false;
  const expires_at = parseNullableTimestamp(body.expires_at);
  const operationNoteValidation = readAuditOperationNote(body);
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
  if (!operationNoteValidation.ok) return operationNoteValidation;
  if (!scopeValidation.ok) return scopeValidation;
  if (permissions.length === 0) {
    return { ok: false as const, error: "at least one permission is required" };
  }
  if (
    permissions.some((permission) => !API_TOKEN_PERMISSION_SET.has(permission))
  ) {
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
      operation_note: operationNoteValidation.operation_note,
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
      parsed.filter(
        (item): item is number =>
          item !== null && Number.isFinite(item) && item > 0,
      ),
    ),
  );
}

function parseNullableHours(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") {
    return { ok: true as const, value: null };
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { ok: false as const, error: `${field} must be a positive integer` };
  }
  if (parsed > MAX_RETENTION_HOURS) {
    return { ok: false as const, error: `${field} is too large` };
  }

  return { ok: true as const, value: parsed };
}

function validateRetentionPolicyBody(body: Record<string, unknown>) {
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
  if (!archiveEmail.ok)
    return { ok: false as const, error: archiveEmail.error };
  if (!mailboxTtl.ok) return { ok: false as const, error: mailboxTtl.error };
  if (!emailRetention.ok)
    return { ok: false as const, error: emailRetention.error };
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

function validateAccessScopeInput(
  body: Record<string, unknown>,
  actor: AuthSession | null,
  options: { allowGlobalScope: boolean },
) {
  const access_scope = String(body.access_scope || "all")
    .trim()
    .toLowerCase();
  const project_ids = parseProjectIdsInput(body.project_ids);

  if (!ACCESS_SCOPE_SET.has(access_scope)) {
    return { ok: false as const, error: "invalid access_scope" };
  }
  if (project_ids.length > MAX_SCOPE_BINDINGS) {
    return { ok: false as const, error: "too many project bindings" };
  }
  if (access_scope === "all") {
    if (!options.allowGlobalScope) {
      return {
        ok: false as const,
        error: "project-scoped resource must use bound access_scope",
      };
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
    return {
      ok: false as const,
      error: "project_ids is required when access_scope is bound",
    };
  }

  if (actor && isActorProjectScoped(actor)) {
    const actorProjectIds = getActorProjectIds(actor);
    if (project_ids.some((projectId) => !actorProjectIds.includes(projectId))) {
      return {
        ok: false as const,
        error: "project binding is outside your scope",
      };
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
