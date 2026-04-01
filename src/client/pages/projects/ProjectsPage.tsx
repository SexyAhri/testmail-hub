import { Alert, App, Button, Form, Tabs } from "antd";
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
} from "../../api/workspace";
import { DataTable, PageHeader } from "../../components";
import { promptOperationNote } from "../../delete-operation-note";
import { usePageFeedback } from "../../hooks/usePageFeedback";
import { EnvironmentFormDrawer, MailboxPoolFormDrawer, ProjectFormDrawer } from "./WorkspaceFormDrawers";
import { ProjectsMetrics } from "./ProjectsMetrics";
import { buildEnvironmentColumns, buildMailboxPoolColumns, buildProjectColumns } from "./workspace-table-columns";
import type {
  MailboxPoolPayload,
  MailboxPoolRecord,
  SessionPayload,
  WorkspaceCatalog,
  WorkspaceEnvironmentPayload,
  WorkspaceEnvironmentRecord,
  WorkspaceProjectPayload,
  WorkspaceProjectRecord,
} from "../../types";
import { canManageGlobalSettings, getAccessModeTag, getReadonlyNotice } from "../../permissions";
import { normalizeApiError } from "../../utils";

interface ProjectsPageProps {
  currentUser?: SessionPayload["user"] | null;
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

export default function ProjectsPage({ currentUser, onUnauthorized }: ProjectsPageProps) {
  const { message, modal } = App.useApp();
  const [projectForm] = Form.useForm<WorkspaceProjectPayload>();
  const [environmentForm] = Form.useForm<WorkspaceEnvironmentPayload>();
  const [mailboxPoolForm] = Form.useForm<MailboxPoolPayload>();
  const [catalog, setCatalog] = useState<WorkspaceCatalog>(EMPTY_CATALOG);
  const [saving, setSaving] = useState(false);
  const [projectDrawerOpen, setProjectDrawerOpen] = useState(false);
  const [environmentDrawerOpen, setEnvironmentDrawerOpen] = useState(false);
  const [mailboxPoolDrawerOpen, setMailboxPoolDrawerOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<WorkspaceProjectRecord | null>(null);
  const [editingEnvironment, setEditingEnvironment] = useState<WorkspaceEnvironmentRecord | null>(null);
  const [editingMailboxPool, setEditingMailboxPool] = useState<MailboxPoolRecord | null>(null);
  const canManageWorkspace = canManageGlobalSettings(currentUser);
  const accessTag = getAccessModeTag(currentUser);
  const readonlyNotice = getReadonlyNotice(currentUser, "项目空间");
  const { loading, handlePageError, runPageLoad } = usePageFeedback(onUnauthorized);

  const mailboxPoolProjectId = Form.useWatch("project_id", mailboxPoolForm);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    const nextCatalog = await runPageLoad(() => getWorkspaceCatalog(true));
    if (nextCatalog !== null) {
      setCatalog(nextCatalog);
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
      handlePageError(error, { ignoreFallbackMessage: true });
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
      handlePageError(error, { ignoreFallbackMessage: true });
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
      handlePageError(error, { ignoreFallbackMessage: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleProjectDelete(id: number) {
    const record = catalog.projects.find(item => item.id === id);
    const operationNote = await promptOperationNote(modal, {
      title: "删除项目",
      description: `将删除 ${record?.name || `项目 #${id}`}。可选填写本次删除备注，便于后续审计追溯。`,
      okText: "确认删除",
    });
    if (operationNote === null) return;

    try {
      await removeProject(id, { operation_note: operationNote });
      message.success("项目已删除");
      await loadData();
    } catch (error) {
      handlePageError(error);
    }
  }

  async function handleEnvironmentDelete(id: number) {
    const record = catalog.environments.find(item => item.id === id);
    const operationNote = await promptOperationNote(modal, {
      title: "删除环境",
      description: `将删除 ${record?.name || `环境 #${id}`}。可选填写本次删除备注，便于后续审计追溯。`,
      okText: "确认删除",
    });
    if (operationNote === null) return;

    try {
      await removeEnvironment(id, { operation_note: operationNote });
      message.success("环境已删除");
      await loadData();
    } catch (error) {
      handlePageError(error);
    }
  }

  async function handleMailboxPoolDelete(id: number) {
    const record = catalog.mailbox_pools.find(item => item.id === id);
    const operationNote = await promptOperationNote(modal, {
      title: "删除邮箱池",
      description: `将删除 ${record?.name || `邮箱池 #${id}`}。可选填写本次删除备注，便于后续审计追溯。`,
      okText: "确认删除",
    });
    if (operationNote === null) return;

    try {
      await removeMailboxPool(id, { operation_note: operationNote });
      message.success("邮箱池已删除");
      await loadData();
    } catch (error) {
      handlePageError(error);
    }
  }

  const projectColumns = buildProjectColumns({
    canManage: canManageWorkspace,
    deleteConfirmTitle: "确认删除该项目吗？如已有环境、邮箱池或历史邮件引用，将被拦截。",
    onDelete: record => void handleProjectDelete(record.id),
    onEdit: openProjectEdit,
  });
  const environmentColumns = buildEnvironmentColumns({
    canManage: canManageWorkspace,
    deleteConfirmTitle: "确认删除该环境吗？如已有邮箱池、邮箱或历史邮件引用，将被拦截。",
    onDelete: record => void handleEnvironmentDelete(record.id),
    onEdit: openEnvironmentEdit,
  });
  const mailboxPoolColumns = buildMailboxPoolColumns({
    canManage: canManageWorkspace,
    deleteConfirmTitle: "确认删除该邮箱池吗？如已有邮箱或历史邮件引用，将被拦截。",
    onDelete: record => void handleMailboxPoolDelete(record.id),
    onEdit: openMailboxPoolEdit,
  });

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
        tags={accessTag ? [accessTag] : undefined}
      />

      {readonlyNotice ? (
        <Alert
          showIcon
          type="info"
          message={readonlyNotice.title}
          description={readonlyNotice.description}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <ProjectsMetrics
        projectCount={catalog.projects.length}
        environmentCount={catalog.environments.length}
        mailboxPoolCount={catalog.mailbox_pools.length}
      />

      <Tabs
        style={{ marginTop: 16 }}
        items={[
          {
            key: "projects",
            label: `项目 (${catalog.projects.length})`,
            children: (
              <DataTable
                cardTitle="项目列表"
                cardExtra={canManageWorkspace ? <Button type="primary" onClick={openProjectCreate}>新增项目</Button> : undefined}
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
                cardExtra={canManageWorkspace ? <Button type="primary" onClick={openEnvironmentCreate}>新增环境</Button> : undefined}
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
                cardExtra={canManageWorkspace ? <Button type="primary" onClick={openMailboxPoolCreate}>新增邮箱池</Button> : undefined}
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

      {canManageWorkspace ? (
        <ProjectFormDrawer
          editing={editingProject}
          form={projectForm}
          loading={saving}
          onClose={() => setProjectDrawerOpen(false)}
          onSubmit={() => void handleProjectSubmit()}
          open={projectDrawerOpen}
        />
      ) : null}

      {canManageWorkspace ? (
        <EnvironmentFormDrawer
          editing={editingEnvironment}
          form={environmentForm}
          loading={saving}
          onClose={() => setEnvironmentDrawerOpen(false)}
          onSubmit={() => void handleEnvironmentSubmit()}
          open={environmentDrawerOpen}
          projectOptions={environmentProjectOptions}
        />
      ) : null}

      {canManageWorkspace ? (
        <MailboxPoolFormDrawer
          editing={editingMailboxPool}
          environmentOptions={filteredPoolEnvironmentOptions}
          form={mailboxPoolForm}
          loading={saving}
          onClose={() => setMailboxPoolDrawerOpen(false)}
          onProjectChange={() => mailboxPoolForm.setFieldValue("environment_id", undefined)}
          onSubmit={() => void handleMailboxPoolSubmit()}
          open={mailboxPoolDrawerOpen}
          projectId={mailboxPoolProjectId}
          projectOptions={projectOptions}
        />
      ) : null}
    </div>
  );
}
