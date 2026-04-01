import { Alert, App, Button, Form, Popconfirm } from "antd";
import { useEffect, useMemo, useState } from "react";

import {
  createWhitelist,
  getWhitelist,
  getWhitelistSettings,
  removeWhitelist,
  updateWhitelist,
  updateWhitelistSettings,
} from "../../api/whitelist";
import {
  BatchActionsBar,
  DataTable,
  PageHeader,
  SearchToolbar,
  WhitelistSettingsCard,
} from "../../components";
import { promptOperationNote } from "../../delete-operation-note";
import { usePageFeedback } from "../../hooks/usePageFeedback";
import { useTableSelection } from "../../hooks/useTableSelection";
import { WhitelistFormDrawer } from "./WhitelistFormDrawer";
import { WhitelistMetrics } from "./WhitelistMetrics";
import { buildWhitelistColumns } from "./whitelist-table-columns";
import { canManageGlobalSettings, getReadonlyNotice, type CurrentUser } from "../../permissions";
import type { WhitelistMutationPayload, WhitelistRecord } from "../../types";
import { loadAllPages, runBatchAction } from "../../utils";

interface WhitelistPageProps {
  currentUser?: CurrentUser;
  onUnauthorized: () => void;
}

const INITIAL_VALUES: WhitelistMutationPayload = {
  is_enabled: true,
  note: "",
  sender_pattern: "",
};

