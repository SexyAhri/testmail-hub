import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, App, Button, Input, Select, Space, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getErrorEvents } from "../../api/observability";
import { DataTable, PageHeader, SearchToolbar } from "../../components";
import { usePageFeedback } from "../../hooks/usePageFeedback";
import {
  canManageGlobalSettings,
  isProjectScopedUser,
  isReadOnlyUser,
  type CurrentUser,
} from "../../permissions";
import type { ErrorEventRecord, ErrorEventsPayload } from "../../types";
import { copyText, formatDateTime, normalizeApiError } from "../../utils";
import { ErrorDetailDrawer } from "./ErrorDetailDrawer";
import { buildErrorColumns } from "./error-table-columns";
import { ErrorsMetrics } from "./ErrorsMetrics";
import {
  EMPTY_SUMMARY,
  formatSourceName,
  getCurrentPage,
  normalizeSearchValue,
} from "./errors-utils";

interface ErrorsPageProps {
  currentUser?: CurrentUser;
  onUnauthorized: () => void;
}

export default function ErrorsPage({ currentUser, onUnauthorized }: ErrorsPageProps) {
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ErrorEventRecord[]>([]);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [detailRecord, setDetailRecord] = useState<ErrorEventRecord | null>(null);
  const [draftKeyword, setDraftKeyword] = useState(searchParams.get("keyword") || "");
  const [draftSource, setDraftSource] = useState<string | undefined>(normalizeSearchValue(searchParams.get("source")));
  const { handlePageError } = usePageFeedback(onUnauthorized);
  const canAccessSystemErrors = canManageGlobalSettings(currentUser);
  const isReadOnly = isReadOnlyUser(currentUser);
  const isProjectScoped = isProjectScopedUser(currentUser);

  const currentPage = useMemo(() => getCurrentPage(searchParams.get("page")), [searchParams]);
  const activeKeyword = useMemo(() => normalizeSearchValue(searchParams.get("keyword")), [searchParams]);
  const activeSource = useMemo(() => normalizeSearchValue(searchParams.get("source")), [searchParams]);
  const latestTag = summary.latest_created_at ? formatDateTime(summary.latest_created_at) : "暂无异常记录";

  useEffect(() => {
    setDraftKeyword(searchParams.get("keyword") || "");
    setDraftSource(normalizeSearchValue(searchParams.get("source")));
  }, [searchParams]);

  useEffect(() => {
    if (!canAccessSystemErrors) return;
    void loadData();
  }, [canAccessSystemErrors, searchParams]);

  async function loadData(paramsSource: URLSearchParams = searchParams) {
    setLoading(true);
    try {
      const params = new URLSearchParams(paramsSource);
      const payload = await getErrorEvents({
        keyword: normalizeSearchValue(params.get("keyword")),
        page: getCurrentPage(params.get("page")),
        source: normalizeSearchValue(params.get("source")),
      });
      applyPayload(payload);
    } catch (error) {
      handlePageError(error);
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

  function commitSearchParams(nextParams: URLSearchParams) {
    setLoading(true);
    if (nextParams.toString() === searchParams.toString()) {
      void loadData(nextParams);
      return;
    }
    setSearchParams(nextParams);
  }

  function applyFilters(nextPage = 1) {
    const nextParams = new URLSearchParams();
    if (draftKeyword.trim()) nextParams.set("keyword", draftKeyword.trim());
    if (draftSource) nextParams.set("source", draftSource);
    nextParams.set("page", String(nextPage));
    commitSearchParams(nextParams);
  }

  function resetFilters() {
    setDraftKeyword("");
    setDraftSource(undefined);
    commitSearchParams(new URLSearchParams({ page: "1" }));
  }

  async function handleCopy(content: string, label: string) {
    try {
      await copyText(content);
      message.success(`${label}已复制`);
    } catch (error) {
      message.error(normalizeApiError(error, `${label}复制失败`));
    }
  }

  const columns = buildErrorColumns({
    onOpenDetail: record => setDetailRecord(record),
  });

  return (
    <div className="app-table-page">
      <PageHeader
        title="系统日志中心"
        subtitle="集中查看登录失败、权限拒绝、管理员新增失败、邮箱同步失败和发信失败等关键异常。"
        tags={[
          { color: "blue", label: `来源 ${summary.unique_sources}` },
          { color: "magenta", label: `最近异常 ${latestTag}` },
          ...(!canAccessSystemErrors ? [{ color: "gold", label: "受限视角" }] : []),
        ]}
        extra={(
          <Button icon={<ReloadOutlined />} disabled={!canAccessSystemErrors} onClick={() => void loadData()} loading={loading}>
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

      {canAccessSystemErrors ? <ErrorsMetrics summary={summary} /> : null}

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
                <Button type="primary" onClick={() => applyFilters(1)} loading={loading}>
                  应用筛选
                </Button>
                <Button onClick={resetFilters} disabled={loading}>
                  重置
                </Button>
              </Space>
            </div>
          </SearchToolbar>
        </div>
      ) : null}

      {canAccessSystemErrors ? (
        <DataTable
          style={{ flex: 1, minHeight: 0 }}
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
          autoFitViewport
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

      <ErrorDetailDrawer
        record={detailRecord}
        onClose={() => setDetailRecord(null)}
        onCopy={(content, label) => void handleCopy(content, label)}
      />
    </div>
  );
}
