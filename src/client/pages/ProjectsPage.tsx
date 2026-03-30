import { App, Button, Col, Form, Input, Select, Switch, Tabs } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";

import {
  createEnvironment,
  createMailboxPool,
  createProject,
  getWorkspaceCatalog,
  removeEnvironment,
  removeMailboxPool,
  removeProject,
  updateEnvironment,
  updateMailboxPool,
  updateProject,
} from "../api";
import { ActionButtons, DataTable, FormDrawer, MetricCard, MetricGrid, PageHeader } from "../components";
import type {
  MailboxPoolPayload,
  MailboxPoolRecord,
  WorkspaceCatalog,
  WorkspaceEnvironmentPayload,
  WorkspaceEnvironmentRecord,
  WorkspaceProjectPayload,
  WorkspaceProjectRecord,
} from "../types";
import { formatDateTime, normalizeApiError } from "../utils";

interface ProjectsPageProps {
  onUnauthorized: () => void;
}

const EMPTY_CATALOG: WorkspaceCatalog = {
  environments: [],
  mailbox_pools: [],
  projects: [],
};

const INITIAL_PROJECT: Partial<WorkspaceProjectPayload> = {
  description: "",
  is_enabled: true,
  name: "",
  slug: "",
};

const INITIAL_ENVIRONMENT: Partial<WorkspaceEnvironmentPayload> = {
  description: "",
  is_enabled: true,
  name: "",
  slug: "",
};

const INITIAL_MAILBOX_POOL: Partial<MailboxPoolPayload> = {
  description: "",
  is_enabled: true,
  name: "",
  slug: "",
};

