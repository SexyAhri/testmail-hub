import {
  ClockCircleOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  FieldTimeOutlined,
  GlobalOutlined,
  PartitionOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";

import {
  createRetentionPolicy,
  getRetentionJobRuns,
  getRetentionPolicies,
  getWorkspaceCatalog,
  removeRetentionPolicy,
  triggerRetentionJob,
  updateRetentionPolicy,
} from "../api";
import {
  ActionButtons,
  DataTable,
  DetailDrawer,
  FormDrawer,
  MetricCard,
  MetricGrid,
  PageHeader,
  SearchToolbar,
} from "../components";
import {
  canManageRetentionPolicyRecord,
  canWriteAnyResource,
  getAccessibleProjectIds,
  isProjectScopedUser,
  isReadOnlyUser,
  type CurrentUser,
} from "../permissions";
import type {
  PaginationPayload,
  RetentionJobRunRecord,
  RetentionPolicyPayload,
  RetentionPolicyRecord,
  WorkspaceCatalog,
} from "../types";
import { formatDateTime, normalizeApiError } from "../utils";

const { Paragraph, Text } = Typography;

interface RetentionPoliciesPageProps {
  currentUser?: CurrentUser;
  onUnauthorized: () => void;
}

const EMPTY_POLICY_LIST: PaginationPayload<RetentionPolicyRecord> = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
};

const EMPTY_RUN_LIST: PaginationPayload<RetentionJobRunRecord> = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
};

const EMPTY_CATALOG: WorkspaceCatalog = {
  environments: [],
  mailbox_pools: [],
  projects: [],
};

const INITIAL_VALUES: RetentionPolicyPayload = {
  archive_email_hours: null,
  deleted_email_retention_hours: null,
  description: "",
  email_retention_hours: null,
  environment_id: null,
  is_enabled: true,
  mailbox_pool_id: null,
  mailbox_ttl_hours: null,
  name: "",
  project_id: null,
};

function getPolicyScopeLabel(
  record: Pick<
    RetentionPolicyRecord,
    "environment_name" | "mailbox_pool_name" | "project_name" | "scope_level"
  >,
) {
  if (record.scope_level === "mailbox_pool") {
    return `${record.project_name} / ${record.environment_name} / ${record.mailbox_pool_name}`;
  }
  if (record.scope_level === "environment") {
    return `${record.project_name} / ${record.environment_name}`;
  }
  if (record.scope_level === "project") {
    return record.project_name;
  }
  return "全局默认";
}

function getPolicyScopeColor(scopeLevel: RetentionPolicyRecord["scope_level"]) {
  if (scopeLevel === "mailbox_pool") return "purple";
  if (scopeLevel === "environment") return "cyan";
  if (scopeLevel === "project") return "blue";
  return "gold";
}

function getPolicyScopeText(scopeLevel: RetentionPolicyRecord["scope_level"]) {
  if (scopeLevel === "mailbox_pool") return "邮箱池";
  if (scopeLevel === "environment") return "环境";
  if (scopeLevel === "project") return "项目";
  return "全局";
}

function formatHours(value: number | null) {
  return value === null ? "-" : `${value} 小时`;
}

