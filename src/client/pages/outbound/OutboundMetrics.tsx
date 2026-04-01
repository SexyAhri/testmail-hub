import {
  BarChartOutlined,
  MailOutlined,
  PaperClipOutlined,
  SnippetsOutlined,
} from "@ant-design/icons";

import { MetricCard, MetricGrid } from "../../components";

interface OutboundMetricsProps {
  totalDrafts: number;
  totalFailed: number;
  totalScheduled: number;
  totalSent: number;
}

export function OutboundMetrics({
  totalDrafts,
  totalFailed,
  totalScheduled,
  totalSent,
}: OutboundMetricsProps) {
  return (
    <MetricGrid>
      <MetricCard title="已发送" value={totalSent} icon={<MailOutlined />} percent={Math.min(100, totalSent)} color="#1677ff" />
      <MetricCard title="计划发送" value={totalScheduled} icon={<BarChartOutlined />} percent={Math.min(100, totalScheduled * 10)} color="#13c2c2" />
      <MetricCard title="草稿数" value={totalDrafts} icon={<SnippetsOutlined />} percent={Math.min(100, totalDrafts * 10)} color="#722ed1" />
      <MetricCard title="失败数" value={totalFailed} icon={<PaperClipOutlined />} percent={Math.min(100, totalFailed * 10)} color="#ff4d4f" />
    </MetricGrid>
  );
}
