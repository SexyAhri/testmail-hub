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
import { Alert, App, Button, Card, Col, Dropdown, Form, Input, Popconfirm, Row, Select, Space, Switch, Tabs, Tag, theme } from "antd";
import { useEffect, useMemo, useState } from "react";

import {
  createDomainAsset,
  createDomainRoutingProfile,
  getDomainAssets,
  getDomainAssetStatuses,
  getDomainProviders,
  getDomainRoutingProfiles,
  removeDomainAsset,
  removeDomainRoutingProfile,
  syncDomainAssetCatchAll,
  syncDomainAssetMailboxRoutes,
  updateDomainAsset,
  updateDomainRoutingProfile,
} from "../../api/domains";
import { getWorkspaceCatalog } from "../../api/workspace";
import {
  domainProviderSupports,
  listDomainProviders,
  type DomainProviderDefinition,
} from "../../../shared/domain-providers";
import { PageHeader } from "../../components";
import {
  canSyncCatchAll,
  canSyncMailboxRoutes,
  type DomainHealthFilter,
  type DomainScopeFilter,
} from "../../domain-filters";
import { usePageFeedback } from "../../hooks/usePageFeedback";
import type {
  DomainAssetRecord,
  DomainAssetStatusRecord,
  DomainMutationPayload,
  DomainRoutingProfileMutationPayload,
  DomainRoutingProfileRecord,
  SessionPayload,
  WorkspaceCatalog,
} from "../../types";
import {
  loadAllPages,
  runBatchAction,
} from "../../utils";
import {
  canWriteAnyResource,
  getAccessibleProjectIds,
  getAccessModeTag,
  getWriteScopeNotice,
  isProjectScopedUser,
} from "../../permissions";
import { promptOperationNote } from "../../delete-operation-note";
import { DomainAssetDrawer } from "./DomainAssetDrawer";
import { buildDomainConfigColumns, buildDomainStatusColumns, buildRoutingProfileColumns } from "./domain-table-columns";
import { DomainRoutingProfileDrawer } from "./DomainRoutingProfileDrawer";
import { DomainsConfigTab } from "./DomainsConfigTab";
import { DomainsFiltersBar } from "./DomainsFiltersBar";
import { DomainsOverviewTab } from "./DomainsOverviewTab";
import { DomainsRoutingProfilesTab } from "./DomainsRoutingProfilesTab";
import { DomainsStatusTab } from "./DomainsStatusTab";
import { useDomainsPageViewModel } from "./useDomainsPageViewModel";
import {
  CLOUDFLARE_TOKEN_MODE_OPTIONS,
  EMPTY_CATALOG,
  INITIAL_PROFILE_VALUES,
  INITIAL_VALUES,
  PROVIDER_CAPABILITY_LABELS,
  buildDomainMutationPayload,
  getProtectedDomainDeleteReason,
  getProtectedDomainMutationReason,
  isFormValidationError,
  profileMatchesDomainScope,
  renderCatchAllModeTokens,
  type DomainTabKey,
} from "./domains-utils";

interface DomainsPageProps {
  currentUser?: SessionPayload["user"] | null;
  onDomainsChanged?: () => Promise<void> | void;
  onUnauthorized: () => void;
}

