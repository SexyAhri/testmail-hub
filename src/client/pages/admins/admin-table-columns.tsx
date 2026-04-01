import { EyeOutlined } from "@ant-design/icons";
import { Button, Space, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";

import {
  changedAdminRecently,
  hasAdminGovernanceNote,
  isHighPrivilegeAdmin,
  isMultiProjectAdmin,
  isPendingAdminLoginAfterChange,
} from "../../admin-governance";
import { ActionButtons } from "../../components";
import type { AdminUserRecord } from "../../types";
import { formatDateTime } from "../../utils";
import {
  ADMIN_ROLE_LABELS,
  normalizeAdminRole,
} from "../../../utils/constants";

interface BuildAdminColumnsOptions {
  canManageRecord: (record: AdminUserRecord) => boolean;
  onEdit: (record: AdminUserRecord) => void;
  onOpenHistory: (record: AdminUserRecord) => void;
}

export function buildAdminColumns({
  canManageRecord,
  onEdit,
  onOpenHistory,
}: BuildAdminColumnsOptions): ColumnsType<AdminUserRecord> {
  return [
    {
      title: "成员",
      key: "identity",
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <span style={{ fontWeight: 600 }}>{record.display_name}</span>
          <span style={{ color: "#8c8c8c", fontSize: 12 }}>{record.username}</span>
          {record.note ? (
            <span style={{ color: "#8c8c8c", fontSize: 12 }}>{record.note}</span>
          ) : null}
        </Space>
      ),
    },
    {
      title: "角色",
      dataIndex: "role",
      key: "role",
      width: 150,
      render: value => ADMIN_ROLE_LABELS[normalizeAdminRole(value) || "viewer"],
    },
    {
      title: "访问范围",
      key: "access_scope",
      width: 120,
      render: (_, record) => (
        <Tag color={record.access_scope === "bound" ? "gold" : "blue"}>
          {record.access_scope === "bound" ? "项目绑定" : "全局"}
        </Tag>
      ),
    },
    {
      title: "绑定项目",
      key: "projects",
      render: (_, record) =>
        record.projects.length > 0
          ? record.projects.map(project => <Tag key={project.id}>{project.name}</Tag>)
          : "-",
    },
    {
      title: "治理焦点",
      key: "governance",
      width: 220,
      render: (_, record) => {
        const tags = [
          isHighPrivilegeAdmin(record) ? <Tag color="volcano" key="high-privilege">高权限</Tag> : null,
          isMultiProjectAdmin(record) ? <Tag color="gold" key="multi-project">跨项目</Tag> : null,
          !hasAdminGovernanceNote(record) ? <Tag color="default" key="missing-note">缺备注</Tag> : null,
          changedAdminRecently(record) ? <Tag color="processing" key="recent-change">7天内变更</Tag> : null,
          isPendingAdminLoginAfterChange(record) ? <Tag color="warning" key="pending-login">变更后未登录</Tag> : null,
        ].filter(Boolean);

        return tags.length > 0 ? <Space size={[4, 4]} wrap>{tags}</Space> : <Tag color="success">稳定</Tag>;
      },
    },
    {
      title: "状态",
      dataIndex: "is_enabled",
      key: "is_enabled",
      width: 100,
      render: value => (value ? "启用" : "停用"),
    },
    {
      title: "最近登录",
      dataIndex: "last_login_at",
      key: "last_login_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "最近变更",
      key: "last_modified",
      width: 220,
      render: (_, record) =>
        record.last_modified_at ? (
          <Space direction="vertical" size={4}>
            <span>{formatDateTime(record.last_modified_at)}</span>
            <span style={{ color: "#8c8c8c", fontSize: 12 }}>
              {(record.last_modified_by || "系统")} · {record.last_modified_action || "admin.update"}
            </span>
          </Space>
        ) : (
          <span style={{ color: "#999" }}>暂无变更记录</span>
        ),
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      key: "action",
      width: 170,
      render: (_, record) =>
        canManageRecord(record)
          ? (
            <ActionButtons
              onEdit={() => onEdit(record)}
              extra={(
                <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onOpenHistory(record)}>
                  记录
                </Button>
              )}
            />
          )
          : <span style={{ color: "#999" }}>只读</span>,
    },
  ];
}
