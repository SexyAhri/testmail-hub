import type { ColumnsType } from "antd/es/table";

import { ActionButtons, StatusTag } from "../../components";
import type { WhitelistRecord } from "../../types";
import { formatDateTime } from "../../utils";

interface BuildWhitelistColumnsOptions {
  canManage: boolean;
  onDelete: (record: WhitelistRecord) => void;
  onEdit: (record: WhitelistRecord) => void;
}

export function buildWhitelistColumns({
  canManage,
  onDelete,
  onEdit,
}: BuildWhitelistColumnsOptions): ColumnsType<WhitelistRecord> {
  return [
    {
      title: "发件人模式",
      dataIndex: "sender_pattern",
      key: "sender_pattern",
      render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
    },
    {
      title: "备注",
      dataIndex: "note",
      key: "note",
      render: value => value || "-",
    },
    {
      title: "状态",
      dataIndex: "is_enabled",
      key: "is_enabled",
      width: 100,
      render: value => (
        <StatusTag
          status={value ? "enabled" : "disabled"}
          activeText="启用"
          inactiveText="停用"
        />
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
      width: 140,
      render: (_value, record) => (
        canManage ? (
          <ActionButtons
            deleteConfirmTitle="确定删除这条白名单规则吗？"
            onEdit={() => onEdit(record)}
            onDelete={() => onDelete(record)}
          />
        ) : (
          <span style={{ color: "#999" }}>只读</span>
        )
      ),
    },
  ];
}
