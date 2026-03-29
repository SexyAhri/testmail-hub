import { InboxOutlined, MailOutlined, SyncOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { App, Button, Col, DatePicker, Form, Input, Popconfirm, Row, Switch, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createMailbox, getMailboxes, removeMailbox, syncMailboxes, updateMailbox, type MailboxPayload } from "../api";
import { ActionButtons, BatchActionsBar, DataTable, FormDrawer, MetricCard, PageHeader, SearchToolbar, StatusTag } from "../components";
import { useTableSelection } from "../hooks/useTableSelection";
import type { MailboxRecord, MailboxSyncResult } from "../types";
import { buildBatchActionMessage, formatDateTime, loadAllPages, normalizeApiError, randomLocalPart, runBatchAction } from "../utils";

interface MailboxesPageProps {
  mailboxDomain: string;
  onMailboxesChanged?: () => Promise<void> | void;
  onUnauthorized: () => void;
}

interface MailboxFormValues {
  batch_count: number;
  domain: string;
  expires_at?: dayjs.Dayjs | null;
  is_enabled: boolean;
  local_part: string;
  note: string;
  tags: string;
}

export default function MailboxesPage({
  mailboxDomain,
  onMailboxesChanged,
  onUnauthorized,
}: MailboxesPageProps) {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm<MailboxFormValues>();
  const [mailboxes, setMailboxes] = useState<MailboxRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<MailboxSyncResult | null>(null);
  const [searchText, setSearchText] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<MailboxRecord | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      await performSync(false);
      setMailboxes(await loadAllPages(page => getMailboxes(page, false)));
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

  async function performSync(showToast: boolean) {
    setSyncing(true);
    try {
      const result = await syncMailboxes();
      setSyncSummary(result);
      if (showToast) {
        const parts = [`新增 ${result.created_count} 个`, `更新 ${result.updated_count} 个`];
        if (result.cloudflare_configured) {
          parts.push(`Cloudflare 路由 ${result.cloudflare_routes_total} 条`);
          if (result.catch_all_enabled) parts.push("Catch-all 已启用");
        } else {
          parts.push("Cloudflare 路由未配置");
        }
        message.success(parts.join("，"));
      }
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      if (showToast) {
        message.error(normalizeApiError(error));
      }
    } finally {
      setSyncing(false);
    }
  }

  async function syncDomains() {
    if (!onMailboxesChanged) return;
    await onMailboxesChanged();
  }

  function openCreateDrawer() {
    setEditing(null);
    form.setFieldsValue({
      batch_count: 1,
      domain: mailboxDomain || "",
      expires_at: null,
      is_enabled: true,
      local_part: "",
      note: "",
      tags: "",
    });
    setDrawerOpen(true);
  }

  function openEditDrawer(record: MailboxRecord) {
    const [local_part, domain = mailboxDomain] = record.address.split("@");
    setEditing(record);
    form.setFieldsValue({
      batch_count: 1,
      domain,
      expires_at: record.expires_at ? dayjs(record.expires_at) : null,
      is_enabled: record.is_enabled,
      local_part,
      note: record.note,
      tags: record.tags.join(", "),
    });
    setDrawerOpen(true);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const values = await form.validateFields();
      const payload: MailboxPayload = {
        batch_count: values.batch_count,
        domain: values.domain.trim(),
        expires_at: values.expires_at ? values.expires_at.valueOf() : null,
        generate_random: !values.local_part.trim(),
        is_enabled: values.is_enabled,
        local_part: values.local_part.trim(),
        note: values.note.trim(),
        tags: values.tags,
      };

      if (editing) {
        await updateMailbox(editing.id, payload);
        message.success("邮箱已更新");
      } else {
        await createMailbox(payload);
        message.success("邮箱已创建");
      }

      setDrawerOpen(false);
      await Promise.all([loadData(), syncDomains()]);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await removeMailbox(id);
      message.success("邮箱已删除");
      await Promise.all([loadData(), syncDomains()]);
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  const filteredMailboxes = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return mailboxes;
    return mailboxes.filter(item =>
      [item.address, item.note, item.tags.join(", ")].some(value => value.toLowerCase().includes(keyword)),
    );
  }, [mailboxes, searchText]);

  const enabledCount = useMemo(() => mailboxes.filter(item => item.is_enabled).length, [mailboxes]);
  const {
    clearSelection,
    rowSelection,
    selectedItems,
  } = useTableSelection(filteredMailboxes, "id");

  function buildMailboxUpdatePayload(record: MailboxRecord, is_enabled: boolean) {
    const [local_part = "", domain = mailboxDomain] = record.address.split("@");
    return {
      batch_count: 1,
      domain,
      expires_at: record.expires_at,
      generate_random: false,
      is_enabled,
      local_part,
      note: record.note,
      tags: record.tags,
    };
  }

  async function handleBatchToggle(is_enabled: boolean) {
    const result = await runBatchAction(selectedItems, item =>
      updateMailbox(item.id, buildMailboxUpdatePayload(item, is_enabled)),
    );

    if (result.successCount > 0) {
      clearSelection();
      await Promise.all([loadData(), syncDomains()]);
    }

    const messageText = buildBatchActionMessage(is_enabled ? "批量启用邮箱" : "批量停用邮箱", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  async function handleBatchDelete() {
    const result = await runBatchAction(selectedItems, item => removeMailbox(item.id));
    if (result.successCount > 0) {
      clearSelection();
      await Promise.all([loadData(), syncDomains()]);
    }

    const messageText = buildBatchActionMessage("批量删除邮箱", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  const columns: ColumnsType<MailboxRecord> = [
    {
      title: "邮箱地址",
      dataIndex: "address",
      key: "address",
      render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
    },
    {
      title: "备注",
      dataIndex: "note",
      key: "note",
      render: value => value || "-",
    },
    {
      title: "标签",
      dataIndex: "tags",
      key: "tags",
      render: value => value?.length ? value.map((tag: string) => <Tag key={tag}>{tag}</Tag>) : "-",
    },
    {
      title: "状态",
      dataIndex: "is_enabled",
      key: "is_enabled",
      width: 100,
      render: value => (
        <StatusTag status={value ? "enabled" : "disabled"} activeText="启用" inactiveText="停用" />
      ),
    },
    {
      title: "到期时间",
      dataIndex: "expires_at",
      key: "expires_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "收件次数",
      dataIndex: "receive_count",
      key: "receive_count",
      width: 100,
    },
    {
      title: "最近收件",
      dataIndex: "last_received_at",
      key: "last_received_at",
      width: 180,
      render: value => formatDateTime(value),
    },
    {
      title: "操作",
      key: "action",
      width: 180,
      render: (_value, record) => (
        <ActionButtons
          onEdit={() => openEditDrawer(record)}
          onDelete={() => void handleDelete(record.id)}
          extra={(
            <Button type="link" size="small" onClick={() => navigate(`/emails?address=${encodeURIComponent(record.address)}`)}>
              收件箱
            </Button>
          )}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="邮箱资产" subtitle="创建、批量生成和维护托管邮箱，支持标签与生命周期配置" />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={8}>
          <MetricCard title="邮箱总数" value={mailboxes.length} icon={<InboxOutlined />} percent={Math.min(100, mailboxes.length * 10)} color="#1890ff" />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <MetricCard title="启用邮箱" value={enabledCount} icon={<ThunderboltOutlined />} percent={mailboxes.length ? (enabledCount / mailboxes.length) * 100 : 0} color="#52c41a" />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <MetricCard
            title={syncSummary?.cloudflare_configured ? "Cloudflare 路由" : "默认域名"}
            value={syncSummary?.cloudflare_configured ? syncSummary.cloudflare_routes_total : mailboxDomain || "--"}
            icon={<MailOutlined />}
            percent={100}
            color="#722ed1"
          />
        </Col>
      </Row>

      <div style={{ marginBottom: 16 }}>
        <SearchToolbar
          searchPlaceholder="搜索邮箱、备注或标签"
          searchValue={searchText}
          onSearchChange={value => setSearchText(value)}
          onReset={() => setSearchText("")}
          onAdd={openCreateDrawer}
          addText="新增邮箱"
          extra={(
            <Button icon={<SyncOutlined />} loading={syncing} onClick={() => void performSync(true)} style={{ borderRadius: 8 }}>
              同步路由
            </Button>
          )}
        />
      </div>

      <DataTable
        cardTitle="邮箱资产列表"
        cardToolbar={(
          <BatchActionsBar selectedCount={selectedItems.length} onClear={clearSelection}>
            <Button onClick={() => void handleBatchToggle(true)}>
              批量启用
            </Button>
            <Button onClick={() => void handleBatchToggle(false)}>
              批量停用
            </Button>
            <Popconfirm
              title={`确定删除选中的 ${selectedItems.length} 个邮箱吗？`}
              onConfirm={() => void handleBatchDelete()}
            >
              <Button danger>
                批量删除
              </Button>
            </Popconfirm>
          </BatchActionsBar>
        )}
        columns={columns}
        dataSource={filteredMailboxes}
        loading={loading}
        rowSelection={rowSelection}
        rowKey="id"
        pageSize={10}
      />

      <FormDrawer
        title={editing ? "编辑邮箱" : "新增邮箱"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSubmit={() => void handleSubmit()}
        form={form}
        loading={saving}
      >
        <Col span={24}>
          <Form.Item label="本地部分" name="local_part" extra="留空时自动生成随机前缀">
            <Input
              placeholder="例如：openai-login"
              addonAfter={(
                <Button type="link" style={{ paddingInline: 0 }} onClick={() => form.setFieldValue("local_part", randomLocalPart())}>
                  随机
                </Button>
              )}
            />
          </Form.Item>
        </Col>
        {!editing ? (
          <Col span={24}>
            <Form.Item label="批量数量" name="batch_count" initialValue={1}>
              <Input type="number" min={1} max={50} />
            </Form.Item>
          </Col>
        ) : null}
        <Col span={24}>
          <Form.Item label="域名" name="domain" rules={[{ required: true, message: "请输入域名" }]}>
            <Input placeholder="例如：vixenahri.cn" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="备注" name="note">
            <Input placeholder="例如：GitHub 登录测试" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="标签" name="tags" extra="多个标签用逗号分隔">
            <Input placeholder="例如：github, login, ci" />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="到期时间" name="expires_at">
            <DatePicker showTime style={{ width: "100%" }} />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item label="启用状态" name="is_enabled" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Col>
      </FormDrawer>
    </div>
  );
}
