import { domainProviderSupports } from "../shared/domain-providers";
import type {
  DomainAssetRecord,
  DomainAssetStatusRecord,
  DomainRoutingProfileRecord,
} from "./types";

export type DomainScopeFilter = "all" | "environment" | "global" | "project";
export type DomainHealthFilter =
  | "all"
  | "catch_all_drift"
  | "error"
  | "governance_blocked"
  | "healthy"
  | "issues"
  | "mailbox_route_drift"
  | "repairable"
  | "unconfigured";

type CatchAllPolicyRecord = Pick<
  DomainAssetRecord,
  | "catch_all_forward_to"
  | "catch_all_mode"
  | "routing_profile_catch_all_forward_to"
  | "routing_profile_catch_all_mode"
  | "routing_profile_enabled"
  | "routing_profile_id"
>;

export function resolveEffectiveCatchAllPolicy(record: CatchAllPolicyRecord) {
  if (record.catch_all_mode !== "inherit") {
    return {
      catch_all_forward_to: record.catch_all_forward_to,
      catch_all_mode: record.catch_all_mode,
      source: "domain" as const,
    };
  }

  if (record.routing_profile_id && record.routing_profile_enabled && record.routing_profile_catch_all_mode !== "inherit") {
    return {
      catch_all_forward_to: record.routing_profile_catch_all_forward_to,
      catch_all_mode: record.routing_profile_catch_all_mode,
      source: "routing_profile" as const,
    };
  }

  return {
    catch_all_forward_to: "",
    catch_all_mode: "inherit" as const,
    source: "inherit" as const,
  };
}

export function isManagedCatchAllPolicy(record: CatchAllPolicyRecord) {
  return resolveEffectiveCatchAllPolicy(record).catch_all_mode !== "inherit";
}

export function canSyncCatchAll(
  record: Pick<
    DomainAssetRecord,
    | "allow_catch_all_sync"
    | "catch_all_forward_to"
    | "catch_all_mode"
    | "is_enabled"
    | "provider"
    | "routing_profile_catch_all_forward_to"
    | "routing_profile_catch_all_mode"
    | "routing_profile_enabled"
    | "routing_profile_id"
  >,
) {
  return record.is_enabled
    && record.allow_catch_all_sync
    && domainProviderSupports(record.provider, "catch_all_sync")
    && isManagedCatchAllPolicy(record);
}

export function canSyncMailboxRoutes(
  record: Pick<DomainAssetRecord, "allow_mailbox_route_sync" | "is_enabled" | "provider">,
) {
  return record.is_enabled
    && record.allow_mailbox_route_sync
    && domainProviderSupports(record.provider, "mailbox_route_sync");
}

export function canRepairCatchAllDrift(
  asset: Pick<
    DomainAssetRecord,
    | "allow_catch_all_sync"
    | "catch_all_forward_to"
    | "catch_all_mode"
    | "is_enabled"
    | "provider"
    | "routing_profile_catch_all_forward_to"
    | "routing_profile_catch_all_mode"
    | "routing_profile_enabled"
    | "routing_profile_id"
  > | null | undefined,
  record: Pick<DomainAssetStatusRecord, "catch_all_drift" | "cloudflare_configured" | "cloudflare_error">,
) {
  return Boolean(
    asset
      && canSyncCatchAll(asset)
      && record.catch_all_drift
      && !record.cloudflare_error
      && record.cloudflare_configured,
  );
}

export function canRepairMailboxRouteDrift(
  asset: Pick<DomainAssetRecord, "allow_mailbox_route_sync" | "is_enabled" | "provider"> | null | undefined,
  record: Pick<
    DomainAssetStatusRecord,
    "cloudflare_configured" | "cloudflare_error" | "mailbox_route_drift" | "mailbox_route_extra_total" | "mailbox_route_missing_total"
  >,
) {
  return Boolean(
    asset
      && canSyncMailboxRoutes(asset)
      && hasMailboxRouteMismatch(record)
      && !record.cloudflare_error
      && record.cloudflare_configured,
  );
}

export function hasMailboxRouteMismatch(
  record: Pick<DomainAssetStatusRecord, "mailbox_route_drift" | "mailbox_route_extra_total" | "mailbox_route_missing_total">,
) {
  return record.mailbox_route_drift || record.mailbox_route_missing_total > 0 || record.mailbox_route_extra_total > 0;
}

export function isGovernanceBlockedDomainStatus(
  asset: Pick<
    DomainAssetRecord,
    | "allow_catch_all_sync"
    | "allow_mailbox_route_sync"
    | "catch_all_forward_to"
    | "catch_all_mode"
    | "is_enabled"
    | "provider"
    | "routing_profile_catch_all_forward_to"
    | "routing_profile_catch_all_mode"
    | "routing_profile_enabled"
    | "routing_profile_id"
  > | null | undefined,
  record: Pick<
    DomainAssetStatusRecord,
    | "catch_all_drift"
    | "cloudflare_configured"
    | "cloudflare_error"
    | "mailbox_route_drift"
    | "mailbox_route_extra_total"
    | "mailbox_route_missing_total"
  >,
) {
  if (!asset || !record.cloudflare_configured || Boolean(record.cloudflare_error)) return false;

  const catchAllBlocked = record.catch_all_drift && !canRepairCatchAllDrift(asset, record);
  const mailboxRouteBlocked = hasMailboxRouteMismatch(record) && !canRepairMailboxRouteDrift(asset, record);

  return catchAllBlocked || mailboxRouteBlocked;
}

