import { Alert, Button, Popconfirm, Space, Tabs, Tag, Typography } from "antd";

import { BatchActionsBar, DataTable, DetailDrawer, MetricCard, MetricGrid, TypeTag } from "../../components";
import type {
  NotificationDeliveriesPayload,
  NotificationDeliveryRecord,
  NotificationEndpointRecord,
} from "../../types";
import { formatDateTime } from "../../utils";
import { buildDeliveryColumns } from "./notification-table-columns";
import {
  DELIVERY_HEALTH_OPTIONS,
  formatDurationMetric,
  formatNotificationEventLabel,
  formatPercentMetric,
} from "./notification-utils";

interface NotificationDeliveriesDrawerProps {
  activeEndpoint: NotificationEndpointRecord | null;
  activeEndpointManageable: boolean;
  deliveryBatchAction: "resolve" | "retry" | null;
  deliveryReplayId: number | null;
  deliveryResolveId: number | null;
  deliveryRowSelection?: unknown;
  deliveryView: "all" | "dead_letter";
  deliveries: NotificationDeliveriesPayload;
  loading: boolean;
  onBatchResolve: () => void;
  onBatchRetry: () => void;
  onChangeView: (view: "all" | "dead_letter") => void;
  onClose: () => void;
  onOpenAttempts: (record: NotificationDeliveryRecord) => void;
  onPageChange: (page: number) => void;
  onReplay: (record: NotificationDeliveryRecord) => void;
  onResolve: (record: NotificationDeliveryRecord) => void;
  onSelectionClear: () => void;
  open: boolean;
  selectedCount: number;
}

export function NotificationDeliveriesDrawer({
  activeEndpoint,
  activeEndpointManageable,
  deliveryBatchAction,
  deliveryReplayId,
  deliveryResolveId,
  deliveryRowSelection,
  deliveryView,
  deliveries,
  loading,
  onBatchResolve,
  onBatchRetry,
  onChangeView,
  onClose,
  onOpenAttempts,
  onPageChange,
  onReplay,
  onResolve,
  onSelectionClear,
  open,
  selectedCount,
}: NotificationDeliveriesDrawerProps) {
  const deliverySummary = deliveries.summary;
  const deliveryHealth = DELIVERY_HEALTH_OPTIONS[deliverySummary.health_status];
  const deliveryColumns = buildDeliveryColumns({
    activeEndpointManageable,
    deliveryReplayId,
    deliveryResolveId,
    onOpenAttempts,
    onReplay,
    onResolve,
  });

  return (
    <DetailDrawer
      title={activeEndpoint ? `投递记录 · ${activeEndpoint.name}` : "投递记录"}
      open={open}
      onClose={onClose}
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

          {!activeEndpointManageable ? (
            <Alert
              showIcon
              type="info"
              message="当前端点超出可写范围"
              description="你仍然可以查看投递记录和尝试明细，但重放、忽略和批量处理入口已关闭。"
            />
          ) : null}

          <Tabs
            activeKey={deliveryView}
            onChange={value => onChangeView(value as "all" | "dead_letter")}
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
            cardToolbar={activeEndpointManageable && deliveryView === "dead_letter" ? (
              <BatchActionsBar selectedCount={selectedCount} onClear={onSelectionClear}>
                <Popconfirm
                  title={`确认重放选中的 ${selectedCount} 条死信吗？`}
                  onConfirm={onBatchRetry}
                >
                  <Button loading={deliveryBatchAction === "retry"}>
                    批量重放
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title={`确认忽略选中的 ${selectedCount} 条死信吗？`}
                  onConfirm={onBatchResolve}
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
            loading={loading}
            onPageChange={onPageChange}
            pageSize={deliveries.pageSize}
            rowKey="id"
            rowSelection={deliveryRowSelection as never}
            total={deliveries.total}
          />
        </div>
      ) : null}
    </DetailDrawer>
  );
}
