import { Tag } from "antd";
import type { ColumnsType } from "antd/es/table";

import { ActionButtons } from "../../components";
import type {
  MailboxPoolRecord,
  WorkspaceEnvironmentRecord,
  WorkspaceProjectRecord,
} from "../../types";
import { formatDateTime } from "../../utils";
import { renderRetentionSummary } from "./workspace-retention";

interface WorkspaceColumnOptions<T> {
  canManage: boolean;
  deleteConfirmTitle: string;
  onDelete: (record: T) => void;
  onEdit: (record: T) => void;
}

export function buildProjectColumns({
  canManage,
  deleteConfirmTitle,
  onDelete,
  onEdit,
}: WorkspaceColumnOptions<WorkspaceProjectRecord>): ColumnsType<WorkspaceProjectRecord> {
  return [
    { title: "项目名称", dataIndex: "name", key: "name" },
    { title: "标识", dataIndex: "slug", key: "slug", render: value => <span style={{ fontFamily: "monospace" }}>{value}</span> },
    { title: "描述", dataIndex: "description", key: "description", render: value => value || "-" },
    { title: "生命周期策略", dataIndex: "resolved_retention", key: "resolved_retention", render: value => renderRetentionSummary(value) },
    { title: "环境数", dataIndex: "environment_count", key: "environment_count", width: 90 },
    { title: "邮箱池", dataIndex: "mailbox_pool_count", key: "mailbox_pool_count", width: 90 },
    { title: "邮箱数", dataIndex: "mailbox_count", key: "mailbox_count", width: 90 },
    { title: "状态", dataIndex: "is_enabled", key: "is_enabled", width: 90, render: value => value ? "启用" : "停用" },
    { title: "更新时间", dataIndex: "updated_at", key: "updated_at", width: 180, render: value => formatDateTime(value) },
    {
      title: "操作",
      key: "action",
      width: 120,
      render: (_value, record) => (
        canManage ? (
          <ActionButtons
            onEdit={() => onEdit(record)}
            onDelete={() => onDelete(record)}
            deleteConfirmTitle={deleteConfirmTitle}
          />
        ) : (
          <span style={{ color: "#999" }}>只读</span>
        )
      ),
    },
  ];
}

export function buildEnvironmentColumns({
  canManage,
  deleteConfirmTitle,
  onDelete,
  onEdit,
}: WorkspaceColumnOptions<WorkspaceEnvironmentRecord>): ColumnsType<WorkspaceEnvironmentRecord> {
  return [
    { title: "所属项目", dataIndex: "project_name", key: "project_name" },
    { title: "环境名称", dataIndex: "name", key: "name" },
    { title: "标识", dataIndex: "slug", key: "slug", render: value => <span style={{ fontFamily: "monospace" }}>{value}</span> },
    { title: "描述", dataIndex: "description", key: "description", render: value => value || "-" },
    { title: "生命周期策略", dataIndex: "resolved_retention", key: "resolved_retention", render: value => renderRetentionSummary(value) },
    { title: "邮箱池", dataIndex: "mailbox_pool_count", key: "mailbox_pool_count", width: 90 },
    { title: "邮箱数", dataIndex: "mailbox_count", key: "mailbox_count", width: 90 },
    { title: "状态", dataIndex: "is_enabled", key: "is_enabled", width: 90, render: value => value ? "启用" : "停用" },
    { title: "更新时间", dataIndex: "updated_at", key: "updated_at", width: 180, render: value => formatDateTime(value) },
    {
      title: "操作",
      key: "action",
      width: 120,
      render: (_value, record) => (
        canManage ? (
          <ActionButtons
            onEdit={() => onEdit(record)}
            onDelete={() => onDelete(record)}
            deleteConfirmTitle={deleteConfirmTitle}
          />
        ) : (
          <span style={{ color: "#999" }}>只读</span>
        )
      ),
    },
  ];
}

export function buildMailboxPoolColumns({
  canManage,
  deleteConfirmTitle,
  onDelete,
  onEdit,
}: WorkspaceColumnOptions<MailboxPoolRecord>): ColumnsType<MailboxPoolRecord> {
  return [
    { title: "所属项目", dataIndex: "project_name", key: "project_name" },
    { title: "所属环境", dataIndex: "environment_name", key: "environment_name" },
    { title: "邮箱池名称", dataIndex: "name", key: "name" },
    { title: "标识", dataIndex: "slug", key: "slug", render: value => <span style={{ fontFamily: "monospace" }}>{value}</span> },
    { title: "描述", dataIndex: "description", key: "description", render: value => value || "-" },
    { title: "生命周期策略", dataIndex: "resolved_retention", key: "resolved_retention", render: value => renderRetentionSummary(value) },
    { title: "邮箱数", dataIndex: "mailbox_count", key: "mailbox_count", width: 90 },
    { title: "状态", dataIndex: "is_enabled", key: "is_enabled", width: 90, render: value => value ? "启用" : "停用" },
    { title: "更新时间", dataIndex: "updated_at", key: "updated_at", width: 180, render: value => formatDateTime(value) },
    {
      title: "操作",
      key: "action",
      width: 120,
      render: (_value, record) => (
        canManage ? (
          <ActionButtons
            onEdit={() => onEdit(record)}
            onDelete={() => onDelete(record)}
            deleteConfirmTitle={deleteConfirmTitle}
          />
        ) : (
          <span style={{ color: "#999" }}>只读</span>
        )
      ),
    },
  ];
}
