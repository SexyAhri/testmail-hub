import {
  getAvailableDomains,
  getAllDomainAssets,
  getAllDomainAssetsWithSecrets,
  getDomainAssetByName,
  getDomainAssetUsageStats,
  getDomainAssetWithSecretByName,
} from "../../core/db";
import {
  getCloudflareMailboxSyncSnapshotByConfig,
  isCloudflareMailboxRouteConfigConfigured,
  resolveCloudflareMailboxRouteConfig,
} from "../../core/mailbox-sync";
import { domainProviderSupports } from "../../shared/domain-providers";
import type {
  AuthSession,
  CatchAllMode,
  D1Database,
  DomainAssetRecord,
  DomainAssetSecretRecord,
  DomainAssetStatusRecord,
  DomainCatchAllSource,
  DomainRoutingProfileRecord,
  WorkerEnv,
} from "../../server/types";
import {
  isSqliteSchemaError,
  normalizeEmailAddress,
} from "../../utils/utils";
import { canAccessProject, getScopedProjectIds } from "../access-control";
import {
  normalizeDomainValue,
  type ValidatedDomainAssetMutation,
} from "../validation";

export interface DomainWorkspaceScope {
  environment_id: number | null;
  project_id: number | null;
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

export function routingProfileMatchesWorkspace(
  profile: Pick<DomainRoutingProfileRecord, "environment_id" | "project_id">,
  workspace: Pick<DomainAssetRecord, "environment_id" | "project_id">,
): boolean {
  if (profile.project_id === null) return true;
  if (workspace.project_id === null) return false;
  if (profile.project_id !== workspace.project_id) return false;
  if (profile.environment_id === null) return true;
  return workspace.environment_id === profile.environment_id;
}

export function resolveEffectiveDomainCatchAllPolicy(
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

export function domainAllowsMailboxRouteSync(
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

export function domainAllowsCatchAllSync(
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

export function describeActiveMailboxCount(total: number) {
  return `${total} active mailbox${total === 1 ? "" : "es"}`;
}

export async function getDomainActiveMailboxTotal(
  db: D1Database,
  domain: string,
): Promise<number> {
  const usageStats = await getDomainAssetUsageStats(db, [domain]);
  return usageStats[0]?.active_mailbox_total || 0;
}

export function resolveDomainCloudflareApiToken(
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

export interface DomainPoolOptions {
  allowMailboxCreationOnly?: boolean;
}

export async function getDomainPool(
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

export async function getDefaultMailboxDomain(
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

export async function resolveMailboxSyncConfig(
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

export async function getCloudflareDomainConfigs(
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

function isPureCatchAllDomain(
  mode: CatchAllMode,
  expectedMailboxRouteTotal: number,
) {
  return mode === "enabled" && expectedMailboxRouteTotal === 0;
}

export async function listDomainAssetStatusRecords(
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
        const pureCatchAllDomain = isPureCatchAllDomain(
          effectivePolicy.catch_all_mode,
          expectedMailboxRoutes.size,
        );
        let mailbox_route_missing_total = 0;
        let mailbox_route_extra_total = 0;
        if (!pureCatchAllDomain) {
          for (const address of expectedMailboxRoutes) {
            if (!enabledMailboxRoutes.has(address)) {
              mailbox_route_missing_total += 1;
            }
          }
          for (const address of enabledMailboxRoutes) {
            if (!expectedMailboxRoutes.has(address)) {
              mailbox_route_extra_total += 1;
            }
          }
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
            !pureCatchAllDomain &&
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
