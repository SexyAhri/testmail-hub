import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Col, Input, Row, Select, Space } from "antd";
import type { TableRowSelection } from "antd/es/table/interface";
import type { ColumnsType } from "antd/es/table";

import { BatchActionsBar, DataTable, SearchToolbar } from "../../components";
import type { OutboundEmailRecord } from "../../types";
import type { OutboundEmailStatus } from "./outbound-utils";

interface OutboundEmailsTableProps {
  activeStatuses: OutboundEmailStatus[];
  activeTab: "drafts" | "records";
  canWriteOutbound: boolean;
  currentStatusOptions: Array<{ label: string; value: OutboundEmailStatus }>;
  emailColumns: ColumnsType<OutboundEmailRecord>;
  emailTotal: number;
  emails: OutboundEmailRecord[];
  keyword: string;
  loading: boolean;
  onBatchDelete: () => void;
  onBatchSend: () => void;
  onChangeKeyword: (value: string) => void;
  onChangeStatuses: (value: OutboundEmailStatus[]) => void;
  onCreate: () => void;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  page: number;
  rowSelection?: TableRowSelection<OutboundEmailRecord>;
  selectedCount: number;
  selectedHasSendable: boolean;
  onClearSelection: () => void;
}

export function OutboundEmailsTable({
  activeStatuses,
  activeTab,
  canWriteOutbound,
  currentStatusOptions,
  emailColumns,
  emailTotal,
  emails,
  keyword,
  loading,
  onBatchDelete,
  onBatchSend,
  onChangeKeyword,
  onChangeStatuses,
  onClearSelection,
  onCreate,
  onPageChange,
  onRefresh,
  page,
  rowSelection,
  selectedCount,
  selectedHasSendable,
}: OutboundEmailsTableProps) {
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <SearchToolbar>
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} md={10} xl={8}>
              <Input
                value={keyword}
                onChange={event => onChangeKeyword(event.target.value)}
                placeholder="搜索主题、发件地址或收件人"
                allowClear
              />
            </Col>
            <Col xs={24} md={10} xl={8}>
              <Select
                mode="multiple"
                allowClear
                style={{ width: "100%" }}
                value={activeStatuses}
                onChange={value => onChangeStatuses(value as OutboundEmailStatus[])}
                options={currentStatusOptions}
                placeholder="筛选状态"
              />
            </Col>
            <Col xs={24} xl={8}>
              <Space wrap>
                <Button icon={<ReloadOutlined />} onClick={onRefresh}>
                  刷新
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={onCreate} disabled={!canWriteOutbound}>
                  新建邮件
                </Button>
              </Space>
            </Col>
          </Row>
        </SearchToolbar>
      </div>

      <DataTable
        cardTitle={activeTab === "drafts" ? "草稿与计划发送" : "发送记录"}
        cardToolbar={canWriteOutbound ? (
          <BatchActionsBar selectedCount={selectedCount} onClear={onClearSelection}>
            {selectedHasSendable ? (
              <Button onClick={onBatchSend}>
                批量发送
              </Button>
            ) : null}
            <Button danger onClick={onBatchDelete}>
              批量删除
            </Button>
          </BatchActionsBar>
        ) : undefined}
        columns={emailColumns}
        dataSource={emails}
        loading={loading}
        rowSelection={rowSelection}
        rowKey="id"
        current={page}
        total={emailTotal}
        pageSize={20}
        onPageChange={onPageChange}
      />
    </>
  );
}
