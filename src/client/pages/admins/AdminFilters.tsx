import { SearchOutlined } from "@ant-design/icons";
import { Button, Input, Select, Space } from "antd";

import { SearchToolbar } from "../../components";
import type { AdminListFilters, AdminRole, WorkspaceProjectRecord } from "../../types";

interface AdminFiltersProps {
  draftFilters: AdminListFilters;
  filterRoleOptions: Array<{ label: string; value: AdminRole }>;
  isProjectScoped: boolean;
  onApply: () => void;
  onReset: () => void;
  onUpdateDraftFilters: (patch: Partial<AdminListFilters>) => void;
  visibleProjects: WorkspaceProjectRecord[];
}

export function AdminFilters({
  draftFilters,
  filterRoleOptions,
  isProjectScoped,
  onApply,
  onReset,
  onUpdateDraftFilters,
  visibleProjects,
}: AdminFiltersProps) {
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
            placeholder="搜索用户名、显示名、备注或绑定项目"
            prefix={<SearchOutlined />}
            value={draftFilters.keyword}
            onChange={event => onUpdateDraftFilters({ keyword: event.target.value })}
            onPressEnter={onApply}
          />
        </div>
        <div style={{ minWidth: 170, flex: "1 1 170px" }}>
          <Select
            allowClear
            placeholder="角色"
            value={draftFilters.role || undefined}
            options={filterRoleOptions}
            onChange={value => onUpdateDraftFilters({ role: value || null })}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ minWidth: 150, flex: "1 1 150px" }}>
          <Select
            allowClear
            placeholder="访问范围"
            value={draftFilters.access_scope || undefined}
            options={[
              ...(!isProjectScoped ? [{ label: "全局", value: "all" as const }] : []),
              { label: "项目绑定", value: "bound" as const },
            ]}
            onChange={value => onUpdateDraftFilters({ access_scope: value || null })}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ minWidth: 180, flex: "1 1 180px" }}>
          <Select
            allowClear
            placeholder="绑定项目"
            value={draftFilters.project_id || undefined}
            options={visibleProjects.map(project => ({
              label: project.is_enabled ? project.name : `${project.name}（已停用）`,
              value: project.id,
            }))}
            onChange={value => onUpdateDraftFilters({ project_id: value || null })}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ minWidth: 150, flex: "1 1 150px" }}>
          <Select
            allowClear
            placeholder="状态"
            value={
              typeof draftFilters.is_enabled === "boolean"
                ? (draftFilters.is_enabled ? "enabled" : "disabled")
                : undefined
            }
            options={[
              { label: "启用", value: "enabled" },
              { label: "停用", value: "disabled" },
            ]}
            onChange={value =>
              onUpdateDraftFilters({
                is_enabled: value === "enabled" ? true : value === "disabled" ? false : null,
              })}
            style={{ width: "100%" }}
          />
        </div>
        <Space size={8}>
          <Button type="primary" onClick={onApply}>
            应用筛选
          </Button>
          <Button onClick={onReset}>重置</Button>
        </Space>
      </div>
    </SearchToolbar>
  );
}
