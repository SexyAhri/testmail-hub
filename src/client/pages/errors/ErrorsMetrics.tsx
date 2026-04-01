import {
  AppstoreOutlined,
  BugOutlined,
  CloudServerOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
} from "@ant-design/icons";

import { MetricCard, MetricGrid } from "../../components";
import type { ErrorEventSummary } from "../../types";

interface ErrorsMetricsProps {
  summary: ErrorEventSummary;
}

export function ErrorsMetrics({ summary }: ErrorsMetricsProps) {
  const combinedSecurityTotal = summary.auth_total + summary.admin_total;
  const combinedDeliveryTotal = summary.sync_total + summary.outbound_total;

  return (
    <MetricGrid minItemWidth={220}>
      <MetricCard
        title="当前筛选异常数"
        value={summary.total}
        icon={<BugOutlined />}
        percent={summary.total > 0 ? 100 : 0}
        color="#ff4d4f"
      />
      <MetricCard
        title="近 24 小时"
        value={summary.recent_24h_total}
        icon={<AppstoreOutlined />}
        percent={summary.total > 0 ? (summary.recent_24h_total / summary.total) * 100 : 0}
        color="#1677ff"
      />
      <MetricCard
        title="鉴权 / 管理异常"
        value={combinedSecurityTotal}
        icon={<SafetyCertificateOutlined />}
        percent={summary.total > 0 ? (combinedSecurityTotal / summary.total) * 100 : 0}
        color="#fa8c16"
      />
      <MetricCard
        title="同步 / 发信异常"
        value={combinedDeliveryTotal}
        icon={<CloudServerOutlined />}
        percent={summary.total > 0 ? (combinedDeliveryTotal / summary.total) * 100 : 0}
        color="#722ed1"
      />
      <MetricCard
        title="发信失败"
        value={summary.outbound_total}
        icon={<SendOutlined />}
        percent={summary.total > 0 ? (summary.outbound_total / summary.total) * 100 : 0}
        color="#13c2c2"
      />
    </MetricGrid>
  );
}
