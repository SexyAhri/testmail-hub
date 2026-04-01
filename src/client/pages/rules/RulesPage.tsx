import { Alert, App, Button, Form, Popconfirm } from "antd";
import { useEffect, useMemo, useState } from "react";

import { createRule, getRules, removeRule, testRules, updateRule } from "../../api/rules";
import { BatchActionsBar, DataTable, PageHeader, SearchToolbar } from "../../components";
import { promptOperationNote } from "../../delete-operation-note";
import { usePageFeedback } from "../../hooks/usePageFeedback";
import { useTableSelection } from "../../hooks/useTableSelection";
import { RulesFormDrawer } from "./RulesFormDrawer";
import { RulesMetrics } from "./RulesMetrics";
import { buildRulesColumns } from "./rules-table-columns";
import { RulesTestDrawer } from "./RulesTestDrawer";
import { canManageGlobalSettings, getReadonlyNotice, type CurrentUser } from "../../permissions";
import type { RuleMutationPayload, RuleRecord, RuleTestResult } from "../../types";
import { loadAllPages, runBatchAction } from "../../utils";

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
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<RuleMutationPayload>();
  const [testerForm] = Form.useForm<{ content: string; sender: string }>();
  const [rules, setRules] = useState<RuleRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [testerOpen, setTesterOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<RuleTestResult | null>(null);
  const [editing, setEditing] = useState<RuleRecord | null>(null);
  const canManageRules = canManageGlobalSettings(currentUser);
  const readonlyNotice = getReadonlyNotice(currentUser, "规则管理");
  const { loading, handlePageError, notifyBatchActionResult, runPageLoad } = usePageFeedback(onUnauthorized);

  useEffect(() => {
    void loadRules();
  }, []);

  async function loadRules() {
    const nextRules = await runPageLoad(() => loadAllPages(getRules));
    if (nextRules !== null) {
      setRules(nextRules);
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
      handlePageError(error, { ignoreFallbackMessage: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const record = rules.find(item => item.id === id);
    const operationNote = await promptOperationNote(modal, {
      title: "删除规则",
      description: `将删除 ${record?.remark || `规则 #${id}`}。可选填写本次删除备注，便于后续审计追溯。`,
      okText: "确认删除",
    });
    if (operationNote === null) return;

    try {
      await removeRule(id, { operation_note: operationNote });
      message.success("规则已删除");
      await loadRules();
    } catch (error) {
      handlePageError(error);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const values = await testerForm.validateFields();
      const payload = await testRules(values);
      setTestResult(payload);
    } catch (error) {
      handlePageError(error, { ignoreFallbackMessage: true });
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

    notifyBatchActionResult(is_enabled ? "批量启用规则" : "批量停用规则", result);
  }

  async function handleBatchDelete() {
    const operationNote = await promptOperationNote(modal, {
      title: "批量删除规则",
      description: `将删除 ${selectedItems.length} 条规则。填写的备注会写入每条规则的审计记录。`,
      okText: "确认批量删除",
    });
    if (operationNote === null) return;

    const result = await runBatchAction(
      selectedItems,
      item => removeRule(item.id, { operation_note: operationNote }),
    );
    if (result.successCount > 0) {
      clearSelection();
      await loadRules();
    }

    notifyBatchActionResult("批量删除规则", result);
  }

  const columns = buildRulesColumns({
    canManage: canManageRules,
    onDelete: record => void handleDelete(record.id),
    onEdit: openEditDrawer,
  });

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

      <RulesMetrics
        totalCount={rules.length}
        enabledCount={enabledCount}
        filteredCount={filteredRules.length}
      />

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
        <RulesFormDrawer
          editing={editing}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onSubmit={() => void handleSubmit()}
          form={form}
          loading={saving}
        />
      ) : null}

      <RulesTestDrawer
        form={testerForm}
        onClose={() => setTesterOpen(false)}
        onSubmit={() => void handleTest()}
        open={testerOpen}
        result={testResult}
        testing={testing}
      />
    </div>
  );
}
