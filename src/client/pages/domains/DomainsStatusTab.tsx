import {
  CloudServerOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Col, Row, Space, Tag, theme } from "antd";
import type { ColumnsType } from "antd/es/table";

import { DataTable, MetricCard, MetricGrid } from "../../components";
import type { DomainHealthFilter } from "../../domain-filters";
import type { DomainAssetStatusRecord } from "../../types";
import { buildRatio, getStatusFocusAccentColor, type DomainStatusFocusCard } from "./domains-utils";

interface DomainsStatusTabProps {
  canWriteDomainResources: boolean;
  filteredStatusItems: DomainAssetStatusRecord[];
  healthFilter: DomainHealthFilter;
  loading: boolean;
  onHealthFilterChange: (value: DomainHealthFilter) => void;
  onRepairCatchAll: () => void;
  onRepairMailboxRoutes: () => void;
  statusColumns: ColumnsType<DomainAssetStatusRecord>;
  statusFocusCards: DomainStatusFocusCard[];
  statusItemsLength: number;
  syncing: boolean;
  visibleConfiguredCount: number;
  visibleDriftCount: number;
  visibleErrorCount: number;
  visibleGovernanceBlockedCount: number;
  visibleHealthyCount: number;
  visibleRepairableCatchAllCount: number;
  visibleRepairableMailboxRouteCount: number;
  visibleRouteDriftCount: number;
  itemsLength: number;
}

