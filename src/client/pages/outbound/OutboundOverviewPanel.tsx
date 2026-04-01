import { SettingOutlined } from "@ant-design/icons";
import { Col, Row } from "antd";

import { InfoCard, MetricChart } from "../../components";
import type { MetricChartDatum } from "../../components";

interface OutboundOverviewPanelProps {
  compactSettingsItems: Array<{ label: string; value: string }>;
  sentSeries: MetricChartDatum[];
}

export function OutboundOverviewPanel({
  compactSettingsItems,
  sentSeries,
}: OutboundOverviewPanelProps) {
  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
      <Col xs={24} xl={9}>
        <InfoCard title="发件配置概览" icon={<SettingOutlined />} color="#1677ff" items={compactSettingsItems} />
      </Col>
      <Col xs={24} xl={15}>
        <MetricChart
          title="近 7 天发送趋势"
          data={sentSeries}
          color="#1677ff"
          height={190}
          emptyText="暂无发送趋势数据"
        />
      </Col>
    </Row>
  );
}
