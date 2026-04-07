import {
  CloudServerOutlined,
  GlobalOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { Alert, Card, Col, Row, Space, Tag, theme } from "antd";

import {
  InfoCard,
  MetricCard,
  MetricChart,
  MetricGrid,
  type MetricChartDatum,
} from "../../components";
import { useTheme } from "../../providers";
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

interface SectionHeaderProps {
  description: string;
  eyebrow: string;
  title: string;
}

function DomainsSectionHeader({ description, eyebrow, title }: SectionHeaderProps) {
  const { token } = theme.useToken();

  return (
    <div className="domains-section-heading">
      <div>
        <div className="domains-section-heading__eyebrow" style={{ color: token.colorPrimary }}>
          {eyebrow}
        </div>
        <div className="domains-section-heading__title" style={{ color: token.colorTextHeading }}>
          {title}
        </div>
      </div>
      <div className="domains-section-heading__description" style={{ color: token.colorTextSecondary }}>
        {description}
      </div>
    </div>
  );
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
  const { token } = theme.useToken();
  const { palette } = useTheme();
  const configuredCoverage = Math.round(buildRatio(configuredCount, statusItemsLength || itemsLength));
  const healthyCoverage = Math.round(buildRatio(healthyCount, statusItemsLength));
  const mailboxCoverage = Math.round(
    buildRatio(totalManagedMailboxes, totalObservedMailboxes || totalManagedMailboxes),
  );

  const signalCards = [
    {
      color: palette.info,
      description: `${configuredCount}/${statusItemsLength || itemsLength || 0} 个域名已经接入治理链路`,
      icon: <CloudServerOutlined />,
      title: "接入覆盖",
      value: configuredCoverage,
    },
    {
      color: palette.success,
      description: `${healthyCount}/${statusItemsLength || 0} 个域名当前处于健康状态`,
      icon: <SafetyCertificateOutlined />,
      title: "健康覆盖",
      value: healthyCoverage,
    },
    {
      color: palette.cyan,
      description: `${totalManagedMailboxes}/${totalObservedMailboxes || totalManagedMailboxes || 0} 个邮箱已纳入托管`,
      icon: <MailOutlined />,
      title: "托管率",
      value: mailboxCoverage,
    },
  ];

  const kpiCards = [
    {
      color: palette.info,
      description: "纳入治理中心的域名资产总量",
      icon: <GlobalOutlined />,
      percent: Math.min(100, itemsLength * 10),
      title: "域名资产",
      value: itemsLength,
    },
    {
      color: palette.success,
      description: "当前处于启用状态的域名",
      icon: <SafetyCertificateOutlined />,
      percent: itemsLength ? (enabledCount / itemsLength) * 100 : 0,
      title: "已启用",
      value: enabledCount,
    },
    {
      color: palette.warning,
      description: "已完成 Cloudflare 接入的域名",
      icon: <CloudServerOutlined />,
      percent: buildRatio(configuredCount, statusItemsLength || itemsLength),
      title: "Cloudflare 已接入",
      value: configuredCount,
    },
    {
      color: palette.info,
      description: "当前无异常且无漂移的域名",
      icon: <SafetyCertificateOutlined />,
      percent: buildRatio(healthyCount, statusItemsLength),
      title: "健康域名",
      value: healthyCount,
    },
    {
      color: palette.cyan,
      description: "已纳入平台托管的活动邮箱",
      icon: <MailOutlined />,
      percent: buildRatio(totalManagedMailboxes, totalObservedMailboxes || totalManagedMailboxes),
      title: "托管邮箱",
      value: totalManagedMailboxes.toLocaleString("zh-CN"),
    },
    {
      color: palette.violet,
      description: "Catch-all 配置与目标状态存在差异",
      icon: <SyncOutlined />,
      percent: buildRatio(driftCount, statusItemsLength),
      title: "Catch-all 漂移",
      value: driftCount,
    },
    {
      color: palette.amber,
      description: "邮箱路由存在漂移或缺口",
      icon: <CloudServerOutlined />,
      percent: buildRatio(routeDriftCount, statusItemsLength),
      title: "邮箱路由漂移",
      value: routeDriftCount,
    },
  ];

  const governanceTags = [
    {
      color: "blue",
      label: `${itemsLength.toLocaleString("zh-CN")} 个域名资产`,
    },
    {
      color: configuredCount > 0 ? "processing" : "default",
      label: configuredCount > 0 ? `Cloudflare 已接入 ${configuredCount}` : "仍有域名待接入",
    },
    {
      color: statusItemsLength > 0 ? "success" : "default",
      label: statusItemsLength > 0 ? `健康率 ${healthyCoverage}%` : "等待状态观测",
    },
    driftCount + routeDriftCount > 0
      ? {
          color: "warning",
          label: `待治理漂移 ${driftCount + routeDriftCount}`,
        }
      : { color: "success", label: "当前未发现漂移" },
  ];

  return (
    <div className="page-scroll-panel">
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card
          size="small"
          style={{
            borderRadius: 18,
            borderColor: token.colorBorderSecondary,
            background: `linear-gradient(135deg, ${token.colorBgContainer} 0%, ${token.colorFillAlter} 100%)`,
          }}
          bodyStyle={{ display: "flex", flexDirection: "column", gap: 20 }}
        >
          <div className="domains-overview-hero">
            <div className="domains-overview-hero__main">
              <DomainsSectionHeader
                eyebrow="Domain Cockpit"
                title="接入与治理总览"
                description="先看接入覆盖、健康覆盖和托管密度，再决定是补接入、修漂移还是继续扩容域名承载。"
              />

              <Space size={[8, 8]} wrap>
                {governanceTags.map(tag => (
                  <Tag key={tag.label} color={tag.color}>
                    {tag.label}
                  </Tag>
                ))}
              </Space>
            </div>

            <div className="domains-overview-signal-grid">
              {signalCards.map(item => (
                <MetricCard
                  key={item.title}
                  title={item.title}
                  value={item.value}
                  suffix="%"
                  description={item.description}
                  icon={item.icon}
                  percent={item.value}
                  color={item.color}
                />
              ))}
            </div>
          </div>
        </Card>

        <MetricGrid minItemWidth={210} gap={12} style={{ marginBottom: 0 }}>
          {kpiCards.map(item => (
            <MetricCard
              key={item.title}
              title={item.title}
              value={item.value}
              description={item.description}
              icon={item.icon}
              percent={item.percent}
              color={item.color}
            />
          ))}
        </MetricGrid>

        {itemsLength === 0 && statusItemsLength > 0 ? (
          <Alert
            type="info"
            showIcon
            message="当前尚未录入域名资产"
            description="系统已经从环境变量或历史邮件中识别到域名，建议先补录到域名资产中心，再继续做工作空间绑定、Cloudflare 状态跟踪和 Catch-all 策略治理。"
          />
        ) : null}

        <DomainsSectionHeader
          eyebrow="Traffic & Routing"
          title="域名承载与路由表现"
          description="优先看收件量、托管邮箱数和路由覆盖排行，判断哪些域名正在承担主要流量。"
        />

        <Row gutter={[16, 16]} align="stretch">
          <Col xs={24}>
            <MetricChart
              title="域名收件量排行"
              data={emailVolumeChartData}
              color={palette.info}
              emptyText="暂无域名收件量统计"
              height={240}
            />
          </Col>
          <Col xs={24} xl={12}>
            <MetricChart
              title="托管邮箱数排行"
              data={managedMailboxChartData}
              color={palette.success}
              emptyText="暂无托管邮箱统计"
              height={220}
            />
          </Col>
          <Col xs={24} xl={12}>
            <MetricChart
              title="路由覆盖排行"
              data={routeCoverageChartData}
              color={palette.warning}
              emptyText="暂无路由覆盖统计"
              height={220}
            />
          </Col>
        </Row>

        <DomainsSectionHeader
          eyebrow="Asset Structure"
          title="资产结构与分层"
          description="把域名归属、层级关系和服务商分布拆开看，便于理解治理边界和承载方式。"
        />

        <Row gutter={[16, 16]} align="stretch">
          <Col xs={24} md={12} xl={8}>
            <InfoCard
              title="资产分布"
              icon={<GlobalOutlined />}
              color={palette.info}
              items={assetOverviewItems}
            />
          </Col>
          <Col xs={24} md={12} xl={8}>
            <InfoCard
              title="域名层级"
              icon={<GlobalOutlined />}
              color={palette.info}
              items={domainHierarchyOverviewItems}
            />
          </Col>
          <Col xs={24} md={12} xl={8}>
            <InfoCard
              title="服务商分布"
              icon={<CloudServerOutlined />}
              color={palette.violet}
              items={providerOverviewItems}
            />
          </Col>
        </Row>

        <DomainsSectionHeader
          eyebrow="Cloudflare Snapshot"
          title="Cloudflare 运行快照"
          description="集中查看接入健康、路由观测和实际生效情况，快速判断是配置缺失还是治理漂移。"
        />

        <Row gutter={[16, 16]} align="stretch">
          <Col xs={24} lg={12}>
            <InfoCard
              title="接入健康"
              icon={<CloudServerOutlined />}
              color={palette.warning}
              items={cloudflareHealthOverviewItems}
            />
          </Col>
          <Col xs={24} lg={12}>
            <InfoCard
              title="路由观测"
              icon={<MailOutlined />}
              color={palette.cyan}
              items={cloudflareRoutingOverviewItems}
            />
          </Col>
        </Row>
      </Space>
    </div>
  );
}
