import { Alert, Button, App, Col, Form, Input, InputNumber, Popconfirm, Select, Space, Switch, Tabs, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";

import {
  createNotification,
  getNotificationDeliveryAttempts,
  getNotificationDeliveries,
  getNotifications,
  getWorkspaceCatalog,
  removeNotification,
  resolveNotificationDeliveries,
  resolveNotificationDelivery,
  retryNotificationDeliveries,
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
  NotificationDeliveryAttemptRecord,
  NotificationDeliveriesPayload,
  NotificationDeliveryBulkActionResult,
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
import {
  DEFAULT_NOTIFICATION_ALERT_CONFIG,
  getNotificationEventDefinition,
  NOTIFICATION_EVENT_CATEGORY_LABELS,
  NOTIFICATION_EVENT_DEFINITIONS,
} from "../../utils/constants";
import {
  canManageNotificationRecord,
  canWriteAnyResource,
  getAccessibleProjectIds,
  isProjectScopedUser,
  isReadOnlyUser,
  type CurrentUser,
} from "../permissions";

interface NotificationsPageProps {
  currentUser?: CurrentUser;
  onUnauthorized: () => void;
}

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

const DELIVERY_HEALTH_OPTIONS = {
  critical: { color: "error", label: "告警", metricColor: "#ff4d4f", percent: 25 },
  healthy: { color: "success", label: "健康", metricColor: "#52c41a", percent: 100 },
  idle: { color: "default", label: "空闲", metricColor: "#bfbfbf", percent: 15 },
  warning: { color: "warning", label: "关注", metricColor: "#faad14", percent: 60 },
} as const;

const EMPTY_DELIVERIES: NotificationDeliveriesPayload = {
  items: [],
  page: 1,
  pageSize: 10,
  summary: {
    alerts: [],
    avg_duration_ms_24h: null,
    dead_letter_total: 0,
    failed_total: 0,
    health_status: "idle",
    last_attempt_at: null,
    last_failure_at: null,
    last_success_at: null,
    pending_total: 0,
    recent_attempts_24h: 0,
    recent_failed_attempts_24h: 0,
    recent_success_attempts_24h: 0,
    resolved_dead_letter_total: 0,
    retrying_total: 0,
    success_total: 0,
    success_rate_24h: 0,
    total_attempts: 0,
    total_deliveries: 0,
  },
  total: 0,
};

const EMPTY_ATTEMPTS: PaginationPayload<NotificationDeliveryAttemptRecord> = {
  items: [],
  page: 1,
  pageSize: 10,
  total: 0,
};

const INITIAL_VALUES: NotificationMutationPayload = {
  access_scope: "all",
  alert_config: { ...DEFAULT_NOTIFICATION_ALERT_CONFIG },
  events: ["email.received"],
  is_enabled: true,
  name: "",
  project_ids: [],
  secret: "",
  target: "",
  type: "webhook",
};

function buildDeliveryBulkMessage(actionLabel: string, result: NotificationDeliveryBulkActionResult) {
  const errorSuffix = result.errors[0]?.message ? `，${result.errors[0].message}` : "";
  if (result.failed_count === 0) {
    return `${actionLabel}完成，共处理 ${result.success_count} 条`;
  }

  return `${actionLabel}完成，成功 ${result.success_count} 条，失败 ${result.failed_count} 条${errorSuffix}`;
}

function formatDurationMetric(value: number | null) {
  if (value === null || value === undefined) return "-";
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
}

function formatPercentMetric(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${Number.isInteger(safeValue) ? safeValue : safeValue.toFixed(1)}%`;
}

function formatNotificationEventLabel(value: string) {
  const definition = getNotificationEventDefinition(value);
  return definition ? definition.label : value;
}

export default function NotificationsPage({ currentUser, onUnauthorized }: NotificationsPageProps) {
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
  const [deliveryResolveId, setDeliveryResolveId] = useState<number | null>(null);
  const [deliveryBatchAction, setDeliveryBatchAction] = useState<"resolve" | "retry" | null>(null);
  const [deliveryView, setDeliveryView] = useState<"all" | "dead_letter">("all");
  const [activeEndpoint, setActiveEndpoint] = useState<NotificationEndpointRecord | null>(null);
  const [activeDelivery, setActiveDelivery] = useState<NotificationDeliveryRecord | null>(null);
  const [attemptDrawerOpen, setAttemptDrawerOpen] = useState(false);
  const [attemptLoading, setAttemptLoading] = useState(false);
  const [deliveries, setDeliveries] = useState<NotificationDeliveriesPayload>(EMPTY_DELIVERIES);
  const [attempts, setAttempts] =
    useState<PaginationPayload<NotificationDeliveryAttemptRecord>>(EMPTY_ATTEMPTS);
  const { clearSelection, rowSelection, selectedItems } = useTableSelection(items, "id");
  const {
    clearSelection: clearDeliverySelection,
    rowSelection: deliverySelection,
    selectedItems: selectedDeliveries,
  } = useTableSelection(deliveries.items, "id");
  const canWriteNotifications = canWriteAnyResource(currentUser);
  const isProjectScoped = isProjectScopedUser(currentUser);
  const isViewer = isReadOnlyUser(currentUser);
  const accessibleProjectIds = useMemo(() => getAccessibleProjectIds(currentUser), [currentUser]);

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

  async function loadDeliveryPage(endpointId: number, page = 1, view: "all" | "dead_letter" = deliveryView) {
    setDeliveryLoading(true);
    try {
      const payload = await getNotificationDeliveries(endpointId, page, {
        dead_letter_only: view === "dead_letter",
      });
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

  async function loadAttemptPage(deliveryId: number, page = 1) {
    setAttemptLoading(true);
    try {
      const payload = await getNotificationDeliveryAttempts(deliveryId, page);
      setAttempts(payload);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setAttemptLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    form.setFieldsValue({
      ...INITIAL_VALUES,
      alert_config: { ...DEFAULT_NOTIFICATION_ALERT_CONFIG },
      access_scope: isProjectScoped ? "bound" : INITIAL_VALUES.access_scope,
      project_ids: isProjectScoped ? accessibleProjectIds : [],
    });
    setDrawerOpen(true);
  }

  function openEdit(record: NotificationEndpointRecord) {
    setEditing(record);
    form.setFieldsValue({
      access_scope: record.access_scope,
      alert_config: { ...record.alert_config },
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
    setDeliveryView("all");
    clearDeliverySelection();
    setActiveDelivery(null);
    setAttemptDrawerOpen(false);
    setAttempts(EMPTY_ATTEMPTS);
    setDeliveryDrawerOpen(true);
    void loadDeliveryPage(record.id, 1, "all");
  }

  function openAttempts(record: NotificationDeliveryRecord) {
    setActiveDelivery(record);
    setAttempts(EMPTY_ATTEMPTS);
    setAttemptDrawerOpen(true);
    void loadAttemptPage(record.id, 1);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const values = await form.validateFields();
      const payload: NotificationMutationPayload = {
        ...values,
        alert_config: values.alert_config || { ...DEFAULT_NOTIFICATION_ALERT_CONFIG },
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
      if (activeDelivery?.id === deliveryId) {
        await loadAttemptPage(activeDelivery.id, 1);
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

  async function handleResolve(deliveryId: number) {
    setDeliveryResolveId(deliveryId);
    try {
      await resolveNotificationDelivery(deliveryId);
      message.success("死信已标记为已处理");
      if (activeEndpoint) {
        await loadDeliveryPage(activeEndpoint.id, 1);
      } else {
        await loadData();
      }
      if (activeDelivery?.id === deliveryId) {
        setAttemptDrawerOpen(false);
        setActiveDelivery(null);
      }
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setDeliveryResolveId(null);
    }
  }

  async function handleBatchDeliveryRetry() {
    if (!activeEndpoint || selectedDeliveries.length === 0) return;

    const selectedIds = selectedDeliveries.map(item => item.id);
    setDeliveryBatchAction("retry");
    try {
      const result = await retryNotificationDeliveries(selectedIds);
      const statusParts: string[] = [];
      const successTotal = result.status_breakdown?.success || 0;
      const retryingTotal = result.status_breakdown?.retrying || 0;
      const failedTotal = result.status_breakdown?.failed || 0;

      if (successTotal > 0) statusParts.push(`直接成功 ${successTotal} 条`);
      if (retryingTotal > 0) statusParts.push(`进入重试 ${retryingTotal} 条`);
      if (failedTotal > 0) statusParts.push(`仍失败 ${failedTotal} 条`);

      const messageText = `${buildDeliveryBulkMessage("批量重放死信", result)}${statusParts.length > 0 ? `（${statusParts.join("，")}）` : ""}`;
      if (result.failed_count === 0) {
        message.success(messageText);
      } else if (result.success_count > 0) {
        message.warning(messageText);
      } else {
        message.error(messageText);
      }

      clearDeliverySelection();
      if (selectedIds.includes(activeDelivery?.id || -1)) {
        setAttemptDrawerOpen(false);
        setActiveDelivery(null);
      }

      await Promise.all([
        loadData(),
        loadDeliveryPage(activeEndpoint.id, 1, deliveryView),
      ]);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setDeliveryBatchAction(null);
    }
  }

  async function handleBatchDeliveryResolve() {
    if (!activeEndpoint || selectedDeliveries.length === 0) return;

    const selectedIds = selectedDeliveries.map(item => item.id);
    setDeliveryBatchAction("resolve");
    try {
      const result = await resolveNotificationDeliveries(selectedIds);
      const messageText = buildDeliveryBulkMessage("批量忽略死信", result);
      if (result.failed_count === 0) {
        message.success(messageText);
      } else if (result.success_count > 0) {
        message.warning(messageText);
      } else {
        message.error(messageText);
      }

      clearDeliverySelection();
      if (selectedIds.includes(activeDelivery?.id || -1)) {
        setAttemptDrawerOpen(false);
        setActiveDelivery(null);
      }

      await loadDeliveryPage(activeEndpoint.id, 1, deliveryView);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setDeliveryBatchAction(null);
    }
  }

  async function handleBatchToggle(is_enabled: boolean) {
    const result = await runBatchAction(selectedItems, item =>
      updateNotification(item.id, {
        access_scope: item.access_scope,
        alert_config: item.alert_config,
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

  const visibleProjects = useMemo(
    () => projects.filter(project => !isProjectScoped || accessibleProjectIds.includes(project.id)),
    [accessibleProjectIds, isProjectScoped, projects],
  );
  const eventOptions = useMemo(() =>
    Object.entries(
      NOTIFICATION_EVENT_DEFINITIONS.reduce<Record<string, typeof NOTIFICATION_EVENT_DEFINITIONS[number][]>>(
        (accumulator, definition) => {
          const bucket = accumulator[definition.category] || [];
          bucket.push(definition);
          accumulator[definition.category] = bucket;
          return accumulator;
        },
        {},
      ),
    ).map(([category, definitions]) => ({
      label: NOTIFICATION_EVENT_CATEGORY_LABELS[category as keyof typeof NOTIFICATION_EVENT_CATEGORY_LABELS],
      options: definitions.map(definition => ({
        label: `${definition.label} · ${definition.key}`,
        value: definition.key,
      })),
    })),
  []);

  const endpointRowSelection = useMemo(
    () => (canWriteNotifications ? {
      ...rowSelection,
      getCheckboxProps: (record: NotificationEndpointRecord) => ({
        disabled: !canManageNotificationRecord(currentUser, record),
      }),
    } : undefined),
    [canWriteNotifications, currentUser, rowSelection],
  );

  const deliveryRowSelection = useMemo(
    () => (canWriteNotifications && deliveryView === "dead_letter" ? {
      ...deliverySelection,
      getCheckboxProps: (record: NotificationDeliveryRecord) => ({
        disabled: !record.is_dead_letter,
      }),
    } : undefined),
    [canWriteNotifications, deliverySelection, deliveryView],
  );

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
            <Tag key={item} title={item}>{formatNotificationEventLabel(item)}</Tag>
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
      render: (_, record) => {
        const canManageRecord = canManageNotificationRecord(currentUser, record);
        return canManageRecord ? (
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
        ) : (
          <Space size={0}>
            <Button type="link" size="small" onClick={() => openDeliveries(record)}>
              记录
            </Button>
            <span style={{ color: "#999", fontSize: 12 }}>只读</span>
          </Space>
        );
      },
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
          disabled={!canWriteNotifications}
          loading={deliveryReplayId === record.id}
          onClick={() => void handleReplay(record.id)}
        >
          重新投递
        </Button>
      ),
    },
  ];

  deliveryColumns[0] = {
    ...deliveryColumns[0],
    title: "投递 ID",
  };
  deliveryColumns[1] = {
    ...deliveryColumns[1],
    title: "事件",
  };
  deliveryColumns[2] = {
    title: "状态",
    dataIndex: "status",
    key: "status",
    width: 180,
    render: (_value, record) => (
      <Space size={[6, 6]} wrap>
        <TypeTag options={DELIVERY_STATUS_OPTIONS} type={record.status} />
        {record.is_dead_letter ? <Tag color="red">死信</Tag> : null}
        {record.resolved_at ? <Tag color="default">已处理</Tag> : null}
      </Space>
    ),
  };
  deliveryColumns[3] = {
    ...deliveryColumns[3],
    title: "尝试次数",
  };
  deliveryColumns[4] = {
    ...deliveryColumns[4],
    title: "响应码",
  };
  deliveryColumns[5] = {
    ...deliveryColumns[5],
    title: "最近尝试",
  };
  deliveryColumns[6] = {
    ...deliveryColumns[6],
    title: "下次重试",
  };
  deliveryColumns[7] = {
    ...deliveryColumns[7],
    title: "错误信息",
  };
  deliveryColumns.splice(8, 0, {
    title: "死信处理",
    key: "dead_letter",
    width: 220,
    render: (_value, record) => (
      record.is_dead_letter || record.resolved_at ? (
        <Space direction="vertical" size={2}>
          <Typography.Text type={record.is_dead_letter ? "danger" : "secondary"}>
            {record.dead_letter_reason || record.last_error || (record.is_dead_letter ? "已进入死信箱" : "已处理")}
          </Typography.Text>
          {record.resolved_at ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {`处理时间 ${formatDateTime(record.resolved_at)}${record.resolved_by ? ` / ${record.resolved_by}` : ""}`}
            </Typography.Text>
          ) : null}
        </Space>
      ) : (
        "-"
      )
    ),
  });
  deliveryColumns[9] = {
    title: "操作",
    key: "action",
    width: 220,
    fixed: "right",
    render: (_value, record) => (
      <Space size={0}>
        <Button type="link" size="small" onClick={() => openAttempts(record)}>
          尝试
        </Button>
        <Button
          type="link"
          size="small"
          disabled={!canWriteNotifications}
          loading={deliveryReplayId === record.id}
          onClick={() => void handleReplay(record.id)}
        >
          重放
        </Button>
        {record.is_dead_letter ? (
          <Popconfirm
            title="确认将这条死信标记为已处理吗？"
            onConfirm={() => void handleResolve(record.id)}
          >
            <Button
              type="link"
              size="small"
              disabled={!canWriteNotifications}
              loading={deliveryResolveId === record.id}
            >
              忽略
            </Button>
          </Popconfirm>
        ) : null}
      </Space>
    ),
  };

  const attemptColumns: ColumnsType<NotificationDeliveryAttemptRecord> = [
    {
      title: "尝试",
      dataIndex: "attempt_number",
      key: "attempt_number",
      width: 90,
      render: value => `#${value}`,
    },
    {
      title: "结果",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: value => <TypeTag options={DELIVERY_STATUS_OPTIONS} type={value} />,
    },
    {
      title: "响应码",
      dataIndex: "response_status",
      key: "response_status",
      width: 100,
      render: value => value ?? "-",
    },
    {
      title: "耗时",
      dataIndex: "duration_ms",
      key: "duration_ms",
      width: 100,
      render: value => (value === null || value === undefined ? "-" : `${value} ms`),
    },
    {
      title: "尝试时间",
      dataIndex: "attempted_at",
      key: "attempted_at",
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
      dataIndex: "error_message",
      key: "error_message",
      render: value =>
        value ? (
          <Typography.Text type="danger" ellipsis={{ tooltip: value }}>
            {value}
          </Typography.Text>
        ) : (
          "-"
        ),
    },
  ];

  const enabledCount = items.filter(item => item.is_enabled).length;
  const failedCount = items.filter(item => item.last_status === "failed").length;
  const retryingCount = items.filter(item => item.last_status === "retrying").length;
  const deliverySummary = deliveries.summary;
  const deliveryHealth = DELIVERY_HEALTH_OPTIONS[deliverySummary.health_status];

  return (
    <div>
      <PageHeader
        title="通知配置"
        subtitle="管理 Webhook 端点、查看投递记录，并对失败通知执行手动重放。"
        tags={
          isViewer
            ? [{ color: "gold", label: "只读视角" }]
            : isProjectScoped
              ? [{ color: "gold", label: "项目级视角" }]
              : undefined
        }
      />

      {!canWriteNotifications ? (
        <Alert
          showIcon
          type="info"
          message="当前账号为通知只读视角"
          description="你仍然可以查看通知端点和投递记录，但新增、编辑、删除、测试投递和重新投递入口已关闭。"
          style={{ marginBottom: 16 }}
        />
      ) : isProjectScoped ? (
        <Alert
          showIcon
          type="info"
          message="当前账号为项目级通知视角"
          description="新建或编辑通知端点时会被限制为项目绑定范围，只能选择你已绑定的项目。"
          style={{ marginBottom: 16 }}
        />
      ) : null}

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
        cardExtra={canWriteNotifications ? <Button onClick={openCreate}>新增端点</Button> : undefined}
        cardToolbar={canWriteNotifications ? (
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
        ) : undefined}
        columns={endpointColumns}
        dataSource={items}
        loading={loading}
        rowKey="id"
        rowSelection={endpointRowSelection}
        pageSize={10}
      />

      {canWriteNotifications ? (
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
                disabled={isProjectScoped}
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
                  options={visibleProjects.map(project => ({
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
                options={eventOptions}
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
          <Col span={24}>
            <Typography.Text strong>告警规则</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
              用于控制死信堆积、重试堆积、成功率和静默时长的告警阈值。
            </Typography.Paragraph>
          </Col>
          <Col span={12}>
            <Form.Item label="死信预警阈值" name={["alert_config", "dead_letter_warning_threshold"]}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="死信严重阈值" name={["alert_config", "dead_letter_critical_threshold"]}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="重试预警阈值" name={["alert_config", "retrying_warning_threshold"]}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="重试严重阈值" name={["alert_config", "retrying_critical_threshold"]}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="成功率预警阈值 (%)" name={["alert_config", "success_rate_warning_threshold"]}>
              <InputNumber min={0} max={100} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="成功率严重阈值 (%)" name={["alert_config", "success_rate_critical_threshold"]}>
              <InputNumber min={0} max={100} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="最小样本数 (24h)" name={["alert_config", "min_attempts_24h"]}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="静默告警时长 (小时)" name={["alert_config", "inactivity_hours"]}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </FormDrawer>
      ) : null}

      <DetailDrawer
        title={activeEndpoint ? `投递记录 · ${activeEndpoint.name}` : "投递记录"}
        open={deliveryDrawerOpen}
        onClose={() => {
          setDeliveryDrawerOpen(false);
          clearDeliverySelection();
        }}
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
                      <Tag key={item} title={item}>{formatNotificationEventLabel(item)}</Tag>
                    ))}
                  </Space>
                </div>
              </div>
            </div>

            {deliverySummary.alerts.length > 0 ? (
              <div style={{ display: "grid", gap: 10 }}>
                {deliverySummary.alerts.map(alert => (
                  <Alert
                    key={alert.code}
                    showIcon
                    type={alert.severity === "critical" ? "error" : alert.severity === "warning" ? "warning" : "info"}
                    message={alert.title}
                    description={alert.description}
                  />
                ))}
              </div>
            ) : null}

            <Tabs
              activeKey={deliveryView}
              onChange={value => {
                const nextView = value as "all" | "dead_letter";
                setDeliveryView(nextView);
                clearDeliverySelection();
                if (activeEndpoint) void loadDeliveryPage(activeEndpoint.id, 1, nextView);
              }}
              items={[
                { key: "all", label: "全部记录" },
                { key: "dead_letter", label: "死信箱" },
              ]}
            />

            <MetricGrid>
              <MetricCard
                title="累计投递"
                value={deliverySummary.total_deliveries}
                icon={<>DL</>}
                percent={Math.min(100, deliverySummary.total_deliveries * 5)}
                color="#1677ff"
              />
              <MetricCard
                title="待处理死信"
                value={deliverySummary.dead_letter_total}
                icon={<>DLQ</>}
                percent={deliverySummary.total_deliveries === 0 ? 0 : Math.round((deliverySummary.dead_letter_total / deliverySummary.total_deliveries) * 100)}
                color="#ff4d4f"
              />
              <MetricCard
                title="重试中"
                value={deliverySummary.retrying_total}
                icon={<>RT</>}
                percent={deliverySummary.total_deliveries === 0 ? 0 : Math.round((deliverySummary.retrying_total / deliverySummary.total_deliveries) * 100)}
                color="#faad14"
              />
              <MetricCard
                title="累计尝试"
                value={deliverySummary.total_attempts}
                icon={<>AT</>}
                percent={Math.min(100, deliverySummary.total_attempts * 4)}
                color="#13c2c2"
              />
            </MetricGrid>

            <MetricGrid minItemWidth={220}>
              <MetricCard
                title="健康状态"
                value={deliveryHealth.label}
                icon={<>HL</>}
                percent={deliveryHealth.percent}
                color={deliveryHealth.metricColor}
              />
              <MetricCard
                title="24h 成功率"
                value={formatPercentMetric(deliverySummary.success_rate_24h)}
                icon={<>SR</>}
                percent={deliverySummary.success_rate_24h}
                color="#1677ff"
              />
              <MetricCard
                title="24h 平均耗时"
                value={formatDurationMetric(deliverySummary.avg_duration_ms_24h)}
                icon={<>MS</>}
                percent={
                  deliverySummary.avg_duration_ms_24h === null
                    ? 0
                    : Math.max(0, 100 - Math.min(100, Math.round(deliverySummary.avg_duration_ms_24h / 20)))
                }
                color="#13c2c2"
              />
              <MetricCard
                title="24h 尝试"
                value={deliverySummary.recent_attempts_24h}
                icon={<>24</>}
                percent={Math.min(100, deliverySummary.recent_attempts_24h * 10)}
                color="#722ed1"
              />
            </MetricGrid>

            <Space size={12} wrap>
              <TypeTag options={DELIVERY_HEALTH_OPTIONS} type={deliverySummary.health_status} />
              <Tag color="blue">{`${deliveryView === "dead_letter" ? "死信列表" : "当前筛选"} ${deliveries.total}`}</Tag>
              <Tag color="default">已处理死信 {deliverySummary.resolved_dead_letter_total}</Tag>
              <Tag color="processing">24h 尝试 {deliverySummary.recent_attempts_24h}</Tag>
              <Tag color="success">24h 成功 {deliverySummary.recent_success_attempts_24h}</Tag>
              <Tag color="error">24h 非成功 {deliverySummary.recent_failed_attempts_24h}</Tag>
              <Tag>{`最近尝试 ${formatDateTime(deliverySummary.last_attempt_at)}`}</Tag>
              <Tag>{`最近成功 ${formatDateTime(deliverySummary.last_success_at)}`}</Tag>
              <Tag>{`最近失败 ${formatDateTime(deliverySummary.last_failure_at)}`}</Tag>
            </Space>

            <DataTable
              cardTitle={deliveryView === "dead_letter" ? "死信记录" : "最近投递"}
              cardToolbar={canWriteNotifications && deliveryView === "dead_letter" ? (
                <BatchActionsBar selectedCount={selectedDeliveries.length} onClear={clearDeliverySelection}>
                  <Popconfirm
                    title={`确认重放选中的 ${selectedDeliveries.length} 条死信吗？`}
                    onConfirm={() => void handleBatchDeliveryRetry()}
                  >
                    <Button loading={deliveryBatchAction === "retry"}>
                      批量重放
                    </Button>
                  </Popconfirm>
                  <Popconfirm
                    title={`确认忽略选中的 ${selectedDeliveries.length} 条死信吗？`}
                    onConfirm={() => void handleBatchDeliveryResolve()}
                  >
                    <Button loading={deliveryBatchAction === "resolve"}>
                      批量忽略
                    </Button>
                  </Popconfirm>
                </BatchActionsBar>
              ) : undefined}
              columns={deliveryColumns}
              current={deliveries.page}
              dataSource={deliveries.items}
              loading={deliveryLoading}
              onPageChange={(page) => {
                if (activeEndpoint) void loadDeliveryPage(activeEndpoint.id, page);
              }}
              pageSize={deliveries.pageSize}
              rowKey="id"
              rowSelection={deliveryRowSelection}
              total={deliveries.total}
            />
          </div>
        ) : null}
      </DetailDrawer>

      <DetailDrawer
        title={activeDelivery ? `尝试明细 · 投递 #${activeDelivery.id}` : "尝试明细"}
        open={attemptDrawerOpen}
        onClose={() => setAttemptDrawerOpen(false)}
        width="56vw"
      >
        {activeDelivery ? (
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
              <Space size={[8, 8]} wrap>
                <Tag color="blue">{activeDelivery.event}</Tag>
                <TypeTag options={DELIVERY_STATUS_OPTIONS} type={activeDelivery.status} />
                {activeDelivery.is_dead_letter ? <Tag color="red">死信</Tag> : null}
              </Space>
              <Typography.Text type="secondary">
                {`尝试 ${activeDelivery.attempt_count}/${activeDelivery.max_attempts} · 最近 ${formatDateTime(activeDelivery.last_attempt_at)}`}
              </Typography.Text>
              {activeDelivery.dead_letter_reason ? (
                <Typography.Text type="danger">{activeDelivery.dead_letter_reason}</Typography.Text>
              ) : null}
            </div>

            <DataTable
              cardTitle="尝试明细"
              columns={attemptColumns}
              current={attempts.page}
              dataSource={attempts.items}
              loading={attemptLoading}
              onPageChange={(page) => {
                if (activeDelivery) void loadAttemptPage(activeDelivery.id, page);
              }}
              pageSize={attempts.pageSize}
              rowKey="id"
              total={attempts.total}
            />
          </div>
        ) : null}
      </DetailDrawer>
    </div>
  );
}
