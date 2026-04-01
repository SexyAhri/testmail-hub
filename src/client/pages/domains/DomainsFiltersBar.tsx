import { Button, Input, Select } from "antd";

import { SearchToolbar } from "../../components";
import type { DomainHealthFilter, DomainScopeFilter } from "../../domain-filters";
import { DOMAIN_HEALTH_FILTER_OPTIONS, DOMAIN_SCOPE_FILTER_OPTIONS, type DomainTabKey } from "./domains-utils";

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
  return (
    <SearchToolbar>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 220, flex: "1.5 1 220px" }}>
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
        <div style={{ minWidth: 150, flex: "1 1 150px" }}>
          <Select
            allowClear
            placeholder="Provider"
            value={providerFilter}
            options={providerOptions}
            onChange={value => onProviderFilterChange(value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ minWidth: 150, flex: "1 1 150px" }}>
          <Select
            value={scopeFilter}
            options={DOMAIN_SCOPE_FILTER_OPTIONS}
            onChange={value => onScopeFilterChange(value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ minWidth: 150, flex: "1 1 150px" }}>
          <Select
            allowClear
            placeholder="项目"
            value={projectFilter}
            options={projectOptions}
            onChange={value => onProjectFilterChange(value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ minWidth: 150, flex: "1 1 150px" }}>
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
          <div style={{ minWidth: 170, flex: "1 1 170px" }}>
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
        <span style={{ marginLeft: "auto", color: "#8c8c8c", fontSize: 12 }}>
          显示 {currentTabResultCount} / {currentTabTotalCount}
        </span>
      </div>
    </SearchToolbar>
  );
}
