import { ReloadOutlined } from "@ant-design/icons";
import { Alert, App, Button, Form, Space } from "antd";
import { useEffect, useMemo, useState } from "react";

import { summarizeAdminGovernance } from "../../admin-governance";
import { createAdmin, getAdmins, updateAdmin } from "../../api/admins";
import { getAuditLogs } from "../../api/observability";
import { getWorkspaceCatalog } from "../../api/workspace";
import {
  BatchActionsBar,
  DataTable,
  PageHeader,
} from "../../components";
import { usePageFeedback } from "../../hooks/usePageFeedback";
import { useTableSelection } from "../../hooks/useTableSelection";
import type {
  AdminListFilters,
  AdminMutationPayload,
  AdminRole,
  AdminUserRecord,
  AuditLogListFilters,
  AuditLogRecord,
  PaginationPayload,
  WorkspaceProjectRecord,
} from "../../types";
import { runBatchAction } from "../../utils";
import {
  ADMIN_ROLE_LABELS,
  normalizeAdminRole,
  requiresBoundAdminScope,
  requiresGlobalAdminScope,
} from "../../../utils/constants";
import {
  canManageAdminRecord,
  canManageAdmins,
  getAccessibleProjectIds,
  isOwnerUser,
  isProjectScopedUser,
  type CurrentUser,
} from "../../permissions";
import { AdminFilters } from "./AdminFilters";
import { AdminFormDrawer } from "./AdminFormDrawer";
import { AdminHistoryDrawer } from "./AdminHistoryDrawer";
import { buildAdminColumns } from "./admin-table-columns";
import { AdminsMetrics } from "./AdminsMetrics";

interface AdminsPageProps {
  currentUser?: CurrentUser;
  onUnauthorized: () => void;
}

const EMPTY_LIST: PaginationPayload<AdminUserRecord> = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
};

const EMPTY_FILTERS: AdminListFilters = {
  access_scope: null,
  is_enabled: null,
  keyword: "",
  project_id: null,
  role: null,
};

const EMPTY_HISTORY_FILTERS: Pick<AuditLogListFilters, "action" | "keyword"> = {
  action: null,
  keyword: "",
};

const INITIAL_VALUES: AdminMutationPayload = {
  access_scope: "all",
  display_name: "",
  is_enabled: true,
  note: "",
  operation_note: "",
  password: "",
  project_ids: [],
  role: "viewer",
  username: "",
};

function normalizeFilters(filters: AdminListFilters): AdminListFilters {
  return {
    access_scope: filters.access_scope || null,
    is_enabled: typeof filters.is_enabled === "boolean" ? filters.is_enabled : null,
    keyword: String(filters.keyword || "").trim(),
    project_id: filters.project_id || null,
    role: filters.role || null,
  };
}

function normalizeHistoryFilters(filters: Pick<AuditLogListFilters, "action" | "keyword">) {
  return {
    action: filters.action || null,
    keyword: String(filters.keyword || "").trim(),
  } satisfies Pick<AuditLogListFilters, "action" | "keyword">;
}

