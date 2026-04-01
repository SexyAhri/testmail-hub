import { DeleteOutlined, EyeOutlined, RollbackOutlined } from "@ant-design/icons";
import { Alert, App, Button, Space, Tag } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getEmails, purgeEmail, restoreEmail } from "../../api/emails";
import { BatchActionsBar, DataTable, PageHeader, RetentionSummary } from "../../components";
import { promptOperationNote } from "../../delete-operation-note";
import { usePageFeedback } from "../../hooks/usePageFeedback";
import { useTableSelection } from "../../hooks/useTableSelection";
import { buildTrashColumns } from "./trash-table-columns";
import { canDeleteEmails, canRestoreEmails, isReadOnlyUser, type CurrentUser } from "../../permissions";
import type { EmailSummary } from "../../types";
import { runBatchAction } from "../../utils";

interface TrashPageProps {
  currentUser?: CurrentUser;
  onUnauthorized: () => void;
}

export default function TrashPage({ currentUser, onUnauthorized }: TrashPageProps) {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [items, setItems] = useState<EmailSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const {
    clearSelection,
    rowSelection,
    selectedItems,
  } = useTableSelection(items, "message_id");
  const canRestoreDeletedEmails = canRestoreEmails(currentUser);
  const canPurgeDeletedEmails = canDeleteEmails(currentUser);
  const canManageDeletedEmails = canRestoreDeletedEmails || canPurgeDeletedEmails;
  const isReadOnly = isReadOnlyUser(currentUser);
  const trashRowSelection = canManageDeletedEmails ? rowSelection : undefined;
  const { loading, handlePageError, notifyBatchActionResult, runPageLoad } = usePageFeedback(onUnauthorized);

  useEffect(() => {
    void loadData(page);
  }, [page]);

  async function loadData(nextPage: number) {
    const payload = await runPageLoad(() => {
      const params = new URLSearchParams({ archived: "include", deleted: "only", page: String(nextPage) });
      return getEmails(params);
    });
    if (payload !== null) {
      setItems(payload.items);
      setTotal(payload.total);
      setPageSize(payload.pageSize);
    }
  }

  async function handleRestore(messageId: string) {
    if (!canRestoreDeletedEmails) return;

    try {
      await restoreEmail(messageId);
      message.success("邮件已恢复。");
      await loadData(page);
    } catch (error) {
      handlePageError(error);
    }
  }

  async function handlePurge(messageId: string) {
    if (!canPurgeDeletedEmails) return;

    const record = items.find(item => item.message_id === messageId);
    const operationNote = await promptOperationNote(modal, {
      title: "永久删除邮件",
      description: `将永久删除 ${record?.subject || messageId}，此操作不可恢复。可选填写本次删除备注，便于后续审计追溯。`,
      okText: "确认永久删除",
    });
    if (operationNote === null) return;

    try {
      await purgeEmail(messageId, { operation_note: operationNote });
      message.success("邮件已永久删除。");
      await loadData(page);
    } catch (error) {
      handlePageError(error);
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
    if (!canRestoreDeletedEmails) return;

    const result = await runBatchAction(selectedItems, item => restoreEmail(item.message_id));
    if (result.successCount > 0) {
      await reloadAfterBatch(result.successCount);
    }

    notifyBatchActionResult("批量恢复", result);
  }

  async function handleBatchPurge() {
    if (!canPurgeDeletedEmails) return;

    const operationNote = await promptOperationNote(modal, {
      title: "批量永久删除邮件",
      description: `将永久删除 ${selectedItems.length} 封邮件，此操作不可恢复。填写的备注会写入每封邮件的审计日志。`,
      okText: "确认批量永久删除",
    });
    if (operationNote === null) return;

    const result = await runBatchAction(
      selectedItems,
      item => purgeEmail(item.message_id, { operation_note: operationNote }),
    );
    if (result.successCount > 0) {
      await reloadAfterBatch(result.successCount);
    }

    notifyBatchActionResult("批量彻底删除", result);
  }

  const columns = buildTrashColumns({
    canPurgeDeletedEmails,
    canRestoreDeletedEmails,
    onOpenDetail: record => navigate(`/emails/${record.message_id}`),
    onPurge: record => void handlePurge(record.message_id),
    onRestore: record => void handleRestore(record.message_id),
  });

  return (
    <div>
      <PageHeader
        title="回收站"
        subtitle="查看已软删除邮件，可恢复或彻底删除。"
        extra={(
          <Button onClick={() => navigate("/emails")}>
            返回邮件
          </Button>
        )}
      />

      {!canManageDeletedEmails ? (
        <Alert
          showIcon
          type="info"
          message={isReadOnly ? "当前账号对回收站为只读。" : "当前账号无法修改回收站邮件。"}
          description="你仍可查看已删邮件，但恢复、彻底删除和批量操作已禁用。"
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <DataTable
        cardTitle="已删邮件"
        cardToolbar={canManageDeletedEmails ? (
          <BatchActionsBar selectedCount={selectedItems.length} onClear={clearSelection}>
            {canRestoreDeletedEmails ? (
              <Button icon={<RollbackOutlined />} onClick={() => void handleBatchRestore()}>
                批量恢复
              </Button>
            ) : null}
            {canPurgeDeletedEmails ? (
              <Button danger icon={<DeleteOutlined />} onClick={() => void handleBatchPurge()}>
                批量彻底删除
              </Button>
            ) : null}
          </BatchActionsBar>
        ) : undefined}
        columns={columns}
        dataSource={items}
        loading={loading}
        rowSelection={trashRowSelection}
        rowKey="message_id"
        total={total}
        current={page}
        pageSize={pageSize}
        onPageChange={nextPage => setPage(nextPage)}
      />
    </div>
  );
}
