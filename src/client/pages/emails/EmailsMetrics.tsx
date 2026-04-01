import {
  CheckCircleOutlined,
  GlobalOutlined,
  PaperClipOutlined,
  SearchOutlined,
} from "@ant-design/icons";

import { MetricCard, MetricGrid } from "../../components";

interface EmailsMetricsProps {
  attachmentCount: number;
  domainCount: number;
  matchedCount: number;
  total: number;
  visibleCount: number;
}

export function EmailsMetrics({
  attachmentCount,
  domainCount,
  matchedCount,
  total,
  visibleCount,
}: EmailsMetricsProps) {
  return (
    <MetricGrid>
      <MetricCard
        title="筛选结果"
        value={total}
        icon={<SearchOutlined />}
        percent={Math.min(100, total)}
        color="#1890ff"
      />
      <MetricCard
        title="当前页命中"
        value={matchedCount}
        icon={<CheckCircleOutlined />}
        percent={visibleCount ? (matchedCount / visibleCount) * 100 : 0}
        color="#52c41a"
      />
      <MetricCard
        title="当前页附件"
        value={attachmentCount}
        icon={<PaperClipOutlined />}
        percent={visibleCount ? (attachmentCount / visibleCount) * 100 : 0}
        color="#fa8c16"
      />
      <MetricCard
        title="可用域名"
        value={domainCount}
        icon={<GlobalOutlined />}
        percent={Math.min(100, domainCount * 20)}
        color="#722ed1"
      />
    </MetricGrid>
  );
}
