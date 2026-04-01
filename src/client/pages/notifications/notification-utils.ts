import {
  DEFAULT_NOTIFICATION_ALERT_CONFIG,
  getNotificationEventDefinition,
  NOTIFICATION_EVENT_CATEGORY_LABELS,
  NOTIFICATION_EVENT_DEFINITIONS,
} from "../../../utils/constants";
import type {
  NotificationDeliveriesPayload,
  NotificationDeliveryBulkActionResult,
  NotificationDeliveryAttemptRecord,
  NotificationMutationPayload,
  PaginationPayload,
} from "../../types";

export const DELIVERY_STATUS_OPTIONS = {
  failed: { color: "error", label: "失败" },
  pending: { color: "processing", label: "待发送" },
  retrying: { color: "warning", label: "重试中" },
  success: { color: "success", label: "成功" },
};

export const ENDPOINT_STATUS_OPTIONS = {
  "": { color: "default", label: "未投递" },
  failed: { color: "error", label: "失败" },
  pending: { color: "processing", label: "待发送" },
  retrying: { color: "warning", label: "等待重试" },
  success: { color: "success", label: "成功" },
};

export const DELIVERY_HEALTH_OPTIONS = {
  critical: { color: "error", label: "告警", metricColor: "#ff4d4f", percent: 25 },
  healthy: { color: "success", label: "健康", metricColor: "#52c41a", percent: 100 },
  idle: { color: "default", label: "空闲", metricColor: "#bfbfbf", percent: 15 },
  warning: { color: "warning", label: "关注", metricColor: "#faad14", percent: 60 },
} as const;

export const EMPTY_DELIVERIES: NotificationDeliveriesPayload = {
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

export const EMPTY_ATTEMPTS: PaginationPayload<NotificationDeliveryAttemptRecord> = {
  items: [],
  page: 1,
  pageSize: 10,
  total: 0,
};

export const INITIAL_VALUES: NotificationMutationPayload = {
  access_scope: "all",
  alert_config: { ...DEFAULT_NOTIFICATION_ALERT_CONFIG },
  events: ["email.received"],
  is_enabled: true,
  name: "",
  operation_note: "",
  project_ids: [],
  secret: "",
  target: "",
  type: "webhook",
};

export function buildDeliveryBulkMessage(
  actionLabel: string,
  result: NotificationDeliveryBulkActionResult,
) {
  const errorSuffix = result.errors[0]?.message ? `，${result.errors[0].message}` : "";
  if (result.failed_count === 0) {
    return `${actionLabel}完成，共处理 ${result.success_count} 条`;
  }

  return `${actionLabel}完成，成功 ${result.success_count} 条，失败 ${result.failed_count} 条${errorSuffix}`;
}

export function formatDurationMetric(value: number | null) {
  if (value === null || value === undefined) return "-";
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
}

export function formatPercentMetric(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${Number.isInteger(safeValue) ? safeValue : safeValue.toFixed(1)}%`;
}

export function formatNotificationEventLabel(value: string) {
  const definition = getNotificationEventDefinition(value);
  return definition ? definition.label : value;
}

export function buildNotificationEventOptions() {
  return Object.entries(
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
  }));
}