function formatDuration(value: number | null) {
  if (value === null || value < 0) return "-";
  if (value < 1000) return `${value} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
  return `${(value / 60_000).toFixed(1)} min`;
}

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

export default function RetentionPoliciesPage({
  currentUser,
  onUnauthorized,
}: RetentionPoliciesPageProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<RetentionPolicyPayload>();
  const [catalog, setCatalog] = useState<WorkspaceCatalog>(EMPTY_CATALOG);
  const [policies, setPolicies] = useState<PaginationPayload<RetentionPolicyRecord>>(EMPTY_POLICY_LIST);
  const [runs, setRuns] = useState<PaginationPayload<RetentionJobRunRecord>>(EMPTY_RUN_LIST);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [runsLoading, setRunsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<RetentionPolicyRecord | null>(null);
  const [activeTab, setActiveTab] = useState("policies");
  const [runDetail, setRunDetail] = useState<RetentionJobRunRecord | null>(null);
  const [policyFilters, setPolicyFilters] = useState<{
    environment_id?: number | null;
    is_enabled?: boolean | null;
    keyword?: string;
    mailbox_pool_id?: number | null;
    project_id?: number | null;
  }>({
    environment_id: null,
    is_enabled: null,
    keyword: "",
    mailbox_pool_id: null,
    project_id: null,
  });
  const [runFilters, setRunFilters] = useState<{
    status?: "failed" | "success" | null;
    trigger_source?: string | null;
  }>({
    status: null,
    trigger_source: null,
  });
  const [policyPage, setPolicyPage] = useState(1);
  const [runPage, setRunPage] = useState(1);
  const canWrite = canWriteAnyResource(currentUser);
  const isProjectScoped = isProjectScopedUser(currentUser);
  const isReadOnly = isReadOnlyUser(currentUser);
  const canViewRuns = !isProjectScoped;
  const accessibleProjectIds = useMemo(() => getAccessibleProjectIds(currentUser), [currentUser]);

  const formProjectId = Form.useWatch("project_id", form);
  const formEnvironmentId = Form.useWatch("environment_id", form);

  useEffect(() => {
    void loadCatalog();
  }, []);

  useEffect(() => {
    void loadPolicies(policyPage);
  }, [policyFilters, policyPage]);

  useEffect(() => {
    if (!canViewRuns) return;
    void loadRuns(runPage);
  }, [canViewRuns, runFilters, runPage]);

  async function loadCatalog() {
    try {
      setCatalog(await getWorkspaceCatalog(true));
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function loadPolicies(nextPage = policyPage) {
    setPoliciesLoading(true);
    try {
      setPolicies(await getRetentionPolicies(nextPage, policyFilters));
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setPoliciesLoading(false);
    }
  }

  async function loadRuns(nextPage = runPage) {
    setRunsLoading(true);
    try {
      setRuns(await getRetentionJobRuns(nextPage, runFilters));
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setRunsLoading(false);
    }
  }

  async function handleRunNow() {
    setRunningNow(true);
    try {
      await triggerRetentionJob();
      message.success("生命周期任务已开始执行");
      setActiveTab("runs");
      setRunPage(1);
      await loadRuns(1);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
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

  const policyMetrics = useMemo(() => ({
    enabled: policies.items.filter(item => item.is_enabled).length,
    global: policies.items.filter(item => item.scope_level === "global").length,
    mailboxPool: policies.items.filter(item => item.scope_level === "mailbox_pool").length,
    project: policies.items.filter(item => item.scope_level === "project").length,
    total: policies.items.length,
  }), [policies.items]);

  const runMetrics = useMemo(() => {
    const successCount = runs.items.filter(item => item.status === "success").length;
    const failedCount = runs.items.filter(item => item.status === "failed").length;
    const latest = runs.items[0] || null;
    return {
      archivedEmails: runs.items.reduce((sum, item) => sum + item.archived_email_count, 0),
      failedCount,
      latest,
      scannedEmails: runs.items.reduce((sum, item) => sum + item.scanned_email_count, 0),
      successCount,
      total: runs.items.length,
    };
  }, [runs.items]);

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
      await loadPolicies(1);
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

  async function handleDelete(record: RetentionPolicyRecord) {
    try {
      await removeRetentionPolicy(record.id);
      message.success("生命周期策略已删除");
      const nextPage = policies.items.length === 1 && policyPage > 1 ? policyPage - 1 : policyPage;
      setPolicyPage(nextPage);
      await loadPolicies(nextPage);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  const policyColumns: ColumnsType<RetentionPolicyRecord> = [
    {
      dataIndex: "name",
      key: "name",
      title: "策略名称",
      width: 180,
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.name}</Text>
          <Tag color={getPolicyScopeColor(record.scope_level)}>{getPolicyScopeText(record.scope_level)}</Tag>
        </Space>
      ),
    },
    {
      key: "scope",
      title: "作用域",
      render: (_value, record) => getPolicyScopeLabel(record),
    },
    {
      dataIndex: "archive_email_hours",
      key: "archive_email_hours",
      title: "自动归档",
      width: 120,
      render: value => formatHours(value),
    },
    {
      dataIndex: "mailbox_ttl_hours",
      key: "mailbox_ttl_hours",
      title: "邮箱 TTL",
      width: 120,
      render: value => formatHours(value),
    },
    {
      dataIndex: "email_retention_hours",
      key: "email_retention_hours",
      title: "邮件保留",
      width: 120,
      render: value => formatHours(value),
    },
    {
      dataIndex: "deleted_email_retention_hours",
      key: "deleted_email_retention_hours",
      title: "已删邮件保留",
      width: 140,
      render: value => formatHours(value),
    },
    {
      dataIndex: "is_enabled",
      key: "is_enabled",
      title: "状态",
      width: 90,
      render: value => <Tag color={value ? "success" : "default"}>{value ? "启用" : "停用"}</Tag>,
    },
    {
      dataIndex: "updated_at",
      key: "updated_at",
      title: "更新时间",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      key: "action",
      title: "操作",
      width: 120,
      render: (_value, record) => (
        canManageRetentionPolicyRecord(currentUser, record) ? (
          <ActionButtons
            onEdit={() => openEdit(record)}
            onDelete={() => void handleDelete(record)}
            deleteConfirmTitle="确认删除这条生命周期策略吗？删除后将回退到上层作用域或系统默认策略。"
          />
        ) : (
          <span style={{ color: "#999" }}>只读</span>
        )
      ),
    },
  ];

  const runColumns: ColumnsType<RetentionJobRunRecord> = [
    {
      dataIndex: "started_at",
      key: "started_at",
      title: "开始时间",
      width: 176,
      render: value => formatDateTime(value),
    },
    {
      dataIndex: "status",
      key: "status",
      title: "状态",
      width: 100,
      render: value => <Tag color={value === "success" ? "success" : "error"}>{value === "success" ? "成功" : "失败"}</Tag>,
    },
    {
      dataIndex: "trigger_source",
      key: "trigger_source",
      title: "触发来源",
      width: 120,
      render: value => <Tag color="processing">{value || "scheduled"}</Tag>,
    },
    {
      dataIndex: "scanned_email_count",
      key: "scanned_email_count",
      title: "扫描邮件",
      width: 110,
    },
    {
      dataIndex: "archived_email_count",
      key: "archived_email_count",
      title: "归档邮件",
      width: 100,
    },
    {
      dataIndex: "purged_active_email_count",
      key: "purged_active_email_count",
      title: "清理普通邮件",
      width: 120,
    },
    {
      dataIndex: "purged_deleted_email_count",
      key: "purged_deleted_email_count",
      title: "清理已删邮件",
      width: 120,
    },
    {
      dataIndex: "expired_mailbox_count",
      key: "expired_mailbox_count",
      title: "停用邮箱",
      width: 100,
    },
    {
      dataIndex: "duration_ms",
      key: "duration_ms",
      title: "耗时",
      width: 100,
      render: value => formatDuration(value),
    },
    {
      key: "detail",
      title: "详情",
      width: 96,
      render: (_value, record) => (
        <Button type="link" size="small" onClick={() => setRunDetail(record)}>
          查看
        </Button>
      ),
    },
  ];

  const policyTab = (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {isReadOnly ? (
        <Alert
          showIcon
          type="info"
          message="当前账号为只读角色，可查看生命周期策略，但不能新增、编辑或删除。"
        />
      ) : null}

      {isProjectScoped ? (
        <Alert
          showIcon
          type="info"
          message="项目级管理员可查看全局默认策略，但只能编辑自己绑定项目下的生命周期策略。"
        />
      ) : null}

      <MetricGrid>
        <MetricCard title="当前页策略数" value={policyMetrics.total} icon={<PartitionOutlined />} color="#1677ff" />
        <MetricCard title="启用中" value={policyMetrics.enabled} icon={<ClockCircleOutlined />} color="#16a34a" />
        <MetricCard title="全局 / 项目" value={`${policyMetrics.global} / ${policyMetrics.project}`} icon={<GlobalOutlined />} color="#d48806" />
        <MetricCard title="邮箱池级" value={policyMetrics.mailboxPool} icon={<FieldTimeOutlined />} color="#7c3aed" />
      </MetricGrid>

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
            options={catalog.environments
              .filter(environment => !policyFilters.project_id || environment.project_id === policyFilters.project_id)
              .filter(environment => !isProjectScoped || accessibleProjectIds.includes(environment.project_id))
              .map(environment => ({
                label: `${environment.project_name} / ${environment.name}`,
                value: environment.id,
              }))}
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
            options={catalog.mailbox_pools
              .filter(pool => !policyFilters.project_id || pool.project_id === policyFilters.project_id)
              .filter(pool => !policyFilters.environment_id || pool.environment_id === policyFilters.environment_id)
              .filter(pool => !isProjectScoped || accessibleProjectIds.includes(pool.project_id))
              .map(pool => ({
                label: `${pool.project_name} / ${pool.environment_name} / ${pool.name}`,
                value: pool.id,
              }))}
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
              setPolicyFilters({
                environment_id: null,
                is_enabled: null,
                keyword: "",
                mailbox_pool_id: null,
                project_id: null,
              });
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
        onPageChange={nextPage => setPolicyPage(nextPage)}
        cardTitle="策略列表"
      />
    </Space>
  );

  const runsTab = canViewRuns ? (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <MetricGrid>
        <MetricCard title="当前页执行数" value={runMetrics.total} icon={<PartitionOutlined />} color="#1677ff" />
        <MetricCard title="成功 / 失败" value={`${runMetrics.successCount} / ${runMetrics.failedCount}`} icon={<ExclamationCircleOutlined />} color={runMetrics.failedCount > 0 ? "#fa541c" : "#16a34a"} />
        <MetricCard title="累计自动归档" value={runMetrics.archivedEmails} icon={<FieldTimeOutlined />} color="#7c3aed" />
        <MetricCard title="最近一次执行" value={runMetrics.latest ? formatDateTime(runMetrics.latest.started_at) : "-"} icon={<ClockCircleOutlined />} color="#0f766e" />
      </MetricGrid>

      <SearchToolbar>
        <Space wrap size={12} style={{ width: "100%" }}>
          <Select
            allowClear
            placeholder="执行状态"
            style={{ width: 140 }}
            value={runFilters.status ?? undefined}
            options={[
              { label: "成功", value: "success" },
              { label: "失败", value: "failed" },
            ]}
            onChange={value => {
              setRunPage(1);
              setRunFilters(current => ({ ...current, status: value ?? null }));
            }}
          />

          <Select
            allowClear
            placeholder="触发来源"
            style={{ width: 160 }}
            value={runFilters.trigger_source ?? undefined}
            options={[
              { label: "manual", value: "manual" },
              { label: "scheduled", value: "scheduled" },
            ]}
            onChange={value => {
              setRunPage(1);
              setRunFilters(current => ({ ...current, trigger_source: value ?? null }));
            }}
          />

          <Button
            icon={<ReloadOutlined />}
            onClick={() => void loadRuns(runPage)}
          >
            刷新执行记录
          </Button>

          {canWrite ? (
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              loading={runningNow}
              onClick={() => void handleRunNow()}
            >
              立即执行
            </Button>
          ) : null}

          <Button
            onClick={() => {
              setRunPage(1);
              setRunFilters({ status: null, trigger_source: null });
            }}
          >
            重置筛选
          </Button>
        </Space>
      </SearchToolbar>

      <DataTable<RetentionJobRunRecord>
        rowKey="id"
        loading={runsLoading}
        columns={runColumns}
        dataSource={runs.items}
        current={runs.page}
        pageSize={runs.pageSize}
        total={runs.total}
        onPageChange={nextPage => setRunPage(nextPage)}
        cardTitle="执行记录"
      />
    </Space>
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

      <FormDrawer
        title={editing ? "编辑生命周期策略" : "新建生命周期策略"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
        loading={saving}
        form={form}
        formProps={{ layout: "vertical" }}
        width="42vw"
      >
        <Col span={24}>
          <Alert
            showIcon
            type="info"
            message="未填写的保留字段会继续继承上层作用域；默认邮箱 TTL 仅在新建邮箱且未手动指定过期时间时生效。"
          />
        </Col>

        <Col span={24}>
          <Form.Item
            label="策略名称"
            name="name"
            rules={[{ required: true, message: "请输入策略名称" }]}
          >
            <Input placeholder="例如：项目默认保留策略" />
          </Form.Item>
        </Col>

        <Col span={24}>
          <Form.Item label="说明" name="description">
            <Input.TextArea rows={3} placeholder="描述这条策略覆盖的范围和用途" />
          </Form.Item>
        </Col>

        <Col span={12}>
          <Form.Item label="项目" name="project_id">
            <Select
              allowClear={!isProjectScoped}
              disabled={isProjectScoped && accessibleProjectIds.length === 1}
              placeholder={isProjectScoped ? "请选择绑定项目" : "留空表示全局策略"}
              options={visibleProjects.map(project => ({ label: project.name, value: project.id }))}
              onChange={() => {
                form.setFieldsValue({ environment_id: null, mailbox_pool_id: null });
              }}
            />
          </Form.Item>
        </Col>

        <Col span={12}>
          <Form.Item label="环境" name="environment_id">
            <Select
              allowClear
              disabled={!formProjectId}
              placeholder="可选，继承项目策略"
              options={visibleEnvironments.map(environment => ({
                label: `${environment.project_name} / ${environment.name}`,
                value: environment.id,
              }))}
              onChange={() => {
                form.setFieldsValue({ mailbox_pool_id: null });
              }}
            />
          </Form.Item>
        </Col>

        <Col span={24}>
          <Form.Item label="邮箱池" name="mailbox_pool_id">
            <Select
              allowClear
              disabled={!formEnvironmentId}
              placeholder="可选，最细粒度策略"
              options={visibleMailboxPools.map(pool => ({
                label: `${pool.project_name} / ${pool.environment_name} / ${pool.name}`,
                value: pool.id,
              }))}
            />
          </Form.Item>
        </Col>

        <Col span={8}>
          <Form.Item label="自动归档（小时）" name="archive_email_hours">
            <InputNumber min={1} max={24 * 365 * 5} precision={0} style={{ width: "100%" }} placeholder="例如 24" />
          </Form.Item>
        </Col>

        <Col span={8}>
          <Form.Item label="默认邮箱 TTL（小时）" name="mailbox_ttl_hours">
            <InputNumber min={1} max={24 * 365 * 5} precision={0} style={{ width: "100%" }} placeholder="例如 24" />
          </Form.Item>
        </Col>

        <Col span={8}>
          <Form.Item label="邮件保留（小时）" name="email_retention_hours">
            <InputNumber min={1} max={24 * 365 * 5} precision={0} style={{ width: "100%" }} placeholder="例如 48" />
          </Form.Item>
        </Col>

        <Col span={8}>
          <Form.Item label="已删邮件保留（小时）" name="deleted_email_retention_hours">
            <InputNumber min={1} max={24 * 365 * 5} precision={0} style={{ width: "100%" }} placeholder="例如 720" />
          </Form.Item>
        </Col>

        <Col span={24}>
          <Form.Item label="启用策略" name="is_enabled" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Col>
      </FormDrawer>

      <DetailDrawer
        title="执行记录详情"
        open={Boolean(runDetail)}
        onClose={() => setRunDetail(null)}
        width="42vw"
      >
        {runDetail ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="状态">
                <Tag color={runDetail.status === "success" ? "success" : "error"}>
                  {runDetail.status === "success" ? "成功" : "失败"}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="触发来源">{runDetail.trigger_source}</Descriptions.Item>
              <Descriptions.Item label="开始时间">{formatDateTime(runDetail.started_at)}</Descriptions.Item>
              <Descriptions.Item label="结束时间">
                {runDetail.finished_at ? formatDateTime(runDetail.finished_at) : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="执行耗时">{formatDuration(runDetail.duration_ms)}</Descriptions.Item>
              <Descriptions.Item label="应用策略数">{runDetail.applied_policy_count}</Descriptions.Item>
              <Descriptions.Item label="扫描邮件">{runDetail.scanned_email_count}</Descriptions.Item>
              <Descriptions.Item label="自动归档">{runDetail.archived_email_count}</Descriptions.Item>
              <Descriptions.Item label="停用邮箱">{runDetail.expired_mailbox_count}</Descriptions.Item>
              <Descriptions.Item label="清理普通邮件">{runDetail.purged_active_email_count}</Descriptions.Item>
              <Descriptions.Item label="清理已删邮件">{runDetail.purged_deleted_email_count}</Descriptions.Item>
            </Descriptions>

            {runDetail.error_message ? (
              <Alert
                showIcon
                type="error"
                message="执行失败"
                description={runDetail.error_message}
              />
            ) : null}

            <div>
              <Text strong>执行上下文</Text>
              <Paragraph
                copyable
                style={{
                  marginTop: 8,
                  marginBottom: 0,
                  padding: 12,
                  background: "#fafafa",
                  borderRadius: 8,
                  border: "1px solid #f0f0f0",
                  whiteSpace: "pre-wrap",
                }}
              >
                {stringifyJson(runDetail.detail_json)}
              </Paragraph>
            </div>
          </Space>
        ) : null}
      </DetailDrawer>
    </>
  );
}
