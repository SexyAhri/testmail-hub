import { Space, Tag } from "antd";

import {
  domainProviderSupports,
  getDomainProviderDefinition,
  type DomainProviderCapability,
  type DomainProviderDefinition,
} from "../../../shared/domain-providers";
import {
  canRepairCatchAllDrift,
  canRepairMailboxRouteDrift,
  hasMailboxRouteMismatch,
  isPureCatchAllDomainStatus,
  isGovernanceBlockedDomainStatus,
  resolveEffectiveCatchAllPolicy,
  type DomainHealthFilter,
  type DomainScopeFilter,
} from "../../domain-filters";
import type { MetricChartDatum } from "../../components";
import type {
  CatchAllMode,
  DomainAssetRecord,
  DomainAssetStatusRecord,
  DomainMutationPayload,
  DomainRoutingProfileMutationPayload,
  DomainRoutingProfileRecord,
  WorkspaceCatalog,
} from "../../types";
import type { DomainHierarchyEntry } from "./domain-hierarchy";

export type DomainTabKey = "config" | "overview" | "routing-profiles" | "status";

export interface DomainStatusSummary {
  catchAllCount: number;
  items: DomainAssetStatusRecord[];
  mailboxRouteCount: number;
}

export interface DomainStatusFocusCard {
  description: string;
  domains: string[];
  filter: DomainHealthFilter;
  key: "error" | "governance_blocked" | "repairable" | "unconfigured";
  severity: "error" | "processing" | "success" | "warning";
  summaryTags: Array<{ color?: string; label: string }>;
  title: string;
  total: number;
}

export const EMPTY_CATALOG: WorkspaceCatalog = {
  environments: [],
  mailbox_pools: [],
  projects: [],
};

export const INITIAL_VALUES: DomainMutationPayload = {
  allow_catch_all_sync: true,
  allow_mailbox_route_sync: true,
  allow_new_mailboxes: true,
  catch_all_forward_to: "",
  catch_all_mode: "inherit",
  cloudflare_api_token: "",
  cloudflare_api_token_mode: "global",
  domain: "",
  email_worker: "",
  environment_id: undefined,
  is_enabled: true,
  is_primary: false,
  mailbox_route_forward_to: "",
  note: "",
  operation_note: "",
  project_id: undefined,
  provider: "cloudflare",
  routing_profile_id: undefined,
  zone_id: "",
};

export const INITIAL_PROFILE_VALUES: DomainRoutingProfileMutationPayload = {
  catch_all_forward_to: "",
  catch_all_mode: "inherit",
  environment_id: undefined,
  is_enabled: true,
  name: "",
  note: "",
  operation_note: "",
  project_id: undefined,
  provider: "cloudflare",
  slug: "",
};

export const CATCH_ALL_MODE_OPTIONS: Array<{ label: string; value: CatchAllMode }> = [
  { label: "跟随当前 Cloudflare 配置", value: "inherit" },
  { label: "启用并转发", value: "enabled" },
  { label: "强制关闭", value: "disabled" },
];

export const DOMAIN_SCOPE_FILTER_OPTIONS: Array<{ label: string; value: DomainScopeFilter }> = [
  { label: "全部范围", value: "all" },
  { label: "未绑定工作空间", value: "global" },
  { label: "仅项目级", value: "project" },
  { label: "仅环境级", value: "environment" },
];

export const DOMAIN_HEALTH_FILTER_OPTIONS: Array<{ label: string; value: DomainHealthFilter }> = [
  { label: "全部状态", value: "all" },
  { label: "仅异常/待处理", value: "issues" },
  { label: "仅可修复", value: "repairable" },
  { label: "治理受阻", value: "governance_blocked" },
  { label: "Catch-all 漂移", value: "catch_all_drift" },
  { label: "邮箱路由漂移", value: "mailbox_route_drift" },
  { label: "接入异常", value: "error" },
  { label: "未接入", value: "unconfigured" },
  { label: "健康", value: "healthy" },
];

export const CLOUDFLARE_TOKEN_MODE_OPTIONS: Array<{
  label: string;
  value: NonNullable<DomainMutationPayload["cloudflare_api_token_mode"]>;
}> = [
  { label: "使用全局令牌", value: "global" },
  { label: "使用域名独立令牌", value: "domain" },
];

