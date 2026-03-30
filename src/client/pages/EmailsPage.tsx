import {
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  GlobalOutlined,
  PaperClipOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { App, Button, Col, DatePicker, Input, Popconfirm, Row, Select, Space, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { buildEmailSearchParams, buildExportUrl, deleteEmail, getEmails, getWorkspaceCatalog } from "../api";
import { BatchActionsBar, DataTable, MetricCard, PageHeader, SearchToolbar } from "../components";
import { useTableSelection } from "../hooks/useTableSelection";
import type { EmailSummary, WorkspaceCatalog } from "../types";
import { buildBatchActionMessage, formatDateTime, normalizeApiError, runBatchAction } from "../utils";

const { RangePicker } = DatePicker;

type RangePickerValue = ComponentProps<typeof RangePicker>["value"];
type RangePickerChangeValue = Parameters<NonNullable<ComponentProps<typeof RangePicker>["onChange"]>>[0];

const EMPTY_CATALOG: WorkspaceCatalog = {
  environments: [],
  mailbox_pools: [],
  projects: [],
};

interface EmailsPageProps {
  domains: string[];
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

export default function EmailsPage({ domains, onUnauthorized }: EmailsPageProps) {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [catalog, setCatalog] = useState<WorkspaceCatalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [drafts, setDrafts] = useState({
    address: searchParams.get("address") || "",
    domain: searchParams.get("domain") || undefined,
    environment_id: searchParams.get("environment_id") ? Number(searchParams.get("environment_id")) : undefined,
    has_attachments: searchParams.get("has_attachments") || undefined,
    has_matches: searchParams.get("has_matches") || undefined,
    mailbox_pool_id: searchParams.get("mailbox_pool_id") ? Number(searchParams.get("mailbox_pool_id")) : undefined,
    project_id: searchParams.get("project_id") ? Number(searchParams.get("project_id")) : undefined,
    sender: searchParams.get("sender") || "",
    subject: searchParams.get("subject") || "",
  });

  const parsedPage = Number.parseInt(searchParams.get("page") || "1", 10);
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  useEffect(() => {
    void loadWorkspaceCatalog();
  }, []);

  useEffect(() => {
    setDrafts({
      address: searchParams.get("address") || "",
      domain: searchParams.get("domain") || undefined,
      environment_id: searchParams.get("environment_id") ? Number(searchParams.get("environment_id")) : undefined,
      has_attachments: searchParams.get("has_attachments") || undefined,
      has_matches: searchParams.get("has_matches") || undefined,
      mailbox_pool_id: searchParams.get("mailbox_pool_id") ? Number(searchParams.get("mailbox_pool_id")) : undefined,
      project_id: searchParams.get("project_id") ? Number(searchParams.get("project_id")) : undefined,
      sender: searchParams.get("sender") || "",
      subject: searchParams.get("subject") || "",
    });
  }, [searchParams]);

  useEffect(() => {
    void loadEmails();
  }, [searchParams]);

  async function loadEmails() {
    setLoading(true);
    try {
      const params = new URLSearchParams(searchParams);
      if (!params.get("page")) params.set("page", "1");
      const payload = await getEmails(params);
      setEmails(payload.items);
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

  async function loadWorkspaceCatalog() {
    try {
      setCatalog(await getWorkspaceCatalog(true));
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
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
    setSearchParams(params);
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
    setSearchParams(params);
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
    setSearchParams(new URLSearchParams({ page: "1" }));
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

  const matchedCount = useMemo(() => emails.filter(item => item.result_count > 0).length, [emails]);
  const attachmentCount = useMemo(() => emails.filter(item => item.has_attachments).length, [emails]);
  const {
    clearSelection: clearSelectedEmails,
    rowSelection,
    selectedItems: selectedEmails,
  } = useTableSelection(emails, "message_id");

  async function reloadAfterBatch(affectedCount: number) {
    clearSelectedEmails();
    if (affectedCount === emails.length && currentPage > 1) {
      const params = new URLSearchParams(searchParams);
      params.set("page", String(currentPage - 1));
      setSearchParams(params);
      return;
    }

    await loadEmails();
  }

  async function handleBatchDelete() {
    const result = await runBatchAction(selectedEmails, item => deleteEmail(item.message_id));
    if (result.successCount > 0) {
      await reloadAfterBatch(result.successCount);
    }

    const messageText = buildBatchActionMessage("批量删除", result);
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
      title: "邮件主题",
      dataIndex: "subject",
      key: "subject",
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{record.subject || "(无主题)"}</Typography.Text>
          <Typography.Text type="secondary">{record.preview || "暂无正文预览"}</Typography.Text>
          {record.note ? <Typography.Text type="secondary">备注: {record.note}</Typography.Text> : null}
          {record.tags.length > 0 || record.extraction.platform || record.extraction.links.length > 0 || record.project_name || record.environment_name || record.mailbox_pool_name ? (
            <Space size={[0, 4]} wrap>
              {record.project_name ? (
                <Tag color="blue">{record.project_name}</Tag>
              ) : null}
              {record.environment_name ? (
                <Tag color="green">{record.environment_name}</Tag>
              ) : null}
              {record.mailbox_pool_name ? (
                <Tag color="purple">{record.mailbox_pool_name}</Tag>
              ) : null}
              {record.extraction.platform ? (
                <Tag color="geekblue">{record.extraction.platform}</Tag>
              ) : null}
              {record.extraction.links.length > 0 ? (
                <Tag color="cyan">
                  {record.extraction.primary_link?.label || "链接"} {record.extraction.links.length}
                </Tag>
              ) : null}
              {record.tags.map(tag => (
                <Tag key={`${record.message_id}-${tag}`} color="blue">
                  {tag}
                </Tag>
              ))}
            </Space>
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
      render: value => (value > 0 ? <Tag color="success">{value}</Tag> : <Tag>0</Tag>),
    },
    {
      title: "附件",
      dataIndex: "has_attachments",
      key: "has_attachments",
      width: 90,
      render: value => (value ? <Tag color="processing">有</Tag> : <Tag>无</Tag>),
    },
    {
      title: "接收时间",
      dataIndex: "received_at",
      key: "received_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      key: "action",
      width: 100,
      render: (_value, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={event => {
            event.stopPropagation();
            navigate(`/emails/${record.message_id}`);
          }}
        >
          查看
        </Button>
      ),
    },
  ];

  const dateRangeValue: RangePickerValue =
    searchParams.get("date_from") && searchParams.get("date_to")
      ? [dayjs(Number(searchParams.get("date_from"))) as Dayjs, dayjs(Number(searchParams.get("date_to"))) as Dayjs]
      : null;

  return (
    <div>
      <PageHeader
        title="邮件中心"
        subtitle="支持按发件人、主题、附件、命中结果和时间范围进行高级筛选，并导出当前库表数据。"
        extra={(
          <Space wrap>
            <Button icon={<DownloadOutlined />} href={buildExportUrl("emails", "csv")}>
              导出 CSV
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void loadEmails()}>
              刷新
            </Button>
            <Button type="primary" onClick={() => navigate("/trash")}>
              回收站
            </Button>
          </Space>
        )}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title="当前筛选总数"
            value={total}
            icon={<SearchOutlined />}
            percent={Math.min(100, total)}
            color="#1890ff"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title="当前页命中"
            value={matchedCount}
            icon={<CheckCircleOutlined />}
            percent={emails.length ? (matchedCount / emails.length) * 100 : 0}
            color="#52c41a"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title="当前页附件"
            value={attachmentCount}
            icon={<PaperClipOutlined />}
            percent={emails.length ? (attachmentCount / emails.length) * 100 : 0}
            color="#fa8c16"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title="可用域名"
            value={domains.length}
            icon={<GlobalOutlined />}
            percent={Math.min(100, domains.length * 20)}
            color="#722ed1"
          />
        </Col>
      </Row>

      <div style={{ marginBottom: 16 }}>
        <SearchToolbar>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 170, flex: "1 1 170px" }}>
              <Input
                placeholder="完整邮箱地址"
                value={drafts.address}
                onChange={event => setDrafts(state => ({ ...state, address: event.target.value }))}
              />
            </div>
            <div style={{ minWidth: 150, flex: "1 1 150px" }}>
              <Input
                placeholder="发件人"
                value={drafts.sender}
                onChange={event => setDrafts(state => ({ ...state, sender: event.target.value }))}
              />
            </div>
            <div style={{ minWidth: 150, flex: "1 1 150px" }}>
              <Input
                placeholder="主题关键词"
                value={drafts.subject}
                onChange={event => setDrafts(state => ({ ...state, subject: event.target.value }))}
              />
            </div>
            <div style={{ minWidth: 130, flex: "1 1 130px" }}>
              <Select
                allowClear
                placeholder="域名"
                value={drafts.domain}
                options={domains.map(item => ({ label: item, value: item }))}
                onChange={value => setDrafts(state => ({ ...state, domain: value }))}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ minWidth: 150, flex: "1 1 150px" }}>
              <Select
                allowClear
                placeholder="项目"
                value={drafts.project_id}
                options={catalog.projects.map(item => ({ label: item.is_enabled ? item.name : `${item.name}（已停用）`, value: item.id }))}
                onChange={value => setDrafts(state => ({
                  ...state,
                  environment_id: undefined,
                  mailbox_pool_id: undefined,
                  project_id: value,
                }))}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ minWidth: 150, flex: "1 1 150px" }}>
              <Select
                allowClear
                placeholder="环境"
                value={drafts.environment_id}
                options={catalog.environments
                  .filter(item => !drafts.project_id || item.project_id === drafts.project_id)
                  .map(item => ({ label: item.is_enabled ? item.name : `${item.name}（已停用）`, value: item.id }))}
                onChange={value => setDrafts(state => ({
                  ...state,
                  environment_id: value,
                  mailbox_pool_id: undefined,
                }))}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ minWidth: 160, flex: "1 1 160px" }}>
              <Select
                allowClear
                placeholder="邮箱池"
                value={drafts.mailbox_pool_id}
                options={catalog.mailbox_pools
                  .filter(item => !drafts.project_id || item.project_id === drafts.project_id)
                  .filter(item => !drafts.environment_id || item.environment_id === drafts.environment_id)
                  .map(item => ({ label: item.is_enabled ? item.name : `${item.name}（已停用）`, value: item.id }))}
                onChange={value => setDrafts(state => ({ ...state, mailbox_pool_id: value }))}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ minWidth: 130, flex: "1 1 130px" }}>
              <Select
                allowClear
                placeholder="是否命中规则"
                value={drafts.has_matches}
                options={[
                  { label: "已命中", value: "1" },
                  { label: "未命中", value: "0" },
                ]}
                onChange={value => setDrafts(state => ({ ...state, has_matches: value }))}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ minWidth: 130, flex: "1 1 130px" }}>
              <Select
                allowClear
                placeholder="是否带附件"
                value={drafts.has_attachments}
                options={[
                  { label: "有附件", value: "1" },
                  { label: "无附件", value: "0" },
                ]}
                onChange={value => setDrafts(state => ({ ...state, has_attachments: value }))}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ minWidth: 260, flex: "1 1 260px" }}>
              <RangePicker showTime value={dateRangeValue} onChange={updateDateRange} style={{ width: "100%" }} />
            </div>
            <Space size={8}>
              <Button type="primary" onClick={() => applyFilters(1)}>
                应用筛选
              </Button>
              <Button onClick={resetFilters}>重置</Button>
            </Space>
          </div>
        </SearchToolbar>
      </div>

      <DataTable
        cardTitle="邮件列表"
        cardToolbar={(
          <BatchActionsBar selectedCount={selectedEmails.length} onClear={clearSelectedEmails}>
            <Popconfirm
              title={`确定删除选中的 ${selectedEmails.length} 封邮件吗？`}
              onConfirm={() => void handleBatchDelete()}
            >
              <Button danger icon={<DeleteOutlined />}>
                批量删除
              </Button>
            </Popconfirm>
          </BatchActionsBar>
        )}
        columns={columns}
        dataSource={emails}
        loading={loading}
        rowSelection={rowSelection}
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
