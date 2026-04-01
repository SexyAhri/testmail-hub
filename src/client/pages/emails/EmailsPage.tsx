import {
  DeleteOutlined,
  DownloadOutlined,
  InboxOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Alert, App, Button, Space } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  archiveEmail,
  buildEmailSearchParams,
  deleteEmail,
  getEmails,
} from "../../api/emails";
import { buildExportUrl } from "../../api/observability";
import { getWorkspaceCatalog } from "../../api/workspace";
import { BatchActionsBar, DataTable, PageHeader } from "../../components";
import { promptOperationNote } from "../../delete-operation-note";
import { usePageFeedback } from "../../hooks/usePageFeedback";
import { useTableSelection } from "../../hooks/useTableSelection";
import {
  canDeleteEmails,
  canWriteEmails,
  isReadOnlyUser,
  type CurrentUser,
} from "../../permissions";
import type { EmailSummary, WorkspaceCatalog } from "../../types";
import { copyText, normalizeApiError, runBatchAction } from "../../utils";
import {
  EmailsFilters,
  type EmailFilterDrafts,
  type RangePickerChangeValue,
  type RangePickerValue,
} from "./EmailsFilters";
import { EmailsMetrics } from "./EmailsMetrics";
import { buildEmailColumns } from "./email-table-columns";

const EMPTY_CATALOG: WorkspaceCatalog = {
  environments: [],
  mailbox_pools: [],
  projects: [],
};

interface EmailsPageProps {
  currentUser?: CurrentUser;
  domains: string[];
  onUnauthorized: () => void;
}

function buildDraftsFromSearchParams(searchParams: URLSearchParams): EmailFilterDrafts {
  return {
    address: searchParams.get("address") || "",
    domain: searchParams.get("domain") || undefined,
    environment_id: searchParams.get("environment_id") ? Number(searchParams.get("environment_id")) : undefined,
    has_attachments: searchParams.get("has_attachments") || undefined,
    has_matches: searchParams.get("has_matches") || undefined,
    mailbox_pool_id: searchParams.get("mailbox_pool_id") ? Number(searchParams.get("mailbox_pool_id")) : undefined,
    project_id: searchParams.get("project_id") ? Number(searchParams.get("project_id")) : undefined,
    sender: searchParams.get("sender") || "",
    subject: searchParams.get("subject") || "",
  };
}

