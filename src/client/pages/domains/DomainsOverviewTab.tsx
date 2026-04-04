import {
  CloudServerOutlined,
  GlobalOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { Alert, Col, Row, Space } from "antd";

import { InfoCard, MetricCard, MetricChart, MetricGrid, type MetricChartDatum } from "../../components";
import { buildRatio } from "./domains-utils";

interface DomainsOverviewTabProps {
  assetOverviewItems: Array<{ label: string; value: string }>;
  cloudflareHealthOverviewItems: Array<{ label: string; value: string }>;
  cloudflareRoutingOverviewItems: Array<{ label: string; value: string }>;
  configuredCount: number;
  domainHierarchyOverviewItems: Array<{ label: string; value: string }>;
  driftCount: number;
  emailVolumeChartData: MetricChartDatum[];
  enabledCount: number;
  healthyCount: number;
  itemsLength: number;
  managedMailboxChartData: MetricChartDatum[];
  providerOverviewItems: Array<{ label: string; value: string }>;
  routeCoverageChartData: MetricChartDatum[];
  routeDriftCount: number;
  statusItemsLength: number;
  totalManagedMailboxes: number;
  totalObservedMailboxes: number;
}

export function DomainsOverviewTab({
  assetOverviewItems,
  cloudflareHealthOverviewItems,
  cloudflareRoutingOverviewItems,
  configuredCount,
  domainHierarchyOverviewItems,
  driftCount,
  emailVolumeChartData,
  enabledCount,
  healthyCount,
  itemsLength,
  managedMailboxChartData,
  providerOverviewItems,
  routeCoverageChartData,
  routeDriftCount,
  statusItemsLength,
  totalManagedMailboxes,
  totalObservedMailboxes,
}: DomainsOverviewTabProps) {
  return (
    <div className="page-scroll-panel">
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <MetricGrid minItemWidth={220} style={{ marginBottom: 0 }}>
          <MetricCard
            title="域名资产"
            value={itemsLength}
            icon={<GlobalOutlined />}
            percent={Math.min(100, itemsLength * 10)}
            color="#1677ff"
          />
          <MetricCard
            title="已启用"
            value={enabledCount}
            icon={<SafetyCertificateOutlined />}
            percent={itemsLength ? (enabledCount / itemsLength) * 100 : 0}
            color="#52c41a"
          />
          <MetricCard
            title="Cloudflare 已接入"
            value={configuredCount}
            icon={<CloudServerOutlined />}
            percent={buildRatio(configuredCount, statusItemsLength || itemsLength)}
            color="#fa8c16"
          />
          <MetricCard
            title="健康域名"
            value={healthyCount}
            icon={<SafetyCertificateOutlined />}
            percent={buildRatio(healthyCount, statusItemsLength)}
            color="#2f54eb"
          />
          <MetricCard
            title="托管邮箱"
            value={totalManagedMailboxes.toLocaleString("zh-CN")}
            icon={<MailOutlined />}
            percent={buildRatio(totalManagedMailboxes, totalObservedMailboxes || totalManagedMailboxes)}
            color="#13c2c2"
          />
          <MetricCard
            title="Catch-all 漂移"
            value={driftCount}
            icon={<SyncOutlined />}
            percent={buildRatio(driftCount, statusItemsLength)}
            color="#722ed1"
          />
          <MetricCard
            title="邮箱路由漂移"
            value={routeDriftCount}
            icon={<CloudServerOutlined />}
            percent={buildRatio(routeDriftCount, statusItemsLength)}
            color="#d46b08"
          />
        </MetricGrid>

        {itemsLength === 0 && statusItemsLength > 0 ? (
          <Alert
            type="info"
            showIcon
            message="当前尚未录入域名资产"
            description="系统已经通过环境变量或历史收件识别到域名，你可以先补录到域名资产中心，后续才能继续做项目绑定、Cloudflare 状态跟踪和 Catch-all 策略管理。"
          />
        ) : null}

        <Row gutter={[16, 16]} align="stretch">
          <Col span={24}>
            <MetricChart
              title="域名收件量排行"
              data={emailVolumeChartData}
              color="#1677ff"
              emptyText="暂无域名收件统计"
              height={240}
            />
          </Col>

          <Col xs={24} xl={12}>
            <MetricChart
              title="托管邮箱数排行"
              data={managedMailboxChartData}
              color="#52c41a"
              emptyText="暂无托管邮箱统计"
              height={220}
            />
          </Col>
          <Col xs={24} xl={12}>
            <MetricChart
              title="路由覆盖排行"
              data={routeCoverageChartData}
              color="#fa8c16"
              emptyText="暂无路由覆盖统计"
              height={220}
            />
          </Col>

          <Col xs={24} md={12} xxl={6}>
            <InfoCard
              title="资产分布"
              icon={<GlobalOutlined />}
              color="#1677ff"
              items={assetOverviewItems}
            />
          </Col>
          <Col xs={24} md={12} xxl={6}>
            <InfoCard
              title="域名层级"
              icon={<GlobalOutlined />}
              color="#0958d9"
              items={domainHierarchyOverviewItems}
            />
          </Col>
          <Col xs={24} md={12} xxl={6}>
            <InfoCard
              title="接入健康"
              icon={<CloudServerOutlined />}
              color="#fa8c16"
              items={cloudflareHealthOverviewItems}
            />
          </Col>
          <Col xs={24} md={12} xxl={6}>
            <InfoCard
              title="路由观测"
              icon={<MailOutlined />}
              color="#13c2c2"
              items={cloudflareRoutingOverviewItems}
            />
          </Col>
          <Col xs={24} md={12} xxl={6}>
            <InfoCard
              title="服务商分布"
              icon={<CloudServerOutlined />}
              color="#722ed1"
              items={providerOverviewItems}
            />
          </Col>
        </Row>
      </Space>
    </div>
  );
}
