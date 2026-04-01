import { Button } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { TableRowSelection } from "antd/es/table/interface";

import { BatchActionsBar, DataTable } from "../../components";
import type { OutboundContactRecord } from "../../types";

interface OutboundContactsTableProps {
  canWriteOutbound: boolean;
  columns: ColumnsType<OutboundContactRecord>;
  dataSource: OutboundContactRecord[];
  loading: boolean;
  onBatchDelete: () => void;
  onBatchFavorite: () => void;
  onBatchUnfavorite: () => void;
  onClearSelection: () => void;
  onCreate: () => void;
  rowSelection?: TableRowSelection<OutboundContactRecord>;
  selectedCount: number;
}

export function OutboundContactsTable({
  canWriteOutbound,
  columns,
  dataSource,
  loading,
  onBatchDelete,
  onBatchFavorite,
  onBatchUnfavorite,
  onClearSelection,
  onCreate,
  rowSelection,
  selectedCount,
}: OutboundContactsTableProps) {
  return (
    <DataTable
      cardTitle="联系人列表"
      cardExtra={canWriteOutbound ? <Button onClick={onCreate}>新增联系人</Button> : undefined}
      cardToolbar={canWriteOutbound ? (
        <BatchActionsBar selectedCount={selectedCount} onClear={onClearSelection}>
          <Button onClick={onBatchFavorite}>
            批量收藏
          </Button>
          <Button onClick={onBatchUnfavorite}>
            取消收藏
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
