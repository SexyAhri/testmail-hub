import {
  CloudServerOutlined,
  GlobalOutlined,
  MailOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { Alert, App, Button, Col, Form, Input, Popconfirm, Row, Select, Space, Switch, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";

import {
  createDomainAsset,
  getDomainAssets,
  getDomainAssetStatuses,
  getWorkspaceCatalog,
  removeDomainAsset,
  syncDomainAssetCatchAll,
  updateDomainAsset,
} from "../api";
import {
  ActionButtons,
  BatchActionsBar,
  DataTable,
  FormDrawer,
  InfoCard,
  MetricCard,
  MetricChart,
  MetricGrid,
  PageHeader,
  type MetricChartDatum,
} from "../components";
import { useTableSelection } from "../hooks/useTableSelection";
import type {
  CatchAllMode,
  DomainAssetRecord,
  DomainAssetStatusRecord,
  DomainMutationPayload,
  WorkspaceCatalog,
} from "../types";
import {
  buildBatchActionMessage,
  formatDateTime,
  loadAllPages,
  normalizeApiError,
  runBatchAction,
} from "../utils";

interface DomainsPageProps {
  onDomainsChanged?: () => Promise<void> | void;
  onUnauthorized: () => void;
}

const EMPTY_CATALOG: WorkspaceCatalog = {
  environments: [],
  mailbox_pools: [],
  projects: [],
};

const INITIAL_VALUES: DomainMutationPayload = {
  catch_all_forward_to: "",
  catch_all_mode: "inherit",
  domain: "",
  email_worker: "",
  environment_id: undefined,
  is_enabled: true,
  is_primary: false,
  note: "",
  project_id: undefined,
  provider: "cloudflare",
  zone_id: "",
};

const CATCH_ALL_MODE_OPTIONS: Array<{ label: string; value: CatchAllMode }> = [
  { label: "跟随当前 Cloudflare 配置", value: "inherit" },
  { label: "启用并转发", value: "enabled" },
  { label: "强制关闭", value: "disabled" },
];

function renderLocalCatchAllPolicy(record: Pick<DomainAssetRecord, "catch_all_forward_to" | "catch_all_mode">) {
  if (record.catch_all_mode === "inherit") {
    return <Tag>继承现状</Tag>;
  }

  if (record.catch_all_mode === "disabled") {
    return <Tag color="red">强制关闭</Tag>;
  }

  return (
    <Space size={[4, 4]} wrap>
      <Tag color="processing">启用转发</Tag>
      <span style={{ fontFamily: "monospace", fontSize: 12 }}>
        {record.catch_all_forward_to || "-"}
      </span>
    </Space>
  );
}

function renderActualCatchAllStatus(record: DomainAssetStatusRecord) {
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

function renderWorkspaceScope(record: Pick<DomainAssetRecord, "environment_id" | "environment_name" | "project_id" | "project_name">) {
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

function isFormValidationError(error: unknown) {
  return Boolean(error && typeof error === "object" && "errorFields" in error);
}

function buildRatio(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function formatMetricValue(value: number) {
  return value.toLocaleString("zh-CN");
}

function shortenLabel(label: string, max = 20) {
  return label.length > max ? `${label.slice(0, max)}...` : label;
}

function buildDomainRankingSeries(
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

export default function DomainsPage({ onDomainsChanged, onUnauthorized }: DomainsPageProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<DomainMutationPayload>();
  const [items, setItems] = useState<DomainAssetRecord[]>([]);
  const [statusItems, setStatusItems] = useState<DomainAssetStatusRecord[]>([]);
  const [catalog, setCatalog] = useState<WorkspaceCatalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<DomainAssetRecord | null>(null);
  const watchedCatchAllMode = Form.useWatch("catch_all_mode", form) || "inherit";
  const watchedProjectId = Form.useWatch("project_id", form);
  const { clearSelection, rowSelection, selectedItems } = useTableSelection(items, "id");

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const currentEnvironmentId = form.getFieldValue("environment_id");
    if (!currentEnvironmentId) return;

    const environmentStillVisible = catalog.environments.some(
      item => item.id === currentEnvironmentId && (!watchedProjectId || item.project_id === watchedProjectId),
    );

    if (!environmentStillVisible) {
      form.setFieldValue("environment_id", undefined);
    }
  }, [catalog.environments, form, watchedProjectId]);

  async function loadData() {
    setLoading(true);
    try {
      const [domainAssets, statuses, workspaceCatalog] = await Promise.all([
        loadAllPages(getDomainAssets),
        getDomainAssetStatuses(),
        getWorkspaceCatalog(true),
      ]);
      setItems(domainAssets);
      setStatusItems(statuses);
      setCatalog(workspaceCatalog);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setLoading(false);
    }
  }

  async function refreshDomains() {
    if (!onDomainsChanged) return;
    await onDomainsChanged();
  }

  async function reloadAll() {
    await Promise.all([loadData(), refreshDomains()]);
  }

  function openCreate() {
    setEditing(null);
    form.setFieldsValue(INITIAL_VALUES);
    setDrawerOpen(true);
  }

  function openEdit(record: DomainAssetRecord) {
    setEditing(record);
    form.setFieldsValue({
      catch_all_forward_to: record.catch_all_forward_to,
      catch_all_mode: record.catch_all_mode,
      domain: record.domain,
      email_worker: record.email_worker,
      environment_id: record.environment_id || undefined,
      is_enabled: record.is_enabled,
      is_primary: record.is_primary,
      note: record.note,
      project_id: record.project_id || undefined,
      provider: record.provider,
      zone_id: record.zone_id,
    });
    setDrawerOpen(true);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const values = await form.validateFields();
      const payload: DomainMutationPayload = {
        catch_all_forward_to: values.catch_all_forward_to.trim(),
        catch_all_mode: values.catch_all_mode,
        domain: values.domain.trim(),
        email_worker: values.email_worker.trim(),
        environment_id: values.environment_id || null,
        is_enabled: values.is_enabled,
        is_primary: values.is_primary,
        note: values.note.trim(),
        project_id: values.project_id || null,
        provider: "cloudflare",
        zone_id: values.zone_id.trim(),
      };

      if (editing) {
        await updateDomainAsset(editing.id, payload);
        message.success("域名资产已更新");
      } else {
        await createDomainAsset(payload);
        message.success("域名资产已创建");
      }

      setDrawerOpen(false);
      await reloadAll();
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      if (!isFormValidationError(error)) {
        message.error(normalizeApiError(error));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await removeDomainAsset(id);
      message.success("域名资产已删除");
      await reloadAll();
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function handleSyncCatchAll(id: number) {
    setSyncing(true);
    try {
      await syncDomainAssetCatchAll(id);
      message.success("Catch-all 策略已同步到 Cloudflare");
      await reloadAll();
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setSyncing(false);
    }
  }

  async function handleBatchToggle(is_enabled: boolean) {
    const result = await runBatchAction(selectedItems, item =>
      updateDomainAsset(item.id, {
        catch_all_forward_to: item.catch_all_forward_to,
        catch_all_mode: item.catch_all_mode,
        domain: item.domain,
        email_worker: item.email_worker,
        environment_id: item.environment_id,
        is_enabled,
        is_primary: item.is_primary,
        note: item.note,
        project_id: item.project_id,
        provider: item.provider,
        zone_id: item.zone_id,
      }),
    );

    if (result.successCount > 0) {
      clearSelection();
      await reloadAll();
    }

    const messageText = buildBatchActionMessage(
      is_enabled ? "批量启用域名" : "批量停用域名",
      result,
    );
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  async function handleBatchSyncCatchAll() {
    const syncableItems = selectedItems.filter(item => item.catch_all_mode !== "inherit");
    if (syncableItems.length === 0) {
      message.info("选中的域名里没有需要同步的 Catch-all 策略");
      return;
    }

    const result = await runBatchAction(syncableItems, item => syncDomainAssetCatchAll(item.id));
    if (result.successCount > 0) {
      clearSelection();
      await reloadAll();
    }

    const messageText = buildBatchActionMessage("批量同步 Catch-all", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  async function handleBatchDelete() {
    const result = await runBatchAction(selectedItems, item => removeDomainAsset(item.id));
    if (result.successCount > 0) {
      clearSelection();
      await reloadAll();
    }

    const messageText = buildBatchActionMessage("批量删除域名", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  const assetMap = useMemo(
    () => new Map(items.map(item => [item.domain, item] as const)),
    [items],
  );

  const projectOptions = useMemo(
    () => catalog.projects.map(item => ({
      label: item.is_enabled ? item.name : `${item.name}（已停用）`,
      value: item.id,
    })),
    [catalog.projects],
  );

  const environmentOptions = useMemo(
    () =>
      catalog.environments
        .filter(item => !watchedProjectId || item.project_id === watchedProjectId)
        .map(item => ({
          label: item.is_enabled ? item.name : `${item.name}（已停用）`,
          value: item.id,
        })),
    [catalog.environments, watchedProjectId],
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
  const errorCount = useMemo(
    () => statusItems.filter(item => Boolean(item.cloudflare_error)).length,
    [statusItems],
  );
  const healthyCount = useMemo(
    () =>
      statusItems.filter(
        item => item.cloudflare_configured && !item.cloudflare_error && !item.catch_all_drift,
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
    () => items.filter(item => item.catch_all_mode !== "inherit").length,
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
    ],
    [
      boundCount,
      environmentBoundCount,
      globalCount,
      managedCatchAllCount,
      primaryCount,
      projectBoundCount,
    ],
  );
  const cloudflareOverviewItems = useMemo(
    () => [
      { label: "健康域名", value: formatMetricValue(healthyCount) },
      { label: "异常域名", value: formatMetricValue(errorCount) },
      { label: "实际启用 Catch-all", value: formatMetricValue(actualCatchAllEnabledCount) },
      { label: "Cloudflare 路由", value: formatMetricValue(totalRoutes) },
      { label: "观测邮箱", value: formatMetricValue(totalObservedMailboxes) },
      { label: "收件总量", value: formatMetricValue(totalEmails) },
    ],
    [
      actualCatchAllEnabledCount,
      errorCount,
      healthyCount,
      totalEmails,
      totalObservedMailboxes,
      totalRoutes,
    ],
  );

  const statusColumns: ColumnsType<DomainAssetStatusRecord> = [
    {
      title: "域名",
      dataIndex: "domain",
      key: "domain",
      render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
    },
    {
      title: "工作空间",
      key: "workspace",
      width: 220,
      render: (_, record) => {
        const asset = assetMap.get(record.domain);
        if (!asset) return <Tag color="gold">仅环境变量回退</Tag>;
        return renderWorkspaceScope(asset);
      },
    },
    {
      title: "资产状态",
      key: "asset_status",
      width: 150,
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
      width: 180,
      render: (_, record) => (
        <Space size={[4, 4]} wrap>
          <Tag color="blue">托管 {record.active_mailbox_total}</Tag>
          <Tag>观测 {record.observed_mailbox_total}</Tag>
          <Tag color="purple">收件 {record.email_total}</Tag>
        </Space>
      ),
    },
    {
      title: "本地 Catch-all 策略",
      key: "catch_all_policy",
      width: 220,
      render: (_, record) => {
        const asset = assetMap.get(record.domain);
        if (!asset) return <Tag>仅云端状态</Tag>;
        return renderLocalCatchAllPolicy(asset);
      },
    },
    {
      title: "Cloudflare 实际状态",
      key: "catch_all_actual",
      width: 220,
      render: (_, record) => renderActualCatchAllStatus(record),
    },
    {
      title: "同步状态",
      key: "catch_all_drift",
      width: 120,
      render: (_, record) => {
        if (record.cloudflare_error) return <Tag color="error">异常</Tag>;
        if (!record.cloudflare_configured) return <Tag>未接入</Tag>;
        if (record.catch_all_drift) return <Tag color="warning">待同步</Tag>;
        return <Tag color="success">已同步</Tag>;
      },
    },
    {
      title: "路由数",
      dataIndex: "cloudflare_routes_total",
      key: "cloudflare_routes_total",
      width: 90,
    },
    {
      title: "状态说明",
      key: "detail",
      render: (_, record) => {
        if (record.cloudflare_error) {
          return <span style={{ color: "#cf1322" }}>{record.cloudflare_error}</span>;
        }

        if (!record.cloudflare_configured) {
          return "当前域名还没有完整的 Cloudflare Zone / Token / Worker 配置。";
        }

        if (record.catch_all_mode === "inherit") {
          return "本地未强制管理 Catch-all，页面仅展示 Cloudflare 当前状态。";
        }

        if (record.catch_all_drift) {
          return "本地策略与 Cloudflare 实际状态不一致，请执行同步。";
        }

        return "本地 Catch-all 策略已与 Cloudflare 保持一致。";
      },
    },
  ];

  const configColumns: ColumnsType<DomainAssetRecord> = [
    {
      title: "域名",
      dataIndex: "domain",
      key: "domain",
      render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
    },
    {
      title: "工作空间",
      key: "workspace",
      width: 220,
      render: (_, record) => renderWorkspaceScope(record),
    },
    {
      title: "基础状态",
      key: "status",
      width: 150,
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
      title: "Zone ID",
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
      title: "Catch-all 策略",
      key: "catch_all",
      width: 220,
      render: (_, record) => renderLocalCatchAllPolicy(record),
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
      width: 240,
      render: (_, record) => (
        <ActionButtons
          onEdit={() => openEdit(record)}
          onDelete={() => void handleDelete(record.id)}
          extra={(
            <Button
              type="link"
              size="small"
              icon={<SyncOutlined />}
              onClick={() => void handleSyncCatchAll(record.id)}
              disabled={record.catch_all_mode === "inherit"}
              loading={syncing}
            >
              同步 Catch-all
            </Button>
          )}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="域名资产"
        subtitle="统一管理接入域名、Cloudflare 路由配置，以及项目/环境级工作空间绑定。"
        tags={[
          ...(errorCount > 0 ? [{ color: "error", label: `异常 ${errorCount}` }] : []),
          ...(driftCount > 0 ? [{ color: "warning", label: `待同步 ${driftCount}` }] : []),
        ]}
        extra={(
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void reloadAll()} loading={loading}>
              刷新状态
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增域名
            </Button>
          </Space>
        )}
      />

      <MetricGrid>
        <MetricCard
          title="域名资产"
          value={items.length}
          icon={<GlobalOutlined />}
          percent={Math.min(100, items.length * 10)}
          color="#1677ff"
        />
        <MetricCard
          title="已启用"
          value={enabledCount}
          icon={<SafetyCertificateOutlined />}
          percent={items.length ? (enabledCount / items.length) * 100 : 0}
          color="#52c41a"
        />
        <MetricCard
          title="Cloudflare 已接入"
          value={configuredCount}
          icon={<CloudServerOutlined />}
          percent={buildRatio(configuredCount, statusItems.length || items.length)}
          color="#fa8c16"
        />
        <MetricCard
          title="健康域名"
          value={healthyCount}
          icon={<SafetyCertificateOutlined />}
          percent={buildRatio(healthyCount, statusItems.length)}
          color="#2f54eb"
        />
        <MetricCard
          title="托管邮箱"
          value={formatMetricValue(totalManagedMailboxes)}
          icon={<MailOutlined />}
          percent={buildRatio(totalManagedMailboxes, totalObservedMailboxes || totalManagedMailboxes)}
          color="#13c2c2"
        />
        <MetricCard
          title="策略待同步"
          value={driftCount}
          icon={<SyncOutlined />}
          percent={buildRatio(driftCount, statusItems.length)}
          color="#722ed1"
        />
      </MetricGrid>

      {items.length === 0 && statusItems.length > 0 ? (
        <Alert
          style={{ marginTop: 16, marginBottom: 16 }}
          type="info"
          showIcon
          message="当前尚未录入域名资产"
          description="系统已经通过环境变量或历史收件识别到域名，你可以先补录到域名资产中心，后续才能继续做项目绑定、Cloudflare 状态跟踪和 Catch-all 策略管理。"
        />
      ) : null}

      {driftCount > 0 ? (
        <Alert
          style={{ marginTop: 16, marginBottom: 16 }}
          type="warning"
          showIcon
          message="检测到待同步的 Catch-all 策略"
          description="本地配置已经保存，但 Cloudflare 侧还没有完全一致。你可以在配置表里按行同步，或者选中多条后批量同步。"
        />
      ) : null}

      {errorCount > 0 ? (
        <Alert
          style={{ marginTop: 16, marginBottom: 16 }}
          type="error"
          showIcon
          message="检测到 Cloudflare 接入异常"
          description="部分域名无法正确读取 Cloudflare 路由或 Catch-all 状态，请检查对应域名的 Zone ID、API Token 和 Email Worker 配置。"
        />
      ) : null}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} xl={16}>
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <MetricChart
                title="域名收件量排行"
                data={emailVolumeChartData}
                color="#1677ff"
                emptyText="暂无域名收件统计"
                height={220}
              />
            </Col>
            <Col xs={24} lg={12}>
              <MetricChart
                title="托管邮箱数排行"
                data={managedMailboxChartData}
                color="#52c41a"
                emptyText="暂无托管邮箱统计"
                height={220}
              />
            </Col>
            <Col xs={24} lg={12}>
              <MetricChart
                title="路由覆盖排行"
                data={routeCoverageChartData}
                color="#fa8c16"
                emptyText="暂无路由覆盖统计"
                height={220}
              />
            </Col>
          </Row>
        </Col>
        <Col xs={24} xl={8}>
          <Space direction="vertical" size={16} style={{ display: "flex" }}>
            <InfoCard
              title="资产分布"
              icon={<GlobalOutlined />}
              color="#1677ff"
              items={assetOverviewItems}
            />
            <InfoCard
              title="接入概览"
              icon={<CloudServerOutlined />}
              color="#fa8c16"
              items={cloudflareOverviewItems}
            />
          </Space>
        </Col>
      </Row>

      <DataTable
        cardTitle="域名运行状态"
        columns={statusColumns}
        dataSource={statusItems}
        loading={loading}
        rowKey="domain"
        showPagination={false}
        style={{ marginBottom: 16 }}
      />

      <DataTable
        cardTitle="域名配置管理"
        cardExtra={<Button onClick={openCreate}>新增域名</Button>}
        cardToolbar={(
          <BatchActionsBar selectedCount={selectedItems.length} onClear={clearSelection}>
            <Button onClick={() => void handleBatchToggle(true)}>批量启用</Button>
            <Button onClick={() => void handleBatchToggle(false)}>批量停用</Button>
            <Button icon={<SyncOutlined />} onClick={() => void handleBatchSyncCatchAll()}>
              批量同步 Catch-all
            </Button>
            <Popconfirm
              title={`确定删除选中的 ${selectedItems.length} 个域名吗？`}
              onConfirm={() => void handleBatchDelete()}
            >
              <Button danger>批量删除</Button>
            </Popconfirm>
          </BatchActionsBar>
        )}
        columns={configColumns}
        dataSource={items}
        loading={loading}
        rowKey="id"
        rowSelection={rowSelection}
        pageSize={10}
      />

      <FormDrawer
        title={editing ? "编辑域名资产" : "新增域名资产"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSubmit={() => void handleSubmit()}
        form={form}
        loading={saving}
        labelLayout="top"
        width="42vw"
      >
        <Col xs={24} md={12}>
          <Form.Item
            label="域名"
            name="domain"
            rules={[{ required: true, message: "请输入域名" }]}
          >
            <Input placeholder="例如：vixenahri.cn" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="项目" name="project_id">
            <Select allowClear options={projectOptions} placeholder="可选，绑定到项目" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="环境" name="environment_id">
            <Select
              allowClear
              options={environmentOptions}
              placeholder={watchedProjectId ? "可选，绑定到环境" : "请先选择项目"}
              disabled={!watchedProjectId}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="Cloudflare Zone ID" name="zone_id">
            <Input placeholder="可留空，留空时回退到环境变量" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="邮件 Worker" name="email_worker">
            <Input placeholder="可留空，留空时回退到环境变量" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="Catch-all 策略" name="catch_all_mode">
            <Select options={CATCH_ALL_MODE_OPTIONS} />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <Form.Item
            label="Catch-all 转发地址"
            name="catch_all_forward_to"
            extra={
              watchedCatchAllMode === "enabled"
                ? "开启后，所有未单独建档的地址都会转发到这里。"
                : "只有在“启用并转发”模式下，才会真正下发到 Cloudflare。"
            }
            rules={watchedCatchAllMode === "enabled" ? [{ required: true, message: "请输入转发地址" }] : undefined}
          >
            <Input
              placeholder="例如：ops@vixenahri.cn"
              disabled={watchedCatchAllMode !== "enabled"}
            />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <Form.Item label="备注" name="note">
            <Input placeholder="例如：生产主域名 / 测试验证码域名" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="设为主域名" name="is_primary" valuePropName="checked">
            <Switch checkedChildren="主域名" unCheckedChildren="普通域名" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="启用状态" name="is_enabled" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Col>
      </FormDrawer>
    </div>
  );
}
