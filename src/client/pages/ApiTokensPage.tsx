import {
  FolderOpenOutlined,
  KeyOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { App, Button, Col, DatePicker, Form, Input, Popconfirm, Select, Switch, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";

import {
  createApiToken,
  getApiTokens,
  getWorkspaceCatalog,
  removeApiToken,
  updateApiToken,
} from "../api";
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
  ApiTokenMutationPayload,
  ApiTokenPermission,
  ApiTokenRecord,
  WorkspaceProjectRecord,
} from "../types";
import {
  buildBatchActionMessage,
  formatDateTime,
  loadAllPages,
  normalizeApiError,
  runBatchAction,
} from "../utils";

interface ApiTokensPageProps {
  onUnauthorized: () => void;
}

interface ApiTokenFormValues {
  access_scope: "all" | "bound";
  description: string;
  expires_at: Dayjs | null;
  is_enabled: boolean;
  name: string;
  permissions: ApiTokenPermission[];
  project_ids: number[];
}

const PERMISSION_OPTIONS: Array<{ label: string; value: ApiTokenPermission }> = [
  { label: "读取邮件摘要", value: "read:mail" },
  { label: "读取验证码/提取结果", value: "read:code" },
  { label: "读取附件", value: "read:attachment" },
  { label: "读取规则命中结果", value: "read:rule-result" },
];

const PERMISSION_LABELS = new Map(PERMISSION_OPTIONS.map(item => [item.value, item.label]));

const INITIAL_VALUES: ApiTokenFormValues = {
  access_scope: "all",
  description: "",
  expires_at: null,
  is_enabled: true,
  name: "",
  permissions: ["read:mail"],
  project_ids: [],
};

function formatPermissionLabel(permission: ApiTokenPermission) {
  return PERMISSION_LABELS.get(permission) || permission;
}

export default function ApiTokensPage({ onUnauthorized }: ApiTokensPageProps) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<ApiTokenFormValues>();
  const watchedAccessScope = Form.useWatch("access_scope", form);
  const [items, setItems] = useState<ApiTokenRecord[]>([]);
  const [projects, setProjects] = useState<WorkspaceProjectRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ApiTokenRecord | null>(null);
  const { clearSelection, rowSelection, selectedItems } = useTableSelection(items, "id");

  const boundCount = useMemo(
    () => items.filter(item => item.access_scope === "bound").length,
    [items],
  );
  const enabledCount = useMemo(
    () => items.filter(item => item.is_enabled).length,
    [items],
  );

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [tokens, catalog] = await Promise.all([
        loadAllPages(getApiTokens),
        getWorkspaceCatalog(true),
      ]);
      setItems(tokens);
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

  function openEdit(record: ApiTokenRecord) {
    setEditing(record);
    form.setFieldsValue({
      access_scope: record.access_scope,
      description: record.description,
      expires_at: record.expires_at ? dayjs(record.expires_at) : null,
      is_enabled: record.is_enabled,
      name: record.name,
      permissions: record.permissions,
      project_ids: record.projects.map(project => project.id),
    });
    setDrawerOpen(true);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const values = await form.validateFields();
      const payload: ApiTokenMutationPayload = {
        access_scope: values.access_scope,
        description: values.description.trim(),
        expires_at: values.expires_at ? values.expires_at.valueOf() : null,
        is_enabled: values.is_enabled,
        name: values.name.trim(),
        permissions: values.permissions,
        project_ids: values.access_scope === "bound" ? values.project_ids || [] : [],
      };

      if (editing) {
        await updateApiToken(editing.id, payload);
        message.success("API Token 已更新");
      } else {
        const result = await createApiToken(payload);
        modal.info({
          title: "新 API Token 已签发",
          width: 720,
          content: (
            <div style={{ marginTop: 16 }}>
              <Typography.Paragraph type="secondary">
                这是唯一一次显示完整 Token，请立即保存。后续页面只保留前缀和预览值。
              </Typography.Paragraph>
              <Typography.Paragraph copyable={{ text: result.plain_text_token }}>
                <code>{result.plain_text_token}</code>
              </Typography.Paragraph>
            </div>
          ),
        });
        message.success("API Token 已创建");
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

  async function handleDelete(id: string) {
    try {
      await removeApiToken(id);
      message.success("API Token 已删除");
      await loadData();
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function handleBatchToggle(is_enabled: boolean) {
    const result = await runBatchAction(selectedItems, item =>
      updateApiToken(item.id, {
        access_scope: item.access_scope,
        description: item.description,
        expires_at: item.expires_at,
        is_enabled,
        name: item.name,
        permissions: item.permissions,
        project_ids: item.projects.map(project => project.id),
      }),
    );

    if (result.successCount > 0) {
      clearSelection();
      await loadData();
    }

    const messageText = buildBatchActionMessage(
      is_enabled ? "批量启用 Token" : "批量停用 Token",
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

  async function handleBatchDelete() {
    const result = await runBatchAction(selectedItems, item => removeApiToken(item.id));
    if (result.successCount > 0) {
      clearSelection();
      await loadData();
    }

    const messageText = buildBatchActionMessage("批量删除 Token", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  const columns: ColumnsType<ApiTokenRecord> = [
    { title: "名称", dataIndex: "name", key: "name", width: 180 },
    {
      title: "说明",
      dataIndex: "description",
      key: "description",
      render: value => value || "-",
      width: 220,
    },
    {
      title: "Token 预览",
      dataIndex: "token_preview",
      key: "token_preview",
      render: value => <Typography.Text code>{value}</Typography.Text>,
      width: 180,
    },
    {
      title: "权限",
      dataIndex: "permissions",
      key: "permissions",
      render: value => value.map((permission: ApiTokenPermission) => <Tag key={permission}>{formatPermissionLabel(permission)}</Tag>),
      width: 260,
    },
    {
      title: "范围",
      key: "access_scope",
      render: (_, record) => (
        <Tag color={record.access_scope === "bound" ? "gold" : "blue"}>
          {record.access_scope === "bound" ? "项目绑定" : "全局"}
        </Tag>
      ),
      width: 110,
    },
    {
      title: "绑定项目",
      key: "projects",
      render: (_, record) =>
        record.projects.length > 0
          ? record.projects.map(project => <Tag key={project.id}>{project.name}</Tag>)
          : "-",
      width: 220,
    },
    {
      title: "状态",
      dataIndex: "is_enabled",
      key: "is_enabled",
      render: value => (value ? "启用" : "停用"),
      width: 90,
    },
    {
      title: "最近使用",
      dataIndex: "last_used_at",
      key: "last_used_at",
      render: value => formatDateTime(value) || "未使用",
      width: 180,
    },
    {
      title: "过期时间",
      dataIndex: "expires_at",
      key: "expires_at",
      render: value => formatDateTime(value) || "永久有效",
      width: 180,
    },
    {
      title: "操作",
      key: "action",
      render: (_, record) => (
        <ActionButtons
          onEdit={() => openEdit(record)}
          onDelete={() => void handleDelete(record.id)}
        />
      ),
      width: 120,
      fixed: "right",
    },
  ];

  return (
    <div>
      <PageHeader
        title="API Token"
        subtitle="为自动化脚本签发全局或项目级访问令牌，支持权限拆分、过期时间和批量启停。"
        extra={(
          <Button type="primary" onClick={openCreate}>
            新建 Token
          </Button>
        )}
      />

      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        项目绑定 Token 只能访问被授权项目下的邮件、提取结果和附件。新建成功后，完整 Token 只会展示一次。
      </Typography.Paragraph>

      <MetricGrid>
        <MetricCard
          title="Token 总数"
          value={items.length}
          icon={<KeyOutlined />}
          percent={Math.min(100, items.length * 10)}
          color="#1890ff"
        />
        <MetricCard
          title="项目级 Token"
          value={boundCount}
          icon={<FolderOpenOutlined />}
          percent={items.length ? Math.round((boundCount / items.length) * 100) : 0}
          color="#faad14"
        />
        <MetricCard
          title="启用中"
          value={enabledCount}
          icon={<SafetyCertificateOutlined />}
          percent={items.length ? Math.round((enabledCount / items.length) * 100) : 0}
          color="#52c41a"
        />
      </MetricGrid>

      <DataTable
        cardTitle="Token 列表"
        cardToolbar={(
          <BatchActionsBar selectedCount={selectedItems.length} onClear={clearSelection}>
            <Button onClick={() => void handleBatchToggle(true)}>
              批量启用
            </Button>
            <Button onClick={() => void handleBatchToggle(false)}>
              批量停用
            </Button>
            <Popconfirm
              title={`确定删除选中的 ${selectedItems.length} 个 Token 吗？`}
              onConfirm={() => void handleBatchDelete()}
            >
              <Button danger>
                批量删除
              </Button>
            </Popconfirm>
          </BatchActionsBar>
        )}
        columns={columns}
        dataSource={items}
        loading={loading}
        rowSelection={rowSelection}
        rowKey="id"
        pageSize={10}
      />

      <FormDrawer
        title={editing ? "编辑 API Token" : "新建 API Token"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSubmit={() => void handleSubmit()}
        form={form}
        loading={saving}
      >
        <Col span={24}>
          <Form.Item label="名称" name="name" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="例如：Playwright Staging Token" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="说明" name="description">
            <Input.TextArea rows={3} placeholder="描述这个 Token 的用途" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item
            label="访问范围"
            name="access_scope"
            rules={[{ required: true, message: "请选择访问范围" }]}
          >
            <Select
              options={[
                { label: "全局", value: "all" },
                { label: "项目绑定", value: "bound" },
              ]}
            />
          </Form.Item>
        </Col>
        {watchedAccessScope === "bound" ? (
          <Col span={24}>
            <Form.Item
              label="绑定项目"
              name="project_ids"
              rules={[{ required: true, message: "请至少选择一个项目" }]}
            >
              <Select
                mode="multiple"
                options={projects.map(project => ({
                  label: project.name,
                  value: project.id,
                }))}
                placeholder="限制 Token 只能访问这些项目"
              />
            </Form.Item>
          </Col>
        ) : null}
        <Col span={24}>
          <Form.Item
            label="权限"
            name="permissions"
            rules={[{ required: true, message: "请至少选择一个权限" }]}
          >
            <Select mode="multiple" options={PERMISSION_OPTIONS} />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="过期时间" name="expires_at">
            <DatePicker showTime style={{ width: "100%" }} placeholder="留空则不过期" />
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
