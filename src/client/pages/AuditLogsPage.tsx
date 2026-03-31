import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, App, Button, Input, Select, Space, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  AUDIT_ACTION_PREFIX_OPTIONS,
  AUDIT_ENTITY_OPTIONS,
  ROLE_LABELS,
  getActionColor,
  getActionLabel,
  getEntityLabel,
  renderAuditSummary,
  renderRawAuditDetail,
} from "../audit-display";
import { getAuditLogs } from "../api";
import { DataTable, PageHeader, SearchToolbar } from "../components";
import {
  canManageGlobalSettings,
  isProjectScopedUser,
  isReadOnlyUser,
  type CurrentUser,
} from "../permissions";
import type { AuditLogRecord } from "../types";
import { formatDateTime, normalizeApiError } from "../utils";

interface AuditLogsPageProps {
  currentUser?: CurrentUser;
  onUnauthorized: () => void;
}

function normalizeSearchValue(value: string | null) {
  const normalized = String(value || "").trim();
  return normalized || undefined;
}

function getCurrentPage(value: string | null) {
  const page = Number.parseInt(value || "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export default function AuditLogsPage({ currentUser, onUnauthorized }: AuditLogsPageProps) {
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AuditLogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [draftKeyword, setDraftKeyword] = useState(searchParams.get("keyword") || "");
  const [draftEntityType, setDraftEntityType] = useState<string | undefined>(
    normalizeSearchValue(searchParams.get("entity_type")),
  );
  const [draftActionPrefix, setDraftActionPrefix] = useState<string | undefined>(
    normalizeSearchValue(searchParams.get("action_prefix")),
  );
  const canAccessAuditLogs = canManageGlobalSettings(currentUser);
  const isReadOnly = isReadOnlyUser(currentUser);
  const isProjectScoped = isProjectScopedUser(currentUser);

  const currentPage = useMemo(() => getCurrentPage(searchParams.get("page")), [searchParams]);
  const activeKeyword = useMemo(() => normalizeSearchValue(searchParams.get("keyword")), [searchParams]);
  const activeEntityType = useMemo(() => normalizeSearchValue(searchParams.get("entity_type")), [searchParams]);
  const activeActionPrefix = useMemo(() => normalizeSearchValue(searchParams.get("action_prefix")), [searchParams]);

  useEffect(() => {
    setDraftKeyword(searchParams.get("keyword") || "");
    setDraftEntityType(normalizeSearchValue(searchParams.get("entity_type")));
    setDraftActionPrefix(normalizeSearchValue(searchParams.get("action_prefix")));
  }, [searchParams]);

  useEffect(() => {
    if (!canAccessAuditLogs) return;
    void loadData();
  }, [canAccessAuditLogs, searchParams]);

  async function loadData() {
    setLoading(true);
    try {
      const payload = await getAuditLogs(currentPage, {
        action_prefix: activeActionPrefix,
        entity_type: activeEntityType,
        keyword: activeKeyword,
      });
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

  function applyFilters(nextPage = 1) {
    const nextParams = new URLSearchParams();
    if (draftKeyword.trim()) nextParams.set("keyword", draftKeyword.trim());
    if (draftEntityType) nextParams.set("entity_type", draftEntityType);
    if (draftActionPrefix) nextParams.set("action_prefix", draftActionPrefix);
    nextParams.set("page", String(nextPage));
    setSearchParams(nextParams);
  }

  function resetFilters() {
    setDraftKeyword("");
    setDraftEntityType(undefined);
    setDraftActionPrefix(undefined);
    setSearchParams(new URLSearchParams({ page: "1" }));
  }

  const columns: ColumnsType<AuditLogRecord> = [
    {
      title: "时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      dataIndex: "action",
      key: "action",
      width: 180,
      render: value => (
        <Tag color={getActionColor(String(value || ""))}>
          {getActionLabel(String(value || ""))}
        </Tag>
      ),
    },
    {
      title: "操作人",
      key: "actor",
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <span>{record.actor_name || "-"}</span>
          <Tag style={{ marginInlineEnd: 0, width: "fit-content" }}>
            {ROLE_LABELS[record.actor_role] || record.actor_role || "未知角色"}
          </Tag>
        </Space>
      ),
    },
    {
      title: "实体",
      key: "entity",
      width: 200,
      render: (_, record) => (
        <Space size={[4, 4]} wrap>
          <Tag color="blue">{getEntityLabel(record)}</Tag>
          {record.entity_id ? <Tag>{record.entity_id}</Tag> : null}
        </Space>
      ),
    },
    {
      title: "摘要",
      key: "summary",
      render: (_, record) => renderAuditSummary(record),
    },
    {
      title: "详情",
      dataIndex: "detail_json",
      key: "detail_json",
      width: 220,
      render: value => renderRawAuditDetail(value),
    },
  ];

  return (
    <div>
      <PageHeader
        title="审计日志"
        subtitle="集中查看后台关键变更记录。成员治理、域名治理、项目配置和自动化接入动作都会在这里留痕。"
        extra={canAccessAuditLogs ? (
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>
            刷新
          </Button>
        ) : undefined}
        tags={!canAccessAuditLogs ? [{ color: "gold", label: "受限视角" }] : undefined}
      />

      {!canAccessAuditLogs ? (
        <Alert
          showIcon
          type="warning"
          message="当前账号不能访问审计日志"
          description={
            isReadOnly
              ? "只读角色暂不开放审计日志读取权限。"
              : isProjectScoped
                ? "项目级管理员不能查看全平台审计日志。"
                : "当前账号没有权限访问审计日志。"
          }
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {canAccessAuditLogs ? (
        <>
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
                <div style={{ minWidth: 280, flex: "1 1 280px" }}>
                  <Input
                    allowClear
                    placeholder="搜索操作人、动作、实体 ID 或原始详情"
                    prefix={<SearchOutlined />}
                    value={draftKeyword}
                    onChange={event => setDraftKeyword(event.target.value)}
                    onPressEnter={() => applyFilters()}
                  />
                </div>
                <div style={{ minWidth: 180, flex: "1 1 180px" }}>
                  <Select
                    allowClear
                    placeholder="实体类型"
                    value={draftEntityType}
                    options={AUDIT_ENTITY_OPTIONS}
                    onChange={value => setDraftEntityType(value || undefined)}
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ minWidth: 180, flex: "1 1 180px" }}>
                  <Select
                    allowClear
                    placeholder="动作域"
                    value={draftActionPrefix}
                    options={AUDIT_ACTION_PREFIX_OPTIONS}
                    onChange={value => setDraftActionPrefix(value || undefined)}
                    style={{ width: "100%" }}
                  />
                </div>
                <Space size={8}>
                  <Button type="primary" onClick={() => applyFilters()}>
                    应用筛选
                  </Button>
                  <Button onClick={resetFilters}>重置</Button>
                </Space>
              </div>
            </SearchToolbar>
          </div>

          <DataTable
            cardTitle="审计日志总览"
            columns={columns}
            current={currentPage}
            dataSource={items}
            loading={loading}
            onPageChange={nextPage => applyFilters(nextPage)}
            pageSize={pageSize}
            rowKey="id"
            total={total}
          />
        </>
      ) : null}
    </div>
  );
}
