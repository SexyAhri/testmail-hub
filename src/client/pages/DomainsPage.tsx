import {
  CloudServerOutlined,
  DownOutlined,
  GlobalOutlined,
  MailOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { Alert, App, Button, Col, Dropdown, Form, Input, Popconfirm, Row, Select, Space, Switch, Tabs, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";

import {
  createDomainAsset,
  createDomainRoutingProfile,
  getDomainAssets,
  getDomainAssetStatuses,
  getDomainProviders,
  getDomainRoutingProfiles,
  getWorkspaceCatalog,
  removeDomainAsset,
  removeDomainRoutingProfile,
  syncDomainAssetCatchAll,
  updateDomainAsset,
  updateDomainRoutingProfile,
} from "../api";
import {
  domainProviderSupports,
  getDomainProviderDefinition,
  getDomainProviderLabel,
  listDomainProviders,
  type DomainProviderCapability,
  type DomainProviderDefinition,
} from "../../shared/domain-providers";
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
  DomainRoutingProfileMutationPayload,
  DomainRoutingProfileRecord,
  SessionPayload,
  WorkspaceCatalog,
} from "../types";
import {
  type BatchActionResult,
  buildBatchActionMessage,
  formatDateTime,
  loadAllPages,
  normalizeApiError,
  runBatchAction,
} from "../utils";

interface DomainsPageProps {
  currentUser?: SessionPayload["user"] | null;
  onDomainsChanged?: () => Promise<void> | void;
  onUnauthorized: () => void;
}

const EMPTY_CATALOG: WorkspaceCatalog = {
  environments: [],
  mailbox_pools: [],
  projects: [],
};

const INITIAL_VALUES: DomainMutationPayload = {
  allow_mailbox_route_sync: true,
  allow_new_mailboxes: true,
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
  routing_profile_id: undefined,
  zone_id: "",
};

const INITIAL_PROFILE_VALUES: DomainRoutingProfileMutationPayload = {
  catch_all_forward_to: "",
  catch_all_mode: "inherit",
  environment_id: undefined,
  is_enabled: true,
  name: "",
  note: "",
  project_id: undefined,
  provider: "cloudflare",
  slug: "",
};

const CATCH_ALL_MODE_OPTIONS: Array<{ label: string; value: CatchAllMode }> = [
  { label: "跟随当前 Cloudflare 配置", value: "inherit" },
  { label: "启用并转发", value: "enabled" },
  { label: "强制关闭", value: "disabled" },
];

const PROVIDER_CAPABILITY_LABELS: Record<DomainProviderCapability, string> = {
  catch_all_policy: "Catch-all 策略",
  catch_all_sync: "Catch-all 同步",
  email_worker: "邮件 Worker",
  mailbox_route_sync: "路由同步",
  routing_profile: "路由策略",
  status_read: "状态观测",
  zone_id: "Zone ID",
};

function resolveEffectiveCatchAllPolicy(
  record: Pick<
    DomainAssetRecord,
    | "catch_all_forward_to"
    | "catch_all_mode"
    | "routing_profile_catch_all_forward_to"
    | "routing_profile_catch_all_mode"
    | "routing_profile_enabled"
    | "routing_profile_id"
  >,
) {
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

function renderCatchAllModeTokens(mode: CatchAllMode, forwardTo: string) {
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

function renderEffectiveCatchAllPolicy(
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

function renderRoutingProfileBinding(
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

function renderProviderBadge(
  provider: string,
  providers?: Map<string, DomainProviderDefinition>,
) {
  const definition = providers?.get(provider) || getDomainProviderDefinition(provider);
  if (!definition) return <Tag>{provider || "未知 Provider"}</Tag>;

  return (
    <Space size={[4, 4]} wrap>
      <Tag color={provider === "cloudflare" ? "processing" : "default"}>{definition.label}</Tag>
    </Space>
  );
}

function renderDomainGovernance(
  record: Pick<DomainAssetRecord, "allow_mailbox_route_sync" | "allow_new_mailboxes" | "provider">,
) {
  const providerSupportsRouteSync = domainProviderSupports(record.provider, "mailbox_route_sync");

  return (
    <Space size={[4, 4]} wrap>
      <Tag color={record.allow_new_mailboxes ? "success" : "default"}>
        {record.allow_new_mailboxes ? "允许新建邮箱" : "仅保留存量邮箱"}
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

function isManagedCatchAllPolicy(
  record: Pick<
    DomainAssetRecord,
    | "catch_all_forward_to"
    | "catch_all_mode"
    | "routing_profile_catch_all_forward_to"
    | "routing_profile_catch_all_mode"
    | "routing_profile_enabled"
    | "routing_profile_id"
  >,
) {
  return resolveEffectiveCatchAllPolicy(record).catch_all_mode !== "inherit";
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

function renderWorkspaceScope(
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

function profileMatchesDomainScope(
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

function buildDomainMutationPayload(
  record: DomainAssetRecord,
  overrides: Partial<DomainMutationPayload> = {},
): DomainMutationPayload {
  return {
    allow_mailbox_route_sync: record.allow_mailbox_route_sync,
    allow_new_mailboxes: record.allow_new_mailboxes,
    catch_all_forward_to: record.catch_all_forward_to,
    catch_all_mode: record.catch_all_mode,
    domain: record.domain,
    email_worker: record.email_worker,
    environment_id: record.environment_id,
    is_enabled: record.is_enabled,
    is_primary: record.is_primary,
    note: record.note,
    project_id: record.project_id,
    provider: record.provider,
    routing_profile_id: record.routing_profile_id,
    zone_id: record.zone_id,
    ...overrides,
  };
}

function canManageProjectScopedRecord(
  user: SessionPayload["user"] | null | undefined,
  projectId: number | null | undefined,
) {
  if (!user || user.access_scope !== "bound") return true;
  if (!projectId) return false;
  return Array.isArray(user.projects) && user.projects.some(project => project.id === projectId);
}

export default function DomainsPage({ currentUser, onDomainsChanged, onUnauthorized }: DomainsPageProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<DomainMutationPayload>();
  const [profileForm] = Form.useForm<DomainRoutingProfileMutationPayload>();
  const [items, setItems] = useState<DomainAssetRecord[]>([]);
  const [providers, setProviders] = useState<DomainProviderDefinition[]>(listDomainProviders());
  const [routingProfiles, setRoutingProfiles] = useState<DomainRoutingProfileRecord[]>([]);
  const [statusItems, setStatusItems] = useState<DomainAssetStatusRecord[]>([]);
  const [catalog, setCatalog] = useState<WorkspaceCatalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<DomainAssetRecord | null>(null);
  const [editingProfile, setEditingProfile] = useState<DomainRoutingProfileRecord | null>(null);
  const watchedCatchAllMode = Form.useWatch("catch_all_mode", form) || "inherit";
  const watchedProjectId = Form.useWatch("project_id", form);
  const watchedEnvironmentId = Form.useWatch("environment_id", form);
  const watchedProvider = Form.useWatch("provider", form) || INITIAL_VALUES.provider;
  const watchedRoutingProfileProjectId = Form.useWatch("project_id", profileForm);
  const watchedRoutingProfileProvider = Form.useWatch("provider", profileForm) || INITIAL_PROFILE_VALUES.provider;
  const { clearSelection, rowSelection, selectedItems } = useTableSelection(items, "id");
  const canManageDomainAssetRecord = (record: Pick<DomainAssetRecord, "project_id">) =>
    canManageProjectScopedRecord(currentUser, record.project_id);
  const canManageRoutingProfileRecord = (record: Pick<DomainRoutingProfileRecord, "project_id">) =>
    canManageProjectScopedRecord(currentUser, record.project_id);
  const domainRowSelection = useMemo(
    () => ({
      ...rowSelection,
      getCheckboxProps: (record: DomainAssetRecord) => ({
        disabled: !canManageDomainAssetRecord(record),
      }),
    }),
    [rowSelection, currentUser],
  );

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

  useEffect(() => {
    const currentEnvironmentId = profileForm.getFieldValue("environment_id");
    if (!currentEnvironmentId) return;

    const environmentStillVisible = catalog.environments.some(
      item => item.id === currentEnvironmentId && (!watchedRoutingProfileProjectId || item.project_id === watchedRoutingProfileProjectId),
    );

    if (!environmentStillVisible) {
      profileForm.setFieldValue("environment_id", undefined);
    }
  }, [catalog.environments, profileForm, watchedRoutingProfileProjectId]);

  useEffect(() => {
    const currentRoutingProfileId = form.getFieldValue("routing_profile_id");
    if (!currentRoutingProfileId) return;

    const currentProjectId = Number(form.getFieldValue("project_id") || 0) || null;
    const currentEnvironmentId = Number(form.getFieldValue("environment_id") || 0) || null;
    const stillVisible = routingProfiles.some(
      item => item.id === currentRoutingProfileId && profileMatchesDomainScope(item, currentProjectId, currentEnvironmentId),
    );

    if (!stillVisible) {
      form.setFieldValue("routing_profile_id", undefined);
    }
  }, [form, routingProfiles, watchedEnvironmentId, watchedProjectId]);

  useEffect(() => {
    if (domainProviderSupports(watchedProvider, "zone_id")) return;
    if (form.getFieldValue("zone_id")) {
      form.setFieldValue("zone_id", "");
    }
  }, [form, watchedProvider]);

  useEffect(() => {
    if (domainProviderSupports(watchedProvider, "email_worker")) return;
    if (form.getFieldValue("email_worker")) {
      form.setFieldValue("email_worker", "");
    }
  }, [form, watchedProvider]);

  useEffect(() => {
    if (domainProviderSupports(watchedProvider, "mailbox_route_sync")) return;
    if (form.getFieldValue("allow_mailbox_route_sync") !== false) {
      form.setFieldValue("allow_mailbox_route_sync", false);
    }
  }, [form, watchedProvider]);

  useEffect(() => {
    if (domainProviderSupports(watchedProvider, "routing_profile")) return;
    if (form.getFieldValue("routing_profile_id")) {
      form.setFieldValue("routing_profile_id", undefined);
    }
  }, [form, watchedProvider]);

  useEffect(() => {
    if (domainProviderSupports(watchedProvider, "catch_all_policy")) return;
    form.setFieldsValue({
      catch_all_forward_to: "",
      catch_all_mode: "inherit",
    });
  }, [form, watchedProvider]);

  useEffect(() => {
    if (domainProviderSupports(watchedRoutingProfileProvider, "routing_profile")) return;
    profileForm.setFieldsValue({
      catch_all_forward_to: "",
      catch_all_mode: "inherit",
      provider: INITIAL_PROFILE_VALUES.provider,
    });
  }, [profileForm, watchedRoutingProfileProvider]);

  async function loadData() {
    setLoading(true);
    try {
      const [domainAssets, statuses, workspaceCatalog, profileItems, providerItems] = await Promise.all([
        loadAllPages(getDomainAssets),
        getDomainAssetStatuses(),
        getWorkspaceCatalog(true),
        loadAllPages(getDomainRoutingProfiles),
        getDomainProviders(),
      ]);
      setItems(domainAssets);
      setProviders(providerItems);
      setRoutingProfiles(profileItems);
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

  function showBatchActionFeedback(actionLabel: string, result: BatchActionResult, extraSuffix = "") {
    const messageText = `${buildBatchActionMessage(actionLabel, result)}${extraSuffix}`;
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  function openCreate() {
    setEditing(null);
    form.setFieldsValue(INITIAL_VALUES);
    setDrawerOpen(true);
  }

  function openProfileCreate() {
    setEditingProfile(null);
    profileForm.setFieldsValue(INITIAL_PROFILE_VALUES);
    setProfileDrawerOpen(true);
  }

  function openEdit(record: DomainAssetRecord) {
    setEditing(record);
    form.setFieldsValue({
      allow_mailbox_route_sync: record.allow_mailbox_route_sync,
      allow_new_mailboxes: record.allow_new_mailboxes,
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
      routing_profile_id: record.routing_profile_id || undefined,
      zone_id: record.zone_id,
    });
    setDrawerOpen(true);
  }

  function openProfileEdit(record: DomainRoutingProfileRecord) {
    setEditingProfile(record);
    profileForm.setFieldsValue({
      catch_all_forward_to: record.catch_all_forward_to,
      catch_all_mode: record.catch_all_mode,
      environment_id: record.environment_id || undefined,
      is_enabled: record.is_enabled,
      name: record.name,
      note: record.note,
      project_id: record.project_id || undefined,
      provider: record.provider,
      slug: record.slug,
    });
    setProfileDrawerOpen(true);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const values = await form.validateFields();
      const payload: DomainMutationPayload = {
        allow_mailbox_route_sync: values.allow_mailbox_route_sync,
        allow_new_mailboxes: values.allow_new_mailboxes,
        catch_all_forward_to: values.catch_all_forward_to.trim(),
        catch_all_mode: values.catch_all_mode,
        domain: values.domain.trim(),
        email_worker: values.email_worker.trim(),
        environment_id: values.environment_id || null,
        is_enabled: values.is_enabled,
        is_primary: values.is_primary,
        note: values.note.trim(),
        project_id: values.project_id || null,
        provider: values.provider,
        routing_profile_id: values.routing_profile_id || null,
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

  async function handleProfileSubmit() {
    setProfileSaving(true);
    try {
      const values = await profileForm.validateFields();
      const payload: DomainRoutingProfileMutationPayload = {
        catch_all_forward_to: values.catch_all_forward_to.trim(),
        catch_all_mode: values.catch_all_mode,
        environment_id: values.environment_id || null,
        is_enabled: values.is_enabled,
        name: values.name.trim(),
        note: values.note.trim(),
        project_id: values.project_id || null,
        provider: values.provider,
        slug: values.slug?.trim() || undefined,
      };

      if (editingProfile) {
        await updateDomainRoutingProfile(editingProfile.id, payload);
        message.success("路由策略已更新");
      } else {
        await createDomainRoutingProfile(payload);
        message.success("路由策略已创建");
      }

      setProfileDrawerOpen(false);
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
      setProfileSaving(false);
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

  async function handleProfileDelete(id: number) {
    try {
      await removeDomainRoutingProfile(id);
      message.success("路由策略已删除");
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
      updateDomainAsset(item.id, buildDomainMutationPayload(item, { is_enabled })),
    );

    if (result.successCount > 0) {
      clearSelection();
      await reloadAll();
    }

    showBatchActionFeedback(is_enabled ? "批量启用域名" : "批量停用域名", result);
  }

  async function handleBatchGovernance(
    field: "allow_new_mailboxes" | "allow_mailbox_route_sync",
    value: boolean,
  ) {
    const actionLabel = field === "allow_new_mailboxes"
      ? value
        ? "批量允许新建邮箱"
        : "批量禁止新建邮箱"
      : value
        ? "批量开启路由同步"
        : "批量关闭路由同步";

    let targetItems = selectedItems;
    let skippedCount = 0;

    if (field === "allow_mailbox_route_sync") {
      targetItems = selectedItems.filter(item => domainProviderSupports(item.provider, "mailbox_route_sync"));
      skippedCount = selectedItems.length - targetItems.length;

      if (targetItems.length === 0) {
        message.info("选中的域名里没有支持邮箱路由同步的 Provider，已跳过手动或外部托管域名");
        return;
      }
    }

    const overrides: Partial<DomainMutationPayload> = field === "allow_new_mailboxes"
      ? { allow_new_mailboxes: value }
      : { allow_mailbox_route_sync: value };

    const result = await runBatchAction(targetItems, item =>
      updateDomainAsset(item.id, buildDomainMutationPayload(item, overrides)),
    );

    if (result.successCount > 0) {
      clearSelection();
      await reloadAll();
    }

    const skippedSuffix = skippedCount > 0 ? `，已跳过 ${skippedCount} 个不支持路由同步的域名` : "";
    showBatchActionFeedback(actionLabel, result, skippedSuffix);
  }

  async function handleBatchSyncCatchAll() {
    const syncableItems = selectedItems.filter(
      item => domainProviderSupports(item.provider, "catch_all_sync") && isManagedCatchAllPolicy(item),
    );
    if (syncableItems.length === 0) {
      message.info("选中的域名里没有需要同步的 Catch-all 策略");
      return;
    }

    const result = await runBatchAction(syncableItems, item => syncDomainAssetCatchAll(item.id));
    if (result.successCount > 0) {
      clearSelection();
      await reloadAll();
    }

    showBatchActionFeedback("批量同步 Catch-all", result);
  }

  async function handleBatchDelete() {
    const result = await runBatchAction(selectedItems, item => removeDomainAsset(item.id));
    if (result.successCount > 0) {
      clearSelection();
      await reloadAll();
    }

    showBatchActionFeedback("批量删除域名", result);
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
        .filter(item => !watchedRoutingProfileProjectId || item.project_id === watchedRoutingProfileProjectId)
        .map(item => ({
          label: item.is_enabled ? item.name : `${item.name}（已停用）`,
          value: item.id,
        })),
    [catalog.environments, watchedRoutingProfileProjectId],
  );

  const providerMap = useMemo(
    () => new Map<string, DomainProviderDefinition>(providers.map(item => [item.key, item])),
    [providers],
  );
  const batchGovernanceMenu = {
    items: [
      { key: "allow_mailbox_create", label: "允许新建邮箱" },
      { key: "block_mailbox_create", label: "禁止新建邮箱" },
      { key: "enable_route_sync", label: "开启路由同步" },
      { key: "disable_route_sync", label: "关闭路由同步" },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === "allow_mailbox_create") {
        void handleBatchGovernance("allow_new_mailboxes", true);
        return;
      }
      if (key === "block_mailbox_create") {
        void handleBatchGovernance("allow_new_mailboxes", false);
        return;
      }
      if (key === "enable_route_sync") {
        void handleBatchGovernance("allow_mailbox_route_sync", true);
        return;
      }
      if (key === "disable_route_sync") {
        void handleBatchGovernance("allow_mailbox_route_sync", false);
      }
    },
  };
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
      title: "Provider",
      key: "provider",
      width: 200,
      render: (_, record) => {
        const asset = assetMap.get(record.domain);
        if (!asset) return <Tag color="gold">未建档</Tag>;
        return renderProviderBadge(asset.provider, providerMap);
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
      title: "治理规则",
      key: "governance",
      width: 260,
      render: (_, record) => {
        const asset = assetMap.get(record.domain);
        if (!asset) return <Tag>仅回退域名</Tag>;
        return renderDomainGovernance(asset);
      },
    },
    {
      title: "当前生效策略",
      key: "catch_all_policy",
      width: 260,
      render: (_, record) => {
        const asset = assetMap.get(record.domain);
        if (!asset) return <Tag>仅云端状态</Tag>;
        return renderEffectiveCatchAllPolicy(asset);
      },
    },
    {
      title: "Provider 实际状态",
      key: "catch_all_actual",
      width: 220,
      render: (_, record) => {
        const asset = assetMap.get(record.domain);
        if (asset && !domainProviderSupports(asset.provider, "status_read")) {
          return <Tag>不支持观测</Tag>;
        }
        return renderActualCatchAllStatus(record);
      },
    },
    {
      title: "同步状态",
      key: "catch_all_drift",
      width: 120,
      render: (_, record) => {
        const asset = assetMap.get(record.domain);
        if (asset && !domainProviderSupports(asset.provider, "catch_all_sync")) return <Tag>手动托管</Tag>;
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
        const asset = assetMap.get(record.domain);
        if (asset && !domainProviderSupports(asset.provider, "status_read")) {
          return `${getDomainProviderLabel(asset.provider)} 当前只做资产登记与工作空间绑定，不读取实时路由状态。`;
        }

        if (asset && !asset.allow_new_mailboxes) {
          return "当前域名已关闭新建邮箱，仅允许保留和管理存量邮箱。";
        }

        if (asset && domainProviderSupports(asset.provider, "mailbox_route_sync") && !asset.allow_mailbox_route_sync) {
          return "当前域名已关闭自动路由同步，系统不会再自动写入或删除该域名下的邮箱路由。";
        }

        if (record.cloudflare_error) {
          return <span style={{ color: "#cf1322" }}>{record.cloudflare_error}</span>;
        }

        if (!record.cloudflare_configured) {
          return "当前域名还没有完整的 Cloudflare Zone / Token / Worker 配置。";
        }

        if (record.catch_all_mode === "inherit") {
          return "本地未强制管理 Catch-all，页面仅展示 Cloudflare 当前状态。";
        }

        if (record.catch_all_source === "routing_profile") {
          if (record.catch_all_drift) {
            return `当前生效策略来自路由策略 ${record.routing_profile_name || "未命名策略"}，但与 Cloudflare 实际状态不一致。`;
          }
          return `当前生效策略来自路由策略 ${record.routing_profile_name || "未命名策略"}。`;
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
      title: "Provider",
      dataIndex: "provider",
      key: "provider",
      width: 200,
      render: value => renderProviderBadge(value, providerMap),
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
      title: "治理规则",
      key: "governance",
      width: 260,
      render: (_, record) => renderDomainGovernance(record),
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
      title: "路由策略",
      key: "routing_profile",
      width: 220,
      render: (_, record) => renderRoutingProfileBinding(record),
    },
    {
      title: "当前生效策略",
      key: "catch_all",
      width: 260,
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
      width: 240,
      render: (_, record) => {
        const canManage = canManageDomainAssetRecord(record);
        if (!canManage) {
          return <Tag>只读</Tag>;
        }

        return (
          <ActionButtons
            onEdit={() => openEdit(record)}
            onDelete={() => void handleDelete(record.id)}
            extra={(
              <Button
                type="link"
                size="small"
                icon={<SyncOutlined />}
                onClick={() => void handleSyncCatchAll(record.id)}
                disabled={!domainProviderSupports(record.provider, "catch_all_sync") || !isManagedCatchAllPolicy(record)}
                loading={syncing}
              >
                同步 Catch-all
              </Button>
            )}
          />
        );
      },
    },
  ];

  const routingProfileColumns: ColumnsType<DomainRoutingProfileRecord> = [
    {
      title: "策略名称",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "Provider",
      dataIndex: "provider",
      key: "provider",
      width: 200,
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
      width: 220,
      render: (_, record) => renderWorkspaceScope(record),
    },
    {
      title: "Catch-all 策略",
      key: "catch_all",
      width: 220,
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
            onDelete={() => void handleProfileDelete(record.id)}
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

  return (
    <div className="page-tab-stack">
      <PageHeader
        title="域名资产"
        subtitle="统一管理接入域名、Cloudflare 路由配置，以及项目/环境级工作空间绑定。"
        tags={[
          ...(currentUser?.access_scope === "bound" ? [{ color: "gold", label: "项目级视角" }] : []),
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

      <Tabs
        className="page-section-tabs"
        items={[
          {
            key: "overview",
            label: "概览",
            children: (
              <div className="page-scroll-panel">
                <Space direction="vertical" size={16} style={{ width: "100%" }}>
                  <MetricGrid minItemWidth={220} style={{ marginBottom: 0 }}>
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
                      percent={buildRatio(
                        totalManagedMailboxes,
                        totalObservedMailboxes || totalManagedMailboxes,
                      )}
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
                      type="info"
                      showIcon
                      message="当前尚未录入域名资产"
                      description="系统已经通过环境变量或历史收件识别到域名，你可以先补录到域名资产中心，后续才能继续做项目绑定、Cloudflare 状态跟踪和 Catch-all 策略管理。"
                    />
                  ) : null}

                  <Row gutter={[16, 16]} align="top">
                    <Col xs={24} xxl={16}>
                      <Space direction="vertical" size={16} style={{ display: "flex" }}>
                        <MetricChart
                          title="域名收件量排行"
                          data={emailVolumeChartData}
                          color="#1677ff"
                          emptyText="暂无域名收件统计"
                          height={200}
                        />

                        <Row gutter={[16, 16]}>
                          <Col xs={24} xl={12}>
                            <MetricChart
                              title="托管邮箱数排行"
                              data={managedMailboxChartData}
                              color="#52c41a"
                              emptyText="暂无托管邮箱统计"
                              height={200}
                            />
                          </Col>
                          <Col xs={24} xl={12}>
                            <MetricChart
                              title="路由覆盖排行"
                              data={routeCoverageChartData}
                              color="#fa8c16"
                              emptyText="暂无路由覆盖统计"
                              height={200}
                            />
                          </Col>
                        </Row>
                      </Space>
                    </Col>
                    <Col xs={24} xxl={8}>
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
                        <InfoCard
                          title="Provider 分布"
                          icon={<CloudServerOutlined />}
                          color="#13c2c2"
                          items={providerOverviewItems}
                        />
                      </Space>
                    </Col>
                  </Row>
                </Space>
              </div>
            ),
          },
          {
            key: "status",
            label: `运行状态 (${statusItems.length})`,
            children: (
              <div className="page-tab-stack">
                <MetricGrid minItemWidth={220}>
                  <MetricCard
                    title="健康域名"
                    value={healthyCount}
                    icon={<SafetyCertificateOutlined />}
                    percent={buildRatio(healthyCount, statusItems.length)}
                    color="#2f54eb"
                  />
                  <MetricCard
                    title="Cloudflare 已接入"
                    value={configuredCount}
                    icon={<CloudServerOutlined />}
                    percent={buildRatio(configuredCount, statusItems.length || items.length)}
                    color="#fa8c16"
                  />
                  <MetricCard
                    title="策略待同步"
                    value={driftCount}
                    icon={<SyncOutlined />}
                    percent={buildRatio(driftCount, statusItems.length)}
                    color="#722ed1"
                  />
                  <MetricCard
                    title="接入异常"
                    value={errorCount}
                    icon={<CloudServerOutlined />}
                    percent={buildRatio(errorCount, statusItems.length)}
                    color="#cf1322"
                  />
                </MetricGrid>

                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  {driftCount > 0 ? (
                    <Alert
                      type="warning"
                      showIcon
                      message="检测到待同步的 Catch-all 策略"
                      description="本地配置已经保存，但 Cloudflare 侧还没有完全一致。你可以在配置表里按行同步，或者选中多条后批量同步。"
                    />
                  ) : null}

                  {errorCount > 0 ? (
                    <Alert
                      type="error"
                      showIcon
                      message="检测到 Cloudflare 接入异常"
                      description="部分域名无法正确读取 Cloudflare 路由或 Catch-all 状态，请检查对应域名的 Zone ID、API Token 和 Email Worker 配置。"
                    />
                  ) : null}
                </Space>

                <DataTable
                  cardTitle="域名运行状态"
                  columns={statusColumns}
                  dataSource={statusItems}
                  loading={loading}
                  rowKey="domain"
                  showPagination={false}
                  scroll={{ x: "max-content", y: 420 }}
                  style={{ marginBottom: 0 }}
                />
              </div>
            ),
          },
          {
            key: "config",
            label: `配置管理 (${items.length})`,
            children: (
              <div className="page-tab-stack">
                <Alert
                  type="info"
                  showIcon
                  message="域名资产配置"
                  description="这里统一管理域名归属、Provider 能力、路由字段、Catch-all 策略，以及项目 / 环境绑定关系。手动 / 外部托管域名只做资产登记，不做 Cloudflare 同步。"
                />
                {currentUser?.access_scope === "bound" ? (
                  <Alert
                    type="warning"
                    showIcon
                    message="当前为项目级管理视角"
                    description="你可以管理已绑定到自己项目的域名和路由策略；全局域名资产会继续显示，但仅支持只读查看。"
                  />
                ) : null}

                <DataTable
                  cardTitle="域名配置管理"
                  cardExtra={<Button onClick={openCreate}>新增域名</Button>}
                  cardToolbar={(
                    <BatchActionsBar selectedCount={selectedItems.length} onClear={clearSelection}>
                      <Button onClick={() => void handleBatchToggle(true)}>批量启用</Button>
                      <Button onClick={() => void handleBatchToggle(false)}>批量停用</Button>
                      <Dropdown trigger={["click"]} menu={batchGovernanceMenu}>
                        <Button icon={<DownOutlined />}>批量治理</Button>
                      </Dropdown>
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
                  rowSelection={domainRowSelection}
                  pageSize={8}
                  scroll={{ x: "max-content", y: 440 }}
                  style={{ marginBottom: 0 }}
                />
              </div>
            ),
          },
          {
            key: "routing-profiles",
            label: `路由策略 (${routingProfiles.length})`,
            children: (
              <div className="page-tab-stack">
                <Alert
                  type="info"
                  showIcon
                  message="独立路由策略中心"
                  description="这里可以沉淀可复用的 Catch-all / 路由策略。域名资产在不做直配覆盖时，会优先继承这里绑定的策略。"
                />

                <DataTable
                  cardTitle="路由策略列表"
                  cardExtra={<Button onClick={openProfileCreate}>新建策略</Button>}
                  columns={routingProfileColumns}
                  dataSource={routingProfiles}
                  loading={loading}
                  rowKey="id"
                  pageSize={8}
                  scroll={{ x: "max-content", y: 440 }}
                  style={{ marginBottom: 0 }}
                />
              </div>
            ),
          },
        ]}
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
          <Form.Item label="Provider" name="provider" rules={[{ required: true, message: "请选择 Provider" }]}>
            <Select options={providerOptions} />
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
          <Form.Item
            label={domainProviderSupports(activeProvider, "zone_id") ? "Cloudflare Zone ID" : "Zone ID（当前 Provider 不适用）"}
            name="zone_id"
          >
            <Input
              placeholder={domainProviderSupports(activeProvider, "zone_id") ? "可留空，留空时回退到环境变量" : "当前 Provider 不需要 Zone ID"}
              disabled={!domainProviderSupports(activeProvider, "zone_id")}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            label={domainProviderSupports(activeProvider, "email_worker") ? "邮件 Worker" : "邮件 Worker（当前 Provider 不适用）"}
            name="email_worker"
          >
            <Input
              placeholder={domainProviderSupports(activeProvider, "email_worker") ? "可留空，留空时回退到环境变量" : "当前 Provider 不需要邮件 Worker"}
              disabled={!domainProviderSupports(activeProvider, "email_worker")}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="绑定路由策略" name="routing_profile_id">
            <Select
              allowClear
              options={routingProfileOptions}
              placeholder={
                !domainProviderSupports(activeProvider, "routing_profile")
                  ? "当前 Provider 不支持路由策略"
                  : routingProfileOptions.length > 0
                    ? "可选，绑定独立路由策略"
                    : "当前工作空间暂无可用策略"
              }
              disabled={!domainProviderSupports(activeProvider, "routing_profile")}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="域名直配 Catch-all 策略" name="catch_all_mode">
            <Select
              options={domainCatchAllOptions}
              disabled={!domainProviderSupports(activeProvider, "catch_all_policy")}
            />
          </Form.Item>
        </Col>
        <Col xs={24}>
          {activeProvider ? (
            <Alert
              type={activeProvider.key === "manual" ? "warning" : "info"}
              showIcon
              style={{ marginBottom: 16 }}
              message={`当前 Provider：${activeProvider.label}`}
              description={`${activeProvider.description} 当前能力：${
                activeProvider.capabilities.length > 0
                  ? activeProvider.capabilities.map(item => PROVIDER_CAPABILITY_LABELS[item]).join(" / ")
                  : "仅资产登记与工作空间绑定"
              }。`}
            />
          ) : null}
        </Col>
        <Col xs={24}>
          <Form.Item
            label="Catch-all 转发地址"
            name="catch_all_forward_to"
            extra={
              !domainProviderSupports(activeProvider, "catch_all_policy")
                ? "当前 Provider 不支持托管 Catch-all 策略，系统只保留域名资产记录。"
                : watchedCatchAllMode === "enabled"
                ? "开启后，所有未单独建档的地址都会转发到这里。"
                : "当这里保持“跟随当前 Cloudflare 配置”时，如果已绑定路由策略，则会优先继承路由策略。"
            }
            rules={watchedCatchAllMode === "enabled" ? [{ required: true, message: "请输入转发地址" }] : undefined}
          >
            <Input
              placeholder="例如：ops@vixenahri.cn"
              disabled={watchedCatchAllMode !== "enabled" || !domainProviderSupports(activeProvider, "catch_all_policy")}
            />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <Form.Item label="备注" name="note">
            <Input placeholder="例如：生产主域名 / 测试验证码域名" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="允许新建邮箱" name="allow_new_mailboxes" valuePropName="checked">
            <Switch checkedChildren="允许新建" unCheckedChildren="仅存量" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="允许路由同步" name="allow_mailbox_route_sync" valuePropName="checked">
            <Switch
              checkedChildren="允许同步"
              unCheckedChildren="关闭同步"
              disabled={!domainProviderSupports(activeProvider, "mailbox_route_sync")}
            />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="域名治理规则"
            description="“允许新建邮箱”关闭后，该域名不会再出现在邮箱创建可选列表中；“允许路由同步”关闭后，系统不会再自动写入、更新或删除该域名下的邮箱路由。"
          />
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

      <FormDrawer
        title={editingProfile ? "编辑路由策略" : "新建路由策略"}
        open={profileDrawerOpen}
        onClose={() => setProfileDrawerOpen(false)}
        onSubmit={() => void handleProfileSubmit()}
        form={profileForm}
        loading={profileSaving}
        labelLayout="top"
        width="42vw"
      >
        <Col xs={24} md={12}>
          <Form.Item
            label="策略名称"
            name="name"
            rules={[{ required: true, message: "请输入策略名称" }]}
          >
            <Input placeholder="例如：生产环境 Catch-all" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="策略标识" name="slug">
            <Input placeholder="可留空，系统会自动生成" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="Provider" name="provider" rules={[{ required: true, message: "请选择 Provider" }]}>
            <Select options={routingProfileProviderOptions} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="项目" name="project_id">
            <Select allowClear options={projectOptions} placeholder="可选，限制到项目级使用" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="环境" name="environment_id">
            <Select
              allowClear
              options={routingProfileEnvironmentOptions}
              placeholder={watchedRoutingProfileProjectId ? "可选，限制到环境级使用" : "请先选择项目"}
              disabled={!watchedRoutingProfileProjectId}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            label="Catch-all 策略"
            name="catch_all_mode"
            rules={[{ required: true, message: "请选择 Catch-all 策略" }]}
          >
            <Select options={CATCH_ALL_MODE_OPTIONS} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="启用状态" name="is_enabled" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Col>
        <Col xs={24}>
          {activeRoutingProfileProvider ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={`当前 Provider：${activeRoutingProfileProvider.label}`}
              description={`${activeRoutingProfileProvider.description} 当前能力：${
                activeRoutingProfileProvider.capabilities.length > 0
                  ? activeRoutingProfileProvider.capabilities.map(item => PROVIDER_CAPABILITY_LABELS[item]).join(" / ")
                  : "仅资产登记与工作空间绑定"
              }。`}
            />
          ) : null}
        </Col>
        <Col xs={24}>
          <Form.Item
            label="Catch-all 转发地址"
            name="catch_all_forward_to"
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (getFieldValue("catch_all_mode") !== "enabled" || String(value || "").trim()) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("启用并转发时必须填写转发地址"));
                },
              }),
            ]}
          >
            <Input placeholder="例如：ops@vixenahri.cn" />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <Form.Item label="备注" name="note">
            <Input placeholder="例如：给一组测试域名复用的默认转发策略" />
          </Form.Item>
        </Col>
      </FormDrawer>
    </div>
  );
}
