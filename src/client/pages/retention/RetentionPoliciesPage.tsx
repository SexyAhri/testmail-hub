import { Alert, App, Button, Form, Input, Select, Space, Tabs } from "antd";
import { useEffect, useMemo, useState } from "react";

import {
  createRetentionPolicy,
  getRetentionJobRunSummary,
  getRetentionJobRuns,
  getRetentionPolicies,
  removeRetentionPolicy,
  triggerRetentionJob,
  updateRetentionPolicy,
} from "../../api/retention";
import { getWorkspaceCatalog } from "../../api/workspace";
import {
  DataTable,
  PageHeader,
  SearchToolbar,
} from "../../components";
import { promptDeleteOperationNote as promptSharedDeleteOperationNote } from "../../delete-operation-note";
import { usePageFeedback } from "../../hooks/usePageFeedback";
import {
  canManageRetentionPolicyRecord,
  canWriteAnyResource,
  getAccessibleProjectIds,
  getAccessModeTag,
  getWriteScopeNotice,
  isProjectScopedUser,
  type CurrentUser,
} from "../../permissions";
import type {
  PaginationPayload,
  RetentionJobRunRecord,
  RetentionJobRunSummary,
  RetentionPolicyPayload,
  RetentionPolicyRecord,
  WorkspaceCatalog,
} from "../../types";
import { normalizeApiError } from "../../utils";
import { RetentionPoliciesMetrics } from "./RetentionPoliciesMetrics";
import { buildRetentionPolicyColumns } from "./retention-policy-table-columns";
import { RetentionPolicyFormDrawer } from "./RetentionPolicyFormDrawer";
import { RetentionRunDetailDrawer } from "./RetentionRunDetailDrawer";
import { RetentionRunsPanel } from "./RetentionRunsPanel";
import {
  EMPTY_CATALOG,
  EMPTY_POLICY_LIST,
  EMPTY_RUN_LIST,
  EMPTY_RUN_SUMMARY,
  INITIAL_VALUES,
  RETENTION_RUN_OPTIONS,
  type RetentionPolicyFilters,
  type RetentionRunFilters,
  buildEnvironmentOptionsForPolicyFilters,
  buildMailboxPoolOptionsForPolicyFilters,
} from "./retention-utils";

interface RetentionPoliciesPageProps {
  currentUser?: CurrentUser;
  onUnauthorized: () => void;
}

const EMPTY_POLICY_FILTERS: RetentionPolicyFilters = {
  environment_id: null,
  is_enabled: null,
  keyword: "",
  mailbox_pool_id: null,
  project_id: null,
};

const EMPTY_RUN_FILTERS: RetentionRunFilters = {
  status: null,
  trigger_source: null,
};