export default function EmailsPage({ currentUser, domains, onUnauthorized }: EmailsPageProps) {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [catalog, setCatalog] = useState<WorkspaceCatalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [drafts, setDrafts] = useState<EmailFilterDrafts>(() => buildDraftsFromSearchParams(searchParams));
  const { handlePageError, notifyBatchActionResult } = usePageFeedback(onUnauthorized);
  const canArchiveEmails = canWriteEmails(currentUser);
  const canDeleteEmailRecords = canDeleteEmails(currentUser);
  const canManageEmailSelection = canArchiveEmails || canDeleteEmailRecords;
  const isReadOnly = isReadOnlyUser(currentUser);

  const parsedPage = Number.parseInt(searchParams.get("page") || "1", 10);
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  useEffect(() => {
    void loadWorkspaceCatalog();
  }, []);

  useEffect(() => {
    setDrafts(buildDraftsFromSearchParams(searchParams));
  }, [searchParams]);

  useEffect(() => {
    void loadEmails();
  }, [searchParams]);

  async function loadEmails(paramsSource: URLSearchParams = searchParams) {
    setLoading(true);
    try {
      const params = new URLSearchParams(paramsSource);
      if (!params.get("page")) params.set("page", "1");
      const payload = await getEmails(params);
      setEmails(payload.items);
      setTotal(payload.total);
      setPageSize(payload.pageSize);
    } catch (error) {
      handlePageError(error);
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkspaceCatalog() {
    try {
      setCatalog(await getWorkspaceCatalog(true));
    } catch (error) {
      handlePageError(error);
    }
  }

  function commitSearchParams(nextParams: URLSearchParams) {
    setLoading(true);
    if (nextParams.toString() === searchParams.toString()) {
      void loadEmails(nextParams);
      return;
    }
    setSearchParams(nextParams);
  }

  function updateDrafts(next: Partial<EmailFilterDrafts>) {
    setDrafts(state => ({ ...state, ...next }));
  }

  function applyFilters(nextPage = 1) {
    const params = buildEmailSearchParams({
      address: drafts.address || undefined,
      domain: drafts.domain || undefined,
      environment_id: drafts.environment_id || undefined,
      has_attachments: drafts.has_attachments ? drafts.has_attachments === "1" : undefined,
      has_matches: drafts.has_matches ? drafts.has_matches === "1" : undefined,
      mailbox_pool_id: drafts.mailbox_pool_id || undefined,
      project_id: drafts.project_id || undefined,
      sender: drafts.sender || undefined,
      subject: drafts.subject || undefined,
    });

    const range =
      searchParams.get("date_from") && searchParams.get("date_to")
        ? [searchParams.get("date_from"), searchParams.get("date_to")]
        : null;

    if (range?.[0]) params.set("date_from", range[0]);
    if (range?.[1]) params.set("date_to", range[1]);
    params.set("page", String(nextPage));
    commitSearchParams(params);
  }

  function updateDateRange(values: RangePickerChangeValue) {
    const params = new URLSearchParams(searchParams);
    if (!values || !values[0] || !values[1]) {
      params.delete("date_from");
      params.delete("date_to");
    } else {
      params.set("date_from", String(values[0].valueOf()));
      params.set("date_to", String(values[1].valueOf()));
    }
    params.set("page", "1");
    commitSearchParams(params);
  }

  function resetFilters() {
    setDrafts({
      address: "",
      domain: undefined,
      environment_id: undefined,
      has_attachments: undefined,
      has_matches: undefined,
      mailbox_pool_id: undefined,
      project_id: undefined,
      sender: "",
      subject: "",
    });
    commitSearchParams(new URLSearchParams({ page: "1" }));
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

  const matchedCount = useMemo(() => emails.filter(item => item.result_count > 0).length, [emails]);
  const attachmentCount = useMemo(() => emails.filter(item => item.has_attachments).length, [emails]);
  const {
    clearSelection: clearSelectedEmails,
    rowSelection,
    selectedItems: selectedEmails,
  } = useTableSelection(emails, "message_id");
  const emailRowSelection = canManageEmailSelection ? rowSelection : undefined;

  async function reloadAfterBatch(affectedCount: number) {
    clearSelectedEmails();
    if (affectedCount === emails.length && currentPage > 1) {
      const params = new URLSearchParams(searchParams);
      params.set("page", String(currentPage - 1));
      commitSearchParams(params);
      return;
    }

    await loadEmails();
  }

  async function handleBatchDelete() {
    if (!canDeleteEmailRecords) return;

    const operationNote = await promptOperationNote(modal, {
      title: "批量删除邮件",
      description: `将删除 ${selectedEmails.length} 封邮件并移入回收站。填写的备注会写入每封邮件的审计日志。`,
      okText: "确认批量删除",
    });
    if (operationNote === null) return;

    const result = await runBatchAction(
      selectedEmails,
      item => deleteEmail(item.message_id, { operation_note: operationNote }),
    );
    if (result.successCount > 0) {
      await reloadAfterBatch(result.successCount);
    }

    notifyBatchActionResult("批量删除", result);
  }

  async function handleBatchArchive() {
    if (!canArchiveEmails) return;

    const result = await runBatchAction(selectedEmails, item => archiveEmail(item.message_id));
    if (result.successCount > 0) {
      await reloadAfterBatch(result.successCount);
    }

    notifyBatchActionResult("批量归档", result);
  }

  const columns = buildEmailColumns({
    onCopyCode: (event, code) => void handleCopyCode(event, code),
    onOpenDetail: (event, messageId) => {
      event.stopPropagation();
      navigate(`/emails/${messageId}`);
    },
  });

  const dateRangeValue: RangePickerValue =
    searchParams.get("date_from") && searchParams.get("date_to")
      ? [dayjs(Number(searchParams.get("date_from"))), dayjs(Number(searchParams.get("date_to")))]
      : null;

  return (
    <div className="app-table-page">
      <PageHeader
        title="邮件"
        subtitle="按发件人、主题、作用域、附件、命中情况和时间范围筛选，并导出当前结果。"
        extra={(
          <Space wrap>
            <Button icon={<DownloadOutlined />} href={buildExportUrl("emails", "csv")}>
              导出 CSV
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void loadEmails()} loading={loading}>
              刷新
            </Button>
            <Button type="primary" onClick={() => navigate("/trash")}>
              回收站
            </Button>
            <Button onClick={() => navigate("/archives")}>
              归档
            </Button>
          </Space>
        )}
      />

      {!canManageEmailSelection ? (
        <Alert
          showIcon
          type="info"
          message={isReadOnly ? "当前账号在此页面为只读。" : "当前账号无法在此页面修改邮件。"}
          description="你仍可筛选、查看、复制验证码并导出结果，但归档、删除和批量写操作已禁用。"
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <EmailsMetrics
        attachmentCount={attachmentCount}
        domainCount={domains.length}
        matchedCount={matchedCount}
        total={total}
        visibleCount={emails.length}
      />

      <div style={{ marginBottom: 16 }}>
        <EmailsFilters
          catalog={catalog}
          dateRangeValue={dateRangeValue}
          domains={domains}
          drafts={drafts}
          loading={loading}
          onApply={() => applyFilters(1)}
          onDateRangeChange={updateDateRange}
          onDraftChange={updateDrafts}
          onReset={resetFilters}
        />
      </div>

      <DataTable
        style={{ flex: 1, minHeight: 0 }}
        cardTitle="邮件列表"
        cardToolbar={canManageEmailSelection ? (
          <BatchActionsBar selectedCount={selectedEmails.length} onClear={clearSelectedEmails}>
            {canArchiveEmails ? (
              <Button icon={<InboxOutlined />} onClick={() => void handleBatchArchive()} loading={loading}>
                批量归档
              </Button>
            ) : null}
            {canDeleteEmailRecords ? (
              <Button danger icon={<DeleteOutlined />} loading={loading} onClick={() => void handleBatchDelete()}>
                批量删除
              </Button>
            ) : null}
          </BatchActionsBar>
        ) : undefined}
        autoFitViewport
        columns={columns}
        dataSource={emails}
        loading={loading}
        rowSelection={emailRowSelection}
        rowKey="message_id"
        total={total}
        current={currentPage}
        pageSize={pageSize}
        onPageChange={page => applyFilters(page)}
        onRow={record => ({
          onClick: () => navigate(`/emails/${record.message_id}`),
        })}
      />
    </div>
  );
}
