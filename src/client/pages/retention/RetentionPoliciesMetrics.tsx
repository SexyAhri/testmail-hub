import {
  ClockCircleOutlined,
  FieldTimeOutlined,
  GlobalOutlined,
  PartitionOutlined,
} from "@ant-design/icons";

import { MetricCard, MetricGrid } from "../../components";

interface RetentionPoliciesMetricsProps {
  enabled: number;
  global: number;
  mailboxPool: number;
  project: number;
  total: number;
}

export function RetentionPoliciesMetrics({
  enabled,
  global,
  mailboxPool,
  project,
  total,
}: RetentionPoliciesMetricsProps) {
  return (
    <MetricGrid>
      <MetricCard title="当前页策略数" value={total} icon={<PartitionOutlined />} color="#1677ff" />
      <MetricCard title="启用中" value={enabled} icon={<ClockCircleOutlined />} color="#16a34a" />
      <MetricCard title="全局 / 项目" value={`${global} / ${project}`} icon={<GlobalOutlined />} color="#d48806" />
      <MetricCard title="邮箱池级" value={mailboxPool} icon={<FieldTimeOutlined />} color="#7c3aed" />
    </MetricGrid>
  );
}
