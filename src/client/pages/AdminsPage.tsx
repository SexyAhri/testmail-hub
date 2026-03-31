import {
  CheckCircleOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Alert, App, Button, Col, Form, Input, Select, Space, Switch, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";

import {
  ROLE_LABELS,
  getActionColor,
  getActionLabel,
  renderAuditSummary,
  renderRawAuditDetail,
} from "../audit-display";
import { createAdmin, getAdmins, getAuditLogs, getWorkspaceCatalog, updateAdmin } from "../api";
import {
  ActionButtons,
  BatchActionsBar,
  DataTable,
  DetailDrawer,
  FormDrawer,
  MetricCard,
  MetricGrid,
  PageHeader,
  SearchToolbar,
} from "../components";
import { useTableSelection } from "../hooks/useTableSelection";
import type {
  AdminListFilters,
  AdminMutationPayload,
  AdminRole,
  AdminUserRecord,
  AuditLogRecord,
  PaginationPayload,
  WorkspaceProjectRecord,
} from "../types";
import {
  buildBatchActionMessage,
  formatDateTime,
  normalizeApiError,
  runBatchAction,
} from "../utils";
import {
  ADMIN_ROLE_LABELS,
  normalizeAdminRole,
  requiresBoundAdminScope,
  requiresGlobalAdminScope,
} from "../../utils/constants";
import {
  canManageAdminRecord,
  canManageAdmins,
  getAccessibleProjectIds,
  isOwnerUser,
  isProjectScopedUser,
  type CurrentUser,
} from "../permissions";

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

const INITIAL_VALUES: AdminMutationPayload = {
  access_scope: "all",
  display_name: "",
  is_enabled: true,
  note: "",
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

  const enabledCount = useMemo(
    () => items.filter(item => item.is_enabled).length,
    [items],
  );
  const boundCount = useMemo(
    () => items.filter(item => item.access_scope === "bound").length,
    [items],
  );
  const viewerCount = useMemo(
    () => items.filter(item => item.role === "viewer").length,
    [items],
  );

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
    void loadHistory(historyTarget, historyPage);
  }, [canManageUsers, historyDrawerOpen, historyPage, historyTarget]);

  useEffect(() => {
    if (
      requiresGlobalAdminScope(watchedRole, watchedAccessScope || "all")
      && form.getFieldValue("access_scope") !== "all"
    ) {
      form.setFieldsValue({ access_scope: "all", project_ids: [] });
    }
    if (
      requiresBoundAdminScope(watchedRole, watchedAccessScope || "all")
      && form.getFieldValue("access_scope") !== "bound"
    ) {
      form.setFieldsValue({
        access_scope: "bound",
        project_ids: isProjectScoped ? accessibleProjectIds : form.getFieldValue("project_ids") || [],
      });
    }
  }, [accessibleProjectIds, form, isProjectScoped, watchedAccessScope, watchedRole]);

  async function loadCatalog() {
    try {
      const catalog = await getWorkspaceCatalog(true);
      setProjects(catalog.projects);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function loadData(nextPage = page, nextFilters = filters) {
    setLoading(true);
    try {
      const payload = await getAdmins(nextPage, nextFilters);
      setList(payload);
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

  async function loadHistory(record: AdminUserRecord, nextPage = historyPage) {
    setHistoryLoading(true);
    try {
      const payload = await getAuditLogs(nextPage, {
        action_prefix: "admin.",
        entity_id: record.id,
        entity_type: "admin_user",
      });
      setHistoryItems(payload.items);
      setHistoryTotal(payload.total);
      setHistoryPageSize(payload.pageSize);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setHistoryLoading(false);
    }
  }

  function openHistory(record: AdminUserRecord) {
    setHistoryItems([]);
    setHistoryTarget(record);
    setHistoryPage(1);
    setHistoryTotal(0);
    setHistoryDrawerOpen(true);
  }

  function closeHistory() {
    setHistoryDrawerOpen(false);
    setHistoryTarget(null);
    setHistoryItems([]);
    setHistoryPage(1);
    setHistoryTotal(0);
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
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      if (error instanceof Error && error.message !== "请求失败") {
        message.error(normalizeApiError(error));
      }
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

    const messageText = buildBatchActionMessage(
      is_enabled ? "批量启用成员" : "批量停用成员",
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

  const historyColumns: ColumnsType<AuditLogRecord> = [
    {
      title: "时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 176,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      dataIndex: "action",
      key: "action",
      width: 160,
      render: value => (
        <Tag color={getActionColor(String(value || ""))}>
          {getActionLabel(String(value || ""))}
        </Tag>
      ),
    },
    {
      title: "操作人",
      key: "actor",
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <span>{record.actor_name || "-"}</span>
          <Tag style={{ marginInlineEnd: 0, width: "fit-content" }}>
            {ROLE_LABELS[record.actor_role] || record.actor_role || "未知角色"}
          </Tag>
        </Space>
      ),
    },
    {
      title: "摘要",
      key: "summary",
      render: (_, record) => renderAuditSummary(record),
    },
    {
      title: "详情",
      dataIndex: "detail_json",
      key: "detail_json",
      width: 220,
      render: value => renderRawAuditDetail(value),
    },
  ];

  const columns: ColumnsType<AdminUserRecord> = [
    {
      title: "成员",
      key: "identity",
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <span style={{ fontWeight: 600 }}>{record.display_name}</span>
          <span style={{ color: "#8c8c8c", fontSize: 12 }}>{record.username}</span>
          {record.note ? (
            <span style={{ color: "#8c8c8c", fontSize: 12 }}>{record.note}</span>
          ) : null}
        </Space>
      ),
    },
    {
      title: "角色",
      dataIndex: "role",
      key: "role",
      width: 150,
      render: value => ADMIN_ROLE_LABELS[normalizeAdminRole(value) || "viewer"],
    },
    {
      title: "访问范围",
      key: "access_scope",
      width: 120,
      render: (_, record) => (
        <Tag color={record.access_scope === "bound" ? "gold" : "blue"}>
          {record.access_scope === "bound" ? "项目绑定" : "全局"}
        </Tag>
      ),
    },
    {
      title: "绑定项目",
      key: "projects",
      render: (_, record) =>
        record.projects.length > 0
          ? record.projects.map(project => <Tag key={project.id}>{project.name}</Tag>)
          : "-",
    },
    {
      title: "状态",
      dataIndex: "is_enabled",
      key: "is_enabled",
      width: 100,
      render: value => (value ? "启用" : "停用"),
    },
    {
      title: "最近登录",
      dataIndex: "last_login_at",
      key: "last_login_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "最近变更",
      key: "last_modified",
      width: 220,
      render: (_, record) =>
        record.last_modified_at ? (
          <Space direction="vertical" size={4}>
            <span>{formatDateTime(record.last_modified_at)}</span>
            <span style={{ color: "#8c8c8c", fontSize: 12 }}>
              {(record.last_modified_by || "系统")} · {getActionLabel(record.last_modified_action || "admin.update")}
            </span>
          </Space>
        ) : (
          <span style={{ color: "#999" }}>暂无变更记录</span>
        ),
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      key: "action",
      width: 170,
      render: (_, record) =>
        canManageAdminRecord(currentUser, record)
          ? (
            <ActionButtons
              onEdit={() => openEdit(record)}
              extra={(
                <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openHistory(record)}>
                  记录
                </Button>
              )}
            />
          )
          : <span style={{ color: "#999" }}>只读</span>,
    },
  ];

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

      <MetricGrid minItemWidth={220}>
        <MetricCard
          title="筛选结果总数"
          value={list.total}
          icon={<TeamOutlined />}
          percent={list.total > 0 ? 100 : 0}
          color="#1677ff"
        />
        <MetricCard
          title="当前页启用"
          value={enabledCount}
          icon={<CheckCircleOutlined />}
          percent={items.length ? (enabledCount / items.length) * 100 : 0}
          color="#16a34a"
        />
        <MetricCard
          title="当前页项目级"
          value={boundCount}
          icon={<FolderOpenOutlined />}
          percent={items.length ? (boundCount / items.length) * 100 : 0}
          color="#d48806"
        />
        <MetricCard
          title="当前页只读"
          value={viewerCount}
          icon={<EyeOutlined />}
          percent={items.length ? (viewerCount / items.length) * 100 : 0}
          color="#7c3aed"
        />
      </MetricGrid>

      <div style={{ marginBottom: 16 }}>
        <SearchToolbar>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 260, flex: "1 1 260px" }}>
              <Input
                allowClear
                placeholder="搜索用户名、显示名、备注或绑定项目"
                prefix={<SearchOutlined />}
                value={draftFilters.keyword}
                onChange={event => updateDraftFilters({ keyword: event.target.value })}
                onPressEnter={applyFilters}
              />
            </div>
            <div style={{ minWidth: 170, flex: "1 1 170px" }}>
              <Select
                allowClear
                placeholder="角色"
                value={draftFilters.role || undefined}
                options={filterRoleOptions}
                onChange={value => updateDraftFilters({ role: value || null })}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ minWidth: 150, flex: "1 1 150px" }}>
              <Select
                allowClear
                placeholder="访问范围"
                value={draftFilters.access_scope || undefined}
                options={[
                  ...(!isProjectScoped ? [{ label: "全局", value: "all" as const }] : []),
                  { label: "项目绑定", value: "bound" as const },
                ]}
                onChange={value => updateDraftFilters({ access_scope: value || null })}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ minWidth: 180, flex: "1 1 180px" }}>
              <Select
                allowClear
                placeholder="绑定项目"
                value={draftFilters.project_id || undefined}
                options={visibleProjects.map(project => ({
                  label: project.is_enabled ? project.name : `${project.name}（已停用）`,
                  value: project.id,
                }))}
                onChange={value => updateDraftFilters({ project_id: value || null })}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ minWidth: 150, flex: "1 1 150px" }}>
              <Select
                allowClear
                placeholder="状态"
                value={
                  typeof draftFilters.is_enabled === "boolean"
                    ? (draftFilters.is_enabled ? "enabled" : "disabled")
                    : undefined
                }
                options={[
                  { label: "启用", value: "enabled" },
                  { label: "停用", value: "disabled" },
                ]}
                onChange={value =>
                  updateDraftFilters({
                    is_enabled:
                      value === "enabled" ? true : value === "disabled" ? false : null,
                  })
                }
                style={{ width: "100%" }}
              />
            </div>
            <Space size={8}>
              <Button type="primary" onClick={applyFilters}>
                应用筛选
              </Button>
              <Button onClick={resetFilters}>重置</Button>
            </Space>
          </div>
        </SearchToolbar>
      </div>

      <DataTable
        cardTitle="成员列表"
        cardToolbar={
          canManageUsers ? (
            <BatchActionsBar selectedCount={selectedItems.length} onClear={clearSelection}>
              <Button onClick={() => void handleBatchToggle(true)}>
                批量启用
              </Button>
              <Button onClick={() => void handleBatchToggle(false)}>
                批量停用
              </Button>
            </BatchActionsBar>
          ) : undefined
        }
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

      {historyTarget ? (
        <DetailDrawer
          title={`成员变更记录 · ${historyTarget.display_name}`}
          open={historyDrawerOpen}
          onClose={closeHistory}
          width="62vw"
          footer={(
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Button onClick={closeHistory}>关闭</Button>
            </div>
          )}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
              }}
            >
              <Tag color="blue">{historyTarget.display_name}</Tag>
              <Tag>{historyTarget.username}</Tag>
              <Tag color={historyTarget.access_scope === "bound" ? "gold" : "default"}>
                {historyTarget.access_scope === "bound" ? "项目绑定" : "全局"}
              </Tag>
              <Tag color={historyTarget.is_enabled ? "success" : "default"}>
                {historyTarget.is_enabled ? "启用" : "停用"}
              </Tag>
              {historyTarget.note ? <Tag color="cyan">{historyTarget.note}</Tag> : null}
            </div>

            <DataTable
              cardTitle="最近成员变更"
              cardExtra={(
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => void loadHistory(historyTarget, historyPage)}
                >
                  刷新
                </Button>
              )}
              columns={historyColumns}
              current={historyPage}
              dataSource={historyItems}
              loading={historyLoading}
              onPageChange={nextPage => setHistoryPage(nextPage)}
              pageSize={historyPageSize}
              rowKey="id"
              total={historyTotal}
            />
          </div>
        </DetailDrawer>
      ) : null}

      {canManageUsers ? (
        <FormDrawer
          title={editing ? "编辑成员" : "新增成员"}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onSubmit={() => void handleSubmit()}
          form={form}
          loading={saving}
        >
          <Col span={24}>
            <Form.Item
              label="用户名"
              name="username"
              rules={[{ required: !editing, message: "请输入用户名" }]}
            >
              <Input disabled={Boolean(editing)} placeholder="例如：ops-admin" prefix={<UserOutlined />} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              label="显示名称"
              name="display_name"
              rules={[{ required: true, message: "请输入显示名称" }]}
            >
              <Input placeholder="例如：项目运维负责人" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="备注" name="note">
              <Input.TextArea rows={3} placeholder="记录成员职责、归属团队或授权说明" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              label="角色"
              name="role"
              rules={[{ required: true, message: "请选择角色" }]}
            >
              <Select options={assignableRoleOptions} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              label="访问范围"
              name="access_scope"
              rules={[{ required: true, message: "请选择访问范围" }]}
            >
              <Select
                disabled={
                  isProjectScoped
                  || requiresGlobalAdminScope(watchedRole, watchedAccessScope || "all")
                  || requiresBoundAdminScope(watchedRole, watchedAccessScope || "all")
                }
                options={[
                  { label: "全局", value: "all" },
                  { label: "项目绑定", value: "bound" },
                ]}
              />
            </Form.Item>
          </Col>
          {watchedAccessScope === "bound" && !requiresGlobalAdminScope(watchedRole, watchedAccessScope || "bound") ? (
            <Col span={24}>
              <Form.Item
                label="绑定项目"
                name="project_ids"
                rules={[{ required: true, message: "请至少选择一个项目" }]}
              >
                <Select
                  mode="multiple"
                  options={visibleProjects.map(project => ({
                    label: project.is_enabled ? project.name : `${project.name}（已停用）`,
                    value: project.id,
                  }))}
                  placeholder="选择该成员可访问的项目"
                />
              </Form.Item>
            </Col>
          ) : null}
          <Col span={24}>
            <Form.Item
              label="密码"
              name="password"
              rules={editing ? [] : [{ required: true, message: "请输入密码" }]}
            >
              <Input.Password
                placeholder={editing ? "留空则不重置密码" : "至少 8 位"}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="启用状态" name="is_enabled" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
          </Col>
        </FormDrawer>
      ) : null}
    </div>
  );
}