export default function AdminsPage({ currentUser, onUnauthorized }: AdminsPageProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<AdminMutationPayload>();
  const watchedAccessScope = Form.useWatch("access_scope", form);
  const watchedRole = Form.useWatch("role", form);
  const [list, setList] = useState<PaginationPayload<AdminUserRecord>>(EMPTY_LIST);
  const [projects, setProjects] = useState<WorkspaceProjectRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUserRecord | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AdminListFilters>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<AdminListFilters>(EMPTY_FILTERS);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<AdminUserRecord | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<AuditLogRecord[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(25);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyFilters, setHistoryFilters] = useState<Pick<AuditLogListFilters, "action" | "keyword">>(EMPTY_HISTORY_FILTERS);
  const [draftHistoryFilters, setDraftHistoryFilters] = useState<Pick<AuditLogListFilters, "action" | "keyword">>(EMPTY_HISTORY_FILTERS);
  const { handlePageError, notifyBatchActionResult } = usePageFeedback(onUnauthorized);

  const items = list.items;
  const { clearSelection, rowSelection, selectedItems } = useTableSelection(items, "id");
  const canManageUsers = canManageAdmins(currentUser);
  const isProjectScoped = isProjectScopedUser(currentUser);
  const accessibleProjectIds = useMemo(() => getAccessibleProjectIds(currentUser), [currentUser]);
  const visibleProjects = useMemo(
    () => projects.filter(project => !isProjectScoped || accessibleProjectIds.includes(project.id)),
    [accessibleProjectIds, isProjectScoped, projects],
  );
  const adminRowSelection = canManageUsers
    ? {
        ...rowSelection,
        getCheckboxProps: (record: AdminUserRecord) => ({
          disabled: !canManageAdminRecord(currentUser, record),
        }),
      }
    : undefined;

  const enabledCount = useMemo(() => items.filter(item => item.is_enabled).length, [items]);
  const boundCount = useMemo(() => items.filter(item => item.access_scope === "bound").length, [items]);
  const viewerCount = useMemo(() => items.filter(item => item.role === "viewer").length, [items]);
  const governanceSummary = useMemo(() => summarizeAdminGovernance(items), [items]);
  const hasHistoryFilters = Boolean(historyFilters.action || historyFilters.keyword);
  const requiresGlobalScope = requiresGlobalAdminScope(watchedRole, watchedAccessScope || "all");
  const requiresBoundScope = requiresBoundAdminScope(watchedRole, watchedAccessScope || "all");

  useEffect(() => {
    if (!canManageUsers) return;
    void loadCatalog();
  }, [canManageUsers]);

  useEffect(() => {
    if (!canManageUsers) return;
    void loadData(page, filters);
  }, [canManageUsers, filters, page]);

  useEffect(() => {
    if (!canManageUsers || !historyDrawerOpen || !historyTarget) return;
    void loadHistory(historyTarget, historyPage, historyFilters);
  }, [canManageUsers, historyDrawerOpen, historyFilters, historyPage, historyTarget]);

  useEffect(() => {
    if (requiresGlobalScope && form.getFieldValue("access_scope") !== "all") {
      form.setFieldsValue({ access_scope: "all", project_ids: [] });
    }
    if (requiresBoundScope && form.getFieldValue("access_scope") !== "bound") {
      form.setFieldsValue({
        access_scope: "bound",
        project_ids: isProjectScoped ? accessibleProjectIds : form.getFieldValue("project_ids") || [],
      });
    }
  }, [accessibleProjectIds, form, isProjectScoped, requiresBoundScope, requiresGlobalScope]);

  async function loadCatalog() {
    try {
      const catalog = await getWorkspaceCatalog(true);
      setProjects(catalog.projects);
    } catch (error) {
      handlePageError(error);
    }
  }

  async function loadData(nextPage = page, nextFilters = filters) {
    setLoading(true);
    try {
      const payload = await getAdmins(nextPage, nextFilters);
      setList(payload);
    } catch (error) {
      handlePageError(error);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(
    record: AdminUserRecord,
    nextPage = historyPage,
    nextFilters = historyFilters,
  ) {
    setHistoryLoading(true);
    try {
      const payload = await getAuditLogs(nextPage, {
        ...(nextFilters.action ? { action: nextFilters.action } : { action_prefix: "admin." }),
        entity_id: record.id,
        entity_type: "admin_user",
        ...(nextFilters.keyword ? { keyword: nextFilters.keyword } : {}),
      });
      setHistoryItems(payload.items);
      setHistoryTotal(payload.total);
      setHistoryPageSize(payload.pageSize);
    } catch (error) {
      handlePageError(error);
    } finally {
      setHistoryLoading(false);
    }
  }

  function openHistory(record: AdminUserRecord) {
    setHistoryItems([]);
    setHistoryTarget(record);
    setDraftHistoryFilters(EMPTY_HISTORY_FILTERS);
    setHistoryFilters(EMPTY_HISTORY_FILTERS);
    setHistoryPage(1);
    setHistoryTotal(0);
    setHistoryDrawerOpen(true);
  }

  function closeHistory() {
    setHistoryDrawerOpen(false);
    setHistoryTarget(null);
    setDraftHistoryFilters(EMPTY_HISTORY_FILTERS);
    setHistoryFilters(EMPTY_HISTORY_FILTERS);
    setHistoryItems([]);
    setHistoryPage(1);
    setHistoryTotal(0);
  }

  function updateDraftHistoryFilters(patch: Partial<Pick<AuditLogListFilters, "action" | "keyword">>) {
    setDraftHistoryFilters(current => ({ ...current, ...patch }));
  }

  function applyHistoryFilters(nextPage = 1) {
    setHistoryPage(nextPage);
    setHistoryFilters(normalizeHistoryFilters(draftHistoryFilters));
  }

  function resetHistoryFilters() {
    setDraftHistoryFilters(EMPTY_HISTORY_FILTERS);
    setHistoryPage(1);
    setHistoryFilters(EMPTY_HISTORY_FILTERS);
  }

  function updateDraftFilters(patch: Partial<AdminListFilters>) {
    setDraftFilters(current => ({ ...current, ...patch }));
  }

  function applyFilters() {
    clearSelection();
    setPage(1);
    setFilters(normalizeFilters(draftFilters));
  }

  function resetFilters() {
    clearSelection();
    setDraftFilters(EMPTY_FILTERS);
    setPage(1);
    setFilters(EMPTY_FILTERS);
  }

  function openCreate() {
    setEditing(null);
    form.setFieldsValue({
      ...INITIAL_VALUES,
      access_scope: isProjectScoped ? "bound" : INITIAL_VALUES.access_scope,
      project_ids: isProjectScoped ? accessibleProjectIds : [],
      role: isProjectScoped ? "project_admin" : INITIAL_VALUES.role,
    });
    setDrawerOpen(true);
  }

  function openEdit(record: AdminUserRecord) {
    setEditing(record);
    form.setFieldsValue({
      access_scope: record.access_scope,
      display_name: record.display_name,
      is_enabled: record.is_enabled,
      note: record.note,
      operation_note: "",
      password: "",
      project_ids: record.projects.map(project => project.id),
      role: record.role,
      username: record.username,
    });
    setDrawerOpen(true);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const values = await form.validateFields();
      const payload: AdminMutationPayload = {
        ...values,
        note: values.note.trim(),
        operation_note: String(values.operation_note || "").trim(),
        project_ids: values.access_scope === "bound" ? values.project_ids || [] : [],
      };

      if (editing) {
        await updateAdmin(editing.id, payload);
        message.success("成员已更新");
      } else {
        await createAdmin(payload);
        message.success("成员已创建");
      }

      setDrawerOpen(false);
      clearSelection();
      await loadData(page, filters);
    } catch (error) {
      handlePageError(error, { ignoreFallbackMessage: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleBatchToggle(is_enabled: boolean) {
    const result = await runBatchAction(selectedItems, item =>
      updateAdmin(item.id, {
        access_scope: item.access_scope,
        display_name: item.display_name,
        is_enabled,
        note: item.note,
        project_ids: item.projects.map(project => project.id),
        role: item.role,
        username: item.username,
      }),
    );

    if (result.successCount > 0) {
      clearSelection();
      await loadData(page, filters);
    }

    notifyBatchActionResult(is_enabled ? "批量启用成员" : "批量停用成员", result);
  }

  const filterRoleOptions = useMemo<Array<{ label: string; value: AdminRole }>>(
    () => [
      ...(!isProjectScoped ? [{ label: ADMIN_ROLE_LABELS.owner, value: "owner" as const }] : []),
      ...(!isProjectScoped
        ? [{ label: ADMIN_ROLE_LABELS.platform_admin, value: "platform_admin" as const }]
        : []),
      { label: ADMIN_ROLE_LABELS.project_admin, value: "project_admin" as const },
      { label: ADMIN_ROLE_LABELS.operator, value: "operator" as const },
      { label: ADMIN_ROLE_LABELS.viewer, value: "viewer" as const },
    ],
    [isProjectScoped],
  );

  const assignableRoleOptions = useMemo<Array<{ label: string; value: AdminRole }>>(
    () => [
      ...(isOwnerUser(currentUser) ? [{ label: ADMIN_ROLE_LABELS.owner, value: "owner" as const }] : []),
      ...(!isProjectScoped
        ? [{ label: ADMIN_ROLE_LABELS.platform_admin, value: "platform_admin" as const }]
        : []),
      { label: ADMIN_ROLE_LABELS.project_admin, value: "project_admin" as const },
      { label: ADMIN_ROLE_LABELS.operator, value: "operator" as const },
      { label: ADMIN_ROLE_LABELS.viewer, value: "viewer" as const },
    ],
    [currentUser, isProjectScoped],
  );

  const columns = buildAdminColumns({
    canManageRecord: record => canManageAdminRecord(currentUser, record),
    onEdit: openEdit,
    onOpenHistory: openHistory,
  });

  return (
    <div>
      <PageHeader
        title="成员中心"
        subtitle="集中管理平台管理员、项目级管理员与协作成员，并按项目范围进行成员治理。"
        extra={(
          <Space size={8} wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void loadData(page, filters)}>
              刷新
            </Button>
            {canManageUsers ? (
              <Button type="primary" onClick={openCreate}>
                新增成员
              </Button>
            ) : null}
          </Space>
        )}
        tags={canManageUsers ? undefined : [{ color: "gold", label: "受限视角" }]}
      />

      {!canManageUsers ? (
        <Alert
          showIcon
          type="warning"
          message="当前账号不能管理成员列表"
          description="当前角色没有成员管理权限。"
          style={{ marginBottom: 16 }}
        />
      ) : isProjectScoped ? (
        <Alert
          showIcon
          type="info"
          message="当前为项目级成员治理视角"
          description="你只能查看和维护绑定在自己项目范围内的成员，无法管理全局账号。"
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <AdminsMetrics
        boundCount={boundCount}
        enabledCount={enabledCount}
        governanceSummary={governanceSummary}
        itemCount={items.length}
        total={list.total}
        viewerCount={viewerCount}
      />

      {governanceSummary.highPrivilegeCount > 0 || governanceSummary.pendingLoginAfterChangeCount > 0 ? (
        <Alert
          showIcon
          type="warning"
          style={{ marginBottom: 16 }}
          message="成员治理焦点"
          description={[
            governanceSummary.highPrivilegeCount > 0
              ? `当前页有 ${governanceSummary.highPrivilegeCount} 个高权限成员`
              : "",
            governanceSummary.pendingLoginAfterChangeCount > 0
              ? `${governanceSummary.pendingLoginAfterChangeCount} 个成员在最近授权变更后还没有重新登录验证`
              : "",
            governanceSummary.multiProjectCount > 0
              ? `${governanceSummary.multiProjectCount} 个成员绑定了多个项目`
              : "",
          ].filter(Boolean).join("，")}
        />
      ) : null}

      <div style={{ marginBottom: 16 }}>
        <AdminFilters
          draftFilters={draftFilters}
          filterRoleOptions={filterRoleOptions}
          isProjectScoped={isProjectScoped}
          onApply={applyFilters}
          onReset={resetFilters}
          onUpdateDraftFilters={updateDraftFilters}
          visibleProjects={visibleProjects}
        />
      </div>

      <DataTable
        cardTitle="成员列表"
        cardToolbar={canManageUsers ? (
          <BatchActionsBar selectedCount={selectedItems.length} onClear={clearSelection}>
            <Button onClick={() => void handleBatchToggle(true)}>
              批量启用
            </Button>
            <Button onClick={() => void handleBatchToggle(false)}>
              批量停用
            </Button>
          </BatchActionsBar>
        ) : undefined}
        columns={columns}
        current={page}
        dataSource={items}
        loading={loading}
        onPageChange={nextPage => setPage(nextPage)}
        pageSize={list.pageSize}
        rowKey="id"
        rowSelection={adminRowSelection}
        total={list.total}
      />

      <AdminHistoryDrawer
        draftAction={draftHistoryFilters.action || null}
        draftKeyword={draftHistoryFilters.keyword || ""}
        hasHistoryFilters={hasHistoryFilters}
        historyItems={historyItems}
        historyLoading={historyLoading}
        historyPage={historyPage}
        historyPageSize={historyPageSize}
        historyTarget={historyTarget}
        historyTotal={historyTotal}
        onApplyFilters={applyHistoryFilters}
        onClose={closeHistory}
        onRefresh={() => void (historyTarget ? loadHistory(historyTarget, historyPage, historyFilters) : Promise.resolve())}
        onResetFilters={resetHistoryFilters}
        onUpdateDraftFilters={updateDraftHistoryFilters}
        open={historyDrawerOpen}
      />

      {canManageUsers ? (
        <AdminFormDrawer
          assignableRoleOptions={assignableRoleOptions}
          editing={editing}
          form={form}
          isProjectScoped={isProjectScoped}
          loading={saving}
          onClose={() => setDrawerOpen(false)}
          onSubmit={() => void handleSubmit()}
          open={drawerOpen}
          requiresBoundScope={requiresBoundScope}
          requiresGlobalScope={requiresGlobalScope}
          visibleProjects={visibleProjects}
          watchedAccessScope={watchedAccessScope}
          watchedRole={normalizeAdminRole(watchedRole) || "viewer"}
        />
      ) : null}
    </div>
  );
}
