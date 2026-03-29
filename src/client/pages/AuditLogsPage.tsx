import { App } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";

import { getAuditLogs } from "../api";
import { DataTable, PageHeader } from "../components";
import type { AuditLogRecord } from "../types";
import { formatDateTime, normalizeApiError } from "../utils";

interface AuditLogsPageProps {
  onUnauthorized: () => void;
}

export default function AuditLogsPage({ onUnauthorized }: AuditLogsPageProps) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AuditLogRecord[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    void loadData(page);
  }, [page]);

  async function loadData(nextPage: number) {
    setLoading(true);
    try {
      const payload = await getAuditLogs(nextPage);
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

  const columns: ColumnsType<AuditLogRecord> = [
    { title: "时间", dataIndex: "created_at", key: "created_at", width: 180, render: value => formatDateTime(value) },
    { title: "操作", dataIndex: "action", key: "action", width: 160 },
    { title: "操作者", dataIndex: "actor_name", key: "actor_name" },
    { title: "角色", dataIndex: "actor_role", key: "actor_role", width: 100 },
    { title: "实体类型", dataIndex: "entity_type", key: "entity_type", width: 140 },
    { title: "实体 ID", dataIndex: "entity_id", key: "entity_id", width: 180, render: value => value || "-" },
    { title: "详情", dataIndex: "detail_json", key: "detail_json", render: value => <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(value, null, 2)}</pre> },
  ];

  return (
    <div>
      <PageHeader title="审计日志" subtitle="查看所有后台变更行为，便于追踪规则、白名单、邮箱和管理员操作" />
      <DataTable
        cardTitle="审计日志"
        columns={columns}
        dataSource={items}
        loading={loading}
        rowKey="id"
        total={total}
        current={page}
        pageSize={pageSize}
        onPageChange={nextPage => setPage(nextPage)}
      />
    </div>
  );
}