export const PROVIDER_CAPABILITY_LABELS: Record<DomainProviderCapability, string> = {
  catch_all_policy: "Catch-all 策略",
  catch_all_sync: "Catch-all 同步",
  email_worker: "邮件 Worker",
  mailbox_route_sync: "路由同步",
  routing_profile: "路由策略",
  status_read: "状态观测",
  zone_id: "区域 ID",
};

export function renderCatchAllModeTokens(mode: CatchAllMode, forwardTo: string) {
  if (mode === "inherit") {
    return [<Tag key="mode">继承现状</Tag>];
  }

  if (mode === "disabled") {
    return [<Tag key="mode" color="red">强制关闭</Tag>];
  }

  return [
    <Tag key="mode" color="processing">
      启用转发
    </Tag>,
    <span key="forward_to" style={{ fontFamily: "monospace", fontSize: 12 }}>
      {forwardTo || "-"}
    </span>,
  ];
}

export function renderEffectiveCatchAllPolicy(
  record: Pick<
    DomainAssetRecord,
    | "catch_all_forward_to"
    | "catch_all_mode"
    | "routing_profile_catch_all_forward_to"
    | "routing_profile_catch_all_mode"
    | "routing_profile_enabled"
    | "routing_profile_id"
    | "routing_profile_name"
  >,
) {
  const effective = resolveEffectiveCatchAllPolicy(record);

  if (effective.source === "inherit") {
    return <Tag>继承现状</Tag>;
  }

  if (effective.source === "routing_profile") {
    return (
      <Space size={[4, 4]} wrap>
        <Tag color="blue">路由策略</Tag>
        <Tag>{record.routing_profile_name || `策略 #${record.routing_profile_id}`}</Tag>
        {renderCatchAllModeTokens(effective.catch_all_mode, effective.catch_all_forward_to)}
      </Space>
    );
  }

  return (
    <Space size={[4, 4]} wrap>
      <Tag color="geekblue">域名直配</Tag>
      {renderCatchAllModeTokens(effective.catch_all_mode, effective.catch_all_forward_to)}
    </Space>
  );
}

export function renderRoutingProfileBinding(
  record: Pick<
    DomainAssetRecord,
    "routing_profile_id" | "routing_profile_name" | "routing_profile_enabled" | "routing_profile_slug"
  >,
) {
  if (!record.routing_profile_id) return <Tag>未绑定</Tag>;

  return (
    <Space size={[4, 4]} wrap>
      <Tag color={record.routing_profile_enabled ? "processing" : "default"}>
        {record.routing_profile_name || `策略 #${record.routing_profile_id}`}
      </Tag>
      {record.routing_profile_slug ? (
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>{record.routing_profile_slug}</span>
      ) : null}
    </Space>
  );
}

export function renderProviderBadge(
  provider: string,
  providers?: Map<string, DomainProviderDefinition>,
) {
  const definition = providers?.get(provider) || getDomainProviderDefinition(provider);
  if (!definition) return <Tag>{provider || "未知服务商"}</Tag>;

  return (
    <Space size={[4, 4]} wrap>
      <Tag color={provider === "cloudflare" ? "processing" : "default"}>{definition.label}</Tag>
    </Space>
  );
}

export function renderDomainHierarchy(entry?: DomainHierarchyEntry | null) {
  if (!entry) {
    return <Tag>独立域名</Tag>;
  }

  const levelColor = entry.depth === 0 ? "blue" : entry.depth === 1 ? "processing" : "purple";
  const levelLabel = entry.depth === 0 ? "根域名" : `第 ${entry.depth} 层子域名`;
  const detailParts = entry.parentDomain
    ? [`父域名 ${entry.parentDomain}`]
    : [`根分组 ${entry.rootDomain}`];

  if (entry.parentDomain && entry.rootDomain !== entry.parentDomain) {
    detailParts.push(`根域名 ${entry.rootDomain}`);
  }

  if (entry.directChildCount > 0) {
    detailParts.push(`直接子域名 ${entry.directChildCount}`);
  }

  return (
    <Space direction="vertical" size={0}>
      <Space size={[4, 4]} wrap>
        <Tag color={levelColor}>{levelLabel}</Tag>
        {entry.totalDescendantCount > entry.directChildCount ? (
          <Tag color="geekblue">{`全部后代 ${entry.totalDescendantCount}`}</Tag>
        ) : null}
      </Space>
      <span style={{ color: "#595959", fontFamily: "monospace", fontSize: 12 }}>
        {detailParts.join(" · ")}
      </span>
    </Space>
  );
}

