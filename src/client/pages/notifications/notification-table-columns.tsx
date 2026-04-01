import { Button, Popconfirm, Space, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";

import { ActionButtons, TypeTag } from "../../components";
import type {
  NotificationDeliveryAttemptRecord,
  NotificationDeliveryRecord,
  NotificationEndpointRecord,
} from "../../types";
import { formatDateTime } from "../../utils";
import {
  DELIVERY_STATUS_OPTIONS,
  ENDPOINT_STATUS_OPTIONS,
} from "./notification-utils";

interface BuildEndpointColumnsOptions {
  canManageRecord: (record: NotificationEndpointRecord) => boolean;
  formatEventLabel: (value: string) => string;
  onDelete: (record: NotificationEndpointRecord) => void;
  onEdit: (record: NotificationEndpointRecord) => void;
  onOpenDeliveries: (record: NotificationEndpointRecord) => void;
  onTest: (record: NotificationEndpointRecord) => void;
}

export function buildEndpointColumns({
  canManageRecord,
  formatEventLabel,
  onDelete,
  onEdit,
  onOpenDeliveries,
  onTest,
}: BuildEndpointColumnsOptions): ColumnsType<NotificationEndpointRecord> {
  return [
    { title: "名称", dataIndex: "name", key: "name", width: 180 },
    {
      title: "目标地址",
      dataIndex: "target",
      key: "target",
      render: value => (
        <Typography.Text style={{ fontFamily: "monospace", fontSize: 12 }} ellipsis={{ tooltip: value }}>
          {value}
        </Typography.Text>
      ),
    },
    {
      title: "范围",
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
      width: 220,
      render: (_, record) =>
        record.projects.length > 0
          ? record.projects.map(project => <Tag key={project.id}>{project.name}</Tag>)
          : "-",
    },
    {
      title: "事件",
      dataIndex: "events",
      key: "events",
      width: 260,
      render: value => (
        <Space size={[4, 4]} wrap>
          {value.map((item: string) => (
            <Tag key={item} title={item}>{formatEventLabel(item)}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "最近状态",
      dataIndex: "last_status",
      key: "last_status",
      width: 120,
      render: value => <TypeTag options={ENDPOINT_STATUS_OPTIONS} type={value || ""} />,
    },
    {
      title: "最近错误",
      dataIndex: "last_error",
      key: "last_error",
      width: 260,
      render: value =>
        value ? (
          <Typography.Text type="danger" ellipsis={{ tooltip: value }}>
            {value}
          </Typography.Text>
        ) : (
          "-"
        ),
    },
    {
      title: "最近发送",
      dataIndex: "last_sent_at",
      key: "last_sent_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      key: "action",
      width: 220,
      fixed: "right",
      render: (_, record) =>
        canManageRecord(record) ? (
          <ActionButtons
            onEdit={() => onEdit(record)}
            onDelete={() => onDelete(record)}
            extra={(
              <Space size={0}>
                <Button type="link" size="small" onClick={() => onTest(record)}>
                  测试
                </Button>
                <Button type="link" size="small" onClick={() => onOpenDeliveries(record)}>
                  记录
                </Button>
              </Space>
            )}
          />
        ) : (
          <Space size={0}>
            <Button type="link" size="small" onClick={() => onOpenDeliveries(record)}>
              记录
            </Button>
            <span style={{ color: "#999", fontSize: 12 }}>只读</span>
          </Space>
        ),
    },
  ];
}

interface BuildDeliveryColumnsOptions {
  activeEndpointManageable: boolean;
  deliveryReplayId: number | null;
  deliveryResolveId: number | null;
  onOpenAttempts: (record: NotificationDeliveryRecord) => void;
  onReplay: (record: NotificationDeliveryRecord) => void;
  onResolve: (record: NotificationDeliveryRecord) => void;
}

export function buildDeliveryColumns({
  activeEndpointManageable,
  deliveryReplayId,
  deliveryResolveId,
  onOpenAttempts,
  onReplay,
  onResolve,
}: BuildDeliveryColumnsOptions): ColumnsType<NotificationDeliveryRecord> {
  return [
    {
      title: "投递 ID",
      dataIndex: "id",
      key: "id",
      width: 100,
      render: value => <Typography.Text copyable>{String(value)}</Typography.Text>,
    },
    {
      title: "事件",
      dataIndex: "event",
      key: "event",
      width: 180,
      render: value => <Typography.Text style={{ fontFamily: "monospace", fontSize: 12 }}>{value}</Typography.Text>,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 180,
      render: (_value, record) => (
        <Space size={[6, 6]} wrap>
          <TypeTag options={DELIVERY_STATUS_OPTIONS} type={record.status} />
          {record.is_dead_letter ? <Tag color="red">死信</Tag> : null}
          {record.resolved_at ? <Tag color="default">已处理</Tag> : null}
        </Space>
      ),
    },
    {
      title: "尝试次数",
      key: "attempt_count",
      width: 120,
      render: (_, record) => `${record.attempt_count}/${record.max_attempts}`,
    },
    {
      title: "响应码",
      dataIndex: "response_status",
      key: "response_status",
      width: 100,
      render: value => value ?? "-",
    },
    {
      title: "最近尝试",
      dataIndex: "last_attempt_at",
      key: "last_attempt_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "下次重试",
      dataIndex: "next_retry_at",
      key: "next_retry_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "错误信息",
      dataIndex: "last_error",
      key: "last_error",
      render: value =>
        value ? (
          <Typography.Text type="danger" ellipsis={{ tooltip: value }}>
            {value}
          </Typography.Text>
        ) : (
          "-"
        ),
    },
    {
      title: "死信处理",
      key: "dead_letter",
      width: 220,
      render: (_value, record) => (
        record.is_dead_letter || record.resolved_at ? (
          <Space direction="vertical" size={2}>
            <Typography.Text type={record.is_dead_letter ? "danger" : "secondary"}>
              {record.dead_letter_reason || record.last_error || (record.is_dead_letter ? "已进入死信箱" : "已处理")}
            </Typography.Text>
            {record.resolved_at ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {`处理时间 ${formatDateTime(record.resolved_at)}${record.resolved_by ? ` / ${record.resolved_by}` : ""}`}
              </Typography.Text>
            ) : null}
          </Space>
        ) : (
          "-"
        )
      ),
    },
    {
      title: "操作",
      key: "action",
      width: 220,
      fixed: "right",
      render: (_value, record) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => onOpenAttempts(record)}>
            尝试
          </Button>
          <Button
            type="link"
            size="small"
            disabled={!activeEndpointManageable}
            loading={deliveryReplayId === record.id}
            onClick={() => onReplay(record)}
          >
            重放
          </Button>
          {record.is_dead_letter ? (
            <Popconfirm
              title="确认将这条死信标记为已处理吗？"
              onConfirm={() => onResolve(record)}
            >
              <Button
                type="link"
                size="small"
                disabled={!activeEndpointManageable}
                loading={deliveryResolveId === record.id}
              >
                忽略
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];
}

export function buildAttemptColumns(): ColumnsType<NotificationDeliveryAttemptRecord> {
  return [
    {
      title: "尝试",
      dataIndex: "attempt_number",
      key: "attempt_number",
      width: 90,
      render: value => `#${value}`,
    },
    {
      title: "结果",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: value => <TypeTag options={DELIVERY_STATUS_OPTIONS} type={value} />,
    },
    {
      title: "响应码",
      dataIndex: "response_status",
      key: "response_status",
      width: 100,
      render: value => value ?? "-",
    },
    {
      title: "耗时",
      dataIndex: "duration_ms",
      key: "duration_ms",
      width: 100,
      render: value => (value === null || value === undefined ? "-" : `${value} ms`),
    },
    {
      title: "尝试时间",
      dataIndex: "attempted_at",
      key: "attempted_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "下次重试",
      dataIndex: "next_retry_at",
      key: "next_retry_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "错误信息",
      dataIndex: "error_message",
      key: "error_message",
      render: value =>
        value ? (
          <Typography.Text type="danger" ellipsis={{ tooltip: value }}>
            {value}
          </Typography.Text>
        ) : (
          "-"
        ),
    },
  ];
}
