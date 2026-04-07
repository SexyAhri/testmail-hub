import { Button, Input, Select, Space, Tag, theme } from "antd";

import { SearchToolbar } from "../../components";
import type { DomainHealthFilter, DomainScopeFilter } from "../../domain-filters";
import { withAlpha } from "../../theme";
import {
  DOMAIN_HEALTH_FILTER_OPTIONS,
  DOMAIN_SCOPE_FILTER_OPTIONS,
  type DomainTabKey,
} from "./domains-utils";

interface DomainsFiltersBarProps {
  activeTab: DomainTabKey;
  currentTabResultCount: number;
  currentTabTotalCount: number;
  environmentFilter?: number;
  filterEnvironmentOptions: Array<{ label: string; value: number }>;
  hasDomainFilters: boolean;
  healthFilter: DomainHealthFilter;
  keyword: string;
  onEnvironmentFilterChange: (value?: number) => void;
  onHealthFilterChange: (value: DomainHealthFilter) => void;
  onKeywordChange: (value: string) => void;
  onProjectFilterChange: (value?: number) => void;
  onProviderFilterChange: (value?: string) => void;
  onResetFilters: () => void;
  onScopeFilterChange: (value: DomainScopeFilter) => void;
  projectFilter?: number;
  projectOptions: Array<{ label: string; value: number }>;
  providerFilter?: string;
  providerOptions: Array<{ label: string; value: string }>;
  scopeFilter: DomainScopeFilter;
}

const DOMAIN_TAB_META: Record<DomainTabKey, { description: string; label: string }> = {
  config: {
    description: "按域名筛选配置项、绑定范围和治理策略，适合做批量启停与同步操作。",
    label: "配置管理",
  },
  overview: {
    description: "总览页默认展示全局趋势和结构，不提供筛选。",
    label: "概览",
  },
  "routing-profiles": {
    description: "搜索可复用的路由策略，查看它们按项目和环境的作用范围。",
    label: "路由策略",
  },
  status: {
    description: "聚焦运行状态、接入异常和治理漂移，快速切换到需要处理的域名集合。",
    label: "运行状态",
  },
};

export function DomainsFiltersBar({
  activeTab,
  currentTabResultCount,
  currentTabTotalCount,
  environmentFilter,
  filterEnvironmentOptions,
  hasDomainFilters,
  healthFilter,
  keyword,
  onEnvironmentFilterChange,
  onHealthFilterChange,
  onKeywordChange,
  onProjectFilterChange,
  onProviderFilterChange,
  onResetFilters,
  onScopeFilterChange,
  projectFilter,
  projectOptions,
  providerFilter,
  providerOptions,
  scopeFilter,
}: DomainsFiltersBarProps) {
  const { token } = theme.useToken();
  const activeFilterCount = [
    keyword.trim(),
    providerFilter,
    projectFilter,
    environmentFilter,
    scopeFilter !== "all" ? scopeFilter : undefined,
    activeTab === "status" && healthFilter !== "all" ? healthFilter : undefined,
  ].filter(Boolean).length;
  const tabMeta = DOMAIN_TAB_META[activeTab];
  const summaryCards = [
    {
      label: "当前视图",
      value: tabMeta.label,
    },
    {
      label: "结果 / 总量",
      value: `${currentTabResultCount} / ${currentTabTotalCount}`,
    },
    {
      label: "已启用筛选",
      value: `${activeFilterCount}`,
    },
  ];

  return (
    <SearchToolbar>
      <div className="domains-filters-bar">
        <div className="domains-filters-bar__top">
          <div className="domains-filters-bar__meta">
            <Space size={[8, 8]} wrap>
              <Tag color="blue">{tabMeta.label}</Tag>
              {activeFilterCount > 0 ? <Tag color="processing">筛选进行中</Tag> : <Tag>未启用筛选</Tag>}
            </Space>
            <div
              className="domains-filters-bar__meta-text"
              style={{ color: token.colorTextSecondary }}
            >
              {tabMeta.description}
            </div>
          </div>

          <div className="domains-filters-bar__summary">
            {summaryCards.map(item => (
              <div
                key={item.label}
                className="domains-filters-bar__summary-card"
                style={{
                  background: withAlpha(token.colorBgContainer, 0.82),
                  border: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                <div
                  className="domains-filters-bar__summary-label"
                  style={{ color: token.colorTextTertiary }}
                >
                  {item.label}
                </div>
                <div
                  className="domains-filters-bar__summary-value"
                  style={{ color: token.colorTextHeading }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="domains-filters-bar__controls">
          <div className="domains-filters-bar__control domains-filters-bar__control--search">
            <Input
              allowClear
              placeholder={
                activeTab === "routing-profiles"
                  ? "搜索策略名称、标识、备注或工作空间"
                  : activeTab === "status"
                    ? "搜索域名、备注、工作空间或异常信息"
                    : "搜索域名、备注、路由策略或工作空间"
              }
              value={keyword}
              onChange={event => onKeywordChange(event.target.value)}
            />
          </div>

          <div className="domains-filters-bar__control">
            <Select
              allowClear
              placeholder="服务商"
              value={providerFilter}
              options={providerOptions}
              onChange={value => onProviderFilterChange(value)}
              style={{ width: "100%" }}
            />
          </div>

          <div className="domains-filters-bar__control">
            <Select
              value={scopeFilter}
              options={DOMAIN_SCOPE_FILTER_OPTIONS}
              onChange={value => onScopeFilterChange(value)}
              style={{ width: "100%" }}
            />
          </div>

          <div className="domains-filters-bar__control">
            <Select
              allowClear
              placeholder="项目"
              value={projectFilter}
              options={projectOptions}
              onChange={value => onProjectFilterChange(value)}
              style={{ width: "100%" }}
            />
          </div>

          <div className="domains-filters-bar__control">
            <Select
              allowClear
              placeholder="环境"
              value={environmentFilter}
              options={filterEnvironmentOptions}
              onChange={value => onEnvironmentFilterChange(value)}
              style={{ width: "100%" }}
            />
          </div>

          {activeTab === "status" ? (
            <div className="domains-filters-bar__control">
              <Select
                value={healthFilter}
                options={DOMAIN_HEALTH_FILTER_OPTIONS}
                onChange={value => onHealthFilterChange(value)}
                style={{ width: "100%" }}
              />
            </div>
          ) : null}

          <Button onClick={onResetFilters} disabled={!hasDomainFilters}>
            重置筛选
          </Button>
        </div>
      </div>
    </SearchToolbar>
  );
}