export default function DomainsPage({ currentUser, onDomainsChanged, onUnauthorized }: DomainsPageProps) {
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  const [form] = Form.useForm<DomainMutationPayload>();
  const [profileForm] = Form.useForm<DomainRoutingProfileMutationPayload>();
  const [activeTab, setActiveTab] = useState<DomainTabKey>("overview");
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
  const [keyword, setKeyword] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>();
  const [projectFilter, setProjectFilter] = useState<number>();
  const [environmentFilter, setEnvironmentFilter] = useState<number>();
  const [scopeFilter, setScopeFilter] = useState<DomainScopeFilter>("all");
  const [healthFilter, setHealthFilter] = useState<DomainHealthFilter>("all");
  const { handlePageError, notifyBatchActionResult } = usePageFeedback(onUnauthorized);
  const canWriteDomainResources = canWriteAnyResource(currentUser);
  const isProjectScoped = isProjectScopedUser(currentUser);
  const accessibleProjectIds = useMemo(() => getAccessibleProjectIds(currentUser), [currentUser]);
  const accessTag = getAccessModeTag(currentUser);
  const accessNotice = getWriteScopeNotice(currentUser, "域名资产", {
    projectScopedDescription: "你可以管理已绑定到自己项目的域名资产、路由策略和 Cloudflare 治理动作；超出项目范围的数据会继续显示，但仅支持只读查看。",
    projectScopedTitle: "当前为项目级域名视角",
    readOnlyDescription: "你仍然可以查看域名状态、配置、路由策略和 Cloudflare 漂移信息，但新增、编辑、同步、批量治理和删除入口都已关闭。",
    readOnlyTitle: "当前为域名只读视角",
  });
  const watchedCatchAllMode = Form.useWatch("catch_all_mode", form) || "inherit";
  const watchedDomainValue = Form.useWatch("domain", form) || "";
  const watchedIsEnabled = Form.useWatch("is_enabled", form) ?? INITIAL_VALUES.is_enabled;
  const watchedProjectId = Form.useWatch("project_id", form);
  const watchedEnvironmentId = Form.useWatch("environment_id", form);
  const watchedProvider = Form.useWatch("provider", form) || INITIAL_VALUES.provider;
  const watchedCloudflareTokenMode =
    Form.useWatch("cloudflare_api_token_mode", form)
    || INITIAL_VALUES.cloudflare_api_token_mode
    || "global";
  const watchedRoutingProfileProjectId = Form.useWatch("project_id", profileForm);
  const watchedRoutingProfileProvider = Form.useWatch("provider", profileForm) || INITIAL_PROFILE_VALUES.provider;

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
    if (watchedProvider === "cloudflare") return;
    form.setFieldsValue({
      cloudflare_api_token: "",
      cloudflare_api_token_mode: "global",
    });
  }, [form, watchedProvider]);

  useEffect(() => {
    if (watchedCloudflareTokenMode !== "global") return;
    if (form.getFieldValue("cloudflare_api_token")) {
      form.setFieldValue("cloudflare_api_token", "");
    }
  }, [form, watchedCloudflareTokenMode]);

  useEffect(() => {
    if (domainProviderSupports(watchedProvider, "catch_all_sync")) return;
    if (form.getFieldValue("allow_catch_all_sync") !== false) {
      form.setFieldValue("allow_catch_all_sync", false);
    }
  }, [form, watchedProvider]);

  useEffect(() => {
    if (domainProviderSupports(watchedProvider, "mailbox_route_sync")) return;
    if (form.getFieldValue("mailbox_route_forward_to")) {
      form.setFieldValue("mailbox_route_forward_to", "");
    }
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

  useEffect(() => {
    if (!environmentFilter) return;

    const environmentStillVisible = catalog.environments.some(
      item => item.id === environmentFilter && (!projectFilter || item.project_id === projectFilter),
    );

    if (!environmentStillVisible) {
      setEnvironmentFilter(undefined);
    }
  }, [catalog.environments, environmentFilter, projectFilter]);

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
      handlePageError(error);
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

  function resetFilters() {
    setKeyword("");
    setProviderFilter(undefined);
    setProjectFilter(undefined);
    setEnvironmentFilter(undefined);
    setScopeFilter("all");
    setHealthFilter("all");
  }

  function openCreate() {
    setEditing(null);
    form.setFieldsValue({
      ...INITIAL_VALUES,
      operation_note: "",
      project_id: isProjectScoped ? (accessibleProjectIds[0] || undefined) : INITIAL_VALUES.project_id,
    });
    setDrawerOpen(true);
  }

  function openProfileCreate() {
    setEditingProfile(null);
    profileForm.setFieldsValue({
      ...INITIAL_PROFILE_VALUES,
      operation_note: "",
      project_id: isProjectScoped ? (accessibleProjectIds[0] || undefined) : INITIAL_PROFILE_VALUES.project_id,
    });
    setProfileDrawerOpen(true);
  }

  function openEdit(record: DomainAssetRecord) {
    setEditing(record);
    form.setFieldsValue({
      allow_catch_all_sync: record.allow_catch_all_sync,
      allow_mailbox_route_sync: record.allow_mailbox_route_sync,
      allow_new_mailboxes: record.allow_new_mailboxes,
      catch_all_forward_to: record.catch_all_forward_to,
      catch_all_mode: record.catch_all_mode,
      cloudflare_api_token: "",
      cloudflare_api_token_mode: record.cloudflare_api_token_configured ? "domain" : "global",
      domain: record.domain,
      email_worker: record.email_worker,
      environment_id: record.environment_id || undefined,
      is_enabled: record.is_enabled,
      is_primary: record.is_primary,
      mailbox_route_forward_to: record.mailbox_route_forward_to,
      note: record.note,
      operation_note: "",
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
      operation_note: "",
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
        allow_catch_all_sync: values.allow_catch_all_sync,
        allow_mailbox_route_sync: values.allow_mailbox_route_sync,
        allow_new_mailboxes: values.allow_new_mailboxes,
        catch_all_forward_to: values.catch_all_forward_to.trim(),
        catch_all_mode: values.catch_all_mode,
        cloudflare_api_token: String(values.cloudflare_api_token || "").trim(),
        cloudflare_api_token_mode: values.cloudflare_api_token_mode || "global",
        domain: values.domain.trim(),
        email_worker: values.email_worker.trim(),
        environment_id: values.environment_id || null,
        is_enabled: values.is_enabled,
        is_primary: values.is_primary,
        mailbox_route_forward_to: String(values.mailbox_route_forward_to || "").trim(),
        note: values.note.trim(),
        operation_note: String(values.operation_note || "").trim(),
        project_id: values.project_id || null,
        provider: values.provider,
        routing_profile_id: values.routing_profile_id || null,
        zone_id: values.zone_id.trim(),
      };

      if (editing) {
        const activeMailboxTotal = statusMap.get(editing.domain)?.active_mailbox_total || 0;
        const protectedReason = getProtectedDomainMutationReason(editing, payload, activeMailboxTotal);
        if (protectedReason) {
          message.warning(protectedReason);
          return;
        }
        await updateDomainAsset(editing.id, payload);
        message.success("域名资产已更新");
      } else {
        await createDomainAsset(payload);
        message.success("域名资产已创建");
      }

      setDrawerOpen(false);
      await reloadAll();
    } catch (error) {
      if (!isFormValidationError(error)) {
        handlePageError(error);
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
        operation_note: String(values.operation_note || "").trim(),
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
      if (!isFormValidationError(error)) {
        handlePageError(error);
      }
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const record = items.find(item => item.id === id);
    const activeMailboxTotal = record ? (statusMap.get(record.domain)?.active_mailbox_total || 0) : 0;
    const protectedReason = record ? getProtectedDomainDeleteReason(record, activeMailboxTotal) : "";
    if (protectedReason) {
      message.warning(protectedReason);
      return;
    }

    const operationNote = await promptOperationNote(modal, {
      title: "删除域名资产",
      description: `将删除 ${record?.domain || `域名 #${id}`}。可选填写本次删除备注，便于后续审计追溯。`,
      okText: "确认删除",
    });
    if (operationNote === null) return;

    try {
      await removeDomainAsset(id, { operation_note: operationNote });
      message.success("域名资产已删除");
      await reloadAll();
    } catch (error) {
      handlePageError(error);
    }
  }

  async function handleProfileDelete(id: number) {
    const record = routingProfiles.find(item => item.id === id);
    const operationNote = await promptOperationNote(modal, {
      title: "删除路由策略",
      description: `将删除 ${record?.name || `路由策略 #${id}`}。可选填写本次删除备注，便于后续审计追溯。`,
      okText: "确认删除",
    });
    if (operationNote === null) return;

    try {
      await removeDomainRoutingProfile(id, { operation_note: operationNote });
      message.success("路由策略已删除");
      await reloadAll();
    } catch (error) {
      handlePageError(error);
    }
  }

  async function handleSyncCatchAll(id: number) {
    const record = items.find(item => item.id === id);
    const operationNote = await promptOperationNote(modal, {
      title: "同步 Catch-all 到 Cloudflare",
      description: `将为 ${record?.domain || `域名 #${id}`} 执行 Catch-all 同步。可选填写本次操作备注，便于后续审计追溯。`,
      okText: "开始同步",
    });
    if (operationNote === null) return;

    setSyncing(true);
    try {
      await syncDomainAssetCatchAll(id, { operation_note: operationNote });
      message.success("Catch-all 策略已同步到 Cloudflare");
      await reloadAll();
    } catch (error) {
      handlePageError(error);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncMailboxRoutes(id: number) {
    const record = items.find(item => item.id === id);
    const operationNote = await promptOperationNote(modal, {
      title: "同步邮箱路由到 Cloudflare",
      description: `将为 ${record?.domain || `域名 #${id}`} 执行邮箱路由同步。可选填写本次操作备注，便于后续审计追溯。`,
      okText: "开始同步",
    });
    if (operationNote === null) return;

    setSyncing(true);
    try {
      const result = await syncDomainAssetMailboxRoutes(id, { operation_note: operationNote });
      message.success(
        `邮箱路由已同步到 Cloudflare（新增 ${result.created_count}，更新 ${result.updated_count}，删除 ${result.deleted_count}）`,
      );
      await reloadAll();
    } catch (error) {
      handlePageError(error);
    } finally {
      setSyncing(false);
    }
  }

  async function handleBatchToggle(is_enabled: boolean) {
    let targetItems = selectedItems;
    let skippedCount = 0;
    if (!is_enabled) {
      targetItems = selectedItems.filter(item => (statusMap.get(item.domain)?.active_mailbox_total || 0) === 0);
      skippedCount = selectedItems.length - targetItems.length;
      if (targetItems.length === 0) {
        message.info("选中的域名仍有活跃邮箱，当前不能批量停用，请先清理这些邮箱。");
        return;
      }
    }

    const result = await runBatchAction(targetItems, item =>
      updateDomainAsset(item.id, buildDomainMutationPayload(item, { is_enabled })),
    );

    if (result.successCount > 0) {
      clearSelection();
      await reloadAll();
    }
    if (!is_enabled && skippedCount > 0) {
      message.info(`已跳过 ${skippedCount} 个仍有活跃邮箱的域名`);
    }

    notifyBatchActionResult(is_enabled ? "批量启用域名" : "批量停用域名", result);
  }

  async function handleBatchGovernance(
    field: "allow_new_mailboxes" | "allow_catch_all_sync" | "allow_mailbox_route_sync",
    value: boolean,
  ) {
    const actionLabel = field === "allow_new_mailboxes"
      ? value
        ? "批量允许新建邮箱"
        : "批量禁止新建邮箱"
      : field === "allow_catch_all_sync"
        ? value
          ? "批量开启 Catch-all 同步"
          : "批量关闭 Catch-all 同步"
      : value
        ? "批量开启路由同步"
        : "批量关闭路由同步";

    let targetItems = selectedItems;
    let skippedCount = 0;

    if (field === "allow_catch_all_sync" || field === "allow_mailbox_route_sync") {
      const capability = field === "allow_catch_all_sync" ? "catch_all_sync" : "mailbox_route_sync";
      targetItems = selectedItems.filter(item => domainProviderSupports(item.provider, capability));
      skippedCount = selectedItems.length - targetItems.length;

      if (targetItems.length === 0) {
        message.info(
          capability === "catch_all_sync"
            ? "选中的域名里没有支持 Catch-all 同步的 Provider，已跳过手动或外部托管域名"
            : "选中的域名里没有支持邮箱路由同步的 Provider，已跳过手动或外部托管域名",
        );
        return;
      }
    }

    const overrides: Partial<DomainMutationPayload> =
      field === "allow_new_mailboxes"
        ? { allow_new_mailboxes: value }
        : field === "allow_catch_all_sync"
          ? { allow_catch_all_sync: value }
          : { allow_mailbox_route_sync: value };

    const result = await runBatchAction(targetItems, item =>
      updateDomainAsset(item.id, buildDomainMutationPayload(item, overrides)),
    );

    if (result.successCount > 0) {
      clearSelection();
      await reloadAll();
    }

    const skippedSuffix = skippedCount > 0
      ? field === "allow_catch_all_sync"
        ? `，已跳过 ${skippedCount} 个不支持 Catch-all 同步的域名`
        : `，已跳过 ${skippedCount} 个不支持路由同步的域名`
      : "";
    notifyBatchActionResult(actionLabel, result, skippedSuffix);
  }

  async function handleBatchSyncCatchAll() {
    const syncableItems = selectedItems.filter(item => canSyncCatchAll(item));
    const skippedCount = selectedItems.length - syncableItems.length;
    if (syncableItems.length === 0) {
      message.info("选中的域名里没有可同步的 Catch-all 策略，可能是域名已停用、Provider 不支持、治理已关闭，或当前策略仍为继承模式");
      return;
    }

    const operationNote = await promptOperationNote(modal, {
      title: "批量同步 Catch-all",
      description: `将对 ${syncableItems.length} 个域名执行 Catch-all 同步。填写的备注会写入每条域名的审计记录。`,
      okText: "开始批量同步",
    });
    if (operationNote === null) return;

    setSyncing(true);
    try {
      const result = await runBatchAction(
        syncableItems,
        item => syncDomainAssetCatchAll(item.id, { operation_note: operationNote }),
      );
      if (result.successCount > 0) {
        clearSelection();
        await reloadAll();
      }

      const skippedSuffix = skippedCount > 0 ? `，已跳过 ${skippedCount} 个不可同步的域名` : "";
      notifyBatchActionResult("批量同步 Catch-all", result, skippedSuffix);
    } finally {
      setSyncing(false);
    }
  }

  async function handleBatchSyncMailboxRoutes() {
    const syncableItems = selectedItems.filter(item => canSyncMailboxRoutes(item));
    const skippedCount = selectedItems.length - syncableItems.length;
    if (syncableItems.length === 0) {
      message.info("选中的域名里没有可同步的邮箱路由，可能是域名已停用、Provider 不支持，或路由同步治理已关闭");
      return;
    }

    const operationNote = await promptOperationNote(modal, {
      title: "批量同步邮箱路由",
      description: `将对 ${syncableItems.length} 个域名执行邮箱路由同步。填写的备注会写入每条域名的审计记录。`,
      okText: "开始批量同步",
    });
    if (operationNote === null) return;

    setSyncing(true);
    try {
      const result = await runBatchAction(
        syncableItems,
        item => syncDomainAssetMailboxRoutes(item.id, { operation_note: operationNote }),
      );
      if (result.successCount > 0) {
        clearSelection();
        await reloadAll();
      }

      const skippedSuffix = skippedCount > 0 ? `，已跳过 ${skippedCount} 个不可同步的域名` : "";
      notifyBatchActionResult("批量同步邮箱路由", result, skippedSuffix);
    } finally {
      setSyncing(false);
    }
  }

  async function handleRepairDriftedCatchAll() {
    const targetItems = visibleRepairableCatchAllDriftItems;
    const skippedCount = visibleDriftCount - targetItems.length;
    if (targetItems.length === 0) {
      message.info("当前没有可直接修复的 Catch-all 漂移域名，可能是异常来自只读域名、治理已关闭，或 Provider 不支持");
      return;
    }

    const operationNote = await promptOperationNote(modal, {
      title: "批量修复 Catch-all 漂移",
      description: `将对 ${targetItems.length} 个域名执行 Catch-all 漂移修复。填写的备注会写入每条域名的审计记录。`,
      okText: "开始修复",
    });
    if (operationNote === null) return;

    setSyncing(true);
    try {
      const result = await runBatchAction(targetItems, item => {
        const asset = assetMap.get(item.domain);
        if (!asset) throw new Error("domain asset not found");
        return syncDomainAssetCatchAll(asset.id, { operation_note: operationNote });
      });
      if (result.successCount > 0) {
        await reloadAll();
      }

      const skippedSuffix = skippedCount > 0 ? `，已跳过 ${skippedCount} 个当前不可自动修复的域名` : "";
      notifyBatchActionResult("批量修复 Catch-all 漂移", result, skippedSuffix);
    } finally {
      setSyncing(false);
    }
  }

  async function handleRepairDriftedMailboxRoutes() {
    const targetItems = visibleRepairableMailboxRouteDriftItems;
    const skippedCount = visibleRouteDriftCount - targetItems.length;
    if (targetItems.length === 0) {
      message.info("当前没有可直接修复的邮箱路由漂移域名，可能是异常来自只读域名、治理已关闭，或 Provider 不支持");
      return;
    }

    const operationNote = await promptOperationNote(modal, {
      title: "批量修复邮箱路由漂移",
      description: `将对 ${targetItems.length} 个域名执行邮箱路由漂移修复。填写的备注会写入每条域名的审计记录。`,
      okText: "开始修复",
    });
    if (operationNote === null) return;

    setSyncing(true);
    try {
      const result = await runBatchAction(targetItems, item => {
        const asset = assetMap.get(item.domain);
        if (!asset) throw new Error("domain asset not found");
        return syncDomainAssetMailboxRoutes(asset.id, { operation_note: operationNote });
      });
      if (result.successCount > 0) {
        await reloadAll();
      }

      const skippedSuffix = skippedCount > 0 ? `，已跳过 ${skippedCount} 个当前不可自动修复的域名` : "";
      notifyBatchActionResult("批量修复邮箱路由漂移", result, skippedSuffix);
    } finally {
      setSyncing(false);
    }
  }

  async function handleBatchDelete() {
    const deletableItems = selectedItems.filter(item => (statusMap.get(item.domain)?.active_mailbox_total || 0) === 0);
    const skippedCount = selectedItems.length - deletableItems.length;
    if (deletableItems.length === 0) {
      message.info("选中的域名仍有活跃邮箱，当前不能批量删除，请先清理这些邮箱。");
      return;
    }

    const operationNote = await promptOperationNote(modal, {
      title: "批量删除域名",
      description: `将删除 ${deletableItems.length} 个域名。填写的备注会写入每条域名的审计记录。`,
      okText: "确认批量删除",
    });
    if (operationNote === null) return;

    const result = await runBatchAction(
      deletableItems,
      item => removeDomainAsset(item.id, { operation_note: operationNote }),
    );
    if (result.successCount > 0) {
      clearSelection();
      await reloadAll();
    }
    if (skippedCount > 0) {
      message.info(`已跳过 ${skippedCount} 个仍有活跃邮箱的域名`);
    }

    notifyBatchActionResult("批量删除域名", result);
  }

  const {
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
  } = useDomainsPageViewModel({
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
  });

  const batchGovernanceMenu = {
    items: [
      { key: "allow_mailbox_create", label: "允许新建邮箱" },
      { key: "block_mailbox_create", label: "禁止新建邮箱" },
      { key: "enable_catch_all_sync", label: "开启 Catch-all 同步" },
      { key: "disable_catch_all_sync", label: "关闭 Catch-all 同步" },
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
      if (key === "enable_catch_all_sync") {
        void handleBatchGovernance("allow_catch_all_sync", true);
        return;
      }
      if (key === "disable_catch_all_sync") {
        void handleBatchGovernance("allow_catch_all_sync", false);
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

  const statusColumns = useMemo(
    () => buildDomainStatusColumns({
      assetMap,
      canManageDomainAssetRecord,
      handleSyncCatchAll: id => {
        void handleSyncCatchAll(id);
      },
      handleSyncMailboxRoutes: id => {
        void handleSyncMailboxRoutes(id);
      },
      providerMap,
      syncing,
    }),
    [assetMap, providerMap, syncing],
  );

  const configColumns = useMemo(
    () => buildDomainConfigColumns({
      canManageDomainAssetRecord,
      getProtectedDomainDeleteReason,
      handleDelete: id => {
        void handleDelete(id);
      },
      handleSyncCatchAll: id => {
        void handleSyncCatchAll(id);
      },
      handleSyncMailboxRoutes: id => {
        void handleSyncMailboxRoutes(id);
      },
      openEdit,
      providerMap,
      statusMap,
      syncing,
    }),
    [providerMap, statusMap, syncing],
  );

  const routingProfileColumns = useMemo(
    () => buildRoutingProfileColumns({
      canManageRoutingProfileRecord,
      handleProfileDelete: id => {
        void handleProfileDelete(id);
      },
      openProfileEdit,
      providerMap,
    }),
    [providerMap],
  );

  return (
    <div className="page-tab-stack">
      <PageHeader
        title="域名资产"
        subtitle="统一管理接入域名、Cloudflare 路由配置，以及项目/环境级工作空间绑定。"
        tags={[
          ...(accessTag ? [accessTag] : []),
          ...(errorCount > 0 ? [{ color: "error", label: `异常 ${errorCount}` }] : []),
          ...(governanceBlockedCount > 0 ? [{ color: "processing", label: `治理受阻 ${governanceBlockedCount}` }] : []),
          ...(driftCount > 0 ? [{ color: "warning", label: `待同步 ${driftCount}` }] : []),
          ...(routeDriftCount > 0 ? [{ color: "orange", label: `路由漂移 ${routeDriftCount}` }] : []),
        ]}
        extra={(
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void reloadAll()} loading={loading}>
              刷新状态
            </Button>
            {canWriteDomainResources ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                新增域名
              </Button>
            ) : null}
          </Space>
        )}
      />

      {accessNotice ? (
        <Alert
          showIcon
          type={canWriteDomainResources ? "info" : "warning"}
          message={accessNotice.title}
          description={accessNotice.description}
        />
      ) : null}

      {activeTab !== "overview" ? (
        <DomainsFiltersBar
          activeTab={activeTab}
          currentTabResultCount={currentTabResultCount}
          currentTabTotalCount={currentTabTotalCount}
          environmentFilter={environmentFilter}
          filterEnvironmentOptions={filterEnvironmentOptions}
          hasDomainFilters={hasDomainFilters}
          healthFilter={healthFilter}
          keyword={keyword}
          onEnvironmentFilterChange={value => setEnvironmentFilter(value)}
          onHealthFilterChange={value => setHealthFilter(value)}
          onKeywordChange={value => setKeyword(value)}
          onProjectFilterChange={value => {
            setProjectFilter(value);
            setEnvironmentFilter(undefined);
          }}
          onProviderFilterChange={value => setProviderFilter(value)}
          onResetFilters={resetFilters}
          onScopeFilterChange={value => setScopeFilter(value)}
          projectFilter={projectFilter}
          projectOptions={projectOptions}
          providerFilter={providerFilter}
          providerOptions={providerOptions}
          scopeFilter={scopeFilter}
        />
      ) : null}

      <Tabs
        activeKey={activeTab}
        className="page-section-tabs"
        onChange={value => setActiveTab(value as DomainTabKey)}
        items={[
          {
            key: "overview",
            label: "概览",
            children: (
              <DomainsOverviewTab
                assetOverviewItems={assetOverviewItems}
                cloudflareHealthOverviewItems={cloudflareHealthOverviewItems}
                cloudflareRoutingOverviewItems={cloudflareRoutingOverviewItems}
                configuredCount={configuredCount}
                driftCount={driftCount}
                emailVolumeChartData={emailVolumeChartData}
                enabledCount={enabledCount}
                healthyCount={healthyCount}
                itemsLength={items.length}
                managedMailboxChartData={managedMailboxChartData}
                providerOverviewItems={providerOverviewItems}
                routeCoverageChartData={routeCoverageChartData}
                routeDriftCount={routeDriftCount}
                statusItemsLength={statusItems.length}
                totalManagedMailboxes={totalManagedMailboxes}
                totalObservedMailboxes={totalObservedMailboxes}
              />
            ),
          },
          {
            key: "status",
            label: `运行状态 (${statusItems.length})`,
            children: (
              <DomainsStatusTab
                canWriteDomainResources={canWriteDomainResources}
                filteredStatusItems={filteredStatusItems}
                healthFilter={healthFilter}
                itemsLength={items.length}
                loading={loading}
                onHealthFilterChange={value => setHealthFilter(value)}
                onRepairCatchAll={() => void handleRepairDriftedCatchAll()}
                onRepairMailboxRoutes={() => void handleRepairDriftedMailboxRoutes()}
                statusColumns={statusColumns}
                statusFocusCards={statusFocusCards}
                statusItemsLength={statusItems.length}
                syncing={syncing}
                visibleConfiguredCount={visibleConfiguredCount}
                visibleDriftCount={visibleDriftCount}
                visibleErrorCount={visibleErrorCount}
                visibleGovernanceBlockedCount={visibleGovernanceBlockedSummary.items.length}
                visibleHealthyCount={visibleHealthyCount}
                visibleRepairableCatchAllCount={visibleRepairableCatchAllDriftItems.length}
                visibleRepairableMailboxRouteCount={visibleRepairableMailboxRouteDriftItems.length}
                visibleRouteDriftCount={visibleRouteDriftCount}
              />
            ),
          },
          {
            key: "config",
            label: `配置管理 (${items.length})`,
            children: (
              <DomainsConfigTab
                batchGovernanceMenu={batchGovernanceMenu}
                canWriteDomainResources={canWriteDomainResources}
                clearSelection={clearSelection}
                configColumns={configColumns}
                filteredConfigItems={filteredConfigItems}
                itemsLength={items.length}
                loading={loading}
                onBatchDelete={() => void handleBatchDelete()}
                onBatchSyncCatchAll={() => void handleBatchSyncCatchAll()}
                onBatchSyncMailboxRoutes={() => void handleBatchSyncMailboxRoutes()}
                onBatchToggleDisable={() => void handleBatchToggle(false)}
                onBatchToggleEnable={() => void handleBatchToggle(true)}
                onCreate={openCreate}
                rowSelection={domainRowSelection}
                selectedCount={selectedItems.length}
                syncing={syncing}
              />
            ),
          },
          {
            key: "routing-profiles",
            label: `路由策略 (${routingProfiles.length})`,
            children: (
              <DomainsRoutingProfilesTab
                canWriteDomainResources={canWriteDomainResources}
                columns={routingProfileColumns}
                dataSource={filteredRoutingProfiles}
                loading={loading}
                onCreate={openProfileCreate}
                totalCount={routingProfiles.length}
              />
            ),
          },
        ]}
      />

      <DomainAssetDrawer
        accessibleProjectIds={accessibleProjectIds}
        activeProvider={activeProvider || undefined}
        domainCatchAllOptions={domainCatchAllOptions}
        editing={editing}
        editingHasActiveMailboxes={editingHasActiveMailboxes}
        editingProtectedReason={editingProtectedReason}
        environmentOptions={environmentOptions}
        form={form}
        isProjectScoped={isProjectScoped}
        loading={saving}
        onClose={() => setDrawerOpen(false)}
        onSubmit={() => void handleSubmit()}
        open={drawerOpen}
        projectOptions={projectOptions}
        providerOptions={providerOptions}
        routingProfileOptions={routingProfileOptions}
        watchedCatchAllMode={watchedCatchAllMode}
        watchedCloudflareTokenMode={watchedCloudflareTokenMode}
        watchedProjectId={watchedProjectId}
      />

      <DomainRoutingProfileDrawer
        accessibleProjectIds={accessibleProjectIds}
        activeProvider={activeRoutingProfileProvider || undefined}
        editingProfile={editingProfile}
        environmentOptions={routingProfileEnvironmentOptions}
        form={profileForm}
        isProjectScoped={isProjectScoped}
        loading={profileSaving}
        onClose={() => setProfileDrawerOpen(false)}
        onSubmit={() => void handleProfileSubmit()}
        open={profileDrawerOpen}
        projectOptions={projectOptions}
        providerOptions={routingProfileProviderOptions}
        watchedProjectId={watchedRoutingProfileProjectId}
      />
    </div>
  );
}
