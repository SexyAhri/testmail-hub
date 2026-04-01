import { Alert, App, Button, Form, Popconfirm } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getDomains } from "../../api/domains";
import {
  createMailbox,
  getLatestMailboxSyncRun,
  getMailboxSyncRun,
  getMailboxes,
  removeMailbox,
  syncMailboxes,
  updateMailbox,
} from "../../api/mailboxes";
import { getWorkspaceCatalog } from "../../api/workspace";
import { BatchActionsBar, DataTable, PageHeader } from "../../components";
import { promptOperationNote } from "../../delete-operation-note";
import { usePageFeedback } from "../../hooks/usePageFeedback";
import { useTableSelection } from "../../hooks/useTableSelection";
import {
  canManageGlobalSettings,
  canManageProjectResource,
  canWriteAnyResource,
  getAccessibleProjectIds,
  isProjectScopedUser,
  isReadOnlyUser,
  type CurrentUser,
} from "../../permissions";
import { resolveRetentionFromCatalog } from "../../retention";
import type {
  MailboxPayload,
  MailboxRecord,
  MailboxSyncRunRecord,
  WorkspaceCatalog,
} from "../../types";
import { loadAllPages, randomLocalPart, runBatchAction } from "../../utils";
import { MailboxFormDrawer } from "./MailboxFormDrawer";
import { MailboxesFilters } from "./MailboxesFilters";
import { MailboxesMetrics } from "./MailboxesMetrics";
import { buildMailboxColumns } from "./mailbox-table-columns";

interface MailboxesPageProps {
  currentUser?: CurrentUser;
  domains: string[];
  mailboxDomain: string;
  onMailboxesChanged?: () => Promise<void> | void;
  onUnauthorized: () => void;
}

interface MailboxFormValues {
  batch_count: number;
  domain: string;
  environment_id?: number;
  expires_at?: dayjs.Dayjs | null;
  is_enabled: boolean;
  local_part: string;
  mailbox_pool_id?: number;
  note: string;
  project_id?: number;
  tags: string;
}

const EMPTY_CATALOG: WorkspaceCatalog = {
  environments: [],
  mailbox_pools: [],
  projects: [],
};

const SYNC_POLL_ATTEMPTS = 120;
const SYNC_POLL_INTERVAL_MS = 1500;

