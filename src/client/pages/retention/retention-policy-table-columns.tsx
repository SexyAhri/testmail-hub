import { Space, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";

import { ActionButtons } from "../../components";
import type { RetentionPolicyRecord } from "../../types";
import { formatDateTime } from "../../utils";
import {
  formatHours,
  getPolicyScopeColor,
  getPolicyScopeLabel,
  getPolicyScopeText,
} from "./retention-utils";

const { Text } = Typography;

interface BuildRetentionPolicyColumnsOptions {
  canManageRecord: (record: RetentionPolicyRecord) => boolean;
  onDelete: (record: RetentionPolicyRecord) => void;
  onEdit: (record: RetentionPolicyRecord) => void;
}

export function buildRetentionPolicyColumns({
  canManageRecord,
  onDelete,
  onEdit,
}: BuildRetentionPolicyColumnsOptions): ColumnsType<RetentionPolicyRecord> {
  return [
    {
      dataIndex: "name",
      key: "name",
      title: "策略名称",
      width: 180,
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.name}</Text>
          <Tag color={getPolicyScopeColor(record.scope_level)}>{getPolicyScopeText(record.scope_level)}</Tag>
        </Space>
      ),
    },
    {
      key: "scope",
      title: "作用域",
      render: (_value, record) => getPolicyScopeLabel(record),
    },
    {
      dataIndex: "archive_email_hours",
      key: "archive_email_hours",
      title: "自动归档",
      width: 120,
      render: value => formatHours(value),
    },
    {
      dataIndex: "mailbox_ttl_hours",
      key: "mailbox_ttl_hours",
      title: "邮箱 TTL",
      width: 120,
      render: value => formatHours(value),
    },
    {
      dataIndex: "email_retention_hours",
      key: "email_retention_hours",
      title: "邮件保留",
      width: 120,
      render: value => formatHours(value),
    },
    {
      dataIndex: "deleted_email_retention_hours",
      key: "deleted_email_retention_hours",
      title: "已删邮件保留",
      width: 140,
      render: value => formatHours(value),
    },
    {
      dataIndex: "is_enabled",
      key: "is_enabled",
      title: "状态",
      width: 90,
      render: value => <Tag color={value ? "success" : "default"}>{value ? "启用" : "停用"}</Tag>,
    },
    {
      dataIndex: "updated_at",
      key: "updated_at",
      title: "更新时间",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      key: "action",
      title: "操作",
      width: 120,
      render: (_value, record) => (
        canManageRecord(record) ? (
          <ActionButtons
            onEdit={() => onEdit(record)}
            onDelete={() => onDelete(record)}
            deleteConfirmTitle="确认删除这条生命周期策略吗？删除后将回退到上层作用域或系统默认策略。"
          />
        ) : (
          <span style={{ color: "#999" }}>只读</span>
        )
      ),
    },
  ];
}
