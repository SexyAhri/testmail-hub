import {
  CopyOutlined,
  DeleteOutlined,
  EyeOutlined,
  InboxOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import { App, Button, Popconfirm, Space, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { deleteEmail, getEmails, unarchiveEmail } from "../api";
import { BatchActionsBar, DataTable, PageHeader } from "../components";
import { useTableSelection } from "../hooks/useTableSelection";
import type { EmailSummary } from "../types";
import { buildBatchActionMessage, formatDateTime, normalizeApiError, runBatchAction } from "../utils";

interface ArchivesPageProps {
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

export default function ArchivesPage({ onUnauthorized }: ArchivesPageProps) {
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
      const params = new URLSearchParams({
        archived: "only",
        deleted: "exclude",
        page: String(nextPage),
      });
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

  async function handleUnarchive(messageId: string) {
    try {
      await unarchiveEmail(messageId);
      message.success("邮件已取消归档");
      await loadData(page);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function handleDelete(messageId: string) {
    try {
      await deleteEmail(messageId);
      message.success("邮件已移入回收站");
      await loadData(page);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function handleCopyCode(event: React.MouseEvent<HTMLElement>, code: string) {
    event.stopPropagation();
    try {
      await copyText(code);
      message.success("验证码已复制");
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
    const result = await runBatchAction(selectedItems, item => unarchiveEmail(item.message_id));
    if (result.successCount > 0) {
      await reloadAfterBatch(result.successCount);
    }

    const messageText = buildBatchActionMessage("批量取消归档", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  async function handleBatchDelete() {
    const result = await runBatchAction(selectedItems, item => deleteEmail(item.message_id));
    if (result.successCount > 0) {
      await reloadAfterBatch(result.successCount);
    }

    const messageText = buildBatchActionMessage("批量移入回收站", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  const columns: ColumnsType<EmailSummary> = [
    {
      title: "主题",
      dataIndex: "subject",
      key: "subject",
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{record.subject || "(无主题)"}</Typography.Text>
          <Typography.Text type="secondary">{record.preview || "暂无正文预览"}</Typography.Text>
          {record.archive_reason ? (
            <Typography.Text type="secondary">归档原因: {record.archive_reason}</Typography.Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: "发件人",
      dataIndex: "from_address",
      key: "from_address",
      render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
    },
    {
      title: "收件人",
      dataIndex: "to_address",
      key: "to_address",
      render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
    },
    {
      title: "验证码",
      dataIndex: "verification_code",
      key: "verification_code",
      width: 120,
      render: value =>
        value ? (
          <Button
            type="link"
            size="small"
            icon={<CopyOutlined />}
            onClick={event => void handleCopyCode(event, value)}
            style={{ paddingInline: 0, fontFamily: "monospace", fontWeight: 600 }}
          >
            {value}
          </Button>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        ),
    },
    {
      title: "命中",
      dataIndex: "result_count",
      key: "result_count",
      width: 90,
      render: value => <Tag color={value ? "success" : "default"}>{value}</Tag>,
    },
    {
      title: "归档时间",
      dataIndex: "archived_at",
      key: "archived_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      key: "action",
      width: 220,
      render: (_value, record) => (
        <Space>
          <Button
            size="small"
            type="link"
            icon={<EyeOutlined />}
            onClick={event => {
              event.stopPropagation();
              navigate(`/emails/${record.message_id}`);
            }}
          >
            查看
          </Button>
          <Button
            size="small"
            icon={<RollbackOutlined />}
            onClick={event => {
              event.stopPropagation();
              void handleUnarchive(record.message_id);
            }}
          >
            取消归档
          </Button>
          <Popconfirm
            title="确认将这封邮件移入回收站吗？"
            onConfirm={() => void handleDelete(record.message_id)}
          >
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={event => event.stopPropagation()}
            >
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
        title="归档中心"
        subtitle="集中查看已归档邮件，可取消归档或继续移入回收站。"
        extra={(
          <Space wrap>
            <Button icon={<InboxOutlined />} onClick={() => navigate("/emails")}>
              返回邮件中心
            </Button>
          </Space>
        )}
      />

      <DataTable
        cardTitle="归档邮件"
        cardToolbar={(
          <BatchActionsBar selectedCount={selectedItems.length} onClear={clearSelection}>
            <Button icon={<RollbackOutlined />} onClick={() => void handleBatchUnarchive()}>
              批量取消归档
            </Button>
            <Popconfirm
              title={`确认将选中的 ${selectedItems.length} 封邮件移入回收站吗？`}
              onConfirm={() => void handleBatchDelete()}
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
        onRow={record => ({
          onClick: () => navigate(`/emails/${record.message_id}`),
        })}
      />
    </div>
  );
}
