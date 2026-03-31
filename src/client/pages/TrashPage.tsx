import { DeleteOutlined, RollbackOutlined } from "@ant-design/icons";
import { App, Button, Popconfirm, Space, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getEmails, purgeEmail, restoreEmail } from "../api";
import { BatchActionsBar, DataTable, PageHeader } from "../components";
import { useTableSelection } from "../hooks/useTableSelection";
import type { EmailSummary } from "../types";
import { buildBatchActionMessage, formatDateTime, normalizeApiError, runBatchAction } from "../utils";

interface TrashPageProps {
  onUnauthorized: () => void;
}

export default function TrashPage({ onUnauthorized }: TrashPageProps) {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<EmailSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const {
    clearSelection,
    rowSelection,
    selectedItems,
  } = useTableSelection(items, "message_id");

  useEffect(() => {
    void loadData(page);
  }, [page]);

  async function loadData(nextPage: number) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ archived: "include", deleted: "only", page: String(nextPage) });
      const payload = await getEmails(params);
      setItems(payload.items);
      setTotal(payload.total);
      setPageSize(payload.pageSize);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(messageId: string) {
    try {
      await restoreEmail(messageId);
      message.success("邮件已恢复");
      await loadData(page);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function handlePurge(messageId: string) {
    try {
      await purgeEmail(messageId);
      message.success("邮件已彻底删除");
      await loadData(page);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function reloadAfterBatch(affectedCount: number) {
    clearSelection();
    if (affectedCount === items.length && page > 1) {
      setPage(current => current - 1);
      return;
    }

    await loadData(page);
  }

  async function handleBatchRestore() {
    const result = await runBatchAction(selectedItems, item => restoreEmail(item.message_id));
    if (result.successCount > 0) {
      await reloadAfterBatch(result.successCount);
    }

    const messageText = buildBatchActionMessage("批量恢复", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  async function handleBatchPurge() {
    const result = await runBatchAction(selectedItems, item => purgeEmail(item.message_id));
    if (result.successCount > 0) {
      await reloadAfterBatch(result.successCount);
    }

    const messageText = buildBatchActionMessage("批量彻底删除", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  const columns: ColumnsType<EmailSummary> = [
    { title: "主题", dataIndex: "subject", key: "subject", render: value => value || "(无主题)" },
    { title: "发件人", dataIndex: "from_address", key: "from_address", render: value => <span style={{ fontFamily: "monospace" }}>{value}</span> },
    { title: "收件人", dataIndex: "to_address", key: "to_address", render: value => <span style={{ fontFamily: "monospace" }}>{value}</span> },
    { title: "命中", dataIndex: "result_count", key: "result_count", width: 90, render: value => <Tag color={value ? "success" : "default"}>{value}</Tag> },
    { title: "删除时间", dataIndex: "deleted_at", key: "deleted_at", width: 180, render: value => formatDateTime(value) },
    {
      title: "操作",
      key: "action",
      width: 180,
      render: (_value, record) => (
        <Space>
          <Button size="small" icon={<RollbackOutlined />} onClick={() => void handleRestore(record.message_id)}>
            恢复
          </Button>
          <Popconfirm title="彻底删除后不可恢复，确认继续吗？" onConfirm={() => void handlePurge(record.message_id)}>
            <Button danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="回收站"
        subtitle="查看已软删除邮件，并支持恢复或彻底清除"
        extra={(
          <Button onClick={() => navigate("/emails")}>
            返回邮件中心
          </Button>
        )}
      />

      <DataTable
        cardTitle="回收站邮件"
        cardToolbar={(
          <BatchActionsBar selectedCount={selectedItems.length} onClear={clearSelection}>
            <Button icon={<RollbackOutlined />} onClick={() => void handleBatchRestore()}>
              批量恢复
            </Button>
            <Popconfirm
              title={`确定彻底删除选中的 ${selectedItems.length} 封邮件吗？`}
              onConfirm={() => void handleBatchPurge()}
            >
              <Button danger icon={<DeleteOutlined />}>
                批量删除
              </Button>
            </Popconfirm>
          </BatchActionsBar>
        )}
        columns={columns}
        dataSource={items}
        loading={loading}
        rowSelection={rowSelection}
        rowKey="message_id"
        total={total}
        current={page}
        pageSize={pageSize}
        onPageChange={nextPage => setPage(nextPage)}
      />
    </div>
  );
}
