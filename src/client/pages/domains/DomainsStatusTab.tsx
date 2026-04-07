import {
  CloudServerOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Col, Row, Space, Tag, theme } from "antd";
import type { ColumnsType } from "antd/es/table";

import { DataTable, MetricCard, MetricGrid } from "../../components";
import type { DomainHealthFilter } from "../../domain-filters";
import { useTheme } from "../../providers";
import { withAlpha } from "../../theme";
import type { DomainAssetStatusRecord } from "../../types";
import { buildRatio, type DomainStatusFocusCard } from "./domains-utils";

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
  const { palette } = useTheme();
  const activeFocusCard = statusFocusCards.find(card => card.filter === healthFilter);
  const repairableTotal = statusFocusCards.find(card => card.key === "repairable")?.total || 0;
  const statusBase = filteredStatusItems.length || statusItemsLength || itemsLength || 1;
  const summaryItems = [
    {
      color: palette.info,
      description: filteredStatusItems.length > 0 ? "当前结果中的健康域名" : "等待状态观测数据",
      icon: <SafetyCertificateOutlined />,
      label: "健康域名",
      percent: buildRatio(visibleHealthyCount, statusBase),
      value: visibleHealthyCount,
    },
    {
      color: token.colorWarning,
      description: "已经具备 Cloudflare 状态观测前提",
      icon: <CloudServerOutlined />,
      label: "Cloudflare 已接入",
      percent: buildRatio(visibleConfiguredCount, statusBase),
      value: visibleConfiguredCount,
    },
    {
      color: palette.violet,
      description: "满足自动修复条件，可以直接执行治理",
      icon: <SyncOutlined />,
      label: "可自动修复",
      percent: buildRatio(repairableTotal, statusBase),
      value: repairableTotal,
    },
    {
      color: token.colorInfo,
      description: "检测到差异，但当前不能直接自动治理",
      icon: <SyncOutlined />,
      label: "治理受阻",
      percent: buildRatio(visibleGovernanceBlockedCount, statusBase),
      value: visibleGovernanceBlockedCount,
    },
    {
      color: token.colorError,
      description: "Zone、令牌或 Worker 配置需要优先排查",
      icon: <CloudServerOutlined />,
      label: "接入异常",
      percent: buildRatio(visibleErrorCount, statusBase),
      value: visibleErrorCount,
    },
  ];
  const notices = [
    visibleDriftCount > 0
      ? {
          description: "本地 Catch-all 策略已经保存，但 Cloudflare 侧还没有完全一致。你可以在表格里逐条同步，也可以直接做批量修复。",
          message: "检测到 Catch-all 漂移",
          type: "warning" as const,
        }
      : null,
    visibleRouteDriftCount > 0
      ? {
          description: "部分域名在 TestMail Hub 中已经托管了活跃邮箱，但 Cloudflare 侧仍缺少启用路由，或存在当前系统未托管的启用路由。",
          message: "检测到邮箱路由漂移",
          type: "warning" as const,
        }
      : null,
    visibleGovernanceBlockedCount > 0
      ? {
          description: "这些域名已经观测到配置差异，但治理规则、域名状态或服务商能力限制了自动修复。建议切换到治理受阻视图逐项排查。",
          message: "检测到治理受阻的域名",
          type: "info" as const,
        }
      : null,
    visibleErrorCount > 0
      ? {
          description: "部分域名无法正确读取 Cloudflare 路由或 Catch-all 状态，请检查对应域名的 Zone ID、API Token 和 Email Worker 配置。",
          message: "检测到 Cloudflare 接入异常",
          type: "error" as const,
        }
      : null,
  ].filter(Boolean) as Array<{ description: string; message: string; type: "error" | "info" | "warning" }>;

  return (
    <div className="page-tab-stack">
      <Card
        size="small"
        style={{
          borderRadius: 18,
          borderColor: token.colorBorderSecondary,
          background: `linear-gradient(135deg, ${token.colorBgContainer} 0%, ${token.colorFillAlter} 100%)`,
        }}
        bodyStyle={{ display: "flex", flexDirection: "column", gap: 18 }}
      >
        <DomainsSectionHeader
          eyebrow="摘要"
          title="运行状态概览"
          description="这里先给出当前筛选范围内的整体分布，再往下看具体焦点域名，不再使用一大一小的不均衡排版。"
        />

        <Space size={[8, 8]} wrap>
          <Tag color="blue">{filteredStatusItems.length} 个结果</Tag>
          <Tag color={healthFilter === "all" ? "default" : "processing"}>
            {healthFilter === "all" ? "未单独聚焦状态" : activeFocusCard?.title || "状态筛选已启用"}
          </Tag>
        </Space>

        <MetricGrid minItemWidth={210} gap={12} style={{ marginBottom: 0 }}>
          {summaryItems.map(item => (
            <MetricCard
              key={item.label}
              color={item.color}
              description={item.description}
              icon={item.icon}
              percent={item.percent}
              title={item.label}
              value={item.value}
            />
          ))}
        </MetricGrid>

        {canWriteDomainResources ? (
          <div className="domains-status-actions">
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
          </div>
        ) : null}
      </Card>

      <Card size="small" style={{ borderRadius: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DomainsSectionHeader
            eyebrow="焦点"
            title="优先处理的域名分组"
            description="按可修复、治理受阻、接入异常和待补齐接入聚合当前筛选结果，先确定处理顺序，再下钻到表格明细。"
          />

          <Row gutter={[16, 16]}>
            {statusFocusCards.map(card => {
              const accentColor = card.severity === "error"
                ? palette.error
                : card.severity === "processing"
                  ? palette.info
                  : card.severity === "success"
                    ? palette.success
                    : palette.warning;
              const isActiveFilter = healthFilter === card.filter;

              return (
                <Col xs={24} md={12} xl={6} key={card.key}>
                  <Card
                    size="small"
                    className="domains-status-focus-card"
                    style={{
                      borderRadius: 14,
                      height: "100%",
                      borderColor: withAlpha(accentColor, 0.22),
                      background: token.colorBgContainer,
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
        </div>
      </Card>

      {notices.length > 0 ? (
        <Card size="small" style={{ borderRadius: 16 }}>
          <div className="domains-section-heading" style={{ marginBottom: 16 }}>
            <div>
              <div className="domains-section-heading__eyebrow" style={{ color: token.colorPrimary }}>
                提醒
              </div>
              <div className="domains-section-heading__title" style={{ color: token.colorTextHeading }}>
                巡检提示
              </div>
            </div>
            <div className="domains-section-heading__description" style={{ color: token.colorTextSecondary }}>
              把需要优先跟进的漂移、异常和治理阻塞集中展示，避免在表格里逐条翻找。
            </div>
          </div>

          <div className="domains-notice-stack">
            {notices.map(notice => (
              <Alert
                key={notice.message}
                type={notice.type}
                showIcon
                message={notice.message}
                description={notice.description}
              />
            ))}
          </div>
        </Card>
      ) : null}

      <DataTable
        autoFitViewport
        cardTitle={`域名运行状态 (${filteredStatusItems.length}/${statusItemsLength})`}
        cardExtra={(
          <Space size={[8, 8]} wrap>
            <Tag color="blue">资产总量 {itemsLength}</Tag>
            <Tag color={visibleErrorCount > 0 ? "error" : "success"}>
              异常 {visibleErrorCount}
            </Tag>
          </Space>
        )}
        cardToolbar={canWriteDomainResources ? (
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
