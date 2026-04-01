import { Button } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { TableRowSelection } from "antd/es/table/interface";

import { BatchActionsBar, DataTable } from "../../components";
import type { OutboundTemplateRecord } from "../../types";

interface OutboundTemplatesTableProps {
  canWriteOutbound: boolean;
  columns: ColumnsType<OutboundTemplateRecord>;
  dataSource: OutboundTemplateRecord[];
  loading: boolean;
  onBatchDelete: () => void;
  onBatchDisable: () => void;
  onBatchEnable: () => void;
  onClearSelection: () => void;
  onCreate: () => void;
  rowSelection?: TableRowSelection<OutboundTemplateRecord>;
  selectedCount: number;
}

export function OutboundTemplatesTable({
  canWriteOutbound,
  columns,
  dataSource,
  loading,
  onBatchDelete,
  onBatchDisable,
  onBatchEnable,
  onClearSelection,
  onCreate,
  rowSelection,
  selectedCount,
}: OutboundTemplatesTableProps) {
  return (
    <DataTable
      cardTitle="模板列表"
      cardExtra={canWriteOutbound ? <Button onClick={onCreate}>新建模板</Button> : undefined}
      cardToolbar={canWriteOutbound ? (
        <BatchActionsBar selectedCount={selectedCount} onClear={onClearSelection}>
          <Button onClick={onBatchEnable}>
            批量启用
          </Button>
          <Button onClick={onBatchDisable}>
            批量停用
          </Button>
          <Button danger onClick={onBatchDelete}>
            批量删除
          </Button>
        </BatchActionsBar>
      ) : undefined}
      columns={columns}
      dataSource={dataSource}
      loading={loading}
      rowSelection={rowSelection}
      rowKey="id"
      pageSize={10}
    />
  );
}
