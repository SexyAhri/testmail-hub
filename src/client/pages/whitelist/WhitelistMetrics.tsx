import { Col, Row } from "antd";

import { MetricCard } from "../../components";

interface WhitelistMetricsProps {
  enabledCount: number;
  filteredCount: number;
  totalCount: number;
}

export function WhitelistMetrics({
  enabledCount,
  filteredCount,
  totalCount,
}: WhitelistMetricsProps) {
  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
      <Col xs={24} sm={12} lg={8}>
        <MetricCard
          title="总数"
          value={totalCount}
          icon={<>@</>}
          percent={Math.min(100, totalCount * 10)}
          color="#1890ff"
        />
      </Col>
      <Col xs={24} sm={12} lg={8}>
        <MetricCard
          title="已启用"
          value={enabledCount}
          icon={<>#</>}
          percent={totalCount ? (enabledCount / totalCount) * 100 : 0}
          color="#52c41a"
        />
      </Col>
      <Col xs={24} sm={12} lg={8}>
        <MetricCard
          title="筛选结果"
          value={filteredCount}
          icon={<>*</>}
          percent={totalCount ? (filteredCount / totalCount) * 100 : 0}
          color="#722ed1"
        />
      </Col>
    </Row>
  );
}