export function DomainsStatusTab({
  canWriteDomainResources,
  filteredStatusItems,
  healthFilter,
  itemsLength,
  loading,
  onHealthFilterChange,
  onRepairCatchAll,
  onRepairMailboxRoutes,
  statusColumns,
  statusFocusCards,
  statusItemsLength,
  syncing,
  visibleConfiguredCount,
  visibleDriftCount,
  visibleErrorCount,
  visibleGovernanceBlockedCount,
  visibleHealthyCount,
  visibleRepairableCatchAllCount,
  visibleRepairableMailboxRouteCount,
  visibleRouteDriftCount,
}: DomainsStatusTabProps) {
  const { token } = theme.useToken();

  return (
    <div className="page-tab-stack">
      <MetricGrid minItemWidth={220}>
        <MetricCard
          title="健康域名"
          value={visibleHealthyCount}
          icon={<SafetyCertificateOutlined />}
          percent={buildRatio(visibleHealthyCount, filteredStatusItems.length)}
          color="#2f54eb"
        />
        <MetricCard
          title="Cloudflare 已接入"
          value={visibleConfiguredCount}
          icon={<CloudServerOutlined />}
          percent={buildRatio(visibleConfiguredCount, filteredStatusItems.length || itemsLength)}
          color="#fa8c16"
        />
        <MetricCard
          title="Catch-all 漂移"
          value={visibleDriftCount}
          icon={<SyncOutlined />}
          percent={buildRatio(visibleDriftCount, filteredStatusItems.length)}
          color="#722ed1"
        />
        <MetricCard
          title="接入异常"
          value={visibleErrorCount}
          icon={<CloudServerOutlined />}
          percent={buildRatio(visibleErrorCount, filteredStatusItems.length)}
          color="#cf1322"
        />
      </MetricGrid>

      <Row gutter={[16, 16]}>
        {statusFocusCards.map(card => {
          const accentColor = getStatusFocusAccentColor(card.severity);
          const isActiveFilter = healthFilter === card.filter;

          return (
            <Col xs={24} md={12} xl={6} key={card.key}>
              <Card
                size="small"
                style={{
                  borderRadius: 12,
                  height: "100%",
                  borderColor: `${accentColor}35`,
                  background: `linear-gradient(180deg, ${accentColor}10 0%, ${token.colorBgContainer} 100%)`,
                }}
                bodyStyle={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  height: "100%",
                }}
              >
                <Space align="start" style={{ justifyContent: "space-between", width: "100%" }}>
                  <div>
                    <div style={{ color: token.colorTextSecondary, fontSize: 12 }}>治理焦点</div>
                    <div style={{ color: token.colorTextHeading, fontSize: 16, fontWeight: 600 }}>
                      {card.title}
                    </div>
                  </div>
                  <Tag color={card.severity === "success" ? "success" : card.severity}>
                    {card.total} 个
                  </Tag>
                </Space>

                <div style={{ color: token.colorTextSecondary, lineHeight: 1.6, minHeight: 66 }}>
                  {card.description}
                </div>

                <Space size={[6, 6]} wrap>
                  {card.summaryTags.length > 0
                    ? card.summaryTags.map(item => (
                      <Tag key={`${card.key}-${item.label}`} color={item.color}>
                        {item.label}
                      </Tag>
                    ))
                    : <Tag>当前无待处理项</Tag>}
                </Space>

                <div style={{ color: token.colorTextTertiary, fontSize: 12, minHeight: 36 }}>
                  {card.domains.length > 0
                    ? `示例域名：${card.domains.join("、")}${card.total > card.domains.length ? ` 等 ${card.total} 个` : ""}`
                    : "示例域名：-"}
                </div>

                <Space size={[8, 8]} wrap style={{ marginTop: "auto" }}>
                  <Button
                    size="small"
                    type={isActiveFilter ? "primary" : "default"}
                    onClick={() => onHealthFilterChange(card.filter)}
                    disabled={card.total === 0 && !isActiveFilter}
                  >
                    {isActiveFilter ? "已聚焦" : "只看这一类"}
                  </Button>
                  {card.key === "repairable" && canWriteDomainResources ? (
                    <>
                      <Button
                        size="small"
                        icon={<SyncOutlined />}
                        onClick={onRepairCatchAll}
                        disabled={visibleRepairableCatchAllCount === 0}
                        loading={syncing}
                      >
                        修复 Catch-all
                      </Button>
                      <Button
                        size="small"
                        icon={<SyncOutlined />}
                        onClick={onRepairMailboxRoutes}
                        disabled={visibleRepairableMailboxRouteCount === 0}
                        loading={syncing}
                      >
                        修复路由
                      </Button>
                    </>
                  ) : null}
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        {visibleDriftCount > 0 ? (
          <Alert
            type="warning"
            showIcon
            message="检测到 Catch-all 漂移"
            description="本地 Catch-all 策略已经保存，但 Cloudflare 侧还没有完全一致。你可以在配置表里按行同步，或者选中多条后批量同步。"
          />
        ) : null}

        {visibleRouteDriftCount > 0 ? (
          <Alert
            type="warning"
            showIcon
            message="检测到邮箱路由漂移"
            description="部分域名在 TestMail Hub 中已经托管了活跃邮箱，但 Cloudflare 侧仍缺少启用路由，或者存在未受当前系统托管的启用路由。"
          />
        ) : null}

        {visibleGovernanceBlockedCount > 0 ? (
          <Alert
            type="info"
            showIcon
            message="检测到治理受阻的域名"
            description="这些域名已经观测到配置差异，但当前治理规则、域名启用状态或 Provider 能力限制了自动修复。建议先切到“治理受阻”视图，逐项检查治理开关、域名状态和托管方式。"
          />
        ) : null}

        {visibleErrorCount > 0 ? (
          <Alert
            type="error"
            showIcon
            message="检测到 Cloudflare 接入异常"
            description="部分域名无法正确读取 Cloudflare 路由或 Catch-all 状态，请检查对应域名的 Zone ID、API Token 和 Email Worker 配置。"
          />
        ) : null}
      </Space>

      <DataTable
        autoFitViewport
        cardTitle={`域名运行状态 (${filteredStatusItems.length}/${statusItemsLength})`}
        cardExtra={canWriteDomainResources ? (
          <Space wrap>
            <Button
              icon={<SyncOutlined />}
              onClick={onRepairCatchAll}
              loading={syncing}
              disabled={visibleRepairableCatchAllCount === 0}
            >
              修复 Catch-all 漂移
            </Button>
            <Button
              icon={<SyncOutlined />}
              onClick={onRepairMailboxRoutes}
              loading={syncing}
              disabled={visibleRepairableMailboxRouteCount === 0}
            >
              修复邮箱路由漂移
            </Button>
          </Space>
        ) : undefined}
        columns={statusColumns}
        dataSource={filteredStatusItems}
        loading={loading}
        rowKey="domain"
        showPagination={false}
        scroll={{ x: "max-content", y: 420 }}
        minScrollY={260}
        style={{ marginBottom: 0 }}
      />
    </div>
  );
}
