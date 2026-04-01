import { Alert, Button } from "antd";
import type { ColumnsType } from "antd/es/table";

import { DataTable } from "../../components";
import type { DomainRoutingProfileRecord } from "../../types";

interface DomainsRoutingProfilesTabProps {
  canWriteDomainResources: boolean;
  columns: ColumnsType<DomainRoutingProfileRecord>;
  dataSource: DomainRoutingProfileRecord[];
  loading: boolean;
  onCreate: () => void;
  totalCount: number;
}

export function DomainsRoutingProfilesTab({
  canWriteDomainResources,
  columns,
  dataSource,
  loading,
  onCreate,
  totalCount,
}: DomainsRoutingProfilesTabProps) {
  return (
    <div className="page-tab-stack">
      <Alert
        type="info"
        showIcon
        message="独立路由策略中心"
        description="这里可以沉淀可复用的 Catch-all / 路由策略。域名资产在不做直配覆盖时，会优先继承这里绑定的策略。"
      />

      <DataTable
        autoFitViewport
        cardTitle={`路由策略列表 (${dataSource.length}/${totalCount})`}
        cardExtra={canWriteDomainResources ? <Button onClick={onCreate}>新建策略</Button> : undefined}
        columns={columns}
        dataSource={dataSource}
        loading={loading}
        rowKey="id"
        pageSize={8}
        scroll={{ x: "max-content", y: 440 }}
        minScrollY={260}
        style={{ marginBottom: 0 }}
      />
    </div>
  );
}
