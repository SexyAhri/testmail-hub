import { useMemo } from "react";

import {
  domainProviderSupports,
  getDomainProviderDefinition,
  type DomainProviderDefinition,
} from "../../../shared/domain-providers";
import {
  canRepairCatchAllDrift,
  canRepairMailboxRouteDrift,
  isManagedCatchAllPolicy,
  matchesDomainAssetKeyword,
  matchesDomainHealthFilter,
  matchesDomainRoutingProfileKeyword,
  matchesDomainScopeFilter,
  matchesDomainStatusKeyword,
  type DomainHealthFilter,
  type DomainScopeFilter,
} from "../../domain-filters";
import { useTableSelection } from "../../hooks/useTableSelection";
import { canManageProjectResource } from "../../permissions";
import type {
  DomainAssetRecord,
  DomainAssetStatusRecord,
  DomainRoutingProfileRecord,
  SessionPayload,
  WorkspaceCatalog,
} from "../../types";
import {
  CATCH_ALL_MODE_OPTIONS,
  buildDomainMutationPayload,
  buildDomainRankingSeries,
  buildDomainSampleList,
  buildGovernanceBlockedStatusSummary,
  formatMetricValue,
  getProtectedDomainMutationReason,
  profileMatchesDomainScope,
  type DomainStatusFocusCard,
  type DomainTabKey,
} from "./domains-utils";

interface UseDomainsPageViewModelArgs {
  accessibleProjectIds: number[];
  activeTab: DomainTabKey;
  canWriteDomainResources: boolean;
  catalog: WorkspaceCatalog;
  currentUser?: SessionPayload["user"] | null;
  editing: DomainAssetRecord | null;
  environmentFilter?: number;
  healthFilter: DomainHealthFilter;
  isProjectScoped: boolean;
  items: DomainAssetRecord[];
  keyword: string;
  projectFilter?: number;
  providerFilter?: string;
  providers: DomainProviderDefinition[];
  routingProfiles: DomainRoutingProfileRecord[];
  scopeFilter: DomainScopeFilter;
  statusItems: DomainAssetStatusRecord[];
  watchedDomainValue: string;
  watchedEnvironmentId?: number | null;
  watchedIsEnabled: boolean;
  watchedProjectId?: number | null;
  watchedProvider: string;
  watchedRoutingProfileProjectId?: number | null;
  watchedRoutingProfileProvider: string;
}

