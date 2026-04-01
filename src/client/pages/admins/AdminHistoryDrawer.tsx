import {
  CheckCircleOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Alert, Button, Input, Select, Space, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";

import {
  ROLE_LABELS,
  getActionColor,
  getActionLabel,
  renderAuditSummary,
  renderRawAuditDetail,
} from "../../audit-display";
import { summarizeAdminHistory } from "../../admin-history";
import { DataTable, DetailDrawer, MetricCard, MetricGrid, SearchToolbar } from "../../components";
import type { AdminUserRecord, AuditLogRecord } from "../../types";
import { formatDateTime } from "../../utils";
import { ADMIN_ROLE_LABELS, normalizeAdminRole } from "../../../utils/constants";

const MEMBER_HISTORY_ACTION_OPTIONS = [
  { label: "全部成员变更", value: "" },
  { label: "新增成员", value: "admin.create" },
  { label: "更新成员", value: "admin.update" },
];

const historyColumns: ColumnsType<AuditLogRecord> = [
  {
    title: "时间",
    dataIndex: "created_at",
    key: "created_at",
    width: 176,
    render: value => formatDateTime(value),
  },
  {
    title: "操作",
    dataIndex: "action",
    key: "action",
    width: 160,
    render: value => (
      <Tag color={getActionColor(String(value || ""))}>
        {getActionLabel(String(value || ""))}
      </Tag>
    ),
  },
  {
    title: "操作人",
    key: "actor",
    width: 160,
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

interface AdminHistoryDrawerProps {
  draftAction: string | null;
  draftKeyword: string;
  hasHistoryFilters: boolean;
  historyItems: AuditLogRecord[];
  historyLoading: boolean;
  historyPage: number;
  historyPageSize: number;
  historyTarget: AdminUserRecord | null;
  historyTotal: number;
  onApplyFilters: (page?: number) => void;
  onClose: () => void;
  onRefresh: () => void;
  onResetFilters: () => void;
  onUpdateDraftFilters: (patch: { action?: string | null; keyword?: string }) => void;
  open: boolean;
}

export function AdminHistoryDrawer({
  draftAction,
  draftKeyword,
  hasHistoryFilters,
  historyItems,
  historyLoading,
  historyPage,
  historyPageSize,
  historyTarget,
  historyTotal,
  onApplyFilters,
  onClose,
  onRefresh,
  onResetFilters,
  onUpdateDraftFilters,
  open,
}: AdminHistoryDrawerProps) {
  const historySummary = summarizeAdminHistory(historyItems);

  return historyTarget ? (
    <DetailDrawer
      title={`成员变更记录 · ${historyTarget.display_name}`}
      open={open}
      onClose={onClose}
      width="62vw"
      footer={(
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button onClick={onClose}>关闭</Button>
        </div>
      )}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
          }}
        >
          <Tag color="blue">{historyTarget.display_name}</Tag>
          <Tag>{historyTarget.username}</Tag>
          <Tag color="purple">{ADMIN_ROLE_LABELS[normalizeAdminRole(historyTarget.role) || "viewer"]}</Tag>
          <Tag color={historyTarget.access_scope === "bound" ? "gold" : "default"}>
            {historyTarget.access_scope === "bound" ? "项目绑定" : "全局"}
          </Tag>
          <Tag color={historyTarget.is_enabled ? "success" : "default"}>
            {historyTarget.is_enabled ? "启用" : "停用"}
          </Tag>
          {historyTarget.note ? <Tag color="cyan">{historyTarget.note}</Tag> : null}
          {historyTarget.projects.length > 0
            ? historyTarget.projects.map(project => <Tag key={`history-project-${project.id}`}>{project.name}</Tag>)
            : <Tag>未绑定项目</Tag>}
        </div>

        <MetricGrid minItemWidth={180}>
          <MetricCard
            title="治理记录"
            value={historyTotal}
            icon={<TeamOutlined />}
            percent={historyTotal > 0 ? 100 : 0}
            color="#1677ff"
          />
          <MetricCard
            title="角色调整"
            value={historySummary.roleChangeCount}
            icon={<UserOutlined />}
            percent={historySummary.total ? (historySummary.roleChangeCount / historySummary.total) * 100 : 0}
            color="#722ed1"
          />
          <MetricCard
            title="授权调整"
            value={historySummary.accessChangeCount}
            icon={<FolderOpenOutlined />}
            percent={historySummary.total ? (historySummary.accessChangeCount / historySummary.total) * 100 : 0}
            color="#fa8c16"
          />
          <MetricCard
            title="带备注操作"
            value={historySummary.operationNoteCount}
            icon={<CheckCircleOutlined />}
            percent={historySummary.total ? (historySummary.operationNoteCount / historySummary.total) * 100 : 0}
            color="#13c2c2"
          />
        </MetricGrid>

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
                placeholder="搜索操作备注、操作人或原始详情"
                prefix={<SearchOutlined />}
                value={draftKeyword}
                onChange={event => onUpdateDraftFilters({ keyword: event.target.value })}
                onPressEnter={() => onApplyFilters()}
              />
            </div>
            <div style={{ minWidth: 180, flex: "1 1 180px" }}>
              <Select
                value={draftAction || ""}
                options={MEMBER_HISTORY_ACTION_OPTIONS}
                onChange={value => onUpdateDraftFilters({ action: value || null })}
                style={{ width: "100%" }}
              />
            </div>
            <Space size={8}>
              <Button type="primary" onClick={() => onApplyFilters()} loading={historyLoading}>
                应用筛选
              </Button>
              <Button onClick={onResetFilters} disabled={!hasHistoryFilters && !draftAction && !draftKeyword}>
                重置
              </Button>
            </Space>
          </div>
        </SearchToolbar>

        {historySummary.latestOperationNote ? (
          <Alert
            type="info"
            showIcon
            message="最近操作备注"
            description={[
              historySummary.latestOperationNote,
              historySummary.latestOperationNoteActor ? `操作人：${historySummary.latestOperationNoteActor}` : "",
              historySummary.latestOperationNoteAt ? `时间：${formatDateTime(historySummary.latestOperationNoteAt)}` : "",
            ].filter(Boolean).join(" · ")}
          />
        ) : null}

        <DataTable
          cardTitle={`最近成员变更 (${historyItems.length}/${historyTotal})`}
          cardExtra={(
            <Button icon={<ReloadOutlined />} onClick={onRefresh}>
              刷新
            </Button>
          )}
          columns={historyColumns}
          current={historyPage}
          dataSource={historyItems}
          loading={historyLoading}
          onPageChange={nextPage => onApplyFilters(nextPage)}
          pageSize={historyPageSize}
          rowKey="id"
          total={historyTotal}
        />
      </div>
    </DetailDrawer>
  ) : null;
}