export default function ProjectsPage({ onUnauthorized }: ProjectsPageProps) {
  const { message } = App.useApp();
  const [projectForm] = Form.useForm<WorkspaceProjectPayload>();
  const [environmentForm] = Form.useForm<WorkspaceEnvironmentPayload>();
  const [mailboxPoolForm] = Form.useForm<MailboxPoolPayload>();
  const [catalog, setCatalog] = useState<WorkspaceCatalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [projectDrawerOpen, setProjectDrawerOpen] = useState(false);
  const [environmentDrawerOpen, setEnvironmentDrawerOpen] = useState(false);
  const [mailboxPoolDrawerOpen, setMailboxPoolDrawerOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<WorkspaceProjectRecord | null>(null);
  const [editingEnvironment, setEditingEnvironment] = useState<WorkspaceEnvironmentRecord | null>(null);
  const [editingMailboxPool, setEditingMailboxPool] = useState<MailboxPoolRecord | null>(null);

  const mailboxPoolProjectId = Form.useWatch("project_id", mailboxPoolForm);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      setCatalog(await getWorkspaceCatalog(true));
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

  const projectOptions = useMemo(
    () => catalog.projects.map(item => ({
      label: item.is_enabled ? item.name : `${item.name}（已停用）`,
      value: item.id,
    })),
    [catalog.projects],
  );

  const environmentProjectOptions = useMemo(
    () => catalog.projects.map(item => ({
      label: item.is_enabled ? item.name : `${item.name}（已停用）`,
      value: item.id,
    })),
    [catalog.projects],
  );

  function openProjectCreate() {
    setEditingProject(null);
    projectForm.setFieldsValue(INITIAL_PROJECT);
    setProjectDrawerOpen(true);
  }

  function openProjectEdit(record: WorkspaceProjectRecord) {
    setEditingProject(record);
    projectForm.setFieldsValue({
      description: record.description,
      is_enabled: record.is_enabled,
      name: record.name,
      slug: record.slug,
    });
    setProjectDrawerOpen(true);
  }

  function openEnvironmentCreate() {
    setEditingEnvironment(null);
    environmentForm.setFieldsValue(INITIAL_ENVIRONMENT);
    setEnvironmentDrawerOpen(true);
  }

  function openEnvironmentEdit(record: WorkspaceEnvironmentRecord) {
    setEditingEnvironment(record);
    environmentForm.setFieldsValue({
      description: record.description,
      is_enabled: record.is_enabled,
      name: record.name,
      project_id: record.project_id,
      slug: record.slug,
    });
    setEnvironmentDrawerOpen(true);
  }

  function openMailboxPoolCreate() {
    setEditingMailboxPool(null);
    mailboxPoolForm.setFieldsValue(INITIAL_MAILBOX_POOL);
    setMailboxPoolDrawerOpen(true);
  }

  function openMailboxPoolEdit(record: MailboxPoolRecord) {
    setEditingMailboxPool(record);
    mailboxPoolForm.setFieldsValue({
      description: record.description,
      environment_id: record.environment_id,
      is_enabled: record.is_enabled,
      name: record.name,
      project_id: record.project_id,
      slug: record.slug,
    });
    setMailboxPoolDrawerOpen(true);
  }

  async function handleProjectSubmit() {
    setSaving(true);
    try {
      const values = await projectForm.validateFields();
      if (editingProject) {
        await updateProject(editingProject.id, values);
        message.success("项目已更新");
      } else {
        await createProject(values);
        message.success("项目已创建");
      }
      setProjectDrawerOpen(false);
      await loadData();
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

  async function handleEnvironmentSubmit() {
    setSaving(true);
    try {
      const values = await environmentForm.validateFields();
      if (editingEnvironment) {
        await updateEnvironment(editingEnvironment.id, values);
        message.success("环境已更新");
      } else {
        await createEnvironment(values);
        message.success("环境已创建");
      }
      setEnvironmentDrawerOpen(false);
      await loadData();
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

  async function handleMailboxPoolSubmit() {
    setSaving(true);
    try {
      const values = await mailboxPoolForm.validateFields();
      if (editingMailboxPool) {
        await updateMailboxPool(editingMailboxPool.id, values);
        message.success("邮箱池已更新");
      } else {
        await createMailboxPool(values);
        message.success("邮箱池已创建");
      }
      setMailboxPoolDrawerOpen(false);
      await loadData();
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

  async function handleProjectDelete(id: number) {
    try {
      await removeProject(id);
      message.success("项目已删除");
      await loadData();
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function handleEnvironmentDelete(id: number) {
    try {
      await removeEnvironment(id);
      message.success("环境已删除");
      await loadData();
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function handleMailboxPoolDelete(id: number) {
    try {
      await removeMailboxPool(id);
      message.success("邮箱池已删除");
      await loadData();
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  const projectColumns: ColumnsType<WorkspaceProjectRecord> = [
    { title: "项目名称", dataIndex: "name", key: "name" },
    { title: "标识", dataIndex: "slug", key: "slug", render: value => <span style={{ fontFamily: "monospace" }}>{value}</span> },
    { title: "描述", dataIndex: "description", key: "description", render: value => value || "-" },
    { title: "环境数", dataIndex: "environment_count", key: "environment_count", width: 90 },
    { title: "邮箱池", dataIndex: "mailbox_pool_count", key: "mailbox_pool_count", width: 90 },
    { title: "邮箱数", dataIndex: "mailbox_count", key: "mailbox_count", width: 90 },
    { title: "状态", dataIndex: "is_enabled", key: "is_enabled", width: 90, render: value => value ? "启用" : "停用" },
    { title: "更新时间", dataIndex: "updated_at", key: "updated_at", width: 180, render: value => formatDateTime(value) },
    {
      title: "操作",
      key: "action",
      width: 120,
      render: (_value, record) => (
        <ActionButtons
          onEdit={() => openProjectEdit(record)}
          onDelete={() => void handleProjectDelete(record.id)}
          deleteConfirmTitle="确认删除该项目吗？如已有环境、邮箱池或历史邮件引用，将被拦截。"
        />
      ),
    },
  ];

  const environmentColumns: ColumnsType<WorkspaceEnvironmentRecord> = [
    { title: "所属项目", dataIndex: "project_name", key: "project_name" },
    { title: "环境名称", dataIndex: "name", key: "name" },
    { title: "标识", dataIndex: "slug", key: "slug", render: value => <span style={{ fontFamily: "monospace" }}>{value}</span> },
    { title: "描述", dataIndex: "description", key: "description", render: value => value || "-" },
    { title: "邮箱池", dataIndex: "mailbox_pool_count", key: "mailbox_pool_count", width: 90 },
    { title: "邮箱数", dataIndex: "mailbox_count", key: "mailbox_count", width: 90 },
    { title: "状态", dataIndex: "is_enabled", key: "is_enabled", width: 90, render: value => value ? "启用" : "停用" },
    { title: "更新时间", dataIndex: "updated_at", key: "updated_at", width: 180, render: value => formatDateTime(value) },
    {
      title: "操作",
      key: "action",
      width: 120,
      render: (_value, record) => (
        <ActionButtons
          onEdit={() => openEnvironmentEdit(record)}
          onDelete={() => void handleEnvironmentDelete(record.id)}
          deleteConfirmTitle="确认删除该环境吗？如已有邮箱池、邮箱或历史邮件引用，将被拦截。"
        />
      ),
    },
  ];

  const mailboxPoolColumns: ColumnsType<MailboxPoolRecord> = [
    { title: "所属项目", dataIndex: "project_name", key: "project_name" },
    { title: "所属环境", dataIndex: "environment_name", key: "environment_name" },
    { title: "邮箱池名称", dataIndex: "name", key: "name" },
    { title: "标识", dataIndex: "slug", key: "slug", render: value => <span style={{ fontFamily: "monospace" }}>{value}</span> },
    { title: "描述", dataIndex: "description", key: "description", render: value => value || "-" },
    { title: "邮箱数", dataIndex: "mailbox_count", key: "mailbox_count", width: 90 },
    { title: "状态", dataIndex: "is_enabled", key: "is_enabled", width: 90, render: value => value ? "启用" : "停用" },
    { title: "更新时间", dataIndex: "updated_at", key: "updated_at", width: 180, render: value => formatDateTime(value) },
    {
      title: "操作",
      key: "action",
      width: 120,
      render: (_value, record) => (
        <ActionButtons
          onEdit={() => openMailboxPoolEdit(record)}
          onDelete={() => void handleMailboxPoolDelete(record.id)}
          deleteConfirmTitle="确认删除该邮箱池吗？如已有邮箱或历史邮件引用，将被拦截。"
        />
      ),
    },
  ];

  const filteredPoolEnvironmentOptions = useMemo(() => {
    const projectId = Number(mailboxPoolProjectId || 0);
    return catalog.environments
      .filter(item => !projectId || item.project_id === projectId)
      .map(item => ({
        label: item.is_enabled ? item.name : `${item.name}（已停用）`,
        value: item.id,
      }));
  }, [catalog.environments, mailboxPoolProjectId]);

  return (
    <div>
      <PageHeader
        title="项目空间"
        subtitle="先把项目、环境、邮箱池这三层基础模型落稳，后续权限隔离、API 范围和团队协作都会基于这里继续扩展。"
        extra={<Button onClick={() => void loadData()} loading={loading}>刷新</Button>}
      />

      <MetricGrid>
        <MetricCard title="项目数量" value={catalog.projects.length} icon={<>P</>} percent={Math.min(100, catalog.projects.length * 10)} color="#1890ff" />
        <MetricCard title="环境数量" value={catalog.environments.length} icon={<>E</>} percent={Math.min(100, catalog.environments.length * 8)} color="#52c41a" />
        <MetricCard title="邮箱池数量" value={catalog.mailbox_pools.length} icon={<>M</>} percent={Math.min(100, catalog.mailbox_pools.length * 8)} color="#722ed1" />
      </MetricGrid>

      <Tabs
        style={{ marginTop: 16 }}
        items={[
          {
            key: "projects",
            label: `项目 (${catalog.projects.length})`,
            children: (
              <DataTable
                cardTitle="项目列表"
                cardExtra={<Button type="primary" onClick={openProjectCreate}>新增项目</Button>}
                columns={projectColumns}
                dataSource={catalog.projects}
                loading={loading}
                rowKey="id"
                showPagination={false}
              />
            ),
          },
          {
            key: "environments",
            label: `环境 (${catalog.environments.length})`,
            children: (
              <DataTable
                cardTitle="环境列表"
                cardExtra={<Button type="primary" onClick={openEnvironmentCreate}>新增环境</Button>}
                columns={environmentColumns}
                dataSource={catalog.environments}
                loading={loading}
                rowKey="id"
                showPagination={false}
              />
            ),
          },
          {
            key: "mailbox-pools",
            label: `邮箱池 (${catalog.mailbox_pools.length})`,
            children: (
              <DataTable
                cardTitle="邮箱池列表"
                cardExtra={<Button type="primary" onClick={openMailboxPoolCreate}>新增邮箱池</Button>}
                columns={mailboxPoolColumns}
                dataSource={catalog.mailbox_pools}
                loading={loading}
                rowKey="id"
                showPagination={false}
              />
            ),
          },
        ]}
      />

      <FormDrawer
        title={editingProject ? "编辑项目" : "新增项目"}
        open={projectDrawerOpen}
        onClose={() => setProjectDrawerOpen(false)}
        onSubmit={() => void handleProjectSubmit()}
        form={projectForm}
        loading={saving}
      >
        <Col span={24}>
          <Form.Item label="项目名称" name="name" rules={[{ required: true, message: "请输入项目名称" }]}>
            <Input placeholder="例如：账号体系测试" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="项目标识" name="slug">
            <Input placeholder="例如：account-auth" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} placeholder="补充项目用途、业务线或交付说明" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="启用状态" name="is_enabled" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Col>
      </FormDrawer>

      <FormDrawer
        title={editingEnvironment ? "编辑环境" : "新增环境"}
        open={environmentDrawerOpen}
        onClose={() => setEnvironmentDrawerOpen(false)}
        onSubmit={() => void handleEnvironmentSubmit()}
        form={environmentForm}
        loading={saving}
      >
        <Col span={24}>
          <Form.Item label="所属项目" name="project_id" rules={[{ required: true, message: "请选择项目" }]}>
            <Select options={environmentProjectOptions} placeholder="选择项目" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="环境名称" name="name" rules={[{ required: true, message: "请输入环境名称" }]}>
            <Input placeholder="例如：staging" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="环境标识" name="slug">
            <Input placeholder="例如：staging" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} placeholder="说明环境用途，例如联调、灰度、生产" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="启用状态" name="is_enabled" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Col>
      </FormDrawer>

      <FormDrawer
        title={editingMailboxPool ? "编辑邮箱池" : "新增邮箱池"}
        open={mailboxPoolDrawerOpen}
        onClose={() => setMailboxPoolDrawerOpen(false)}
        onSubmit={() => void handleMailboxPoolSubmit()}
        form={mailboxPoolForm}
        loading={saving}
      >
        <Col span={24}>
          <Form.Item label="所属项目" name="project_id" rules={[{ required: true, message: "请选择项目" }]}>
            <Select
              options={projectOptions}
              placeholder="选择项目"
              onChange={() => mailboxPoolForm.setFieldValue("environment_id", undefined)}
            />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="所属环境" name="environment_id" rules={[{ required: true, message: "请选择环境" }]}>
            <Select
              options={filteredPoolEnvironmentOptions}
              placeholder={mailboxPoolProjectId ? "选择环境" : "请先选择项目"}
              disabled={!mailboxPoolProjectId}
            />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="邮箱池名称" name="name" rules={[{ required: true, message: "请输入邮箱池名称" }]}>
            <Input placeholder="例如：登录验证码池" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="邮箱池标识" name="slug">
            <Input placeholder="例如：login-codes" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} placeholder="说明该邮箱池服务的测试场景或团队" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="启用状态" name="is_enabled" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Col>
      </FormDrawer>
    </div>
  );
}
