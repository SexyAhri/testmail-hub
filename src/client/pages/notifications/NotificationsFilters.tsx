import { Button, Input, Select } from "antd";

import { SearchToolbar } from "../../components";
import type { AccessScope } from "../../types";

interface Option {
  label: string;
  value: number | string;
}

interface NotificationsFiltersProps {
  accessScopeFilter?: AccessScope;
  canWriteNotifications: boolean;
  eventFilter?: string;
  eventOptions: Option[];
  onAccessScopeChange: (value?: AccessScope) => void;
  onCreate: () => void;
  onEventChange: (value?: string) => void;
  onProjectChange: (value?: number) => void;
  onReset: () => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (value?: string) => void;
  projectFilter?: number;
  projectOptions: Array<{ label: string; value: number }>;
  searchText: string;
  statusFilter?: string;
}

export function NotificationsFilters({
  accessScopeFilter,
  canWriteNotifications,
  eventFilter,
  eventOptions,
  onAccessScopeChange,
  onCreate,
  onEventChange,
  onProjectChange,
  onReset,
  onSearchChange,
  onStatusChange,
  projectFilter,
  projectOptions,
  searchText,
  statusFilter,
}: NotificationsFiltersProps) {
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
        <div style={{ minWidth: 260, flex: "1 1 260px" }}>
          <Input
            allowClear
            placeholder="搜索名称、目标地址、错误信息或项目"
            value={searchText}
            onChange={event => onSearchChange(event.target.value)}
          />
        </div>
        <div style={{ minWidth: 150, flex: "1 1 150px" }}>
          <Select
            allowClear
            placeholder="最近状态"
            value={statusFilter}
            options={[
              { label: "成功", value: "success" },
              { label: "重试中", value: "retrying" },
              { label: "待发送", value: "pending" },
              { label: "失败", value: "failed" },
              { label: "未投递", value: "" },
            ]}
            onChange={value => onStatusChange(value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ minWidth: 150, flex: "1 1 150px" }}>
          <Select
            allowClear
            placeholder="访问范围"
            value={accessScopeFilter}
            options={[
              { label: "全局", value: "all" },
              { label: "项目绑定", value: "bound" },
            ]}
            onChange={value => onAccessScopeChange(value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ minWidth: 160, flex: "1 1 160px" }}>
          <Select
            allowClear
            placeholder="绑定项目"
            value={projectFilter}
            options={projectOptions}
            onChange={value => onProjectChange(value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ minWidth: 220, flex: "1 1 220px" }}>
          <Select
            allowClear
            showSearch
            placeholder="事件"
            value={eventFilter}
            options={eventOptions}
            onChange={value => onEventChange(value)}
            optionFilterProp="label"
            style={{ width: "100%" }}
          />
        </div>
        <Button onClick={onReset}>重置</Button>
        <Button type="primary" onClick={onCreate} disabled={!canWriteNotifications}>
          新增端点
        </Button>
      </div>
    </SearchToolbar>
  );
}
