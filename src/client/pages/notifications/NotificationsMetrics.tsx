import { MetricCard, MetricGrid } from "../../components";

interface NotificationsMetricsProps {
  enabledCount: number;
  failedCount: number;
  itemCount: number;
  retryingCount: number;
}

export function NotificationsMetrics({
  enabledCount,
  failedCount,
  itemCount,
  retryingCount,
}: NotificationsMetricsProps) {
  return (
    <MetricGrid>
      <MetricCard
        title="通知端点"
        value={itemCount}
        icon={<>#</>}
        percent={Math.min(100, itemCount * 10)}
        color="#1677ff"
      />
      <MetricCard
        title="启用中"
        value={enabledCount}
        icon={<>ON</>}
        percent={itemCount === 0 ? 0 : Math.round((enabledCount / itemCount) * 100)}
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
  );
}