export function renderDomainGovernance(
  record: Pick<DomainAssetRecord, "allow_catch_all_sync" | "allow_mailbox_route_sync" | "allow_new_mailboxes" | "provider">,
) {
  const providerSupportsCatchAllSync = domainProviderSupports(record.provider, "catch_all_sync");
  const providerSupportsRouteSync = domainProviderSupports(record.provider, "mailbox_route_sync");

  return (
    <Space size={[4, 4]} wrap>
      <Tag color={record.allow_new_mailboxes ? "success" : "default"}>
        {record.allow_new_mailboxes ? "允许新建邮箱" : "仅保留存量邮箱"}
      </Tag>
      <Tag color={record.allow_catch_all_sync && providerSupportsCatchAllSync ? "purple" : "default"}>
        {!providerSupportsCatchAllSync
          ? "无 Catch-all 同步能力"
          : record.allow_catch_all_sync
            ? "允许 Catch-all 同步"
            : "关闭 Catch-all 同步"}
      </Tag>
      <Tag color={record.allow_mailbox_route_sync && providerSupportsRouteSync ? "processing" : "default"}>
        {!providerSupportsRouteSync
          ? "无路由同步能力"
          : record.allow_mailbox_route_sync
            ? "允许路由同步"
            : "关闭路由同步"}
      </Tag>
    </Space>
  );
}

export function renderActualCatchAllStatus(record: DomainAssetStatusRecord) {
  return (
    <Space size={[4, 4]} wrap>
      <Tag color={record.catch_all_enabled ? "success" : "default"}>
        {record.catch_all_enabled ? "已启用" : "未启用"}
      </Tag>
      {record.catch_all_forward_to_actual ? (
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>
          {record.catch_all_forward_to_actual}
        </span>
      ) : (
        <span style={{ color: "#999" }}>-</span>
      )}
    </Space>
  );
}

export function renderMailboxRouteStatus(record: DomainAssetStatusRecord) {
  if (record.cloudflare_error) return <Tag color="error">异常</Tag>;
  if (!record.cloudflare_configured) return <Tag>未接入</Tag>;
  if (isPureCatchAllDomainStatus(record)) return <Tag color="cyan">纯 Catch-all</Tag>;
  if (record.mailbox_route_drift) {
    return (
      <Space size={[4, 4]} wrap>
        {record.mailbox_route_missing_total > 0 ? <Tag color="warning">缺失 {record.mailbox_route_missing_total}</Tag> : null}
        {record.mailbox_route_extra_total > 0 ? <Tag color="gold">冗余 {record.mailbox_route_extra_total}</Tag> : null}
      </Space>
    );
  }
  if (record.mailbox_route_expected_total === 0 && record.mailbox_route_enabled_total === 0) {
    return <Tag>无托管路由</Tag>;
  }
  return <Tag color="success">已对齐</Tag>;
}

export function renderWorkspaceScope(
  record: Pick<
    DomainAssetRecord | DomainRoutingProfileRecord,
    "environment_id" | "environment_name" | "project_id" | "project_name"
  >,
) {
  if (!record.project_id) {
    return <Tag>未绑定工作空间</Tag>;
  }

  return (
    <Space size={[4, 4]} wrap>
      <Tag color="blue">{record.project_name || `项目 #${record.project_id}`}</Tag>
      {record.environment_id ? (
        <Tag color="cyan">{record.environment_name || `环境 #${record.environment_id}`}</Tag>
      ) : (
        <Tag>仅项目</Tag>
      )}
    </Space>
  );
}

export function profileMatchesDomainScope(
  profile: Pick<DomainRoutingProfileRecord, "environment_id" | "project_id">,
  projectId?: number | null,
  environmentId?: number | null,
) {
  if (!profile.project_id) return true;
  if (!projectId) return false;
  if (profile.project_id !== projectId) return false;
  if (!profile.environment_id) return true;
  return profile.environment_id === (environmentId || null);
}

export function isFormValidationError(error: unknown) {
  return Boolean(error && typeof error === "object" && "errorFields" in error);
}