export function matchesDomainScopeFilter(
  record:
    | Pick<DomainAssetRecord, "environment_id" | "project_id">
    | Pick<DomainRoutingProfileRecord, "environment_id" | "project_id">
    | null
    | undefined,
  scopeFilter: DomainScopeFilter,
) {
  if (scopeFilter === "all") return true;
  if (!record) return scopeFilter === "global";
  if (scopeFilter === "global") return !record.project_id;
  if (scopeFilter === "project") return Boolean(record.project_id && !record.environment_id);
  return Boolean(record.environment_id);
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().toLowerCase();
}

function containsKeyword(values: Array<string | number | null | undefined>, keyword: string) {
  const normalizedKeyword = normalizeKeyword(keyword);
  if (!normalizedKeyword) return true;

  return values.some(value =>
    String(value || "")
      .trim()
      .toLowerCase()
      .includes(normalizedKeyword),
  );
}

export function matchesDomainAssetKeyword(
  record: Pick<
    DomainAssetRecord,
    "domain" | "environment_name" | "mailbox_route_forward_to" | "note" | "project_name" | "provider" | "routing_profile_name" | "zone_id"
  >,
  keyword: string,
) {
  return containsKeyword(
    [
      record.domain,
      record.provider,
      record.project_name,
      record.environment_name,
      record.note,
      record.zone_id,
      record.mailbox_route_forward_to,
      record.routing_profile_name,
    ],
    keyword,
  );
}

export function matchesDomainStatusKeyword(
  record: Pick<
    DomainAssetStatusRecord,
    | "catch_all_forward_to"
    | "catch_all_forward_to_actual"
    | "cloudflare_error"
    | "domain"
    | "provider"
    | "routing_profile_name"
  >,
  asset:
    | Pick<DomainAssetRecord, "environment_name" | "mailbox_route_forward_to" | "note" | "project_name" | "provider">
    | null
    | undefined,
  keyword: string,
) {
  return containsKeyword(
    [
      record.domain,
      asset?.provider || record.provider,
      asset?.project_name,
      asset?.environment_name,
      asset?.note,
      asset?.mailbox_route_forward_to,
      record.routing_profile_name,
      record.catch_all_forward_to,
      record.catch_all_forward_to_actual,
      record.cloudflare_error,
    ],
    keyword,
  );
}

export function matchesDomainRoutingProfileKeyword(
  record: Pick<
    DomainRoutingProfileRecord,
    "environment_name" | "name" | "note" | "project_name" | "provider" | "slug"
  >,
  keyword: string,
) {
  return containsKeyword(
    [
      record.name,
      record.slug,
      record.provider,
      record.project_name,
      record.environment_name,
      record.note,
    ],
    keyword,
  );
}

export function matchesDomainHealthFilter(
  record: Pick<
    DomainAssetStatusRecord,
    | "catch_all_drift"
    | "cloudflare_configured"
    | "cloudflare_error"
    | "mailbox_route_drift"
    | "mailbox_route_extra_total"
    | "mailbox_route_missing_total"
  >,
  asset:
    | Pick<
        DomainAssetRecord,
        | "allow_catch_all_sync"
        | "allow_mailbox_route_sync"
        | "catch_all_forward_to"
        | "catch_all_mode"
        | "is_enabled"
        | "provider"
        | "routing_profile_catch_all_forward_to"
        | "routing_profile_catch_all_mode"
        | "routing_profile_enabled"
        | "routing_profile_id"
      >
    | null
    | undefined,
  healthFilter: DomainHealthFilter,
) {
  if (healthFilter === "all") return true;
  if (healthFilter === "healthy") {
    return record.cloudflare_configured && !record.cloudflare_error && !record.catch_all_drift && !record.mailbox_route_drift;
  }
  if (healthFilter === "issues") {
    return !record.cloudflare_configured || Boolean(record.cloudflare_error) || record.catch_all_drift || record.mailbox_route_drift;
  }
  if (healthFilter === "error") return Boolean(record.cloudflare_error);
  if (healthFilter === "unconfigured") return !record.cloudflare_configured;
  if (healthFilter === "catch_all_drift") return record.catch_all_drift;
  if (healthFilter === "mailbox_route_drift") return record.mailbox_route_drift;
  if (healthFilter === "governance_blocked") return isGovernanceBlockedDomainStatus(asset, record);
  return canRepairCatchAllDrift(asset, record) || canRepairMailboxRouteDrift(asset, record);
}
