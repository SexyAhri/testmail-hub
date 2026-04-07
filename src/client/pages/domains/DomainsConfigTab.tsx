import { DownOutlined, SyncOutlined } from "@ant-design/icons";
import { Button, Card, Dropdown, Popconfirm, theme } from "antd";
import type { MenuProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { TableRowSelection } from "antd/es/table/interface";

import { BatchActionsBar, DataTable } from "../../components";
import type { DomainAssetRecord } from "../../types";

interface DomainsConfigTabProps {
  batchGovernanceMenu: MenuProps;
  canWriteDomainResources: boolean;
  clearSelection: () => void;
  configColumns: ColumnsType<DomainAssetRecord>;
  filteredConfigItems: DomainAssetRecord[];
  itemsLength: number;
  loading: boolean;
  onBatchDelete: () => void;
  onBatchSyncCatchAll: () => void;
  onBatchSyncMailboxRoutes: () => void;
  onBatchToggleDisable: () => void;
  onBatchToggleEnable: () => void;
  onCreate: () => void;
  rowSelection?: TableRowSelection<DomainAssetRecord>;
  selectedCount: number;
  syncing: boolean;
}

export function DomainsConfigTab({
  batchGovernanceMenu,
  canWriteDomainResources,
  clearSelection,
  configColumns,
  filteredConfigItems,
  itemsLength,
  loading,
  onBatchDelete,
  onBatchSyncCatchAll,
  onBatchSyncMailboxRoutes,
  onBatchToggleDisable,
  onBatchToggleEnable,
  onCreate,
  rowSelection,
  selectedCount,
  syncing,
}: DomainsConfigTabProps) {
  const { token } = theme.useToken();

  return (
    <div className="page-tab-stack">
      <div className="domains-tab-intro-grid">
        <Card size="small" className="domains-tab-intro-card">
          <div className="domains-tab-intro-card__eyebrow" style={{ color: token.colorPrimary }}>
            Governance Surface
          </div>
          <div className="domains-tab-intro-card__title" style={{ color: token.colorTextHeading }}>
            域名资产配置
          </div>
          <div className="domains-tab-intro-card__description" style={{ color: token.colorTextSecondary }}>
            在这里统一管理域名归属、服务商能力、路由字段、Catch-all 策略以及项目/环境绑定关系。
          </div>
        </Card>

        <Card size="small" className="domains-tab-intro-card">
          <div className="domains-tab-intro-card__eyebrow" style={{ color: token.colorPrimary }}>
            Hierarchy Context
          </div>
          <div className="domains-tab-intro-card__title" style={{ color: token.colorTextHeading }}>
            子域名分组
          </div>
          <div className="domains-tab-intro-card__description" style={{ color: token.colorTextSecondary }}>
            已配置域名会按最近的已注册父域名自动归组，每个子域名仍保留独立资产属性和治理开关。
          </div>
        </Card>
      </div>

      <DataTable
        autoFitViewport
        cardTitle={`域名配置管理 (${filteredConfigItems.length}/${itemsLength})`}
        cardExtra={canWriteDomainResources ? <Button onClick={onCreate}>新增域名</Button> : undefined}
        cardToolbar={canWriteDomainResources ? (
          <BatchActionsBar selectedCount={selectedCount} onClear={clearSelection}>
            <Button onClick={onBatchToggleEnable}>批量启用</Button>
            <Button onClick={onBatchToggleDisable}>批量停用</Button>
            <Dropdown trigger={["click"]} menu={batchGovernanceMenu}>
              <Button icon={<DownOutlined />}>批量治理</Button>
            </Dropdown>
            <Button icon={<SyncOutlined />} onClick={onBatchSyncCatchAll} loading={syncing}>
              批量同步 Catch-all
            </Button>
            <Button icon={<SyncOutlined />} onClick={onBatchSyncMailboxRoutes} loading={syncing}>
              批量同步邮箱路由
            </Button>
            <Popconfirm
              title={`确定删除选中的 ${selectedCount} 个域名吗？`}
              onConfirm={onBatchDelete}
            >
              <Button danger>批量删除</Button>
            </Popconfirm>
          </BatchActionsBar>
        ) : undefined}
        columns={configColumns}
        dataSource={filteredConfigItems}
        loading={loading}
        rowKey="id"
        rowSelection={rowSelection}
        pageSize={8}
        scroll={{ x: "max-content", y: 440 }}
        minScrollY={260}
        style={{ marginBottom: 0 }}
      />
    </div>
  );
}
