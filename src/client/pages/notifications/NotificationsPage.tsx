import { Alert, App, Button, Form, Popconfirm } from "antd";
import { useEffect, useMemo, useState } from "react";

import {
  createNotification,
  getNotificationDeliveryAttempts,
  getNotificationDeliveries,
  getNotifications,
  removeNotification,
  resolveNotificationDeliveries,
  resolveNotificationDelivery,
  retryNotificationDeliveries,
  retryNotificationDelivery,
  testNotification,
  updateNotification,
} from "../../api/notifications";
import { getWorkspaceCatalog } from "../../api/workspace";
import { BatchActionsBar, DataTable, PageHeader } from "../../components";
import { promptOperationNote } from "../../delete-operation-note";
import { usePageFeedback } from "../../hooks/usePageFeedback";
import { useTableSelection } from "../../hooks/useTableSelection";
import {
  canManageNotificationRecord,
  canWriteAnyResource,
  getAccessModeTag,
  getAccessibleProjectIds,
  getWriteScopeNotice,
  isProjectScopedUser,
  type CurrentUser,
} from "../../permissions";
import type {
  AccessScope,
  NotificationDeliveryAttemptRecord,
  NotificationDeliveryBulkActionResult,
  NotificationDeliveryRecord,
  NotificationEndpointRecord,
  NotificationMutationPayload,
  PaginationPayload,
  WorkspaceProjectRecord,
} from "../../types";
import { buildBatchActionMessage, loadAllPages, runBatchAction } from "../../utils";
import { NotificationAttemptsDrawer } from "./NotificationAttemptsDrawer";
import { buildEndpointColumns } from "./notification-table-columns";
import { NotificationDeliveriesDrawer } from "./NotificationDeliveriesDrawer";
import { NotificationFormDrawer } from "./NotificationFormDrawer";
import { NotificationsFilters } from "./NotificationsFilters";
import { NotificationsMetrics } from "./NotificationsMetrics";
import { NotificationTestDrawer } from "./NotificationTestDrawer";
import {
  buildDeliveryBulkMessage,
  buildNotificationEventFlatOptions,
  buildNotificationEventOptions,
  buildNotificationTestPayloadTemplate,
  EMPTY_ATTEMPTS,
  EMPTY_DELIVERIES,
  formatNotificationEventLabel,
  INITIAL_VALUES,
} from "./notification-utils";

interface NotificationsPageProps {
  currentUser?: CurrentUser;
  onUnauthorized: () => void;
}

interface NotificationTestFormValues {
  event: string;
  payload_json: string;
}