export default function RetentionPoliciesPage({
  currentUser,
  onUnauthorized,
}: RetentionPoliciesPageProps) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<RetentionPolicyPayload>();
  const [catalog, setCatalog] = useState<WorkspaceCatalog>(EMPTY_CATALOG);
  const [policies, setPolicies] = useState<PaginationPayload<RetentionPolicyRecord>>(EMPTY_POLICY_LIST);
  const [runs, setRuns] = useState<PaginationPayload<RetentionJobRunRecord>>(EMPTY_RUN_LIST);
  const [runSummary, setRunSummary] = useState<RetentionJobRunSummary>(EMPTY_RUN_SUMMARY);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runSummaryLoading, setRunSummaryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<RetentionPolicyRecord | null>(null);
  const [activeTab, setActiveTab] = useState("policies");
  const [runDetail, setRunDetail] = useState<RetentionJobRunRecord | null>(null);
  const [policyFilters, setPolicyFilters] = useState<RetentionPolicyFilters>(EMPTY_POLICY_FILTERS);
  const [runFilters, setRunFilters] = useState<RetentionRunFilters>(EMPTY_RUN_FILTERS);
  const [policyPage, setPolicyPage] = useState(1);
  const [runPage, setRunPage] = useState(1);
  const { handlePageError } = usePageFeedback(onUnauthorized);
  const canWrite = canWriteAnyResource(currentUser);
  const isProjectScoped = isProjectScopedUser(currentUser);
  const canViewRuns = !isProjectScoped;
  const accessibleProjectIds = useMemo(() => getAccessibleProjectIds(currentUser), [currentUser]);
  const accessTag = getAccessModeTag(currentUser);
  const accessNotice = getWriteScopeNotice(currentUser, "生命周期策略", {
    projectScopedDescription: "你可以新增和维护自己绑定项目下的生命周期策略；全局默认策略与其他项目策略仍可查看，但会保持只读。",
    projectScopedTitle: "当前账号为项目级生命周期视角",
  });

  const formProjectId = Form.useWatch("project_id", form);
  const formEnvironmentId = Form.useWatch("environment_id", form);

  useEffect(() => {
    void loadCatalog();
  }, []);

  useEffect(() => {
    void loadPolicies(policyPage, policyFilters);
  }, [policyFilters, policyPage]);

  useEffect(() => {
    if (!canViewRuns) return;
    void loadRuns(runPage, runFilters);
  }, [canViewRuns, runFilters, runPage]);

  useEffect(() => {
    if (!canViewRuns) return;
    void loadRunSummary();
  }, [canViewRuns]);

  async function loadCatalog() {
    try {
      setCatalog(await getWorkspaceCatalog(true));
    } catch (error) {
      handlePageError(error);
    }
  }

  async function loadPolicies(nextPage = policyPage, nextFilters = policyFilters) {
    setPoliciesLoading(true);
    try {
      setPolicies(await getRetentionPolicies(nextPage, nextFilters));
    } catch (error) {
      handlePageError(error);
    } finally {
      setPoliciesLoading(false);
    }
  }

  async function loadRuns(nextPage = runPage, nextFilters = runFilters) {
    setRunsLoading(true);
    try {
      setRuns(await getRetentionJobRuns(nextPage, nextFilters));
    } catch (error) {
      handlePageError(error);
    } finally {
      setRunsLoading(false);
    }
  }

  async function loadRunSummary() {
    setRunSummaryLoading(true);
    try {
      setRunSummary(await getRetentionJobRunSummary());
    } catch (error) {
      handlePageError(error);
    } finally {
      setRunSummaryLoading(false);
    }
  }

  async function handleRunNow(optionKey = "full") {
    const selectedOption = RETENTION_RUN_OPTIONS.find(option => option.key === optionKey) || RETENTION_RUN_OPTIONS[0];
    setRunningNow(true);
    try {
      await triggerRetentionJob(selectedOption.actions);
      message.success(`${selectedOption.label}已开始执行`);
      setActiveTab("runs");
      setRunPage(1);
      await Promise.all([loadRuns(1, runFilters), loadRunSummary()]);
    } catch (error) {
      handlePageError(error);
    } finally {
      setRunningNow(false);
    }
  }

  const visibleProjects = useMemo(
    () => catalog.projects.filter(project => !isProjectScoped || accessibleProjectIds.includes(project.id)),
    [accessibleProjectIds, catalog.projects, isProjectScoped],
  );

  const visibleEnvironments = useMemo(
    () =>
      catalog.environments.filter(environment => {
        if (isProjectScoped && !accessibleProjectIds.includes(environment.project_id)) return false;
        if (formProjectId) return environment.project_id === formProjectId;
        return true;
      }),
    [accessibleProjectIds, catalog.environments, formProjectId, isProjectScoped],
  );

  const visibleMailboxPools = useMemo(
    () =>
      catalog.mailbox_pools.filter(pool => {
        if (isProjectScoped && !accessibleProjectIds.includes(pool.project_id)) return false;
        if (formProjectId && pool.project_id !== formProjectId) return false;
        if (formEnvironmentId && pool.environment_id !== formEnvironmentId) return false;
        return true;
      }),
    [accessibleProjectIds, catalog.mailbox_pools, formEnvironmentId, formProjectId, isProjectScoped],
  );

  const policyFilterEnvironmentOptions = useMemo(
    () => buildEnvironmentOptionsForPolicyFilters(catalog, policyFilters, isProjectScoped, accessibleProjectIds),
    [accessibleProjectIds, catalog, isProjectScoped, policyFilters],
  );

  const policyFilterMailboxPoolOptions = useMemo(
    () => buildMailboxPoolOptionsForPolicyFilters(catalog, policyFilters, isProjectScoped, accessibleProjectIds),
    [accessibleProjectIds, catalog, isProjectScoped, policyFilters],
  );

  const policyMetrics = useMemo(() => ({
    enabled: policies.items.filter(item => item.is_enabled).length,
    global: policies.items.filter(item => item.scope_level === "global").length,
    mailboxPool: policies.items.filter(item => item.scope_level === "mailbox_pool").length,
    project: policies.items.filter(item => item.scope_level === "project").length,
    total: policies.items.length,
  }), [policies.items]);

  const policyColumns = useMemo(
    () =>
      buildRetentionPolicyColumns({
        canManageRecord: record => canManageRetentionPolicyRecord(currentUser, record),
        onDelete: record => {
          void handleDelete(record);
        },
        onEdit: openEdit,
      }),
    [currentUser],
  );

  function resetDrawer(projectId: number | null = null) {
    form.setFieldsValue({
      ...INITIAL_VALUES,
      project_id: projectId,
    });
  }

  function openCreate() {
    setEditing(null);
    resetDrawer(isProjectScoped ? (accessibleProjectIds[0] || null) : null);
    setDrawerOpen(true);
  }

  function openEdit(record: RetentionPolicyRecord) {
    setEditing(record);
    form.setFieldsValue({
      archive_email_hours: record.archive_email_hours,
      deleted_email_retention_hours: record.deleted_email_retention_hours,
      description: record.description,
      email_retention_hours: record.email_retention_hours,
      environment_id: record.environment_id,
      is_enabled: record.is_enabled,
      mailbox_pool_id: record.mailbox_pool_id,
      mailbox_ttl_hours: record.mailbox_ttl_hours,
      name: record.name,
      operation_note: "",
      project_id: record.project_id,
    });
    setDrawerOpen(true);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const values = await form.validateFields();
      const payload: RetentionPolicyPayload = {
        ...values,
        archive_email_hours: values.archive_email_hours ?? null,
        deleted_email_retention_hours: values.deleted_email_retention_hours ?? null,
        email_retention_hours: values.email_retention_hours ?? null,
        environment_id: values.environment_id ?? null,
        mailbox_pool_id: values.mailbox_pool_id ?? null,
        mailbox_ttl_hours: values.mailbox_ttl_hours ?? null,
        operation_note: String(values.operation_note || "").trim(),
        project_id: values.project_id ?? null,
      };

      if (editing) {
        await updateRetentionPolicy(editing.id, payload);
        message.success("生命周期策略已更新");
      } else {
        await createRetentionPolicy(payload);
        message.success("生命周期策略已创建");
      }

      setDrawerOpen(false);
      setPolicyPage(1);
      await loadPolicies(1, policyFilters);
    } catch (error) {
      if (handlePageError(error, { ignoreFallbackMessage: true })) {
        return;
      }

      const normalized = normalizeApiError(error);
      if (normalized !== "请求失败") {
        message.error(normalized);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(record: RetentionPolicyRecord) {
    const operationNote = await promptSharedDeleteOperationNote(modal, {
      title: "删除生命周期策略",
      description: `将删除 ${record.name}。可选填写本次删除备注，便于后续审计追溯。`,
      okText: "确认删除",
    });
    if (operationNote === null) return;

    try {
      await removeRetentionPolicy(record.id, { operation_note: operationNote });
      message.success("生命周期策略已删除");
      const nextPage = policies.items.length === 1 && policyPage > 1 ? policyPage - 1 : policyPage;
      setPolicyPage(nextPage);
      await loadPolicies(nextPage, policyFilters);
    } catch (error) {
      handlePageError(error);
    }
  }

  const policyTab = (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {accessNotice ? (
        <Alert
          showIcon
          type="info"
          message={accessNotice.title}
          description={accessNotice.description}
        />
      ) : null}

      <RetentionPoliciesMetrics {...policyMetrics} />

      <SearchToolbar>
        <Space wrap size={12} style={{ width: "100%" }}>
          <Input
            allowClear
            placeholder="搜索策略名称或说明"
            style={{ width: 240 }}
            value={policyFilters.keyword}
            onChange={event => {
              setPolicyPage(1);
              setPolicyFilters(current => ({ ...current, keyword: event.target.value }));
            }}
          />

          <Select
            allowClear
            placeholder="按项目筛选"
            style={{ width: 180 }}
            value={policyFilters.project_id ?? undefined}
            options={visibleProjects.map(project => ({ label: project.name, value: project.id }))}
            onChange={value => {
              setPolicyPage(1);
              setPolicyFilters(current => ({
                ...current,
                environment_id: null,
                mailbox_pool_id: null,
                project_id: value ?? null,
              }));
            }}
          />

          <Select
            allowClear
            placeholder="按环境筛选"
            style={{ width: 180 }}
            value={policyFilters.environment_id ?? undefined}
            options={policyFilterEnvironmentOptions}
            onChange={value => {
              setPolicyPage(1);
              setPolicyFilters(current => ({
                ...current,
                environment_id: value ?? null,
                mailbox_pool_id: null,
              }));
            }}
          />

          <Select
            allowClear
            placeholder="按邮箱池筛选"
            style={{ width: 220 }}
            value={policyFilters.mailbox_pool_id ?? undefined}
            options={policyFilterMailboxPoolOptions}
            onChange={value => {
              setPolicyPage(1);
              setPolicyFilters(current => ({ ...current, mailbox_pool_id: value ?? null }));
            }}
          />

          <Select
            allowClear
            placeholder="状态"
            style={{ width: 120 }}
            value={
              policyFilters.is_enabled === null || policyFilters.is_enabled === undefined
                ? undefined
                : policyFilters.is_enabled
                  ? "enabled"
                  : "disabled"
            }
            options={[
              { label: "启用", value: "enabled" },
              { label: "停用", value: "disabled" },
            ]}
            onChange={value => {
              setPolicyPage(1);
              setPolicyFilters(current => ({
                ...current,
                is_enabled: value === "enabled" ? true : value === "disabled" ? false : null,
              }));
            }}
          />

          <Button
            onClick={() => {
              setPolicyPage(1);
              setPolicyFilters(EMPTY_POLICY_FILTERS);
            }}
          >
            重置筛选
          </Button>
        </Space>
      </SearchToolbar>

      <DataTable<RetentionPolicyRecord>
        rowKey="id"
        loading={policiesLoading}
        columns={policyColumns}
        dataSource={policies.items}
        current={policies.page}
        pageSize={policies.pageSize}
        total={policies.total}
        onPageChange={setPolicyPage}
        cardTitle="策略列表"
      />
    </Space>
  );

  const runsTab = canViewRuns ? (
    <RetentionRunsPanel
      canWrite={canWrite}
      onRefresh={() => {
        void Promise.all([loadRuns(runPage, runFilters), loadRunSummary()]);
      }}
      onRunFiltersChange={setRunFilters}
      onRunNow={optionKey => {
        void handleRunNow(optionKey);
      }}
      onRunPageChange={setRunPage}
      onViewDetail={setRunDetail}
      runFilters={runFilters}
      runPage={runPage}
      runSummary={runSummary}
      runSummaryLoading={runSummaryLoading}
      runningNow={runningNow}
      runs={runs}
      runsLoading={runsLoading}
    />
  ) : (
    <Alert
      showIcon
      type="info"
      message="生命周期执行记录属于全局观测视图，项目级管理员当前只能查看策略配置。"
    />
  );

  return (
    <>
      <PageHeader
        title="生命周期策略"
        subtitle="按 全局 -> 项目 -> 环境 -> 邮箱池 的优先级生效，可控制默认邮箱 TTL、邮件清理策略与执行观测。"
        tags={accessTag ? [accessTag] : undefined}
        extra={
          activeTab === "policies" && canWrite ? (
            <Button type="primary" onClick={openCreate}>
              新建策略
            </Button>
          ) : undefined
        }
      />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: "policies", label: "策略配置", children: policyTab },
          { key: "runs", label: "执行记录", children: runsTab },
        ]}
      />

      <RetentionPolicyFormDrawer
        accessibleProjectIds={accessibleProjectIds}
        editing={editing}
        form={form}
        formEnvironmentId={formEnvironmentId}
        formProjectId={formProjectId}
        isProjectScoped={isProjectScoped}
        loading={saving}
        onClose={() => setDrawerOpen(false)}
        onSubmit={() => {
          void handleSubmit();
        }}
        open={drawerOpen}
        visibleEnvironments={visibleEnvironments}
        visibleMailboxPools={visibleMailboxPools}
        visibleProjects={visibleProjects}
      />

      <RetentionRunDetailDrawer
        runDetail={runDetail}
        onClose={() => setRunDetail(null)}
      />
    </>
  );
}
