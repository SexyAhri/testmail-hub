import { Alert, App, Button, Col, Form, Input, Popconfirm, Row, Switch } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";

import { createRule, getRules, removeRule, testRules, updateRule } from "../api";
import { ActionButtons, BatchActionsBar, DataTable, DetailDrawer, FormDrawer, MetricCard, PageHeader, SearchToolbar, StatusTag } from "../components";
import { useTableSelection } from "../hooks/useTableSelection";
import { canManageGlobalSettings, getReadonlyNotice, type CurrentUser } from "../permissions";
import type { RuleMatch, RuleMutationPayload, RuleRecord, RuleTestResult } from "../types";
import { buildBatchActionMessage, formatDateTime, loadAllPages, normalizeApiError, runBatchAction } from "../utils";

interface RulesPageProps {
  currentUser?: CurrentUser;
  onUnauthorized: () => void;
}

const INITIAL_VALUES: RuleMutationPayload = {
  is_enabled: true,
  pattern: "",
  remark: "",
  sender_filter: "",
};

export default function RulesPage({ currentUser, onUnauthorized }: RulesPageProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<RuleMutationPayload>();
  const [testerForm] = Form.useForm<{ content: string; sender: string }>();
  const [rules, setRules] = useState<RuleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [testerOpen, setTesterOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<RuleTestResult | null>(null);
  const [editing, setEditing] = useState<RuleRecord | null>(null);
  const canManageRules = canManageGlobalSettings(currentUser);
  const readonlyNotice = getReadonlyNotice(currentUser, "规则管理");

  useEffect(() => {
    void loadRules();
  }, []);

  async function loadRules() {
    setLoading(true);
    try {
      setRules(await loadAllPages(getRules));
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

  function openCreateDrawer() {
    setEditing(null);
    form.setFieldsValue(INITIAL_VALUES);
    setDrawerOpen(true);
  }

  function openEditDrawer(record: RuleRecord) {
    setEditing(record);
    form.setFieldsValue({
      is_enabled: record.is_enabled,
      pattern: record.pattern,
      remark: record.remark,
      sender_filter: record.sender_filter,
    });
    setDrawerOpen(true);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const values = await form.validateFields();
      if (editing) {
        await updateRule(editing.id, values);
        message.success("规则已更新");
      } else {
        await createRule(values);
        message.success("规则已创建");
      }
      setDrawerOpen(false);
      await loadRules();
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      if (error instanceof Error && error.message !== "请求失败") {
        message.error(normalizeApiError(error));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await removeRule(id);
      message.success("规则已删除");
      await loadRules();
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const values = await testerForm.validateFields();
      const payload = await testRules(values);
      setTestResult(payload);
    } catch (error) {
      if (normalizeApiError(error) !== "请求失败") {
        message.error(normalizeApiError(error));
      }
    } finally {
      setTesting(false);
    }
  }

  const filteredRules = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return rules;
    return rules.filter(rule =>
      [rule.remark, rule.sender_filter, rule.pattern].some(value => value.toLowerCase().includes(keyword)),
    );
  }, [rules, searchText]);

  const enabledCount = useMemo(() => rules.filter(rule => rule.is_enabled).length, [rules]);
  const {
    clearSelection,
    rowSelection,
    selectedItems,
  } = useTableSelection(filteredRules, "id");

  async function handleBatchToggle(is_enabled: boolean) {
    const result = await runBatchAction(selectedItems, item => updateRule(item.id, {
      is_enabled,
      pattern: item.pattern,
      remark: item.remark,
      sender_filter: item.sender_filter,
    }));

    if (result.successCount > 0) {
      clearSelection();
      await loadRules();
    }

    const messageText = buildBatchActionMessage(is_enabled ? "批量启用规则" : "批量停用规则", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  async function handleBatchDelete() {
    const result = await runBatchAction(selectedItems, item => removeRule(item.id));
    if (result.successCount > 0) {
      clearSelection();
      await loadRules();
    }

    const messageText = buildBatchActionMessage("批量删除规则", result);
    if (result.failureCount === 0) {
      message.success(messageText);
    } else if (result.successCount > 0) {
      message.warning(messageText);
    } else {
      message.error(messageText);
    }
  }

  const columns: ColumnsType<RuleRecord> = [
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
        canManageRules ? (
          <ActionButtons onEdit={() => openEditDrawer(record)} onDelete={() => void handleDelete(record.id)} />
        ) : (
          <span style={{ color: "#999" }}>只读</span>
        )
      ),
    },
  ];

  const testColumns: ColumnsType<RuleMatch> = [
    {
      title: "规则 ID",
      dataIndex: "rule_id",
      key: "rule_id",
      width: 100,
    },
    {
      title: "备注",
      dataIndex: "remark",
      key: "remark",
      render: value => value || "-",
    },
    {
      title: "命中内容",
      dataIndex: "value",
      key: "value",
      render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="规则管理"
        subtitle="维护提取规则，并可直接输入样例内容验证命中结果"
        tags={canManageRules ? undefined : [{ color: "gold", label: "只读视角" }]}
      />

      {readonlyNotice ? (
        <Alert
          showIcon
          type="info"
          message={readonlyNotice.title}
          description={readonlyNotice.description}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={8}>
          <MetricCard title="规则总数" value={rules.length} icon={<>#</>} percent={Math.min(100, rules.length * 10)} color="#1890ff" />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <MetricCard title="启用规则" value={enabledCount} icon={<>✓</>} percent={rules.length ? (enabledCount / rules.length) * 100 : 0} color="#52c41a" />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <MetricCard title="搜索结果" value={filteredRules.length} icon={<>*</>} percent={rules.length ? (filteredRules.length / rules.length) * 100 : 0} color="#722ed1" />
        </Col>
      </Row>

      <div style={{ marginBottom: 16 }}>
        <SearchToolbar
          searchPlaceholder="搜索备注、发件人过滤或正文正则"
          searchValue={searchText}
          onSearchChange={value => setSearchText(value)}
          onReset={() => setSearchText("")}
          onAdd={canManageRules ? openCreateDrawer : undefined}
          addText="新增规则"
          extra={(
            <Button onClick={() => setTesterOpen(true)}>
              规则测试器
            </Button>
          )}
        />
      </div>

      <DataTable
        cardTitle="规则列表"
        cardToolbar={canManageRules ? (
          <BatchActionsBar selectedCount={selectedItems.length} onClear={clearSelection}>
            <Button onClick={() => void handleBatchToggle(true)}>
              批量启用
            </Button>
            <Button onClick={() => void handleBatchToggle(false)}>
              批量停用
            </Button>
            <Popconfirm
              title={`确定删除选中的 ${selectedItems.length} 条规则吗？`}
              onConfirm={() => void handleBatchDelete()}
            >
              <Button danger>
                批量删除
              </Button>
            </Popconfirm>
          </BatchActionsBar>
        ) : undefined}
        columns={columns}
        dataSource={filteredRules}
        loading={loading}
        rowSelection={canManageRules ? rowSelection : undefined}
        rowKey="id"
        pageSize={10}
      />

      {canManageRules ? (
        <FormDrawer
          title={editing ? "编辑规则" : "新增规则"}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onSubmit={() => void handleSubmit()}
          form={form}
          loading={saving}
        >
          <Col span={24}>
            <Form.Item label="规则备注" name="remark">
              <Input placeholder="例如：GitHub 六位验证码" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="发件人过滤" name="sender_filter">
              <Input.TextArea rows={4} placeholder="例如：notifications@github\\.com$" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="正文正则" name="pattern" rules={[{ required: true, message: "请输入正文正则" }]}>
              <Input.TextArea rows={6} placeholder={"例如：\\b\\d{6}\\b"} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="启用状态" name="is_enabled" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
          </Col>
        </FormDrawer>
      ) : null}

      <DetailDrawer
        title="规则测试器"
        open={testerOpen}
        onClose={() => setTesterOpen(false)}
        width="58vw"
        footer={(
          <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
            <Button onClick={() => setTesterOpen(false)}>关闭</Button>
            <Button type="primary" loading={testing} onClick={() => void handleTest()}>
              开始测试
            </Button>
          </div>
        )}
      >
        <Form form={testerForm} layout="vertical" initialValues={{ content: "", sender: "" }}>
          <Form.Item label="发件人" name="sender">
            <Input placeholder="例如：notifications@github.com" />
          </Form.Item>
          <Form.Item label="样例正文" name="content" rules={[{ required: true, message: "请输入样例正文" }]}>
            <Input.TextArea rows={10} placeholder="粘贴一段邮件正文，系统会用当前所有规则进行匹配" />
          </Form.Item>
        </Form>

        <Row gutter={[16, 16]}>
          <Col span={24}>
            <MetricCard
              title="命中条数"
              value={testResult?.matches.length || 0}
              icon={<>✓</>}
              percent={Math.min(100, (testResult?.matches.length || 0) * 20)}
              color="#52c41a"
            />
          </Col>
        </Row>

        <div style={{ marginTop: 16 }}>
          <DataTable
            cardTitle="测试结果"
            columns={testColumns}
            dataSource={testResult?.matches || []}
            rowKey={record => `${record.rule_id}-${record.value}`}
            showPagination={false}
          />
        </div>

        {testResult?.invalid_rules.length ? (
          <div style={{ marginTop: 16, fontSize: 13 }}>
            无效正则规则 ID：{testResult.invalid_rules.join(", ")}
          </div>
        ) : null}
      </DetailDrawer>
    </div>
  );
}
