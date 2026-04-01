import {
  FolderOpenOutlined,
  KeyOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";

import { MetricCard, MetricGrid } from "../../components";

interface ApiTokensMetricsProps {
  boundCount: number;
  enabledCount: number;
  totalCount: number;
}

export function ApiTokensMetrics({
  boundCount,
  enabledCount,
  totalCount,
}: ApiTokensMetricsProps) {
  return (
    <MetricGrid>
      <MetricCard
        title="Token 总数"
        value={totalCount}
        icon={<KeyOutlined />}
        percent={Math.min(100, totalCount * 10)}
        color="#1890ff"
      />
      <MetricCard
        title="项目级 Token"
        value={boundCount}
        icon={<FolderOpenOutlined />}
        percent={totalCount ? Math.round((boundCount / totalCount) * 100) : 0}
        color="#faad14"
      />
      <MetricCard
        title="启用中"
        value={enabledCount}
        icon={<SafetyCertificateOutlined />}
        percent={totalCount ? Math.round((enabledCount / totalCount) * 100) : 0}
        color="#52c41a"
      />
    </MetricGrid>
  );
}
