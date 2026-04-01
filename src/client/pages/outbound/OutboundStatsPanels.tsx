import { Col, Row } from "antd";

import { MetricChart } from "../../components";
import type { MetricChartDatum } from "../../components";

interface OutboundStatsPanelsProps {
  failedSeries: MetricChartDatum[];
  scheduledSeries: MetricChartDatum[];
  sentSeries: MetricChartDatum[];
  topDomainSeries: MetricChartDatum[];
}

export function OutboundStatsPanels({
  failedSeries,
  scheduledSeries,
  sentSeries,
  topDomainSeries,
}: OutboundStatsPanelsProps) {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={12}>
        <MetricChart title="发送成功趋势" data={sentSeries} color="#1677ff" height={210} emptyText="暂无成功数据" />
      </Col>
      <Col xs={24} xl={12}>
        <MetricChart title="发送失败趋势" data={failedSeries} color="#ff4d4f" height={210} emptyText="暂无失败数据" />
      </Col>
      <Col xs={24} xl={12}>
        <MetricChart title="计划发送趋势" data={scheduledSeries} color="#13c2c2" height={210} emptyText="暂无计划数据" />
      </Col>
      <Col xs={24} xl={12}>
        <MetricChart title="热门收件域名" data={topDomainSeries} color="#722ed1" height={210} emptyText="暂无域名统计" />
      </Col>
    </Row>
  );
}
