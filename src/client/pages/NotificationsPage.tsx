import { Button, App, Col, Form, Input, Popconfirm, Select, Space, Switch, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";

import {
  createNotification,
  getNotificationDeliveries,
  getNotifications,
  getWorkspaceCatalog,
  removeNotification,
  retryNotificationDelivery,
  testNotification,
  updateNotification,
} from "../api";
import {
  ActionButtons,
  BatchActionsBar,
  DataTable,
  DetailDrawer,
  FormDrawer,
  MetricCard,
  MetricGrid,
  PageHeader,
  TypeTag,
} from "../components";
import { useTableSelection } from "../hooks/useTableSelection";
import type {
  NotificationDeliveryRecord,
  NotificationEndpointRecord,
  NotificationMutationPayload,
  PaginationPayload,
  WorkspaceProjectRecord,
} from "../types";
import {
  buildBatchActionMessage,
  formatDateTime,
  loadAllPages,
  normalizeApiError,
  runBatchAction,
} from "../utils";

interface NotificationsPageProps {
  onUnauthorized: () => void;
}

const EVENT_OPTIONS = [
  "email.received",
  "email.matched",
  "email.code_extracted",
  "email.link_extracted",
  "email.deleted",
  "email.restored",
  "mailbox.expired",
  "admin.login",
  "rule.updated",
  "error.raised",
  "email.sent",
  "email.send_failed",
];

const DELIVERY_STATUS_OPTIONS = {
  failed: { color: "error", label: "失败" },
  pending: { color: "processing", label: "待发送" },
  retrying: { color: "warning", label: "重试中" },
  success: { color: "success", label: "成功" },
};

const ENDPOINT_STATUS_OPTIONS = {
  "": { color: "default", label: "未投递" },
  failed: { color: "error", label: "失败" },
  pending: { color: "processing", label: "待发送" },
  retrying: { color: "warning", label: "等待重试" },
  success: { color: "success", label: "成功" },
};

const EMPTY_DELIVERIES: PaginationPayload<NotificationDeliveryRecord> = {
  items: [],
  page: 1,
  pageSize: 10,
  total: 0,
};

const INITIAL_VALUES: NotificationMutationPayload = {
  access_scope: "all",
  events: ["email.received"],
  is_enabled: true,
  name: "",
  project_ids: [],
  secret: "",
  target: "",
  type: "webhook",
};

export default function NotificationsPage({ onUnauthorized }: NotificationsPageProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<NotificationMutationPayload>();
  const watchedAccessScope = Form.useWatch("access_scope", form);
  const [items, setItems] = useState<NotificationEndpointRecord[]>([]);
  const [projects, setProjects] = useState<WorkspaceProjectRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationEndpointRecord | null>(null);
  const [deliveryDrawerOpen, setDeliveryDrawerOpen] = useState(false);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryReplayId, setDeliveryReplayId] = useState<number | null>(null);
  const [activeEndpoint, setActiveEndpoint] = useState<NotificationEndpointRecord | null>(null);
  const [deliveries, setDeliveries] =
    useState<PaginationPayload<NotificationDeliveryRecord>>(EMPTY_DELIVERIES);
  const { clearSelection, rowSelection, selectedItems } = useTableSelection(items, "id");

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [notifications, catalog] = await Promise.all([
        loadAllPages(getNotifications),
        getWorkspaceCatalog(true),
      ]);
      setItems(notifications);
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

  async function loadDeliveryPage(endpointId: number, page = 1) {
    setDeliveryLoading(true);
    try {
      const payload = await getNotificationDeliveries(endpointId, page);
      setDeliveries(payload);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setDeliveryLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    form.setFieldsValue(INITIAL_VALUES);
    setDrawerOpen(true);
  }

  function openEdit(record: NotificationEndpointRecord) {
    setEditing(record);
    form.setFieldsValue({
      access_scope: record.access_scope,
      events: record.events,
      is_enabled: record.is_enabled,
      name: record.name,
      project_ids: record.projects.map(project => project.id),
      secret: record.secret,
      target: record.target,
      type: record.type,
    });
    setDrawerOpen(true);
  }

  function openDeliveries(record: NotificationEndpointRecord) {
    setActiveEndpoint(record);
    setDeliveries(EMPTY_DELIVERIES);
    setDeliveryDrawerOpen(true);
    void loadDeliveryPage(record.id, 1);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const values = await form.validateFields();
      const payload: NotificationMutationPayload = {
        ...values,
        project_ids: values.access_scope === "bound" ? values.project_ids || [] : [],
      };
      if (editing) {
        await updateNotification(editing.id, payload);
        message.success("通知端点已更新");
      } else {
        await createNotification(payload);
        message.success("通知端点已创建");
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

  async function handleDelete(id: number) {
    try {
      await removeNotification(id);
      message.success("通知端点已删除");
      await loadData();
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function handleTest(id: number) {
    try {
      await testNotification(id);
      message.success("测试投递已触发");
      await Promise.all([
        loadData(),
        activeEndpoint?.id === id ? loadDeliveryPage(id, 1) : Promise.resolve(),
      ]);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function handleReplay(deliveryId: number) {
    setDeliveryReplayId(deliveryId);
    try {
      const payload = await retryNotificationDelivery(deliveryId);
      if (payload.delivery.status === "success") {
        message.success("重新投递成功");
      } else if (payload.delivery.status === "retrying") {
        message.warning("重新投递失败，已进入自动重试队列");
      } else {
        message.error("重新投递失败");
      }

      if (activeEndpoint) {
        await Promise.all([loadData(), loadDeliveryPage(activeEndpoint.id, 1)]);
      } else {
        await loadData();
      }
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setDeliveryReplayId(null);
    }
  }

  async function handleBatchToggle(is_enabled: boolean) {
    const result = await runBatchAction(selectedItems, item =>
      updateNotification(item.id, {
        access_scope: item.access_scope,
        events: item.events,
        is_enabled,
        name: item.name,
        project_ids: item.projects.map(project => project.id),
        secret: item.secret,
        target: item.target,
        type: item.type,
      }),
    );

    if (result.successCount > 0) {
      clearSelection();
      await loadData();
    }

    const messageText = buildBatchActionMessage(
      is_enabled ? "批量启用通知" : "批量停用通知",
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
    const result = await runBatchAction(selectedItems, item => removeNotification(item.id));
    if (result.successCount > 0) {
      clearSelection();
      await loadData();
    }

    const messageText = buildBatchActionMessage("批量删除通知", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  const endpointColumns: ColumnsType<NotificationEndpointRecord> = [
    { title: "名称", dataIndex: "name", key: "name", width: 180 },
    {
      title: "目标地址",
      dataIndex: "target",
      key: "target",
      render: value => (
        <Typography.Text style={{ fontFamily: "monospace", fontSize: 12 }} ellipsis={{ tooltip: value }}>
          {value}
        </Typography.Text>
      ),
    },
    {
      title: "范围",
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
      width: 220,
      render: (_, record) =>
        record.projects.length > 0
          ? record.projects.map(project => <Tag key={project.id}>{project.name}</Tag>)
          : "-",
    },
    {
      title: "事件",
      dataIndex: "events",
      key: "events",
      width: 260,
      render: value => (
        <Space size={[4, 4]} wrap>
          {value.map((item: string) => (
            <Tag key={item}>{item}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "最近状态",
      dataIndex: "last_status",
      key: "last_status",
      width: 120,
      render: value => <TypeTag options={ENDPOINT_STATUS_OPTIONS} type={value || ""} />,
    },
    {
      title: "最近错误",
      dataIndex: "last_error",
      key: "last_error",
      width: 260,
      render: value =>
        value ? (
          <Typography.Text type="danger" ellipsis={{ tooltip: value }}>
            {value}
          </Typography.Text>
        ) : (
          "-"
        ),
    },
    {
      title: "最近发送",
      dataIndex: "last_sent_at",
      key: "last_sent_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      key: "action",
      width: 220,
      fixed: "right",
      render: (_, record) => (
        <ActionButtons
          onEdit={() => openEdit(record)}
          onDelete={() => void handleDelete(record.id)}
          extra={(
            <Space size={0}>
              <Button type="link" size="small" onClick={() => void handleTest(record.id)}>
                测试
              </Button>
              <Button type="link" size="small" onClick={() => openDeliveries(record)}>
                记录
              </Button>
            </Space>
          )}
        />
      ),
    },
  ];

  const deliveryColumns: ColumnsType<NotificationDeliveryRecord> = [
    {
      title: "投递 ID",
      dataIndex: "id",
      key: "id",
      width: 100,
      render: value => <Typography.Text copyable>{String(value)}</Typography.Text>,
    },
    {
      title: "事件",
      dataIndex: "event",
      key: "event",
      width: 180,
      render: value => <Typography.Text style={{ fontFamily: "monospace", fontSize: 12 }}>{value}</Typography.Text>,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: value => <TypeTag options={DELIVERY_STATUS_OPTIONS} type={value} />,
    },
    {
      title: "尝试次数",
      key: "attempt_count",
      width: 120,
      render: (_, record) => `${record.attempt_count}/${record.max_attempts}`,
    },
    {
      title: "响应码",
      dataIndex: "response_status",
      key: "response_status",
      width: 100,
      render: value => value ?? "-",
    },
    {
      title: "最近尝试",
      dataIndex: "last_attempt_at",
      key: "last_attempt_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "下次重试",
      dataIndex: "next_retry_at",
      key: "next_retry_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "错误信息",
      dataIndex: "last_error",
      key: "last_error",
      render: value =>
        value ? (
          <Typography.Text type="danger" ellipsis={{ tooltip: value }}>
            {value}
          </Typography.Text>
        ) : (
          "-"
        ),
    },
    {
      title: "操作",
      key: "action",
      width: 120,
      fixed: "right",
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          loading={deliveryReplayId === record.id}
          onClick={() => void handleReplay(record.id)}
        >
          重新投递
        </Button>
      ),
    },
  ];

  const enabledCount = items.filter(item => item.is_enabled).length;
  const failedCount = items.filter(item => item.last_status === "failed").length;
  const retryingCount = items.filter(item => item.last_status === "retrying").length;

  return (
    <div>
      <PageHeader
        title="通知配置"
        subtitle="管理 Webhook 端点、查看投递记录，并对失败通知执行手动重放。"
      />

      <MetricGrid>
        <MetricCard
          title="通知端点"
          value={items.length}
          icon={<>#</>}
          percent={Math.min(100, items.length * 10)}
          color="#1677ff"
        />
        <MetricCard
          title="启用中"
          value={enabledCount}
          icon={<>ON</>}
          percent={items.length === 0 ? 0 : Math.round((enabledCount / items.length) * 100)}
          color="#52c41a"
        />
        <MetricCard
          title="等待重试"
          value={retryingCount}
          icon={<>RT</>}
          percent={Math.min(100, retryingCount * 20)}
          color="#faad14"
        />
        <MetricCard
          title="最近失败"
          value={failedCount}
          icon={<>ER</>}
          percent={Math.min(100, failedCount * 20)}
          color="#ff4d4f"
        />
      </MetricGrid>

      <DataTable
        cardTitle="通知端点列表"
        cardExtra={<Button onClick={openCreate}>新增端点</Button>}
        cardToolbar={(
          <BatchActionsBar selectedCount={selectedItems.length} onClear={clearSelection}>
            <Button onClick={() => void handleBatchToggle(true)}>
              批量启用
            </Button>
            <Button onClick={() => void handleBatchToggle(false)}>
              批量停用
            </Button>
            <Popconfirm
              title={`确定删除选中的 ${selectedItems.length} 个通知端点吗？`}
              onConfirm={() => void handleBatchDelete()}
            >
              <Button danger>
                批量删除
              </Button>
            </Popconfirm>
          </BatchActionsBar>
        )}
        columns={endpointColumns}
        dataSource={items}
        loading={loading}
        rowKey="id"
        rowSelection={rowSelection}
        pageSize={10}
      />

      <FormDrawer
        title={editing ? "编辑通知端点" : "新增通知端点"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSubmit={() => void handleSubmit()}
        form={form}
        loading={saving}
      >
        <Col span={24}>
          <Form.Item label="名称" name="name" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="例如：登录回调 Webhook" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="目标地址" name="target" rules={[{ required: true, message: "请输入目标地址" }]}>
            <Input placeholder="https://example.com/webhook" />
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
                placeholder="选择需要接收事件的项目"
              />
            </Form.Item>
          </Col>
        ) : null}
        <Col span={24}>
          <Form.Item label="事件" name="events" rules={[{ required: true, message: "请选择事件" }]}>
            <Select
              mode="multiple"
              options={EVENT_OPTIONS.map(value => ({ label: value, value }))}
            />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="签名 Secret" name="secret">
            <Input.Password placeholder="可留空" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="启用状态" name="is_enabled" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Col>
      </FormDrawer>

      <DetailDrawer
        title={activeEndpoint ? `投递记录 · ${activeEndpoint.name}` : "投递记录"}
        open={deliveryDrawerOpen}
        onClose={() => setDeliveryDrawerOpen(false)}
        width="64vw"
      >
        {activeEndpoint ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                display: "grid",
                gap: 8,
                padding: 14,
                borderRadius: 12,
                background: "rgba(22,119,255,0.04)",
                border: "1px solid rgba(22,119,255,0.12)",
              }}
            >
              <div>
                <Typography.Text type="secondary">目标地址</Typography.Text>
                <div>
                  <Typography.Text style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {activeEndpoint.target}
                  </Typography.Text>
                </div>
              </div>
              <div>
                <Typography.Text type="secondary">事件</Typography.Text>
                <div style={{ marginTop: 4 }}>
                  <Space size={[4, 4]} wrap>
                    {activeEndpoint.events.map(item => (
                      <Tag key={item}>{item}</Tag>
                    ))}
                  </Space>
                </div>
              </div>
            </div>

            <DataTable
              cardTitle="最近投递"
              columns={deliveryColumns}
              current={deliveries.page}
              dataSource={deliveries.items}
              loading={deliveryLoading}
              onPageChange={(page) => {
                if (activeEndpoint) void loadDeliveryPage(activeEndpoint.id, page);
              }}
              pageSize={deliveries.pageSize}
              rowKey="id"
              total={deliveries.total}
            />
          </div>
        ) : null}
      </DetailDrawer>
    </div>
  );
}