export default function MailboxesPage({
  currentUser,
  domains,
  mailboxDomain,
  onMailboxesChanged,
  onUnauthorized,
}: MailboxesPageProps) {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<MailboxFormValues>();
  const [mailboxes, setMailboxes] = useState<MailboxRecord[]>([]);
  const [catalog, setCatalog] = useState<WorkspaceCatalog>(EMPTY_CATALOG);
  const [availableDomains, setAvailableDomains] = useState<string[]>([]);
  const [preferredDomain, setPreferredDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<MailboxSyncRunRecord | null>(null);
  const [searchText, setSearchText] = useState("");
  const [projectFilter, setProjectFilter] = useState<number | undefined>();
  const [environmentFilter, setEnvironmentFilter] = useState<number | undefined>();
  const [mailboxPoolFilter, setMailboxPoolFilter] = useState<number | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<MailboxRecord | null>(null);
  const watchedProjectId = Form.useWatch("project_id", form);
  const watchedEnvironmentId = Form.useWatch("environment_id", form);
  const watchedMailboxPoolId = Form.useWatch("mailbox_pool_id", form);
  const { handlePageError, notifyBatchActionResult } = usePageFeedback(onUnauthorized);
  const canWriteMailboxes = canWriteAnyResource(currentUser);
  const canSyncRoutes = canManageGlobalSettings(currentUser);
  const isProjectScoped = isProjectScopedUser(currentUser);
  const isViewer = isReadOnlyUser(currentUser);
  const syncPollTokenRef = useRef(0);
  const accessibleProjectIds = useMemo(() => getAccessibleProjectIds(currentUser), [currentUser]);

  const formResolvedRetention = useMemo(
    () => resolveRetentionFromCatalog(catalog, {
      environment_id: watchedEnvironmentId,
      mailbox_pool_id: watchedMailboxPoolId,
      project_id: watchedProjectId,
    }),
    [catalog, watchedEnvironmentId, watchedMailboxPoolId, watchedProjectId],
  );

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!canSyncRoutes) {
      setSyncSummary(null);
      return;
    }

    void loadLatestSyncRun();
  }, [canSyncRoutes]);

  useEffect(() => () => {
    syncPollTokenRef.current += 1;
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;

    let disposed = false;
    void (async () => {
      try {
        const payload = await getDomains({
          environment_id: watchedEnvironmentId,
          purpose: "mailbox_create",
          project_id: watchedProjectId,
        });
        if (disposed) return;

        setAvailableDomains(payload.domains);
        setPreferredDomain(payload.default_domain || "");

        const nextDomain = payload.default_domain || payload.domains[0] || "";
        const currentDomain = String(form.getFieldValue("domain") || "").trim();
        if (!currentDomain || !payload.domains.includes(currentDomain)) {
          form.setFieldValue("domain", nextDomain || undefined);
        }
      } catch (error) {
        if (!disposed) handlePageError(error);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [drawerOpen, form, handlePageError, watchedEnvironmentId, watchedProjectId]);

  async function loadData() {
    setLoading(true);
    try {
      const [items, workspaceCatalog] = await Promise.all([
        loadAllPages(page => getMailboxes(page, false)),
        getWorkspaceCatalog(true),
      ]);
      setMailboxes(items);
      setCatalog(workspaceCatalog);
    } catch (error) {
      handlePageError(error);
    } finally {
      setLoading(false);
    }
  }

  function isActiveSyncRun(run: Pick<MailboxSyncRunRecord, "status"> | null | undefined) {
    return run?.status === "pending" || run?.status === "running";
  }

  function getSyncSuccessMessage(run: Pick<MailboxSyncRunRecord, "catch_all_enabled" | "cloudflare_configured" | "cloudflare_routes_total" | "created_count" | "updated_count">) {
    const parts = [`新增 ${run.created_count} 个`, `更新 ${run.updated_count} 个`];
    if (run.cloudflare_configured) {
      parts.push(`Cloudflare 路由 ${run.cloudflare_routes_total} 条`);
      if (run.catch_all_enabled) parts.push("Catch-all 已启用");
    } else {
      parts.push("未配置 Cloudflare 路由");
    }
    return parts.join("，");
  }

  async function loadLatestSyncRun() {
    try {
      const run = await getLatestMailboxSyncRun();
      setSyncSummary(run);
      if (run && isActiveSyncRun(run)) {
        await pollSyncRun(run.id, false);
      }
    } catch (error) {
      handlePageError(error);
    }
  }

  async function pollSyncRun(jobId: number, showToast: boolean) {
    const pollToken = syncPollTokenRef.current + 1;
    syncPollTokenRef.current = pollToken;
    setSyncing(true);

    try {
      for (let attempt = 0; attempt < SYNC_POLL_ATTEMPTS; attempt += 1) {
        const run = await getMailboxSyncRun(jobId);
        if (syncPollTokenRef.current !== pollToken) return;

        setSyncSummary(run);

        if (run.status === "success") {
          if (showToast) {
            message.success(getSyncSuccessMessage(run));
          }
          await loadData();
          return;
        }

        if (run.status === "failed") {
          if (showToast) {
            message.error(run.error_message || "邮箱同步失败。");
          }
          return;
        }

        await new Promise(resolve => setTimeout(resolve, SYNC_POLL_INTERVAL_MS));
      }

      if (showToast) {
        message.info("邮箱同步仍在后台执行，可稍后查看状态。");
      }
    } catch (error) {
      handlePageError(error);
    } finally {
      if (syncPollTokenRef.current === pollToken) {
        setSyncing(false);
      }
    }
  }

  async function performSync(showToast: boolean) {
    setSyncing(true);
    try {
      const result = await syncMailboxes();
      if (showToast) {
        message.info("邮箱同步任务已提交，正在后台执行。");
      }
      await pollSyncRun(result.job_id, showToast);
    } catch (error) {
      if (showToast) {
        handlePageError(error);
      } else {
        handlePageError(error);
      }
      setSyncing(false);
    }
  }

  async function syncDomains() {
    if (!onMailboxesChanged) return;
    await onMailboxesChanged();
  }

  const domainOptions = useMemo(() => {
    const sourceDomains = drawerOpen ? availableDomains : domains;
    const fallbackDomain = drawerOpen ? preferredDomain : mailboxDomain;
    const values = Array.from(new Set([...sourceDomains, fallbackDomain].filter(Boolean)));
    return values.map(item => ({ label: item, value: item }));
  }, [availableDomains, domains, drawerOpen, mailboxDomain, preferredDomain]);

  function openCreateDrawer() {
    setEditing(null);
    setAvailableDomains(domains);
    setPreferredDomain(mailboxDomain);
    const defaultProjectId = isProjectScoped ? accessibleProjectIds[0] : undefined;
    form.setFieldsValue({
      batch_count: 1,
      domain: mailboxDomain || domains[0] || "",
      environment_id: undefined,
      expires_at: null,
      is_enabled: true,
      local_part: "",
      mailbox_pool_id: undefined,
      note: "",
      project_id: defaultProjectId,
      tags: "",
    });
    setDrawerOpen(true);
  }

  function openEditDrawer(record: MailboxRecord) {
    const [local_part, domain = domains[0] || mailboxDomain] = record.address.split("@");
    setEditing(record);
    setAvailableDomains(domains);
    setPreferredDomain(domain);
    form.setFieldsValue({
      batch_count: 1,
      domain,
      environment_id: record.environment_id || undefined,
      expires_at: record.expires_at ? dayjs(record.expires_at) : null,
      is_enabled: record.is_enabled,
      local_part,
      mailbox_pool_id: record.mailbox_pool_id || undefined,
      note: record.note,
      project_id: record.project_id || undefined,
      tags: record.tags.join(", "),
    });
    setDrawerOpen(true);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const values = await form.validateFields();
      const payload: MailboxPayload = {
        batch_count: values.batch_count,
        domain: values.domain.trim(),
        environment_id: values.environment_id || null,
        expires_at: values.expires_at ? values.expires_at.valueOf() : null,
        generate_random: !values.local_part.trim(),
        is_enabled: values.is_enabled,
        local_part: values.local_part.trim(),
        mailbox_pool_id: values.mailbox_pool_id || null,
        note: values.note.trim(),
        project_id: values.project_id || null,
        tags: values.tags,
      };

      if (editing) {
        await updateMailbox(editing.id, payload);
        message.success("邮箱已更新。");
      } else {
        await createMailbox(payload);
        message.success("邮箱已创建。");
      }

      setDrawerOpen(false);
      await Promise.all([loadData(), syncDomains()]);
    } catch (error) {
      const blocked = handlePageError(error, { ignoreFallbackMessage: true });
      if (!blocked && !(error instanceof Error)) {
        message.error("保存邮箱失败");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(record: MailboxRecord) {
    const operationNote = await promptOperationNote(modal, {
      title: "删除邮箱",
      description: `将删除 ${record.address}。可选填写本次删除备注，便于后续审计追溯。`,
      okText: "确认删除",
    });
    if (operationNote === null) return;

    try {
      await removeMailbox(record.id, { operation_note: operationNote });
      message.success("邮箱已删除。");
      await Promise.all([loadData(), syncDomains()]);
    } catch (error) {
      handlePageError(error);
    }
  }

  const filteredMailboxes = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return mailboxes.filter(item => {
      if (projectFilter && item.project_id !== projectFilter) return false;
      if (environmentFilter && item.environment_id !== environmentFilter) return false;
      if (mailboxPoolFilter && item.mailbox_pool_id !== mailboxPoolFilter) return false;
      if (!keyword) return true;
      return [
        item.address,
        item.note,
        item.tags.join(", "),
        item.project_name,
        item.environment_name,
        item.mailbox_pool_name,
      ].some(value => value.toLowerCase().includes(keyword));
    });
  }, [environmentFilter, mailboxPoolFilter, mailboxes, projectFilter, searchText]);

  const enabledCount = useMemo(() => mailboxes.filter(item => item.is_enabled).length, [mailboxes]);
  const assignedCount = useMemo(() => mailboxes.filter(item => item.project_id !== null).length, [mailboxes]);
  const syncAlert = useMemo(() => {
    if (!syncSummary) return null;

    if (syncSummary.status === "failed") {
      return {
        description: `开始于 ${new Date(syncSummary.started_at).toLocaleString()}；失败原因：${syncSummary.error_message || "未知错误"}`,
        message: "最近一次邮箱同步失败",
        type: "error" as const,
      };
    }

    if (isActiveSyncRun(syncSummary)) {
      return {
        description: `任务已在后台执行，开始时间 ${new Date(syncSummary.started_at).toLocaleString()}。你可以继续操作当前页面，完成后会自动刷新列表。`,
        message: "邮箱同步正在后台执行",
        type: "info" as const,
      };
    }

    return {
      description: `开始于 ${new Date(syncSummary.started_at).toLocaleString()}；完成于 ${new Date(syncSummary.finished_at || 0).toLocaleString()}；新增 ${syncSummary.created_count} 个，更新 ${syncSummary.updated_count} 个，跳过 ${syncSummary.skipped_count} 个。`,
      message: "最近一次邮箱同步已完成",
      type: "success" as const,
    };
  }, [syncSummary]);

  const { clearSelection, rowSelection, selectedItems } = useTableSelection(filteredMailboxes, "id");
  const mailboxRowSelection = useMemo(
    () => (canWriteMailboxes ? {
      ...rowSelection,
      getCheckboxProps: (record: MailboxRecord) => ({
        disabled: !canManageMailboxRecord(record),
      }),
    } : undefined),
    [canWriteMailboxes, rowSelection],
  );

  const projectOptions = useMemo(
    () =>
      catalog.projects
        .filter(item => !isProjectScoped || accessibleProjectIds.includes(item.id))
        .map(item => ({
          label: item.is_enabled ? item.name : `${item.name}（已停用）`,
          value: item.id,
        })),
    [accessibleProjectIds, catalog.projects, isProjectScoped],
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

  const mailboxPoolOptions = useMemo(
    () =>
      catalog.mailbox_pools
        .filter(item => !isProjectScoped || accessibleProjectIds.includes(item.project_id))
        .filter(item => !watchedProjectId || item.project_id === watchedProjectId)
        .filter(item => !watchedEnvironmentId || item.environment_id === watchedEnvironmentId)
        .map(item => ({
          label: item.is_enabled ? item.name : `${item.name}（已停用）`,
          value: item.id,
        })),
    [accessibleProjectIds, catalog.mailbox_pools, isProjectScoped, watchedEnvironmentId, watchedProjectId],
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

  const filterMailboxPoolOptions = useMemo(
    () =>
      catalog.mailbox_pools
        .filter(item => !projectFilter || item.project_id === projectFilter)
        .filter(item => !environmentFilter || item.environment_id === environmentFilter)
        .map(item => ({
          label: item.is_enabled ? item.name : `${item.name}（已停用）`,
          value: item.id,
        })),
    [catalog.mailbox_pools, environmentFilter, projectFilter],
  );

  function canManageMailboxRecord(record: Pick<MailboxRecord, "project_id">) {
    return canManageProjectResource(currentUser, record.project_id);
  }

  function buildMailboxUpdatePayload(record: MailboxRecord, is_enabled: boolean): MailboxPayload {
    const [local_part = "", domain = domains[0] || mailboxDomain] = record.address.split("@");
    return {
      batch_count: 1,
      domain,
      environment_id: record.environment_id,
      expires_at: record.expires_at,
      generate_random: false,
      is_enabled,
      local_part,
      mailbox_pool_id: record.mailbox_pool_id,
      note: record.note,
      project_id: record.project_id,
      tags: record.tags,
    };
  }

  async function handleBatchToggle(is_enabled: boolean) {
    const result = await runBatchAction(selectedItems, item =>
      updateMailbox(item.id, buildMailboxUpdatePayload(item, is_enabled)),
    );

    if (result.successCount > 0) {
      clearSelection();
      await Promise.all([loadData(), syncDomains()]);
    }

    notifyBatchActionResult(is_enabled ? "批量启用邮箱" : "批量停用邮箱", result);
  }

  async function handleBatchDelete() {
    const operationNote = await promptOperationNote(modal, {
      title: "批量删除邮箱",
      description: `将删除 ${selectedItems.length} 个邮箱。填写的备注会写入每条邮箱的审计记录。`,
      okText: "确认批量删除",
    });
    if (operationNote === null) return;

    const result = await runBatchAction(
      selectedItems,
      item => removeMailbox(item.id, { operation_note: operationNote }),
    );
    if (result.successCount > 0) {
      clearSelection();
      await Promise.all([loadData(), syncDomains()]);
    }

    notifyBatchActionResult("批量删除邮箱", result);
  }

  const columns = buildMailboxColumns({
    canManageMailboxRecord,
    onDelete: record => void handleDelete(record),
    onEdit: openEditDrawer,
    onOpenInbox: record => navigate(`/emails?address=${encodeURIComponent(record.address)}`),
  });

  return (
    <div>
      <PageHeader
        title="邮箱"
        subtitle="创建、批量生成、同步并管理托管邮箱，同时查看归属范围和生命周期策略。"
        tags={
          isViewer
            ? [{ color: "gold", label: "只读" }]
            : isProjectScoped
              ? [{ color: "gold", label: "项目范围" }]
              : undefined
        }
      />

      {!canWriteMailboxes ? (
        <Alert
          showIcon
          type="info"
          message="当前账号对邮箱管理为只读。"
          description="你仍可查看邮箱资产并打开收件箱，但新建、编辑、删除和批量操作已禁用。"
          style={{ marginBottom: 16 }}
        />
      ) : isProjectScoped ? (
        <Alert
          showIcon
          type="info"
          message="当前账号只能管理已绑定项目内的邮箱资产。"
          description="全局路由同步已禁用，新建邮箱也仅限当前账号绑定的项目。"
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {canSyncRoutes && syncAlert ? (
        <Alert
          showIcon
          type={syncAlert.type}
          message={syncAlert.message}
          description={syncAlert.description}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <MailboxesMetrics
        assignedCount={assignedCount}
        enabledCount={enabledCount}
        mailboxCount={mailboxes.length}
        routeValue={syncSummary?.cloudflare_configured ? syncSummary.cloudflare_routes_total : domainOptions.length || "--"}
        syncConfigured={Boolean(syncSummary?.cloudflare_configured)}
      />

      <div style={{ marginBottom: 16 }}>
        <MailboxesFilters
          canSyncRoutes={canSyncRoutes}
          canWriteMailboxes={canWriteMailboxes}
          environmentFilter={environmentFilter}
          environmentOptions={filterEnvironmentOptions}
          mailboxPoolFilter={mailboxPoolFilter}
          mailboxPoolOptions={filterMailboxPoolOptions}
          onCreate={openCreateDrawer}
          onEnvironmentChange={value => {
            setEnvironmentFilter(value);
            setMailboxPoolFilter(undefined);
          }}
          onMailboxPoolChange={value => setMailboxPoolFilter(value)}
          onProjectChange={value => {
            setProjectFilter(value);
            setEnvironmentFilter(undefined);
            setMailboxPoolFilter(undefined);
          }}
          onReset={() => {
            setSearchText("");
            setProjectFilter(undefined);
            setEnvironmentFilter(undefined);
            setMailboxPoolFilter(undefined);
          }}
          onSearchChange={setSearchText}
          onSync={() => void performSync(true)}
          projectFilter={projectFilter}
          projectOptions={projectOptions}
          searchText={searchText}
          syncing={syncing}
        />
      </div>

      <DataTable
        cardTitle="邮箱资产"
        cardToolbar={canWriteMailboxes ? (
          <BatchActionsBar selectedCount={selectedItems.length} onClear={clearSelection}>
            <Button onClick={() => void handleBatchToggle(true)}>
              批量启用
            </Button>
            <Button onClick={() => void handleBatchToggle(false)}>
              批量停用
            </Button>
            <Popconfirm
              title={`确认删除选中的 ${selectedItems.length} 个邮箱吗？`}
              onConfirm={() => void handleBatchDelete()}
            >
              <Button danger>
                批量删除
              </Button>
            </Popconfirm>
          </BatchActionsBar>
        ) : undefined}
        columns={columns}
        dataSource={filteredMailboxes}
        loading={loading}
        rowSelection={mailboxRowSelection}
        rowKey="id"
        pageSize={10}
      />

      {canWriteMailboxes ? (
        <MailboxFormDrawer
          domainOptions={domainOptions}
          editing={editing}
          environmentOptions={environmentOptions}
          form={form}
          formResolvedRetention={formResolvedRetention}
          isProjectScoped={isProjectScoped}
          loading={saving}
          mailboxPoolOptions={mailboxPoolOptions}
          onClose={() => setDrawerOpen(false)}
          onProjectChange={() => {
            form.setFieldValue("environment_id", undefined);
            form.setFieldValue("mailbox_pool_id", undefined);
          }}
          onRandomizeLocalPart={() => form.setFieldValue("local_part", randomLocalPart())}
          onSubmit={() => void handleSubmit()}
          open={drawerOpen}
          projectOptions={projectOptions}
          watchedEnvironmentId={watchedEnvironmentId}
          watchedProjectId={watchedProjectId}
        />
      ) : null}
    </div>
  );
}