export default function NotificationsPage({ currentUser, onUnauthorized }: NotificationsPageProps) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<NotificationMutationPayload>();
  const [testForm] = Form.useForm<NotificationTestFormValues>();
  const watchedAccessScope = Form.useWatch("access_scope", form);
  const [items, setItems] = useState<NotificationEndpointRecord[]>([]);
  const [projects, setProjects] = useState<WorkspaceProjectRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationEndpointRecord | null>(null);
  const [testDrawerOpen, setTestDrawerOpen] = useState(false);
  const [testingEndpoint, setTestingEndpoint] = useState<NotificationEndpointRecord | null>(null);
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
  const [deliveries, setDeliveries] = useState(EMPTY_DELIVERIES);
  const [attempts, setAttempts] = useState<PaginationPayload<NotificationDeliveryAttemptRecord>>(EMPTY_ATTEMPTS);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>();
  const [accessScopeFilter, setAccessScopeFilter] = useState<AccessScope>();
  const [projectFilter, setProjectFilter] = useState<number>();
  const [eventFilter, setEventFilter] = useState<string>();
  const {
    clearSelection: clearDeliverySelection,
    rowSelection: deliverySelection,
    selectedItems: selectedDeliveries,
  } = useTableSelection(deliveries.items, "id");
  const { handlePageError, notifyBatchActionResult } = usePageFeedback(onUnauthorized);
  const canWriteNotifications = canWriteAnyResource(currentUser);
  const isProjectScoped = isProjectScopedUser(currentUser);
  const accessibleProjectIds = useMemo(() => getAccessibleProjectIds(currentUser), [currentUser]);
  const accessTag = getAccessModeTag(currentUser);
  const accessNotice = getWriteScopeNotice(currentUser, "通知配置", {
    projectScopedDescription: "你仍然可以查看全部通知端点和投递记录，但只能新增、编辑、测试和维护自己绑定项目内的通知端点；全局端点与超范围端点会保持只读。",
    projectScopedTitle: "当前账号为项目级通知视角",
    readOnlyDescription: "你仍然可以查看通知端点和投递记录，但新增、编辑、删除、测试投递和重新投递入口已关闭。",
    readOnlyTitle: "当前账号为通知只读视角",
  });
  const activeEndpointManageable = useMemo(
    () => (activeEndpoint ? canManageNotificationRecord(currentUser, activeEndpoint) : false),
    [activeEndpoint, currentUser],
  );

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
      handlePageError(error);
    } finally {
      setLoading(false);
    }
  }

  async function loadDeliveryPage(
    endpointId: number,
    page = 1,
    view: "all" | "dead_letter" = deliveryView,
  ) {
    setDeliveryLoading(true);
    try {
      const payload = await getNotificationDeliveries(endpointId, page, {
        dead_letter_only: view === "dead_letter",
      });
      setDeliveries(payload);
    } catch (error) {
      handlePageError(error);
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
      handlePageError(error);
    } finally {
      setAttemptLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    form.setFieldsValue({
      ...INITIAL_VALUES,
      access_scope: isProjectScoped ? "bound" : INITIAL_VALUES.access_scope,
      custom_headers: [],
      operation_note: "",
      project_ids: isProjectScoped ? accessibleProjectIds : [],
    });
    setDrawerOpen(true);
  }

  function openEdit(record: NotificationEndpointRecord) {
    setEditing(record);
    form.setFieldsValue({
      access_scope: record.access_scope,
      alert_config: { ...record.alert_config },
      custom_headers: record.custom_headers,
      events: record.events,
      is_enabled: record.is_enabled,
      name: record.name,
      operation_note: "",
      project_ids: record.projects.map(project => project.id),
      secret: record.secret,
      target: record.target,
      type: record.type,
    });
    setDrawerOpen(true);
  }

  function openTestDrawer(record: NotificationEndpointRecord) {
    const nextEvent = record.events.find(item => item !== "*") || "email.received";
    setTestingEndpoint(record);
    testForm.setFieldsValue({
      event: nextEvent,
      payload_json: buildNotificationTestPayloadTemplate(nextEvent),
    });
    setTestDrawerOpen(true);
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
        alert_config: values.alert_config || { ...INITIAL_VALUES.alert_config },
        custom_headers: (values.custom_headers || [])
          .map(item => ({
            key: String(item?.key || "").trim(),
            value: String(item?.value || "").trim(),
          }))
          .filter(item => item.key),
        operation_note: String(values.operation_note || "").trim(),
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
      handlePageError(error, { ignoreFallbackMessage: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(record: NotificationEndpointRecord) {
    const operationNote = await promptOperationNote(modal, {
      title: "删除通知端点",
      description: `将删除 ${record.name}。可选填写本次删除备注，便于后续审计追溯。`,
      okText: "确认删除",
    });
    if (operationNote === null) return;

    try {
      await removeNotification(record.id, { operation_note: operationNote });
      message.success("通知端点已删除");
      await loadData();
    } catch (error) {
      handlePageError(error);
    }
  }

  async function handleTestSubmit() {
    if (!testingEndpoint) return;

    setTestSending(true);
    try {
      const values = await testForm.validateFields();
      let payload: unknown;
      try {
        payload = JSON.parse(values.payload_json);
      } catch {
        message.error("测试 payload 必须是合法 JSON。");
        return;
      }

      await testNotification(testingEndpoint.id, {
        event: values.event,
        payload,
      });
      message.success("测试投递已触发");
      setTestDrawerOpen(false);
      await Promise.all([
        loadData(),
        activeEndpoint?.id === testingEndpoint.id
          ? loadDeliveryPage(testingEndpoint.id, 1, deliveryView)
          : Promise.resolve(),
      ]);
    } catch (error) {
      handlePageError(error);
    } finally {
      setTestSending(false);
    }
  }

  async function handleReplay(record: NotificationDeliveryRecord) {
    if (!activeEndpointManageable) {
      message.info("当前端点为只读状态，不能重新投递。");
      return;
    }

    setDeliveryReplayId(record.id);
    try {
      const payload = await retryNotificationDelivery(record.id);
      if (payload.delivery.status === "success") {
        message.success("重新投递成功");
      } else if (payload.delivery.status === "retrying") {
        message.warning("重新投递失败，已进入自动重试队列");
      } else {
        message.error("重新投递失败");
      }

      if (activeEndpoint) {
        await Promise.all([loadData(), loadDeliveryPage(activeEndpoint.id, 1, deliveryView)]);
      } else {
        await loadData();
      }

      if (activeDelivery?.id === record.id) {
        await loadAttemptPage(activeDelivery.id, 1);
      }
    } catch (error) {
      handlePageError(error);
    } finally {
      setDeliveryReplayId(null);
    }
  }

  async function handleResolve(record: NotificationDeliveryRecord) {
    if (!activeEndpointManageable) {
      message.info("当前端点为只读状态，不能忽略死信。");
      return;
    }

    setDeliveryResolveId(record.id);
    try {
      await resolveNotificationDelivery(record.id);
      message.success("死信已标记为已处理");
      if (activeEndpoint) {
        await loadDeliveryPage(activeEndpoint.id, 1, deliveryView);
      } else {
        await loadData();
      }

      if (activeDelivery?.id === record.id) {
        setAttemptDrawerOpen(false);
        setActiveDelivery(null);
      }
    } catch (error) {
      handlePageError(error);
    } finally {
      setDeliveryResolveId(null);
    }
  }

  async function handleBatchDeliveryRetry() {
    if (!activeEndpoint || !activeEndpointManageable || selectedDeliveries.length === 0) return;

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
      handlePageError(error);
    } finally {
      setDeliveryBatchAction(null);
    }
  }

  async function handleBatchDeliveryResolve() {
    if (!activeEndpoint || !activeEndpointManageable || selectedDeliveries.length === 0) return;

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
      handlePageError(error);
    } finally {
      setDeliveryBatchAction(null);
    }
  }

  async function handleBatchToggle(is_enabled: boolean) {
    const result = await runBatchAction(selectedItems, item =>
      updateNotification(item.id, {
        access_scope: item.access_scope,
        alert_config: item.alert_config,
        custom_headers: item.custom_headers,
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

    notifyBatchActionResult(is_enabled ? "批量启用通知" : "批量停用通知", result);
  }

  async function handleBatchDelete() {
    const operationNote = await promptOperationNote(modal, {
      title: "批量删除通知端点",
      description: `将删除 ${selectedItems.length} 个通知端点。填写的备注会写入每条通知端点的审计记录。`,
      okText: "确认批量删除",
    });
    if (operationNote === null) return;

    const result = await runBatchAction(
      selectedItems,
      item => removeNotification(item.id, { operation_note: operationNote }),
    );

    if (result.successCount > 0) {
      clearSelection();
      await loadData();
    }

    notifyBatchActionResult("批量删除通知", result);
  }

  const visibleProjects = useMemo(
    () => projects.filter(project => !isProjectScoped || accessibleProjectIds.includes(project.id)),
    [accessibleProjectIds, isProjectScoped, projects],
  );

  const eventOptions = useMemo(() => buildNotificationEventOptions(), []);
  const eventFlatOptions = useMemo(() => buildNotificationEventFlatOptions(), []);
  const filteredItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return items.filter(item => {
      if (statusFilter !== undefined && item.last_status !== statusFilter) return false;
      if (accessScopeFilter && item.access_scope !== accessScopeFilter) return false;
      if (projectFilter && !item.projects.some(project => project.id === projectFilter)) return false;
      if (eventFilter && !item.events.includes(eventFilter) && !item.events.includes("*")) return false;
      if (!keyword) return true;

      return [
        item.name,
        item.target,
        item.last_error,
        item.events.join(", "),
        item.projects.map(project => project.name).join(", "),
        item.custom_headers.map(header => header.key).join(", "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [accessScopeFilter, eventFilter, items, projectFilter, searchText, statusFilter]);
  const { clearSelection, rowSelection, selectedItems } = useTableSelection(filteredItems, "id");

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
    () => (activeEndpointManageable && deliveryView === "dead_letter" ? {
      ...deliverySelection,
      getCheckboxProps: (record: NotificationDeliveryRecord) => ({
        disabled: !record.is_dead_letter,
      }),
    } : undefined),
    [activeEndpointManageable, deliverySelection, deliveryView],
  );

  const endpointColumns = buildEndpointColumns({
    canManageRecord: record => canManageNotificationRecord(currentUser, record),
    formatEventLabel: formatNotificationEventLabel,
    onDelete: record => void handleDelete(record),
    onEdit: openEdit,
    onOpenDeliveries: openDeliveries,
    onTest: openTestDrawer,
  });

  const enabledCount = items.filter(item => item.is_enabled).length;
  const failedCount = items.filter(item => item.last_status === "failed").length;
  const retryingCount = items.filter(item => item.last_status === "retrying").length;

  return (
    <div>
      <PageHeader
        title="通知配置"
        subtitle="管理 Webhook 端点、查看投递记录，并对失败通知执行手动重放。"
        tags={accessTag ? [accessTag] : undefined}
      />

      {accessNotice ? (
        <Alert
          showIcon
          type="info"
          message={accessNotice.title}
          description={accessNotice.description}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <NotificationsMetrics
        enabledCount={enabledCount}
        failedCount={failedCount}
        itemCount={items.length}
        retryingCount={retryingCount}
      />

      <div style={{ marginBottom: 16 }}>
        <NotificationsFilters
          accessScopeFilter={accessScopeFilter}
          canWriteNotifications={canWriteNotifications}
          eventFilter={eventFilter}
          eventOptions={eventFlatOptions}
          onAccessScopeChange={value => setAccessScopeFilter(value)}
          onCreate={openCreate}
          onEventChange={value => setEventFilter(value)}
          onProjectChange={value => setProjectFilter(value)}
          onReset={() => {
            setSearchText("");
            setStatusFilter(undefined);
            setAccessScopeFilter(undefined);
            setProjectFilter(undefined);
            setEventFilter(undefined);
          }}
          onSearchChange={setSearchText}
          onStatusChange={value => setStatusFilter(value)}
          projectFilter={projectFilter}
          projectOptions={visibleProjects.map(project => ({ label: project.name, value: project.id }))}
          searchText={searchText}
          statusFilter={statusFilter}
        />
      </div>

      <DataTable
        cardTitle={`通知端点列表 (${filteredItems.length}/${items.length})`}
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
        dataSource={filteredItems}
        loading={loading}
        rowKey="id"
        rowSelection={endpointRowSelection}
        pageSize={10}
      />

      {canWriteNotifications ? (
        <NotificationFormDrawer
          editingId={editing?.id}
          eventOptions={eventOptions}
          form={form}
          isProjectScoped={isProjectScoped}
          loading={saving}
          onClose={() => setDrawerOpen(false)}
          onSubmit={() => void handleSubmit()}
          open={drawerOpen}
          visibleProjects={visibleProjects}
          watchedAccessScope={watchedAccessScope}
        />
      ) : null}

      {canWriteNotifications && testingEndpoint ? (
        <NotificationTestDrawer
          endpointName={testingEndpoint.name}
          eventOptions={eventFlatOptions}
          form={testForm}
          loading={testSending}
          onClose={() => setTestDrawerOpen(false)}
          onResetTemplate={() => {
            const event = String(testForm.getFieldValue("event") || "email.received");
            testForm.setFieldValue("payload_json", buildNotificationTestPayloadTemplate(event));
          }}
          onSubmit={() => void handleTestSubmit()}
          open={testDrawerOpen}
        />
      ) : null}

      <NotificationDeliveriesDrawer
        activeEndpoint={activeEndpoint}
        activeEndpointManageable={activeEndpointManageable}
        deliveryBatchAction={deliveryBatchAction}
        deliveryReplayId={deliveryReplayId}
        deliveryResolveId={deliveryResolveId}
        deliveryRowSelection={deliveryRowSelection}
        deliveryView={deliveryView}
        deliveries={deliveries}
        loading={deliveryLoading}
        onBatchResolve={() => void handleBatchDeliveryResolve()}
        onBatchRetry={() => void handleBatchDeliveryRetry()}
        onChangeView={view => {
          setDeliveryView(view);
          clearDeliverySelection();
          setActiveDelivery(null);
          setAttemptDrawerOpen(false);
          if (activeEndpoint) void loadDeliveryPage(activeEndpoint.id, 1, view);
        }}
        onClose={() => {
          setDeliveryDrawerOpen(false);
          clearDeliverySelection();
        }}
        onOpenAttempts={openAttempts}
        onPageChange={page => {
          if (activeEndpoint) void loadDeliveryPage(activeEndpoint.id, page, deliveryView);
        }}
        onReplay={record => void handleReplay(record)}
        onResolve={record => void handleResolve(record)}
        onSelectionClear={clearDeliverySelection}
        open={deliveryDrawerOpen}
        selectedCount={selectedDeliveries.length}
      />

      <NotificationAttemptsDrawer
        activeDelivery={activeDelivery}
        attempts={attempts}
        loading={attemptLoading}
        onClose={() => setAttemptDrawerOpen(false)}
        onPageChange={page => {
          if (activeDelivery) void loadAttemptPage(activeDelivery.id, page);
        }}
        open={attemptDrawerOpen}
      />
    </div>
  );
}