export default function WhitelistPage({ currentUser, onUnauthorized }: WhitelistPageProps) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<WhitelistMutationPayload>();
  const [items, setItems] = useState<WhitelistRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<WhitelistRecord | null>(null);
  const [whitelistEnabled, setWhitelistEnabled] = useState(true);
  const canManageWhitelist = canManageGlobalSettings(currentUser);
  const readonlyNotice = getReadonlyNotice(currentUser, "白名单");
  const { loading, handlePageError, notifyBatchActionResult, runPageLoad } = usePageFeedback(onUnauthorized);

  useEffect(() => {
    void loadData();
    void loadSettings();
  }, []);

  async function loadData() {
    const nextItems = await runPageLoad(() => loadAllPages(getWhitelist));
    if (nextItems !== null) {
      setItems(nextItems);
    }
  }

  async function loadSettings() {
    setSettingsLoading(true);
    try {
      const payload = await getWhitelistSettings();
      setWhitelistEnabled(payload.enabled);
    } catch (error) {
      handlePageError(error);
    } finally {
      setSettingsLoading(false);
    }
  }

  async function handleSettingsChange(enabled: boolean) {
    const previousValue = whitelistEnabled;
    setWhitelistEnabled(enabled);
    setSettingsSaving(true);
    try {
      const payload = await updateWhitelistSettings({ enabled });
      setWhitelistEnabled(payload.enabled);
      message.success(payload.enabled ? "全局白名单已启用" : "全局白名单已关闭");
    } catch (error) {
      setWhitelistEnabled(previousValue);
      handlePageError(error);
    } finally {
      setSettingsSaving(false);
    }
  }

  function openCreateDrawer() {
    setEditing(null);
    form.setFieldsValue(INITIAL_VALUES);
    setDrawerOpen(true);
  }

  function openEditDrawer(record: WhitelistRecord) {
    setEditing(record);
    form.setFieldsValue({
      is_enabled: record.is_enabled,
      note: record.note,
      sender_pattern: record.sender_pattern,
    });
    setDrawerOpen(true);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const values = await form.validateFields();
      if (editing) {
        await updateWhitelist(editing.id, values);
        message.success("白名单规则已更新");
      } else {
        await createWhitelist(values);
        message.success("白名单规则已创建");
      }
      setDrawerOpen(false);
      await loadData();
    } catch (error) {
      handlePageError(error, { ignoreFallbackMessage: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const record = items.find(item => item.id === id);
    const operationNote = await promptOperationNote(modal, {
      title: "删除白名单",
      description: `将删除 ${record?.note || `白名单 #${id}`}。可选填写本次删除备注，便于后续审计追溯。`,
      okText: "确认删除",
    });
    if (operationNote === null) return;

    try {
      await removeWhitelist(id, { operation_note: operationNote });
      message.success("白名单规则已删除");
      await loadData();
    } catch (error) {
      handlePageError(error);
    }
  }

  const filteredItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter(item =>
      [item.sender_pattern, item.note].some(value => value.toLowerCase().includes(keyword)),
    );
  }, [items, searchText]);

  const enabledCount = useMemo(() => items.filter(item => item.is_enabled).length, [items]);
  const {
    clearSelection,
    rowSelection,
    selectedItems,
  } = useTableSelection(filteredItems, "id");

  async function handleBatchToggle(is_enabled: boolean) {
    const result = await runBatchAction(selectedItems, item => updateWhitelist(item.id, {
      is_enabled,
      note: item.note,
      sender_pattern: item.sender_pattern,
    }));

    if (result.successCount > 0) {
      clearSelection();
      await loadData();
    }

    notifyBatchActionResult(is_enabled ? "批量启用白名单" : "批量停用白名单", result);
  }

  async function handleBatchDelete() {
    const operationNote = await promptOperationNote(modal, {
      title: "批量删除白名单",
      description: `将删除 ${selectedItems.length} 条白名单规则。填写的备注会写入每条规则的审计记录。`,
      okText: "确认批量删除",
    });
    if (operationNote === null) return;

    const result = await runBatchAction(
      selectedItems,
      item => removeWhitelist(item.id, { operation_note: operationNote }),
    );
    if (result.successCount > 0) {
      clearSelection();
      await loadData();
    }

    notifyBatchActionResult("批量删除白名单", result);
  }

  const columns = buildWhitelistColumns({
    canManage: canManageWhitelist,
    onDelete: record => void handleDelete(record.id),
    onEdit: openEditDrawer,
  });

  return (
    <div>
      <PageHeader
        title="白名单"
        subtitle="管理允许放行的发件人模式，支持备注、状态控制以及全局白名单开关。"
        tags={canManageWhitelist ? undefined : [{ color: "gold", label: "只读视角" }]}
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

      <WhitelistSettingsCard
        canManage={canManageWhitelist}
        enabled={whitelistEnabled}
        loading={settingsLoading || settingsSaving}
        onChange={value => void handleSettingsChange(value)}
      />

      <WhitelistMetrics
        totalCount={items.length}
        enabledCount={enabledCount}
        filteredCount={filteredItems.length}
      />

      <div style={{ marginBottom: 16 }}>
        <SearchToolbar
          searchPlaceholder="搜索发件人模式或备注"
          searchValue={searchText}
          onSearchChange={value => setSearchText(value)}
          onReset={() => setSearchText("")}
          onAdd={canManageWhitelist ? openCreateDrawer : undefined}
          addText="新增白名单规则"
        />
      </div>

      <DataTable
        cardTitle="白名单列表"
        cardToolbar={canManageWhitelist ? (
          <BatchActionsBar selectedCount={selectedItems.length} onClear={clearSelection}>
            <Button onClick={() => void handleBatchToggle(true)}>
              批量启用
            </Button>
            <Button onClick={() => void handleBatchToggle(false)}>
              批量停用
            </Button>
            <Popconfirm
              title={`确定删除选中的 ${selectedItems.length} 条白名单规则吗？`}
              onConfirm={() => void handleBatchDelete()}
            >
              <Button danger>
                批量删除
              </Button>
            </Popconfirm>
          </BatchActionsBar>
        ) : undefined}
        columns={columns}
        dataSource={filteredItems}
        loading={loading}
        rowSelection={canManageWhitelist ? rowSelection : undefined}
        rowKey="id"
        pageSize={10}
      />

      {canManageWhitelist ? (
        <WhitelistFormDrawer
          editing={editing}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onSubmit={() => void handleSubmit()}
          form={form}
          loading={saving}
        />
      ) : null}
    </div>
  );
}