export function buildRatio(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

export function formatMetricValue(value: number) {
  return value.toLocaleString("zh-CN");
}

export function shortenLabel(label: string, max = 20) {
  return label.length > max ? `${label.slice(0, max)}...` : label;
}

export function buildDomainRankingSeries(
  records: DomainAssetStatusRecord[],
  valueSelector: (record: DomainAssetStatusRecord) => number,
): MetricChartDatum[] {
  return records
    .map(record => ({ record, value: valueSelector(record) }))
    .filter(item => item.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 6)
    .map(item => ({
      time: shortenLabel(item.record.domain),
      value: item.value,
    }));
}

export function buildGovernanceBlockedStatusSummary(
  records: DomainAssetStatusRecord[],
  assetMap: Map<string, DomainAssetRecord>,
): DomainStatusSummary {
  const items: DomainAssetStatusRecord[] = [];
  let catchAllCount = 0;
  let mailboxRouteCount = 0;

  for (const record of records) {
    const asset = assetMap.get(record.domain);
    if (!isGovernanceBlockedDomainStatus(asset, record)) continue;

    const catchAllBlocked = Boolean(asset && record.catch_all_drift && !canRepairCatchAllDrift(asset, record));
    const mailboxRouteBlocked = Boolean(asset && hasMailboxRouteMismatch(record) && !canRepairMailboxRouteDrift(asset, record));

    items.push(record);
    if (catchAllBlocked) catchAllCount += 1;
    if (mailboxRouteBlocked) mailboxRouteCount += 1;
  }

  return {
    catchAllCount,
    items,
    mailboxRouteCount,
  };
}

export function buildDomainSampleList(records: DomainAssetStatusRecord[], max = 3) {
  return records.slice(0, max).map(record => record.domain);
}

export function getStatusFocusAccentColor(severity: DomainStatusFocusCard["severity"]) {
  if (severity === "error") return "#cf1322";
  if (severity === "processing") return "#1677ff";
  if (severity === "success") return "#389e0d";
  return "#fa8c16";
}

export function buildDomainMutationPayload(
  record: DomainAssetRecord,
  overrides: Partial<DomainMutationPayload> = {},
): DomainMutationPayload {
  return {
    allow_catch_all_sync: record.allow_catch_all_sync,
    allow_mailbox_route_sync: record.allow_mailbox_route_sync,
    allow_new_mailboxes: record.allow_new_mailboxes,
    catch_all_forward_to: record.catch_all_forward_to,
    catch_all_mode: record.catch_all_mode,
    cloudflare_api_token: "",
    cloudflare_api_token_mode: record.cloudflare_api_token_configured ? "domain" : "global",
    domain: record.domain,
    email_worker: record.email_worker,
    environment_id: record.environment_id,
    is_enabled: record.is_enabled,
    is_primary: record.is_primary,
    mailbox_route_forward_to: record.mailbox_route_forward_to,
    note: record.note,
    project_id: record.project_id,
    provider: record.provider,
    routing_profile_id: record.routing_profile_id,
    zone_id: record.zone_id,
    ...overrides,
  };
}

export function normalizeDomainInput(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

export function describeActiveMailboxSummary(total: number) {
  return `当前仍有 ${total} 个活跃邮箱`;
}

export function getProtectedDomainMutationReason(
  existing: DomainAssetRecord | null,
  payload: DomainMutationPayload,
  activeMailboxTotal: number,
) {
  if (!existing || activeMailboxTotal <= 0) return "";

  const existingDomain = normalizeDomainInput(existing.domain);
  const nextDomain = normalizeDomainInput(payload.domain);
  const nextProjectId = payload.project_id || null;
  const nextEnvironmentId = payload.environment_id || null;
  const mailboxSummary = describeActiveMailboxSummary(activeMailboxTotal);

  if (existingDomain !== nextDomain) {
    return `${mailboxSummary}仍绑定在 ${existing.domain}，请先停用或删除这些邮箱，再修改域名值。`;
  }
  if ((existing.project_id || null) !== nextProjectId || (existing.environment_id || null) !== nextEnvironmentId) {
    return `${mailboxSummary}仍绑定在 ${existing.domain}，请先迁移或清理这些邮箱，再调整项目/环境归属。`;
  }
  if (existing.is_enabled && !payload.is_enabled) {
    return `${mailboxSummary}仍使用 ${existing.domain}，请先停用或删除这些邮箱，再停用域名。`;
  }

  return "";
}

export function getProtectedDomainDeleteReason(
  record: Pick<DomainAssetRecord, "domain">,
  activeMailboxTotal: number,
) {
  if (activeMailboxTotal <= 0) return "";
  return `${describeActiveMailboxSummary(activeMailboxTotal)}仍使用 ${record.domain}，请先停用或删除这些邮箱，再删除域名。`;
}