export function useDomainsPageViewModel({
  accessibleProjectIds,
  activeTab,
  canWriteDomainResources,
  catalog,
  currentUser,
  editing,
  environmentFilter,
  healthFilter,
  isProjectScoped,
  items,
  keyword,
  projectFilter,
  providerFilter,
  providers,
  routingProfiles,
  scopeFilter,
  statusItems,
  watchedDomainValue,
  watchedEnvironmentId,
  watchedIsEnabled,
  watchedProjectId,
  watchedProvider,
  watchedRoutingProfileProjectId,
  watchedRoutingProfileProvider,
}: UseDomainsPageViewModelArgs) {
  const canManageDomainAssetRecord = (record: Pick<DomainAssetRecord, "project_id">) =>
    canManageProjectResource(currentUser, record.project_id);
  const canManageRoutingProfileRecord = (record: Pick<DomainRoutingProfileRecord, "project_id">) =>
    canManageProjectResource(currentUser, record.project_id);

  const assetMap = useMemo(
    () => new Map(items.map(item => [item.domain, item] as const)),
    [items],
  );
  const statusMap = useMemo(
    () => new Map(statusItems.map(item => [item.domain, item] as const)),
    [statusItems],
  );

  const editingActiveMailboxTotal = editing ? (statusMap.get(editing.domain)?.active_mailbox_total || 0) : 0;
  const editingHasActiveMailboxes = Boolean(editing && editingActiveMailboxTotal > 0);
  const editingProtectedReason = editing
    ? getProtectedDomainMutationReason(
        editing,
        buildDomainMutationPayload(editing, {
          domain: watchedDomainValue,
          environment_id: watchedEnvironmentId || null,
          is_enabled: watchedIsEnabled,
          project_id: watchedProjectId || null,
        }),
        editingActiveMailboxTotal,
      )
    : "";

  const visibleProjects = useMemo(
    () => catalog.projects.filter(project => !isProjectScoped || accessibleProjectIds.includes(project.id)),
    [accessibleProjectIds, catalog.projects, isProjectScoped],
  );
  const projectOptions = useMemo(
    () => visibleProjects.map(item => ({
      label: item.is_enabled ? item.name : `${item.name}（已停用）`,
      value: item.id,
    })),
    [visibleProjects],
  );
  const environmentOptions = useMemo(
    () =>
      catalog.environments
        .filter(item => !isProjectScoped || accessibleProjectIds.includes(item.project_id))
        .filter(item => !watchedProjectId || item.project_id === watchedProjectId)
        .map(item => ({
          label: item.is_enabled ? item.name : `${item.name}（已停用）`,
          value: item.id,
        })),
    [accessibleProjectIds, catalog.environments, isProjectScoped, watchedProjectId],
  );
  const routingProfileOptions = useMemo(
    () =>
      routingProfiles
        .filter(item => item.provider === watchedProvider)
        .filter(item => profileMatchesDomainScope(item, watchedProjectId || null, watchedEnvironmentId || null))
        .map(item => ({
          label: item.is_enabled ? item.name : `${item.name}（已停用）`,
          value: item.id,
        })),
    [routingProfiles, watchedEnvironmentId, watchedProjectId, watchedProvider],
  );
  const routingProfileEnvironmentOptions = useMemo(
    () =>
      catalog.environments
        .filter(item => !isProjectScoped || accessibleProjectIds.includes(item.project_id))
        .filter(item => !watchedRoutingProfileProjectId || item.project_id === watchedRoutingProfileProjectId)
        .map(item => ({
          label: item.is_enabled ? item.name : `${item.name}（已停用）`,
          value: item.id,
        })),
    [accessibleProjectIds, catalog.environments, isProjectScoped, watchedRoutingProfileProjectId],
  );

  const providerMap = useMemo(
    () => new Map<string, DomainProviderDefinition>(providers.map(item => [item.key, item])),
    [providers],
  );
  const providerOptions = useMemo(
    () =>
      providers.map(item => ({
        label: item.label,
        value: item.key,
      })),
    [providers],
  );
  const routingProfileProviderOptions = useMemo(
    () =>
      providers
        .filter(item => domainProviderSupports(item, "routing_profile"))
        .map(item => ({
          label: item.label,
          value: item.key,
        })),
    [providers],
  );
  const activeProvider = useMemo(
    () => providerMap.get(watchedProvider) || getDomainProviderDefinition(watchedProvider),
    [providerMap, watchedProvider],
  );
  const activeRoutingProfileProvider = useMemo(
    () =>
      providerMap.get(watchedRoutingProfileProvider)
      || getDomainProviderDefinition(watchedRoutingProfileProvider),
    [providerMap, watchedRoutingProfileProvider],
  );
  const domainCatchAllOptions = useMemo(
    () =>
      domainProviderSupports(activeProvider, "catch_all_policy")
        ? CATCH_ALL_MODE_OPTIONS
        : [CATCH_ALL_MODE_OPTIONS[0]!],
    [activeProvider],
  );
  const filterEnvironmentOptions = useMemo(
    () =>
      catalog.environments
        .filter(item => !projectFilter || item.project_id === projectFilter)
        .map(item => ({
          label: item.is_enabled ? item.name : `${item.name}（已停用）`,
          value: item.id,
        })),
    [catalog.environments, projectFilter],
  );

  const filteredConfigItems = useMemo(
    () =>
      items.filter(item => {
        if (providerFilter && item.provider !== providerFilter) return false;
        if (!matchesDomainScopeFilter(item, scopeFilter)) return false;
        if (projectFilter && item.project_id !== projectFilter) return false;
        if (environmentFilter && item.environment_id !== environmentFilter) return false;
        return matchesDomainAssetKeyword(item, keyword);
      }),
    [environmentFilter, items, keyword, projectFilter, providerFilter, scopeFilter],
  );
  const filteredStatusItems = useMemo(
    () =>
      statusItems.filter(item => {
        const asset = assetMap.get(item.domain);
        const provider = asset?.provider || item.provider;
        if (providerFilter && provider !== providerFilter) return false;
        if (!matchesDomainScopeFilter(asset, scopeFilter)) return false;
        if (projectFilter && asset?.project_id !== projectFilter) return false;
        if (environmentFilter && asset?.environment_id !== environmentFilter) return false;
        if (!matchesDomainStatusKeyword(item, asset, keyword)) return false;
        return matchesDomainHealthFilter(item, asset, healthFilter);
      }),
    [assetMap, environmentFilter, healthFilter, keyword, projectFilter, providerFilter, scopeFilter, statusItems],
  );
  const filteredRoutingProfiles = useMemo(
    () =>
      routingProfiles.filter(item => {
        if (providerFilter && item.provider !== providerFilter) return false;
        if (!matchesDomainScopeFilter(item, scopeFilter)) return false;
        if (projectFilter && item.project_id !== projectFilter) return false;
        if (environmentFilter && item.environment_id !== environmentFilter) return false;
        return matchesDomainRoutingProfileKeyword(item, keyword);
      }),
    [environmentFilter, keyword, projectFilter, providerFilter, routingProfiles, scopeFilter],
  );

  const {
    clearSelection,
    rowSelection,
    selectedItems,
  } = useTableSelection(filteredConfigItems, "id");
  const domainRowSelection = useMemo(
    () => (canWriteDomainResources ? {
      ...rowSelection,
      getCheckboxProps: (record: DomainAssetRecord) => ({
        disabled: !canManageProjectResource(currentUser, record.project_id),
      }),
    } : undefined),
    [canWriteDomainResources, currentUser, rowSelection],
  );

  const visibleRepairableCatchAllDriftItems = useMemo(
    () =>
      filteredStatusItems.filter(item => {
        const asset = assetMap.get(item.domain);
        return Boolean(
          asset
            && canManageProjectResource(currentUser, asset.project_id)
            && canRepairCatchAllDrift(asset, item),
        );
      }),
    [assetMap, currentUser, filteredStatusItems],
  );
  const visibleRepairableMailboxRouteDriftItems = useMemo(
    () =>
      filteredStatusItems.filter(item => {
        const asset = assetMap.get(item.domain);
        return Boolean(
          asset
            && canManageProjectResource(currentUser, asset.project_id)
            && canRepairMailboxRouteDrift(asset, item),
        );
      }),
    [assetMap, currentUser, filteredStatusItems],
  );
  const visibleRepairableSummary = useMemo(() => {
    const domains = new Set<string>();
    for (const item of visibleRepairableCatchAllDriftItems) domains.add(item.domain);
    for (const item of visibleRepairableMailboxRouteDriftItems) domains.add(item.domain);

    return {
      catchAllCount: visibleRepairableCatchAllDriftItems.length,
      items: filteredStatusItems.filter(item => domains.has(item.domain)),
      mailboxRouteCount: visibleRepairableMailboxRouteDriftItems.length,
    };
  }, [filteredStatusItems, visibleRepairableCatchAllDriftItems, visibleRepairableMailboxRouteDriftItems]);
  const governanceBlockedSummary = useMemo(
    () => buildGovernanceBlockedStatusSummary(statusItems, assetMap),
    [assetMap, statusItems],
  );
  const visibleGovernanceBlockedSummary = useMemo(
    () => buildGovernanceBlockedStatusSummary(filteredStatusItems, assetMap),
    [assetMap, filteredStatusItems],
  );

  const visibleConfiguredCount = useMemo(
    () => filteredStatusItems.filter(item => item.cloudflare_configured).length,
    [filteredStatusItems],
  );
  const visibleUnconfiguredCount = useMemo(
    () => filteredStatusItems.filter(item => !item.cloudflare_configured).length,
    [filteredStatusItems],
  );
  const visibleDriftCount = useMemo(
    () => filteredStatusItems.filter(item => item.catch_all_drift).length,
    [filteredStatusItems],
  );
  const visibleRouteDriftCount = useMemo(
    () => filteredStatusItems.filter(item => item.mailbox_route_drift).length,
    [filteredStatusItems],
  );
  const visibleErrorCount = useMemo(
    () => filteredStatusItems.filter(item => Boolean(item.cloudflare_error)).length,
    [filteredStatusItems],
  );
  const visibleHealthyCount = useMemo(
    () =>
      filteredStatusItems.filter(
        item => item.cloudflare_configured && !item.cloudflare_error && !item.catch_all_drift && !item.mailbox_route_drift,
      ).length,
    [filteredStatusItems],
  );

  const statusFocusCards = useMemo<DomainStatusFocusCard[]>(
    () => [
      {
        key: "repairable",
        title: "可自动修复",
        total: visibleRepairableSummary.items.length,
        filter: "repairable",
        severity: "warning",
        description: visibleRepairableSummary.items.length > 0
          ? "这些域名已经具备自动修复条件，可以直接把本地治理策略同步到 Provider。"
          : "当前筛选结果里没有可直接自动修复的域名。",
        domains: buildDomainSampleList(visibleRepairableSummary.items),
        summaryTags: [
          visibleRepairableSummary.catchAllCount > 0
            ? { color: "warning", label: `Catch-all ${visibleRepairableSummary.catchAllCount}` }
            : null,
          visibleRepairableSummary.mailboxRouteCount > 0
            ? { color: "processing", label: `邮箱路由 ${visibleRepairableSummary.mailboxRouteCount}` }
            : null,
        ].filter(Boolean) as DomainStatusFocusCard["summaryTags"],
      },
      {
        key: "governance_blocked",
        title: "治理受阻",
        total: visibleGovernanceBlockedSummary.items.length,
        filter: "governance_blocked",
        severity: "processing",
        description: visibleGovernanceBlockedSummary.items.length > 0
          ? "这些域名存在配置差异，但当前治理规则、域名状态或 Provider 能力不允许直接自动修复。"
          : "当前筛选结果里没有治理受阻的域名。",
        domains: buildDomainSampleList(visibleGovernanceBlockedSummary.items),
        summaryTags: [
          visibleGovernanceBlockedSummary.catchAllCount > 0
            ? { color: "purple", label: `Catch-all ${visibleGovernanceBlockedSummary.catchAllCount}` }
            : null,
          visibleGovernanceBlockedSummary.mailboxRouteCount > 0
            ? { color: "geekblue", label: `邮箱路由 ${visibleGovernanceBlockedSummary.mailboxRouteCount}` }
            : null,
        ].filter(Boolean) as DomainStatusFocusCard["summaryTags"],
      },
      {
        key: "error",
        title: "接入异常",
        total: visibleErrorCount,
        filter: "error",
        severity: "error",
        description: visibleErrorCount > 0
          ? "这些域名无法正常读取 Cloudflare 状态，优先检查 Zone ID、Token 权限和 Email Worker 配置。"
          : "当前筛选结果里没有 Cloudflare 接入异常。",
        domains: buildDomainSampleList(filteredStatusItems.filter(item => Boolean(item.cloudflare_error))),
        summaryTags: visibleErrorCount > 0
          ? [{ color: "error", label: "优先排查 Token / Zone / Worker" }]
          : [],
      },
      {
        key: "unconfigured",
        title: "待补齐接入",
        total: visibleUnconfiguredCount,
        filter: "unconfigured",
        severity: "success",
        description: visibleUnconfiguredCount > 0
          ? "这些域名还没有完整接入 Cloudflare 路由配置，补齐后才能进行状态观测和自动治理。"
          : "当前筛选结果里没有待补齐接入的域名。",
        domains: buildDomainSampleList(filteredStatusItems.filter(item => !item.cloudflare_configured)),
        summaryTags: visibleUnconfiguredCount > 0
          ? [{ color: "default", label: "需要 Zone ID / Token / Worker" }]
          : [],
      },
    ],
    [
      filteredStatusItems,
      visibleErrorCount,
      visibleGovernanceBlockedSummary,
      visibleRepairableSummary,
      visibleUnconfiguredCount,
    ],
  );

  const currentTabResultCount = activeTab === "status"
    ? filteredStatusItems.length
    : activeTab === "config"
      ? filteredConfigItems.length
      : activeTab === "routing-profiles"
        ? filteredRoutingProfiles.length
        : items.length;
  const currentTabTotalCount = activeTab === "status"
    ? statusItems.length
    : activeTab === "config"
      ? items.length
      : activeTab === "routing-profiles"
        ? routingProfiles.length
        : items.length;
  const hasDomainFilters = Boolean(
    keyword.trim()
    || providerFilter
    || projectFilter
    || environmentFilter
    || scopeFilter !== "all"
    || healthFilter !== "all",
  );

  const providerOverviewItems = useMemo(
    () =>
      providers.map(item => ({
        label: item.label,
        value: formatMetricValue(items.filter(domain => domain.provider === item.key).length),
      })),
    [items, providers],
  );
  const enabledCount = useMemo(() => items.filter(item => item.is_enabled).length, [items]);
  const configuredCount = useMemo(
    () => statusItems.filter(item => item.cloudflare_configured).length,
    [statusItems],
  );
  const boundCount = useMemo(
    () => items.filter(item => item.project_id !== null).length,
    [items],
  );
  const driftCount = useMemo(
    () => statusItems.filter(item => item.catch_all_drift).length,
    [statusItems],
  );
  const routeDriftCount = useMemo(
    () => statusItems.filter(item => item.mailbox_route_drift).length,
    [statusItems],
  );
  const errorCount = useMemo(
    () => statusItems.filter(item => Boolean(item.cloudflare_error)).length,
    [statusItems],
  );
  const governanceBlockedCount = governanceBlockedSummary.items.length;
  const healthyCount = useMemo(
    () =>
      statusItems.filter(
        item => item.cloudflare_configured && !item.cloudflare_error && !item.catch_all_drift && !item.mailbox_route_drift,
      ).length,
    [statusItems],
  );
  const primaryCount = useMemo(() => items.filter(item => item.is_primary).length, [items]);
  const globalCount = useMemo(
    () => items.filter(item => item.project_id === null).length,
    [items],
  );
  const projectBoundCount = useMemo(
    () => items.filter(item => item.project_id !== null && item.environment_id === null).length,
    [items],
  );
  const environmentBoundCount = useMemo(
    () => items.filter(item => item.environment_id !== null).length,
    [items],
  );
  const managedCatchAllCount = useMemo(
    () => items.filter(item => isManagedCatchAllPolicy(item)).length,
    [items],
  );
  const mailboxCreationEnabledCount = useMemo(
    () => items.filter(item => item.allow_new_mailboxes).length,
    [items],
  );
  const mailboxRouteSyncEnabledCount = useMemo(
    () =>
      items.filter(
        item => item.allow_mailbox_route_sync && domainProviderSupports(item.provider, "mailbox_route_sync"),
      ).length,
    [items],
  );
  const actualCatchAllEnabledCount = useMemo(
    () => statusItems.filter(item => item.catch_all_enabled).length,
    [statusItems],
  );
  const totalManagedMailboxes = useMemo(
    () => statusItems.reduce((sum, item) => sum + item.active_mailbox_total, 0),
    [statusItems],
  );
  const totalObservedMailboxes = useMemo(
    () => statusItems.reduce((sum, item) => sum + item.observed_mailbox_total, 0),
    [statusItems],
  );
  const totalEmails = useMemo(
    () => statusItems.reduce((sum, item) => sum + item.email_total, 0),
    [statusItems],
  );
  const totalRoutes = useMemo(
    () => statusItems.reduce((sum, item) => sum + item.cloudflare_routes_total, 0),
    [statusItems],
  );
  const totalEnabledMailboxRoutes = useMemo(
    () => statusItems.reduce((sum, item) => sum + item.mailbox_route_enabled_total, 0),
    [statusItems],
  );
  const totalExpectedMailboxRoutes = useMemo(
    () => statusItems.reduce((sum, item) => sum + item.mailbox_route_expected_total, 0),
    [statusItems],
  );
  const emailVolumeChartData = useMemo(
    () => buildDomainRankingSeries(statusItems, item => item.email_total),
    [statusItems],
  );
  const managedMailboxChartData = useMemo(
    () => buildDomainRankingSeries(statusItems, item => item.active_mailbox_total),
    [statusItems],
  );
  const routeCoverageChartData = useMemo(
    () => buildDomainRankingSeries(statusItems, item => item.cloudflare_routes_total),
    [statusItems],
  );
  const assetOverviewItems = useMemo(
    () => [
      { label: "主域名", value: formatMetricValue(primaryCount) },
      { label: "未绑定工作空间", value: formatMetricValue(globalCount) },
      { label: "项目级绑定", value: formatMetricValue(projectBoundCount) },
      { label: "环境级绑定", value: formatMetricValue(environmentBoundCount) },
      { label: "已绑定工作空间", value: formatMetricValue(boundCount) },
      { label: "本地托管 Catch-all", value: formatMetricValue(managedCatchAllCount) },
      { label: "允许新建邮箱", value: formatMetricValue(mailboxCreationEnabledCount) },
      { label: "允许路由同步", value: formatMetricValue(mailboxRouteSyncEnabledCount) },
    ],
    [
      boundCount,
      environmentBoundCount,
      globalCount,
      mailboxCreationEnabledCount,
      mailboxRouteSyncEnabledCount,
      managedCatchAllCount,
      primaryCount,
      projectBoundCount,
    ],
  );
  const cloudflareHealthOverviewItems = useMemo(
    () => [
      { label: "Cloudflare 已接入", value: formatMetricValue(configuredCount) },
      { label: "健康域名", value: formatMetricValue(healthyCount) },
      { label: "异常域名", value: formatMetricValue(errorCount) },
      { label: "治理受阻", value: formatMetricValue(governanceBlockedCount) },
      { label: "实际启用 Catch-all", value: formatMetricValue(actualCatchAllEnabledCount) },
    ],
    [
      actualCatchAllEnabledCount,
      configuredCount,
      errorCount,
      governanceBlockedCount,
      healthyCount,
    ],
  );
  const cloudflareRoutingOverviewItems = useMemo(
    () => [
      { label: "Cloudflare 路由", value: formatMetricValue(totalRoutes) },
      { label: "启用邮箱路由", value: formatMetricValue(totalEnabledMailboxRoutes) },
      { label: "托管目标路由", value: formatMetricValue(totalExpectedMailboxRoutes) },
      { label: "路由漂移域名", value: formatMetricValue(routeDriftCount) },
      { label: "观测邮箱", value: formatMetricValue(totalObservedMailboxes) },
      { label: "收件总量", value: formatMetricValue(totalEmails) },
    ],
    [
      routeDriftCount,
      totalEmails,
      totalEnabledMailboxRoutes,
      totalExpectedMailboxRoutes,
      totalObservedMailboxes,
      totalRoutes,
    ],
  );

  return {
    activeProvider,
    activeRoutingProfileProvider,
    assetMap,
    assetOverviewItems,
    canManageDomainAssetRecord,
    canManageRoutingProfileRecord,
    clearSelection,
    cloudflareHealthOverviewItems,
    cloudflareRoutingOverviewItems,
    configuredCount,
    currentTabResultCount,
    currentTabTotalCount,
    domainCatchAllOptions,
    domainRowSelection,
    driftCount,
    editingHasActiveMailboxes,
    editingProtectedReason,
    emailVolumeChartData,
    enabledCount,
    environmentOptions,
    errorCount,
    filterEnvironmentOptions,
    filteredConfigItems,
    filteredRoutingProfiles,
    filteredStatusItems,
    governanceBlockedCount,
    hasDomainFilters,
    healthyCount,
    managedMailboxChartData,
    projectOptions,
    providerMap,
    providerOptions,
    providerOverviewItems,
    routeCoverageChartData,
    routeDriftCount,
    routingProfileEnvironmentOptions,
    routingProfileOptions,
    routingProfileProviderOptions,
    selectedItems,
    statusFocusCards,
    statusMap,
    totalManagedMailboxes,
    totalObservedMailboxes,
    visibleConfiguredCount,
    visibleDriftCount,
    visibleErrorCount,
    visibleGovernanceBlockedSummary,
    visibleHealthyCount,
    visibleRepairableCatchAllDriftItems,
    visibleRepairableMailboxRouteDriftItems,
    visibleRouteDriftCount,
  };
}
