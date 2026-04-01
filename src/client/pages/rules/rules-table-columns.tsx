import type { ColumnsType } from "antd/es/table";

import { ActionButtons, StatusTag } from "../../components";
import type { RuleRecord } from "../../types";
import { formatDateTime } from "../../utils";

interface BuildRulesColumnsOptions {
  canManage: boolean;
  onDelete: (record: RuleRecord) => void;
  onEdit: (record: RuleRecord) => void;
}

export function buildRulesColumns({
  canManage,
  onDelete,
  onEdit,
}: BuildRulesColumnsOptions): ColumnsType<RuleRecord> {
  return [
    {
      title: "备注",
      dataIndex: "remark",
      key: "remark",
      render: value => value || "未命名规则",
    },
    {
      title: "发件人过滤",
      dataIndex: "sender_filter",
      key: "sender_filter",
      render: value => (value ? <span style={{ fontFamily: "monospace" }}>{value}</span> : "-"),
    },
    {
      title: "正文正则",
      dataIndex: "pattern",
      key: "pattern",
      render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
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
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      key: "action",
      width: 140,
      render: (_value, record) => (
        canManage ? (
          <ActionButtons onEdit={() => onEdit(record)} onDelete={() => onDelete(record)} />
        ) : (
          <span style={{ color: "#999" }}>只读</span>
        )
      ),
    },
  ];
}
