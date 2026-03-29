import { App, Button, Col, Form, Input, Popconfirm, Select, Switch } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";

import {
  createNotification,
  getNotifications,
  removeNotification,
  testNotification,
  updateNotification,
} from "../api";
import { ActionButtons, BatchActionsBar, DataTable, FormDrawer, MetricCard, MetricGrid, PageHeader } from "../components";
import { useTableSelection } from "../hooks/useTableSelection";
import type { NotificationEndpointRecord, NotificationMutationPayload } from "../types";
import { buildBatchActionMessage, formatDateTime, loadAllPages, normalizeApiError, runBatchAction } from "../utils";

interface NotificationsPageProps {
  onUnauthorized: () => void;
}

const INITIAL_VALUES: NotificationMutationPayload = {
  events: ["email.received"],
  is_enabled: true,
  name: "",
  secret: "",
  target: "",
  type: "webhook",
};

export default function NotificationsPage({ onUnauthorized }: NotificationsPageProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<NotificationMutationPayload>();
  const [items, setItems] = useState<NotificationEndpointRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationEndpointRecord | null>(null);
  const {
    clearSelection,
    rowSelection,
    selectedItems,
  } = useTableSelection(items, "id");

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      setItems(await loadAllPages(getNotifications));
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

  function openEdit(record: NotificationEndpointRecord) {
    setEditing(record);
    form.setFieldsValue({
      events: record.events,
      is_enabled: record.is_enabled,
      name: record.name,
      secret: record.secret,
      target: record.target,
      type: record.type,
    });
    setDrawerOpen(true);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const values = await form.validateFields();
      if (editing) {
        await updateNotification(editing.id, values);
        message.success("通知端点已更新");
      } else {
        await createNotification(values);
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
      message.success("测试通知已发送");
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
    const result = await runBatchAction(selectedItems, item => updateNotification(item.id, {
      events: item.events,
      is_enabled,
      name: item.name,
      secret: item.secret,
      target: item.target,
      type: item.type,
    }));

    if (result.successCount > 0) {
      clearSelection();
      await loadData();
    }

    const messageText = buildBatchActionMessage(is_enabled ? "批量启用通知" : "批量停用通知", result);
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

  const columns: ColumnsType<NotificationEndpointRecord> = [
    { title: "名称", dataIndex: "name", key: "name" },
    { title: "目标地址", dataIndex: "target", key: "target", render: value => <span style={{ fontFamily: "monospace" }}>{value}</span> },
    { title: "事件", dataIndex: "events", key: "events", render: value => value.join(", ") },
    { title: "状态", dataIndex: "last_status", key: "last_status", render: value => value || "-" },
    { title: "最近发送", dataIndex: "last_sent_at", key: "last_sent_at", render: value => formatDateTime(value) },
    {
      title: "操作",
      key: "action",
      render: (_value, record) => (
        <ActionButtons
          onEdit={() => openEdit(record)}
          onDelete={() => void handleDelete(record.id)}
          extra={(
            <Button type="link" size="small" onClick={() => void handleTest(record.id)}>
              测试
            </Button>
          )}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="通知配置" subtitle="配置 Webhook 通知，支持收件、命中、删除、登录和错误事件" />

      <MetricGrid>
        <MetricCard title="通知端点" value={items.length} icon={<>→</>} percent={Math.min(100, items.length * 10)} color="#1890ff" />
      </MetricGrid>

      <DataTable
        cardTitle="通知端点列表"
        cardExtra={<Button onClick={openCreate}>新增端点</Button>}
        cardToolbar={(
          <>
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
          </>
        )}
        columns={columns}
        dataSource={items}
        loading={loading}
        rowSelection={rowSelection}
        rowKey="id"
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
            <Input placeholder="例如：默认 Webhook" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="目标地址" name="target" rules={[{ required: true, message: "请输入目标地址" }]}>
            <Input placeholder="https://example.com/webhook" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="事件" name="events" rules={[{ required: true, message: "请选择事件" }]}>
            <Select
              mode="multiple"
              options={[
                { label: "email.received", value: "email.received" },
                { label: "email.matched", value: "email.matched" },
                { label: "email.deleted", value: "email.deleted" },
                { label: "email.restored", value: "email.restored" },
                { label: "mailbox.expired", value: "mailbox.expired" },
                { label: "admin.login", value: "admin.login" },
                { label: "rule.updated", value: "rule.updated" },
                { label: "error.raised", value: "error.raised" },
                { label: "email.sent", value: "email.sent" },
                { label: "email.send_failed", value: "email.send_failed" },
              ]}
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
    </div>
  );
}
