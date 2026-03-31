import { Alert, App, Button, Card, Col, Form, Input, Popconfirm, Row, Space, Switch, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";

import {
  createWhitelist,
  getWhitelist,
  getWhitelistSettings,
  removeWhitelist,
  updateWhitelist,
  updateWhitelistSettings,
} from "../api";
import {
  ActionButtons,
  BatchActionsBar,
  DataTable,
  FormDrawer,
  MetricCard,
  PageHeader,
  SearchToolbar,
  StatusTag,
} from "../components";
import { useTableSelection } from "../hooks/useTableSelection";
import { canManageGlobalSettings, getReadonlyNotice, type CurrentUser } from "../permissions";
import type { WhitelistMutationPayload, WhitelistRecord } from "../types";
import { buildBatchActionMessage, formatDateTime, loadAllPages, normalizeApiError, runBatchAction } from "../utils";

interface WhitelistPageProps {
  currentUser?: CurrentUser;
  onUnauthorized: () => void;
}

const INITIAL_VALUES: WhitelistMutationPayload = {
  is_enabled: true,
  note: "",
  sender_pattern: "",
};

export default function WhitelistPage({ currentUser, onUnauthorized }: WhitelistPageProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<WhitelistMutationPayload>();
  const [items, setItems] = useState<WhitelistRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<WhitelistRecord | null>(null);
  const [whitelistEnabled, setWhitelistEnabled] = useState(true);
  const canManageWhitelist = canManageGlobalSettings(currentUser);
  const readonlyNotice = getReadonlyNotice(currentUser, "白名单");

  useEffect(() => {
    void loadData();
    void loadSettings();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      setItems(await loadAllPages(getWhitelist));
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

  async function loadSettings() {
    setSettingsLoading(true);
    try {
      const payload = await getWhitelistSettings();
      setWhitelistEnabled(payload.enabled);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setSettingsLoading(false);
    }
  }

  async function handleSettingsChange(enabled: boolean) {
    const previousValue = whitelistEnabled;
    setWhitelistEnabled(enabled);
    setSettingsSaving(true);
    try {
      const payload = await updateWhitelistSettings({ enabled });
      setWhitelistEnabled(payload.enabled);
      message.success(payload.enabled ? "全局白名单已启用" : "全局白名单已关闭");
    } catch (error) {
      setWhitelistEnabled(previousValue);
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setSettingsSaving(false);
    }
  }

  function openCreateDrawer() {
    setEditing(null);
    form.setFieldsValue(INITIAL_VALUES);
    setDrawerOpen(true);
  }

  function openEditDrawer(record: WhitelistRecord) {
    setEditing(record);
    form.setFieldsValue({
      is_enabled: record.is_enabled,
      note: record.note,
      sender_pattern: record.sender_pattern,
    });
    setDrawerOpen(true);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const values = await form.validateFields();
      if (editing) {
        await updateWhitelist(editing.id, values);
        message.success("白名单规则已更新");
      } else {
        await createWhitelist(values);
        message.success("白名单规则已创建");
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
      await removeWhitelist(id);
      message.success("白名单规则已删除");
      await loadData();
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  const filteredItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter(item =>
      [item.sender_pattern, item.note].some(value => value.toLowerCase().includes(keyword)),
    );
  }, [items, searchText]);

  const enabledCount = useMemo(() => items.filter(item => item.is_enabled).length, [items]);
  const {
    clearSelection,
    rowSelection,
    selectedItems,
  } = useTableSelection(filteredItems, "id");

  async function handleBatchToggle(is_enabled: boolean) {
    const result = await runBatchAction(selectedItems, item => updateWhitelist(item.id, {
      is_enabled,
      note: item.note,
      sender_pattern: item.sender_pattern,
    }));

    if (result.successCount > 0) {
      clearSelection();
      await loadData();
    }

    const messageText = buildBatchActionMessage(is_enabled ? "批量启用白名单" : "批量停用白名单", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  async function handleBatchDelete() {
    const result = await runBatchAction(selectedItems, item => removeWhitelist(item.id));
    if (result.successCount > 0) {
      clearSelection();
      await loadData();
    }

    const messageText = buildBatchActionMessage("批量删除白名单", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  const columns: ColumnsType<WhitelistRecord> = [
    {
      title: "发件人模式",
      dataIndex: "sender_pattern",
      key: "sender_pattern",
      render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
    },
    {
      title: "备注",
      dataIndex: "note",
      key: "note",
      render: value => value || "-",
    },
    {
      title: "状态",
      dataIndex: "is_enabled",
      key: "is_enabled",
      width: 100,
      render: value => (
        <StatusTag
          status={value ? "enabled" : "disabled"}
          activeText="启用"
          inactiveText="停用"
        />
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
      width: 140,
      render: (_value, record) => (
        canManageWhitelist ? (
          <ActionButtons
            deleteConfirmTitle="确定删除这条白名单规则吗？"
            onEdit={() => openEditDrawer(record)}
            onDelete={() => void handleDelete(record.id)}
          />
        ) : (
          <span style={{ color: "#999" }}>只读</span>
        )
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="白名单"
        subtitle="管理允许放行的发件人模式，支持备注、状态控制以及全局白名单开关。"
        tags={canManageWhitelist ? undefined : [{ color: "gold", label: "只读视角" }]}
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

      <Card size="small" style={{ borderRadius: 12, marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <Space direction="vertical" size={4}>
            <Typography.Text strong>全局白名单检查</Typography.Text>
            <Typography.Text type="secondary">
              启用后，仅允许命中已启用白名单规则的发件人通过；关闭后，将跳过白名单检查。
            </Typography.Text>
          </Space>
          <Switch
            checked={whitelistEnabled}
            checkedChildren="开"
            unCheckedChildren="关"
            disabled={!canManageWhitelist}
            loading={settingsLoading || settingsSaving}
            onChange={value => void handleSettingsChange(value)}
          />
        </div>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={8}>
          <MetricCard title="总数" value={items.length} icon={<>@</>} percent={Math.min(100, items.length * 10)} color="#1890ff" />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <MetricCard
            title="已启用"
            value={enabledCount}
            icon={<>#</>}
            percent={items.length ? (enabledCount / items.length) * 100 : 0}
            color="#52c41a"
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <MetricCard
            title="筛选结果"
            value={filteredItems.length}
            icon={<>*</>}
            percent={items.length ? (filteredItems.length / items.length) * 100 : 0}
            color="#722ed1"
          />
        </Col>
      </Row>

      <div style={{ marginBottom: 16 }}>
        <SearchToolbar
          searchPlaceholder="搜索发件人模式或备注"
          searchValue={searchText}
          onSearchChange={value => setSearchText(value)}
          onReset={() => setSearchText("")}
          onAdd={canManageWhitelist ? openCreateDrawer : undefined}
          addText="新增白名单规则"
        />
      </div>

      <DataTable
        cardTitle="白名单列表"
        cardToolbar={canManageWhitelist ? (
          <BatchActionsBar selectedCount={selectedItems.length} onClear={clearSelection}>
            <Button onClick={() => void handleBatchToggle(true)}>
              批量启用
            </Button>
            <Button onClick={() => void handleBatchToggle(false)}>
              批量停用
            </Button>
            <Popconfirm
              title={`确定删除选中的 ${selectedItems.length} 条白名单规则吗？`}
              onConfirm={() => void handleBatchDelete()}
            >
              <Button danger>
                批量删除
              </Button>
            </Popconfirm>
          </BatchActionsBar>
        ) : undefined}
        columns={columns}
        dataSource={filteredItems}
        loading={loading}
        rowSelection={canManageWhitelist ? rowSelection : undefined}
        rowKey="id"
        pageSize={10}
      />

      {canManageWhitelist ? (
        <FormDrawer
          title={editing ? "编辑白名单规则" : "新增白名单规则"}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onSubmit={() => void handleSubmit()}
          form={form}
          loading={saving}
        >
          <Col span={24}>
            <Form.Item
              label="发件人模式"
              name="sender_pattern"
              rules={[{ required: true, message: "请输入发件人模式" }]}
            >
              <Input.TextArea rows={6} placeholder={"示例: notifications@github\\.com$"} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="备注" name="note">
              <Input placeholder="示例: GitHub 官方通知" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="启用状态" name="is_enabled" valuePropName="checked">
              <Switch checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>
          </Col>
        </FormDrawer>
      ) : null}
    </div>
  );
}
