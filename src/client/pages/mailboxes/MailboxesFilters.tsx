import { SyncOutlined } from "@ant-design/icons";
import { Button, Input, Select } from "antd";

import { SearchToolbar } from "../../components";

interface Option {
  label: string;
  value: number;
}

interface MailboxesFiltersProps {
  canSyncRoutes: boolean;
  canWriteMailboxes: boolean;
  environmentFilter?: number;
  environmentOptions: Option[];
  mailboxPoolFilter?: number;
  mailboxPoolOptions: Option[];
  onCreate: () => void;
  onEnvironmentChange: (value?: number) => void;
  onMailboxPoolChange: (value?: number) => void;
  onProjectChange: (value?: number) => void;
  onReset: () => void;
  onSearchChange: (value: string) => void;
  onSync: () => void;
  projectFilter?: number;
  projectOptions: Option[];
  searchText: string;
  syncing: boolean;
}

export function MailboxesFilters({
  canSyncRoutes,
  canWriteMailboxes,
  environmentFilter,
  environmentOptions,
  mailboxPoolFilter,
  mailboxPoolOptions,
  onCreate,
  onEnvironmentChange,
  onMailboxPoolChange,
  onProjectChange,
  onReset,
  onSearchChange,
  onSync,
  projectFilter,
  projectOptions,
  searchText,
  syncing,
}: MailboxesFiltersProps) {
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
        <div style={{ minWidth: 220, flex: "1 1 220px" }}>
          <Input
            placeholder="搜索邮箱、备注、标签或归属"
            value={searchText}
            onChange={event => onSearchChange(event.target.value)}
          />
        </div>
        <div style={{ minWidth: 160, flex: "1 1 160px" }}>
          <Select
            allowClear
            placeholder="项目"
            value={projectFilter}
            options={projectOptions}
            onChange={onProjectChange}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ minWidth: 150, flex: "1 1 150px" }}>
          <Select
            allowClear
            placeholder="环境"
            value={environmentFilter}
            options={environmentOptions}
            onChange={onEnvironmentChange}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ minWidth: 160, flex: "1 1 160px" }}>
          <Select
            allowClear
            placeholder="邮箱池"
            value={mailboxPoolFilter}
            options={mailboxPoolOptions}
            onChange={onMailboxPoolChange}
            style={{ width: "100%" }}
          />
        </div>
        <Button onClick={onReset}>重置</Button>
        <Button
          icon={<SyncOutlined />}
          loading={syncing}
          disabled={!canSyncRoutes}
          onClick={onSync}
          style={{ borderRadius: 8 }}
        >
          同步路由
        </Button>
        <Button type="primary" onClick={onCreate} disabled={!canWriteMailboxes}>
          新建邮箱
        </Button>
      </div>
    </SearchToolbar>
  );
}
