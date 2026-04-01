import { MetricCard, MetricGrid } from "../../components";

interface ProjectsMetricsProps {
  environmentCount: number;
  mailboxPoolCount: number;
  projectCount: number;
}

export function ProjectsMetrics({
  environmentCount,
  mailboxPoolCount,
  projectCount,
}: ProjectsMetricsProps) {
  return (
    <MetricGrid>
      <MetricCard
        title="项目数量"
        value={projectCount}
        icon={<>P</>}
        percent={Math.min(100, projectCount * 10)}
        color="#1890ff"
      />
      <MetricCard
        title="环境数量"
        value={environmentCount}
        icon={<>E</>}
        percent={Math.min(100, environmentCount * 8)}
        color="#52c41a"
      />
      <MetricCard
        title="邮箱池数量"
        value={mailboxPoolCount}
        icon={<>M</>}
        percent={Math.min(100, mailboxPoolCount * 8)}
        color="#722ed1"
      />
    </MetricGrid>
  );
}
