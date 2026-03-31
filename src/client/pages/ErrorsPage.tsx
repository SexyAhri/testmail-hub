import {
  AppstoreOutlined,
  BugOutlined,
  CloudServerOutlined,
  CopyOutlined,
  EyeOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { Alert, App, Button, Descriptions, Input, Select, Space, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getErrorEvents } from "../api";
import { DataTable, DetailDrawer, MetricCard, MetricGrid, PageHeader, SearchToolbar } from "../components";
import { canManageGlobalSettings, isProjectScopedUser, isReadOnlyUser, type CurrentUser } from "../permissions";
import type { ErrorEventsPayload, ErrorEventRecord, ErrorEventSummary } from "../types";
import { formatDateTime, normalizeApiError } from "../utils";

const { Paragraph, Text } = Typography;

interface ErrorsPageProps {
  currentUser?: CurrentUser;
  onUnauthorized: () => void;
}

const EMPTY_SUMMARY: ErrorEventSummary = {
  admin_total: 0,
  auth_total: 0,
  latest_created_at: null,
  outbound_total: 0,
  recent_24h_total: 0,
  sync_total: 0,
  total: 0,
  unique_sources: 0,
};

const SOURCE_NAME_MAP: Record<string, string> = {
  "admin.create_failed": "管理员新增失败",
  "auth.login_failed": "登录失败",
  "auth.permission_denied": "权限拒绝",
  "mailbox.cloudflare_sync_failed": "邮箱同步 Cloudflare 失败",
  "outbound.resend_send_failed": "Resend 发信失败",
};

function normalizeSearchValue(value: string | null) {
  const normalized = String(value || "").trim();
  return normalized || undefined;
}

function getCurrentPage(value: string | null) {
  const page = Number.parseInt(value || "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function getSourceMeta(source: string) {
  if (source.startsWith("auth.")) return { color: "red", label: "鉴权" };
  if (source.startsWith("admin.")) return { color: "orange", label: "管理" };
  if (source.startsWith("mailbox.") || source.startsWith("cloudflare.")) return { color: "cyan", label: "邮箱同步" };
  if (source.startsWith("outbound.")) return { color: "purple", label: "发信" };
  if (source.startsWith("notification.")) return { color: "gold", label: "通知" };
  return { color: "default", label: "系统" };
}

function formatSourceName(source: string) {
  if (SOURCE_NAME_MAP[source]) return SOURCE_NAME_MAP[source];
  return source
    .split(".")
    .map(part => part.replace(/_/g, " "))
    .join(" / ");
}

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function buildContextPreview(value: unknown) {
  const normalized = stringifyJson(value).replace(/\s+/g, " ").trim();
  if (!normalized || normalized === "{}" || normalized === "[]") return "无附加上下文";
  return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized;
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

export default function ErrorsPage({ currentUser, onUnauthorized }: ErrorsPageProps) {
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ErrorEventRecord[]>([]);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [summary, setSummary] = useState<ErrorEventSummary>(EMPTY_SUMMARY);
  const [detailRecord, setDetailRecord] = useState<ErrorEventRecord | null>(null);
  const [draftKeyword, setDraftKeyword] = useState(searchParams.get("keyword") || "");
  const [draftSource, setDraftSource] = useState<string | undefined>(normalizeSearchValue(searchParams.get("source")));
  const canAccessSystemErrors = canManageGlobalSettings(currentUser);
  const isReadOnly = isReadOnlyUser(currentUser);
  const isProjectScoped = isProjectScopedUser(currentUser);

  const currentPage = useMemo(() => getCurrentPage(searchParams.get("page")), [searchParams]);
  const activeKeyword = useMemo(() => normalizeSearchValue(searchParams.get("keyword")), [searchParams]);
  const activeSource = useMemo(() => normalizeSearchValue(searchParams.get("source")), [searchParams]);

  useEffect(() => {
    setDraftKeyword(searchParams.get("keyword") || "");
    setDraftSource(normalizeSearchValue(searchParams.get("source")));
  }, [searchParams]);

  useEffect(() => {
    if (!canAccessSystemErrors) return;
    void loadData();
  }, [canAccessSystemErrors, searchParams]);

  async function loadData() {
    setLoading(true);
    try {
      const payload = await getErrorEvents({
        keyword: activeKeyword,
        page: currentPage,
        source: activeSource,
      });

      applyPayload(payload);
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

  function applyPayload(payload: ErrorEventsPayload) {
    setItems(payload.items);
    setPageSize(payload.pageSize);
    setSourceOptions(payload.source_options);
    setSummary(payload.summary || EMPTY_SUMMARY);
    setTotal(payload.total);
  }

  function applyFilters(nextPage = 1) {
    const nextParams = new URLSearchParams();
    if (draftKeyword.trim()) nextParams.set("keyword", draftKeyword.trim());
    if (draftSource) nextParams.set("source", draftSource);
    nextParams.set("page", String(nextPage));
    setSearchParams(nextParams);
  }

  function resetFilters() {
    setDraftKeyword("");
    setDraftSource(undefined);
    setSearchParams(new URLSearchParams({ page: "1" }));
  }

  async function handleCopy(content: string, label: string) {
    try {
      await copyText(content);
      message.success(`${label}已复制`);
    } catch (error) {
      message.error(normalizeApiError(error, `${label}复制失败`));
    }
  }

  const latestTag = summary.latest_created_at ? formatDateTime(summary.latest_created_at) : "暂无异常记录";
  const combinedSecurityTotal = summary.auth_total + summary.admin_total;
  const combinedDeliveryTotal = summary.sync_total + summary.outbound_total;

  const columns: ColumnsType<ErrorEventRecord> = [
    {
      title: "时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 176,
      render: value => formatDateTime(value),
    },
    {
      title: "来源",
      dataIndex: "source",
      key: "source",
      width: 220,
      render: value => {
        const meta = getSourceMeta(String(value || ""));
        return (
          <Space direction="vertical" size={4}>
            <Space size={6} wrap>
              <Tag color={meta.color}>{meta.label}</Tag>
              <Text strong>{formatSourceName(String(value || ""))}</Text>
            </Space>
            <Text code>{String(value || "-")}</Text>
          </Space>
        );
      },
    },
    {
      title: "错误摘要",
      dataIndex: "message",
      key: "message",
      render: (_value, record) => (
        <Space direction="vertical" size={4}>
          <Text strong>{record.message || "-"}</Text>
          <Text type="secondary">{buildContextPreview(record.context_json)}</Text>
        </Space>
      ),
    },
    {
      title: "详情",
      key: "action",
      width: 92,
      render: (_value, record) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailRecord(record)}>
          查看
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="系统日志中心"
        subtitle="集中查看登录失败、权限拒绝、管理员新增失败、邮箱同步失败和发信失败等关键异常。"
        tags={[
          { color: "blue", label: `来源 ${summary.unique_sources}` },
          { color: "magenta", label: `最近异常 ${latestTag}` },
          ...(!canAccessSystemErrors ? [{ color: "gold", label: "受限视角" }] : []),
        ]}
        extra={(
          <Button icon={<ReloadOutlined />} disabled={!canAccessSystemErrors} onClick={() => void loadData()}>
            刷新日志
          </Button>
        )}
      />

      {!canAccessSystemErrors ? (
        <Alert
          showIcon
          type="warning"
          message="当前账号不能访问系统日志"
          description={
            isReadOnly
              ? "只读角色暂不开放系统日志读取权限。"
              : isProjectScoped
                ? "项目级管理员不能查看全平台系统日志。"
                : "当前账号没有权限访问系统日志。"
          }
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {canAccessSystemErrors ? (
      <MetricGrid minItemWidth={220}>
        <MetricCard
          title="当前筛选异常数"
          value={summary.total}
          icon={<BugOutlined />}
          percent={summary.total > 0 ? 100 : 0}
          color="#ff4d4f"
        />
        <MetricCard
          title="近 24 小时"
          value={summary.recent_24h_total}
          icon={<AppstoreOutlined />}
          percent={summary.total > 0 ? (summary.recent_24h_total / summary.total) * 100 : 0}
          color="#1677ff"
        />
        <MetricCard
          title="鉴权 / 管理异常"
          value={combinedSecurityTotal}
          icon={<SafetyCertificateOutlined />}
          percent={summary.total > 0 ? (combinedSecurityTotal / summary.total) * 100 : 0}
          color="#fa8c16"
        />
        <MetricCard
          title="同步 / 发信异常"
          value={combinedDeliveryTotal}
          icon={<CloudServerOutlined />}
          percent={summary.total > 0 ? (combinedDeliveryTotal / summary.total) * 100 : 0}
          color="#722ed1"
        />
        <MetricCard
          title="发信失败"
          value={summary.outbound_total}
          icon={<SendOutlined />}
          percent={summary.total > 0 ? (summary.outbound_total / summary.total) * 100 : 0}
          color="#13c2c2"
        />
      </MetricGrid>
      ) : null}

      {canAccessSystemErrors ? (
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
            <div style={{ minWidth: 220, flex: "1 1 220px" }}>
              <Input
                allowClear
                placeholder="搜索来源、错误消息、上下文或堆栈"
                prefix={<SearchOutlined />}
                value={draftKeyword}
                onChange={event => setDraftKeyword(event.target.value)}
                onPressEnter={() => applyFilters(1)}
              />
            </div>
            <div style={{ minWidth: 220, flex: "1 1 220px" }}>
              <Select
                allowClear
                placeholder="按来源筛选"
                value={draftSource}
                options={sourceOptions.map(item => ({
                  label: `${formatSourceName(item)} (${item})`,
                  value: item,
                }))}
                onChange={value => setDraftSource(value)}
                style={{ width: "100%" }}
              />
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
      ) : null}

      {canAccessSystemErrors ? (
      <DataTable
        cardTitle="错误事件列表"
        cardToolbar={(
          <Space size={[8, 8]} wrap>
            <Tag color="red">鉴权 {summary.auth_total}</Tag>
            <Tag color="orange">管理员 {summary.admin_total}</Tag>
            <Tag color="cyan">邮箱同步 {summary.sync_total}</Tag>
            <Tag color="purple">发信 {summary.outbound_total}</Tag>
            {activeSource ? <Tag color="processing">当前来源: {activeSource}</Tag> : null}
            {activeKeyword ? <Tag color="blue">关键字: {activeKeyword}</Tag> : null}
          </Space>
        )}
        columns={columns}
        dataSource={items}
        loading={loading}
        rowKey="id"
        total={total}
        current={currentPage}
        pageSize={pageSize}
        onPageChange={nextPage => applyFilters(nextPage)}
      />
      ) : null}

      <DetailDrawer
        title={detailRecord ? `日志详情 #${detailRecord.id}` : "日志详情"}
        open={Boolean(detailRecord)}
        onClose={() => setDetailRecord(null)}
        width="60vw"
      >
        {detailRecord ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="时间">{formatDateTime(detailRecord.created_at)}</Descriptions.Item>
              <Descriptions.Item label="事件编号">{detailRecord.id}</Descriptions.Item>
              <Descriptions.Item label="事件分类">
                <Tag color={getSourceMeta(detailRecord.source).color}>{getSourceMeta(detailRecord.source).label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="来源标识">
                <Text code>{detailRecord.source}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="事件名称" span={2}>
                {formatSourceName(detailRecord.source)}
              </Descriptions.Item>
              <Descriptions.Item label="错误消息" span={2}>
                {detailRecord.message || "-"}
              </Descriptions.Item>
            </Descriptions>

            <div>
              <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
                <Text strong>上下文 JSON</Text>
                <Button
                  type="link"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => void handleCopy(stringifyJson(detailRecord.context_json), "上下文")}
                >
                  复制上下文
                </Button>
              </Space>
              <div
                style={{
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 10,
                  background: "#fafafa",
                  maxHeight: 260,
                  overflow: "auto",
                }}
              >
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {stringifyJson(detailRecord.context_json)}
                </pre>
              </div>
            </div>

            <div>
              <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
                <Text strong>异常堆栈</Text>
                <Button
                  type="link"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => void handleCopy(detailRecord.stack || "-", "堆栈")}
                >
                  复制堆栈
                </Button>
              </Space>
              <div
                style={{
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 10,
                  background: "#fafafa",
                  maxHeight: 320,
                  overflow: "auto",
                }}
              >
                <Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {detailRecord.stack || "-"}
                </Paragraph>
              </div>
            </div>
          </Space>
        ) : null}
      </DetailDrawer>
    </div>
  );
}
