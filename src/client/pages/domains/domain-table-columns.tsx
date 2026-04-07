import { Button, Space, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";

import { getDomainProviderLabel, domainProviderSupports, type DomainProviderDefinition } from "../../../shared/domain-providers";
import {
  canRepairCatchAllDrift,
  canRepairMailboxRouteDrift,
  canSyncCatchAll,
  canSyncMailboxRoutes,
  isPureCatchAllDomainStatus,
} from "../../domain-filters";
import { ActionButtons } from "../../components";
import type {
  DomainAssetRecord,
  DomainAssetStatusRecord,
  DomainRoutingProfileRecord,
} from "../../types";
import { formatDateTime } from "../../utils";
import {
  renderActualCatchAllStatus,
  renderCatchAllModeTokens,
  renderDomainGovernance,
  renderDomainHierarchy,
  renderEffectiveCatchAllPolicy,
  renderMailboxRouteStatus,
  renderProviderBadge,
  renderRoutingProfileBinding,
  renderWorkspaceScope,
} from "./domains-utils";
import type { DomainHierarchyEntry } from "./domain-hierarchy";

interface BuildDomainStatusColumnsOptions {
  assetMap: Map<string, DomainAssetRecord>;
  canManageDomainAssetRecord: (record: Pick<DomainAssetRecord, "project_id">) => boolean;
  domainHierarchyMap: Map<string, DomainHierarchyEntry>;
  handleSyncCatchAll: (id: number) => void;
  handleSyncMailboxRoutes: (id: number) => void;
  providerMap: Map<string, DomainProviderDefinition>;
  syncing: boolean;
}

interface BuildDomainConfigColumnsOptions {
  canManageDomainAssetRecord: (record: Pick<DomainAssetRecord, "project_id">) => boolean;
  domainHierarchyMap: Map<string, DomainHierarchyEntry>;
  handleDelete: (id: number) => void;
  handleSyncCatchAll: (id: number) => void;
  handleSyncMailboxRoutes: (id: number) => void;
  openEdit: (record: DomainAssetRecord) => void;
  providerMap: Map<string, DomainProviderDefinition>;
  statusMap: Map<string, DomainAssetStatusRecord>;
  syncing: boolean;
  getProtectedDomainDeleteReason: (
    record: Pick<DomainAssetRecord, "domain">,
    activeMailboxTotal: number,
  ) => string;
}

interface BuildRoutingProfileColumnsOptions {
  canManageRoutingProfileRecord: (record: Pick<DomainRoutingProfileRecord, "project_id">) => boolean;
  handleProfileDelete: (id: number) => void;
  openProfileEdit: (record: DomainRoutingProfileRecord) => void;
  providerMap: Map<string, DomainProviderDefinition>;
}

export function buildDomainStatusColumns({
  assetMap,
  canManageDomainAssetRecord,
  domainHierarchyMap,
  handleSyncCatchAll,
  handleSyncMailboxRoutes,
  providerMap,
  syncing,
}: BuildDomainStatusColumnsOptions): ColumnsType<DomainAssetStatusRecord> {
  return [
    {
      title: "域名",
      dataIndex: "domain",
      key: "domain",
      width: 220,
      render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
    },
    {
      title: "层级关系",
      key: "hierarchy",
      width: 240,
      render: (_, record) => renderDomainHierarchy(domainHierarchyMap.get(record.domain)),
    },
    {
      title: "工作空间",
      key: "workspace",
      render: (_, record) => {
        const asset = assetMap.get(record.domain);
        if (!asset) return <Tag color="gold">仅环境变量回退</Tag>;
        return renderWorkspaceScope(asset);
      },
    },
    {
      title: "服务商",
      key: "provider",
      render: (_, record) => {
        const asset = assetMap.get(record.domain);
        if (!asset) return <Tag color="gold">未建档</Tag>;
        return renderProviderBadge(asset.provider, providerMap);
      },
    },
    {
      title: "资产状态",
      key: "asset_status",
      render: (_, record) => {
        const asset = assetMap.get(record.domain);
        if (!asset) {
          return <Tag color="gold">未录入资产</Tag>;
        }

        return (
          <Space size={[4, 4]} wrap>
            <Tag color={asset.is_enabled ? "success" : "default"}>
              {asset.is_enabled ? "启用" : "停用"}
            </Tag>
            {asset.is_primary ? <Tag color="blue">主域名</Tag> : null}
          </Space>
        );
      },
    },
    {
      title: "邮箱资产",
      key: "mailbox_stats",
      render: (_, record) => (
        <Space size={[4, 4]} wrap>
          <Tag color="blue">托管 {record.active_mailbox_total}</Tag>
          <Tag>观测 {record.observed_mailbox_total}</Tag>
          <Tag color="purple">收件 {record.email_total}</Tag>
        </Space>
      ),
    },
    {
      title: "治理规则",
      key: "governance",
      render: (_, record) => {
        const asset = assetMap.get(record.domain);
        if (!asset) return <Tag>仅回退域名</Tag>;
        return renderDomainGovernance(asset);
      },
    },
    {
      title: "当前生效策略",
      key: "catch_all_policy",
      render: (_, record) => {
        const asset = assetMap.get(record.domain);
        if (!asset) return <Tag>仅云端状态</Tag>;
        return renderEffectiveCatchAllPolicy(asset);
      },
    },
    {
      title: "服务商实际状态",
      key: "catch_all_actual",
      render: (_, record) => {
        const asset = assetMap.get(record.domain);
        if (asset && !domainProviderSupports(asset.provider, "status_read")) {
          return <Tag>不支持观测</Tag>;
        }
        return renderActualCatchAllStatus(record);
      },
    },
    {
      title: "Catch-all 状态",
      key: "catch_all_drift",
      render: (_, record) => {
        const asset = assetMap.get(record.domain);
        if (asset && !domainProviderSupports(asset.provider, "catch_all_sync")) return <Tag>手动托管</Tag>;
        if (asset && domainProviderSupports(asset.provider, "catch_all_sync") && !asset.allow_catch_all_sync) {
          return <Tag color="default">治理关闭</Tag>;
        }
        if (record.cloudflare_error) return <Tag color="error">异常</Tag>;
        if (!record.cloudflare_configured) return <Tag>未接入</Tag>;
        if (record.catch_all_drift) return <Tag color="warning">有漂移</Tag>;
        return <Tag color="success">已同步</Tag>;
      },
    },
    {
      title: "邮箱路由状态",
      key: "mailbox_route_drift",
      render: (_, record) => {
        const asset = assetMap.get(record.domain);
        if (asset && !domainProviderSupports(asset.provider, "mailbox_route_sync")) return <Tag>手动托管</Tag>;
        if (asset && domainProviderSupports(asset.provider, "mailbox_route_sync") && !asset.allow_mailbox_route_sync) {
          return <Tag color="default">治理关闭</Tag>;
        }
        return renderMailboxRouteStatus(record);
      },
    },
    {
      title: "路由数",
      key: "cloudflare_routes_total",
      render: (_, record) => (
        <Space size={[4, 4]} wrap>
          <Tag color="blue">启用 {record.mailbox_route_enabled_total}</Tag>
          <Tag>总计 {record.cloudflare_routes_total}</Tag>
          <Tag color="cyan">目标 {record.mailbox_route_expected_total}</Tag>
        </Space>
      ),
    },
    {
      title: "状态说明",
      key: "detail",
      render: (_, record) => {
        const asset = assetMap.get(record.domain);
        if (asset && !domainProviderSupports(asset.provider, "status_read")) {
          return `${getDomainProviderLabel(asset.provider)} 当前只做资产登记与工作空间绑定，不读取实时路由状态。`;
        }

        if (asset && !asset.allow_new_mailboxes) {
          return "当前域名已关闭新建邮箱，仅允许保留和管理存量邮箱。";
        }

        if (asset && domainProviderSupports(asset.provider, "catch_all_sync") && !asset.allow_catch_all_sync) {
          return "当前域名已关闭 Catch-all 同步，本地策略不会主动同步到 Cloudflare。";
        }

        if (asset && domainProviderSupports(asset.provider, "mailbox_route_sync") && !asset.allow_mailbox_route_sync) {
          return "当前域名已关闭自动路由同步，系统不会再自动写入或删除该域名下的邮箱路由。";
        }

        if (record.cloudflare_error) {
          return <Typography.Text type="danger">{record.cloudflare_error}</Typography.Text>;
        }

        if (!record.cloudflare_configured) {
          return "当前域名还没有完整的 Cloudflare Zone / API 令牌 / Worker 配置。";
        }

        if (isPureCatchAllDomainStatus(record)) {
          return "当前域名作为纯 Catch-all 使用，没有显式托管邮箱，因此不校验也不批量治理显式邮箱路由。";
        }

        if (record.mailbox_route_drift) {
          const parts: string[] = [];
          if (record.mailbox_route_missing_total > 0) {
            parts.push(`${record.mailbox_route_missing_total} 个活跃邮箱未在 Cloudflare 中启用路由`);
          }
          if (record.mailbox_route_extra_total > 0) {
            parts.push(`${record.mailbox_route_extra_total} 个启用路由未出现在系统托管邮箱中`);
          }
          return `邮箱路由存在漂移：${parts.join("，")}。`;
        }

        if (record.catch_all_mode === "inherit") {
          return "本地未强制管理 Catch-all，且邮箱路由当前与 Cloudflare 保持一致。";
        }

        if (record.catch_all_source === "routing_profile") {
          if (record.catch_all_drift) {
            return `当前生效策略来自路由策略 ${record.routing_profile_name || "未命名策略"}，但 Catch-all 与 Cloudflare 实际状态存在漂移。`;
          }
          return `当前生效策略来自路由策略 ${record.routing_profile_name || "未命名策略"}。`;
        }

        if (record.catch_all_drift) {
          return "本地 Catch-all 策略与 Cloudflare 实际状态存在漂移，请执行同步。";
        }

        return "本地 Catch-all 与邮箱路由均已和 Cloudflare 保持一致。";
      },
    },
    {
      title: "治理动作",
      key: "action",
      width: 220,
      render: (_, record) => {
        const asset = assetMap.get(record.domain);
        if (!asset) return <Tag>仅监控</Tag>;
        if (!canManageDomainAssetRecord(asset)) return <Tag>只读</Tag>;

        const canRepairCatchAll = canRepairCatchAllDrift(asset, record);
        const canRepairRoutes = canRepairMailboxRouteDrift(asset, record);
        if (!canRepairCatchAll && !canRepairRoutes) return <Tag>无需处理</Tag>;

        return (
          <Space size={[4, 4]} wrap>
            <Button
              type="link"
              size="small"
              onClick={() => handleSyncCatchAll(asset.id)}
              disabled={!canRepairCatchAll}
              loading={syncing}
            >
              修复 Catch-all
            </Button>
            <Button
              type="link"
              size="small"
              onClick={() => handleSyncMailboxRoutes(asset.id)}
              disabled={!canRepairRoutes}
              loading={syncing}
            >
              修复路由
            </Button>
          </Space>
        );
      },
    },
  ];
}

export function buildDomainConfigColumns({
  canManageDomainAssetRecord,
  domainHierarchyMap,
  getProtectedDomainDeleteReason,
  handleDelete,
  handleSyncCatchAll,
  handleSyncMailboxRoutes,
  openEdit,
  providerMap,
  statusMap,
  syncing,
}: BuildDomainConfigColumnsOptions): ColumnsType<DomainAssetRecord> {
  const hierarchyColumn = {
    title: "层级关系",
    key: "hierarchy",
    width: 240,
    render: (_: unknown, record: DomainAssetRecord) => renderDomainHierarchy(domainHierarchyMap.get(record.domain)),
  } satisfies ColumnsType<DomainAssetRecord>[number];

  return [
    {
      title: "域名",
      dataIndex: "domain",
      key: "domain",
      width: 220,
      render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
    },
    hierarchyColumn,
    {
      title: "服务商",
      dataIndex: "provider",
      key: "provider",
      render: value => renderProviderBadge(value, providerMap),
    },
    {
      title: "工作空间",
      key: "workspace",
      render: (_, record) => renderWorkspaceScope(record),
    },
    {
      title: "基础状态",
      key: "status",
      render: (_, record) => (
        <Space size={[4, 4]} wrap>
          <Tag color={record.is_enabled ? "success" : "default"}>
            {record.is_enabled ? "启用" : "停用"}
          </Tag>
          {record.is_primary ? <Tag color="blue">主域名</Tag> : null}
        </Space>
      ),
    },
    {
      title: "治理规则",
      key: "governance",
      render: (_, record) => renderDomainGovernance(record),
    },
    {
      title: "区域 ID",
      dataIndex: "zone_id",
      key: "zone_id",
      render: value =>
        value ? <span style={{ fontFamily: "monospace", fontSize: 12 }}>{value}</span> : "-",
    },
    {
      title: "邮件 Worker",
      dataIndex: "email_worker",
      key: "email_worker",
      render: value =>
        value ? <span style={{ fontFamily: "monospace", fontSize: 12 }}>{value}</span> : "-",
    },
    {
      title: "邮箱路由转发",
      dataIndex: "mailbox_route_forward_to",
      key: "mailbox_route_forward_to",
      render: value =>
        value ? <span style={{ fontFamily: "monospace", fontSize: 12 }}>{value}</span> : "-",
    },
    {
      title: "API 令牌",
      key: "cloudflare_token",
      render: (_, record) => {
        if (record.provider !== "cloudflare") return "-";
        return record.cloudflare_api_token_configured
          ? <Tag color="gold">独立令牌</Tag>
          : <Tag>全局令牌</Tag>;
      },
    },
    {
      title: "路由策略",
      key: "routing_profile",
      render: (_, record) => renderRoutingProfileBinding(record),
    },
    {
      title: "当前生效策略",
      key: "catch_all",
      render: (_, record) => renderEffectiveCatchAllPolicy(record),
    },
    {
      title: "备注",
      dataIndex: "note",
      key: "note",
      render: value => value || "-",
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      key: "action",
      width: 340,
      render: (_, record) => {
        const canManage = canManageDomainAssetRecord(record);
        if (!canManage) {
          return <Tag>只读</Tag>;
        }

        const activeMailboxTotal = statusMap.get(record.domain)?.active_mailbox_total || 0;
        const deleteProtectedReason = getProtectedDomainDeleteReason(record, activeMailboxTotal);

        return (
          <ActionButtons
            onEdit={() => openEdit(record)}
            onDelete={() => handleDelete(record.id)}
            deleteConfirmTitle={deleteProtectedReason || "确认删除该域名吗？"}
            deleteDisabled={Boolean(deleteProtectedReason)}
            deleteTooltip={deleteProtectedReason || undefined}
            extra={(
              <>
                <Button
                  type="link"
                  size="small"
                  onClick={() => handleSyncCatchAll(record.id)}
                  disabled={!canSyncCatchAll(record)}
                  loading={syncing}
                >
                  同步 Catch-all
                </Button>
                <Button
                  type="link"
                  size="small"
                  onClick={() => handleSyncMailboxRoutes(record.id)}
                  disabled={!canSyncMailboxRoutes(record, statusMap.get(record.domain))}
                  loading={syncing}
                >
                  同步路由
                </Button>
              </>
            )}
          />
        );
      },
    },
  ];
}

export function buildRoutingProfileColumns({
  canManageRoutingProfileRecord,
  handleProfileDelete,
  openProfileEdit,
  providerMap,
}: BuildRoutingProfileColumnsOptions): ColumnsType<DomainRoutingProfileRecord> {
  return [
    {
      title: "策略名称",
      dataIndex: "name",
      key: "name",
      width: 220,
    },
    {
      title: "服务商",
      dataIndex: "provider",
      key: "provider",
      render: value => renderProviderBadge(value, providerMap),
    },
    {
      title: "标识",
      dataIndex: "slug",
      key: "slug",
      render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
    },
    {
      title: "工作空间",
      key: "workspace",
      render: (_, record) => renderWorkspaceScope(record),
    },
    {
      title: "Catch-all 策略",
      key: "catch_all",
      render: (_, record) => (
        <Space size={[4, 4]} wrap>
          {renderCatchAllModeTokens(record.catch_all_mode, record.catch_all_forward_to)}
        </Space>
      ),
    },
    {
      title: "已绑定域名",
      dataIndex: "linked_domain_count",
      key: "linked_domain_count",
      width: 110,
    },
    {
      title: "状态",
      key: "status",
      width: 120,
      render: (_, record) => (
        <Tag color={record.is_enabled ? "success" : "default"}>
          {record.is_enabled ? "启用" : "停用"}
        </Tag>
      ),
    },
    {
      title: "备注",
      dataIndex: "note",
      key: "note",
      render: value => value || "-",
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      key: "action",
      width: 140,
      render: (_, record) => {
        if (!canManageRoutingProfileRecord(record)) {
          return <Tag>只读</Tag>;
        }

        return (
          <ActionButtons
            onEdit={() => openProfileEdit(record)}
            onDelete={() => handleProfileDelete(record.id)}
            deleteConfirmTitle={
              record.linked_domain_count > 0
                ? "当前策略仍绑定域名，删除会被拦截。"
                : "确认删除该路由策略吗？"
            }
          />
        );
      },
    },
  ];
}
