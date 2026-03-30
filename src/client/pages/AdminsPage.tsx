import { App, Button, Col, Form, Input, Select, Switch, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";

import { createAdmin, getAdmins, getWorkspaceCatalog, updateAdmin } from "../api";
import {
  ActionButtons,
  BatchActionsBar,
  DataTable,
  FormDrawer,
  MetricCard,
  MetricGrid,
  PageHeader,
} from "../components";
import { useTableSelection } from "../hooks/useTableSelection";
import type {
  AdminMutationPayload,
  AdminUserRecord,
  WorkspaceProjectRecord,
} from "../types";
import {
  buildBatchActionMessage,
  formatDateTime,
  loadAllPages,
  normalizeApiError,
  runBatchAction,
} from "../utils";

interface AdminsPageProps {
  onUnauthorized: () => void;
}

const INITIAL_VALUES: AdminMutationPayload = {
  access_scope: "all",
  display_name: "",
  is_enabled: true,
  password: "",
  project_ids: [],
  role: "analyst",
  username: "",
};

export default function AdminsPage({ onUnauthorized }: AdminsPageProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<AdminMutationPayload>();
  const watchedAccessScope = Form.useWatch("access_scope", form);
  const watchedRole = Form.useWatch("role", form);
  const [items, setItems] = useState<AdminUserRecord[]>([]);
  const [projects, setProjects] = useState<WorkspaceProjectRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUserRecord | null>(null);
  const { clearSelection, rowSelection, selectedItems } = useTableSelection(items, "id");

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (watchedRole === "owner" && form.getFieldValue("access_scope") !== "all") {
      form.setFieldsValue({ access_scope: "all", project_ids: [] });
    }
  }, [form, watchedRole]);

  async function loadData() {
    setLoading(true);
    try {
      const [admins, catalog] = await Promise.all([
        loadAllPages(getAdmins),
        getWorkspaceCatalog(true),
      ]);
      setItems(admins);
      setProjects(catalog.projects);
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

  function openCreate() {
    setEditing(null);
    form.setFieldsValue(INITIAL_VALUES);
    setDrawerOpen(true);
  }

  function openEdit(record: AdminUserRecord) {
    setEditing(record);
    form.setFieldsValue({
      access_scope: record.access_scope,
      display_name: record.display_name,
      is_enabled: record.is_enabled,
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
        project_ids: values.access_scope === "bound" ? values.project_ids || [] : [],
      };
      if (editing) {
        await updateAdmin(editing.id, payload);
        message.success("管理员已更新");
      } else {
        await createAdmin(payload);
        message.success("管理员已创建");
      }
      setDrawerOpen(false);
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

  async function handleBatchToggle(is_enabled: boolean) {
    const result = await runBatchAction(selectedItems, item =>
      updateAdmin(item.id, {
        access_scope: item.access_scope,
        display_name: item.display_name,
        is_enabled,
        project_ids: item.projects.map(project => project.id),
        role: item.role,
        username: item.username,
      }),
    );

    if (result.successCount > 0) {
      clearSelection();
      await loadData();
    }

    const messageText = buildBatchActionMessage(
      is_enabled ? "批量启用管理员" : "批量停用管理员",
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

  const columns: ColumnsType<AdminUserRecord> = [
    { title: "用户名", dataIndex: "username", key: "username" },
    { title: "显示名", dataIndex: "display_name", key: "display_name" },
    { title: "角色", dataIndex: "role", key: "role" },
    {
      title: "访问范围",
      key: "access_scope",
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
          ? record.projects.map(project => (
            <Tag key={project.id}>{project.name}</Tag>
          ))
          : "-",
    },
    {
      title: "状态",
      dataIndex: "is_enabled",
      key: "is_enabled",
      render: value => (value ? "启用" : "停用"),
    },
    {
      title: "最近登录",
      dataIndex: "last_login_at",
      key: "last_login_at",
      render: value => formatDateTime(value),
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      key: "created_at",
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      key: "action",
      render: (_, record) => <ActionButtons onEdit={() => openEdit(record)} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="管理员"
        subtitle="维护平台管理员，并为需要隔离的账号绑定可访问项目。"
        extra={
          <Button type="primary" onClick={openCreate}>
            新增管理员
          </Button>
        }
      />

      <MetricGrid>
        <MetricCard
          title="管理员总数"
          value={items.length}
          icon={<>#</>}
          percent={Math.min(100, items.length * 10)}
          color="#1890ff"
        />
      </MetricGrid>

      <DataTable
        cardTitle="管理员列表"
        cardToolbar={
          <BatchActionsBar selectedCount={selectedItems.length} onClear={clearSelection}>
            <Button onClick={() => void handleBatchToggle(true)}>
              批量启用
            </Button>
            <Button onClick={() => void handleBatchToggle(false)}>
              批量停用
            </Button>
          </BatchActionsBar>
        }
        columns={columns}
        dataSource={items}
        loading={loading}
        rowSelection={rowSelection}
        rowKey="id"
        pageSize={10}
      />

      <FormDrawer
        title={editing ? "编辑管理员" : "新增管理员"}
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
            <Input disabled={Boolean(editing)} placeholder="例如：ops-admin" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item
            label="显示名"
            name="display_name"
            rules={[{ required: true, message: "请输入显示名" }]}
          >
            <Input placeholder="例如：项目运维" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item
            label="角色"
            name="role"
            rules={[{ required: true, message: "请选择角色" }]}
          >
            <Select
              options={[
                { label: "Owner", value: "owner" },
                { label: "Admin", value: "admin" },
                { label: "Analyst", value: "analyst" },
              ]}
            />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item
            label="访问范围"
            name="access_scope"
            rules={[{ required: true, message: "请选择访问范围" }]}
          >
            <Select
              disabled={watchedRole === "owner"}
              options={[
                { label: "全局", value: "all" },
                { label: "项目绑定", value: "bound" },
              ]}
            />
          </Form.Item>
        </Col>
        {watchedAccessScope === "bound" && watchedRole !== "owner" ? (
          <Col span={24}>
            <Form.Item
              label="绑定项目"
              name="project_ids"
              rules={[{ required: true, message: "请选择至少一个项目" }]}
            >
              <Select
                mode="multiple"
                options={projects.map(project => ({
                  label: project.name,
                  value: project.id,
                }))}
                placeholder="选择允许访问的项目"
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
    </div>
  );
}
