import {
  CopyOutlined,
  DeleteOutlined,
  EyeOutlined,
  InboxOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import { Alert, App, Button, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { deleteEmail, getEmails, unarchiveEmail } from "../../api/emails";
import { BatchActionsBar, DataTable, PageHeader, RetentionSummary } from "../../components";
import { promptOperationNote } from "../../delete-operation-note";
import { usePageFeedback } from "../../hooks/usePageFeedback";
import { useTableSelection } from "../../hooks/useTableSelection";
import { buildArchivesColumns } from "./archives-table-columns";
import { canDeleteEmails, canRestoreEmails, isReadOnlyUser, type CurrentUser } from "../../permissions";
import type { EmailSummary } from "../../types";
import { normalizeApiError, runBatchAction } from "../../utils";

interface ArchivesPageProps {
  currentUser?: CurrentUser;
  onUnauthorized: () => void;
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

export default function ArchivesPage({ currentUser, onUnauthorized }: ArchivesPageProps) {
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
  const canUnarchiveEmails = canRestoreEmails(currentUser);
  const canDeleteArchivedEmails = canDeleteEmails(currentUser);
  const canManageArchivedEmails = canUnarchiveEmails || canDeleteArchivedEmails;
  const isReadOnly = isReadOnlyUser(currentUser);
  const archiveRowSelection = canManageArchivedEmails ? rowSelection : undefined;
  const { loading, handlePageError, notifyBatchActionResult, runPageLoad } = usePageFeedback(onUnauthorized);

  useEffect(() => {
    void loadData(page);
  }, [page]);

  async function loadData(nextPage: number) {
    const payload = await runPageLoad(() => {
      const params = new URLSearchParams({
        archived: "only",
        deleted: "exclude",
        page: String(nextPage),
      });
      return getEmails(params);
    });
    if (payload !== null) {
      setItems(payload.items);
      setTotal(payload.total);
      setPageSize(payload.pageSize);
    }
  }

  async function handleUnarchive(messageId: string) {
    if (!canUnarchiveEmails) return;

    try {
      await unarchiveEmail(messageId);
      message.success("邮件已移出归档。");
      await loadData(page);
    } catch (error) {
      handlePageError(error);
    }
  }

  async function handleDelete(messageId: string) {
    if (!canDeleteArchivedEmails) return;

    const record = items.find(item => item.message_id === messageId);
    const operationNote = await promptOperationNote(modal, {
      title: "删除归档邮件",
      description: `将把 ${record?.subject || messageId} 移入回收站。可选填写本次删除备注，便于后续审计追溯。`,
      okText: "确认删除",
    });
    if (operationNote === null) return;

    try {
      await deleteEmail(messageId, { operation_note: operationNote });
      message.success("邮件已移入回收站。");
      await loadData(page);
    } catch (error) {
      handlePageError(error);
    }
  }

  async function handleCopyCode(event: React.MouseEvent<HTMLElement>, code: string) {
    event.stopPropagation();
    try {
      await copyText(code);
      message.success("验证码已复制。");
    } catch (error) {
      message.error(normalizeApiError(error, "复制失败"));
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

  async function handleBatchUnarchive() {
    if (!canUnarchiveEmails) return;

    const result = await runBatchAction(selectedItems, item => unarchiveEmail(item.message_id));
    if (result.successCount > 0) {
      await reloadAfterBatch(result.successCount);
    }

    notifyBatchActionResult("批量取消归档", result);
  }

  async function handleBatchDelete() {
    if (!canDeleteArchivedEmails) return;

    const operationNote = await promptOperationNote(modal, {
      title: "批量删除归档邮件",
      description: `将把 ${selectedItems.length} 封归档邮件移入回收站。填写的备注会写入每封邮件的审计日志。`,
      okText: "确认批量删除",
    });
    if (operationNote === null) return;

    const result = await runBatchAction(
      selectedItems,
      item => deleteEmail(item.message_id, { operation_note: operationNote }),
    );
    if (result.successCount > 0) {
      await reloadAfterBatch(result.successCount);
    }

    notifyBatchActionResult("批量移入回收站", result);
  }

  const columns = buildArchivesColumns({
    canDeleteArchivedEmails,
    canUnarchiveEmails,
    onCopyCode: (event, code) => void handleCopyCode(event, code),
    onDelete: (event, record) => {
      event.stopPropagation();
      void handleDelete(record.message_id);
    },
    onOpenDetail: (event, record) => {
      event.stopPropagation();
      navigate(`/emails/${record.message_id}`);
    },
    onUnarchive: (event, record) => {
      event.stopPropagation();
      void handleUnarchive(record.message_id);
    },
  });

  return (
    <div>
      <PageHeader
        title="归档"
        subtitle="查看已归档邮件，可恢复或移入回收站。"
        extra={(
          <Space wrap>
            <Button icon={<InboxOutlined />} onClick={() => navigate("/emails")}>
              返回邮件
            </Button>
          </Space>
        )}
      />

      {!canManageArchivedEmails ? (
        <Alert
          showIcon
          type="info"
          message={isReadOnly ? "当前账号对归档页为只读。" : "当前账号无法修改归档邮件。"}
          description="你仍可查看归档邮件和详情，但恢复、删除与批量操作已禁用。"
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <DataTable
        cardTitle="归档邮件"
        cardToolbar={canManageArchivedEmails ? (
          <BatchActionsBar selectedCount={selectedItems.length} onClear={clearSelection}>
            {canUnarchiveEmails ? (
              <Button icon={<RollbackOutlined />} onClick={() => void handleBatchUnarchive()}>
                批量取消归档
              </Button>
            ) : null}
            {canDeleteArchivedEmails ? (
              <Button danger icon={<DeleteOutlined />} onClick={() => void handleBatchDelete()}>
                批量删除
              </Button>
            ) : null}
          </BatchActionsBar>
        ) : undefined}
        columns={columns}
        dataSource={items}
        loading={loading}
        rowSelection={archiveRowSelection}
        rowKey="message_id"
        total={total}
        current={page}
        pageSize={pageSize}
        onPageChange={nextPage => setPage(nextPage)}
        onRow={record => ({
          onClick: () => navigate(`/emails/${record.message_id}`),
        })}
      />
    </div>
  );
}
