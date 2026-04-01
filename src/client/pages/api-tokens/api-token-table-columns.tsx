import { Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";

import { ActionButtons } from "../../components";
import type {
  ApiTokenPermission,
  ApiTokenRecord,
} from "../../types";
import { formatDateTime } from "../../utils";

interface BuildApiTokenColumnsOptions {
  canManageTokenRecord: (record: ApiTokenRecord) => boolean;
  formatPermissionLabel: (permission: ApiTokenPermission) => string;
  isProjectScoped: boolean;
  onDelete: (record: ApiTokenRecord) => void;
  onEdit: (record: ApiTokenRecord) => void;
}

export function buildApiTokenColumns({
  canManageTokenRecord,
  formatPermissionLabel,
  isProjectScoped,
  onDelete,
  onEdit,
}: BuildApiTokenColumnsOptions): ColumnsType<ApiTokenRecord> {
  return [
    { title: "名称", dataIndex: "name", key: "name", width: 180 },
    {
      title: "说明",
      dataIndex: "description",
      key: "description",
      render: value => value || "-",
      width: 220,
    },
    {
      title: "Token 预览",
      dataIndex: "token_preview",
      key: "token_preview",
      render: value => <Typography.Text code>{value}</Typography.Text>,
      width: 180,
    },
    {
      title: "权限",
      dataIndex: "permissions",
      key: "permissions",
      render: value =>
        value.map((permission: ApiTokenPermission) => (
          <Tag key={permission}>{formatPermissionLabel(permission)}</Tag>
        )),
      width: 260,
    },
    {
      title: "范围",
      key: "access_scope",
      render: (_, record) => (
        <Tag color={record.access_scope === "bound" ? "gold" : "blue"}>
          {record.access_scope === "bound" ? "项目绑定" : "全局"}
        </Tag>
      ),
      width: 110,
    },
    {
      title: "绑定项目",
      key: "projects",
      render: (_, record) =>
        record.projects.length > 0
          ? record.projects.map(project => <Tag key={project.id}>{project.name}</Tag>)
          : "-",
      width: 220,
    },
    {
      title: "状态",
      dataIndex: "is_enabled",
      key: "is_enabled",
      render: value => (value ? "启用" : "停用"),
      width: 90,
    },
    {
      title: "最近使用",
      dataIndex: "last_used_at",
      key: "last_used_at",
      render: value => formatDateTime(value) || "未使用",
      width: 180,
    },
    {
      title: "过期时间",
      dataIndex: "expires_at",
      key: "expires_at",
      render: value => formatDateTime(value) || "永久有效",
      width: 180,
    },
    {
      title: "操作",
      key: "action",
      render: (_, record) => (
        canManageTokenRecord(record) ? (
          <ActionButtons
            onEdit={() => onEdit(record)}
            onDelete={() => onDelete(record)}
          />
        ) : (
          <span style={{ color: "#999" }}>{isProjectScoped && record.access_scope === "all" ? "全局只读" : "只读"}</span>
        )
      ),
      width: 120,
      fixed: "right",
    },
  ];
}
