import { Alert, App, Button, Form, Popconfirm, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";

import {
  createApiToken,
  getApiTokens,
  removeApiToken,
  updateApiToken,
} from "../../api/apiTokens";
import { getWorkspaceCatalog } from "../../api/workspace";
import {
  BatchActionsBar,
  DataTable,
  PageHeader,
} from "../../components";
import { promptOperationNote } from "../../delete-operation-note";
import { usePageFeedback } from "../../hooks/usePageFeedback";
import { useTableSelection } from "../../hooks/useTableSelection";
import { ApiTokenFormDrawer } from "./ApiTokenFormDrawer";
import { ApiTokensMetrics } from "./ApiTokensMetrics";
import { buildApiTokenColumns } from "./api-token-table-columns";
import type {
  ApiTokenMutationPayload,
  ApiTokenPermission,
  ApiTokenRecord,
  WorkspaceProjectRecord,
} from "../../types";
import {
  loadAllPages,
  runBatchAction,
} from "../../utils";
import {
  canWriteAnyResource,
  getAccessibleProjectIds,
  getAccessModeTag,
  getWriteScopeNotice,
  isProjectScopedUser,
  type CurrentUser,
} from "../../permissions";

interface ApiTokensPageProps {
  currentUser?: CurrentUser;
  onUnauthorized: () => void;
}

interface ApiTokenFormValues {
  access_scope: "all" | "bound";
  description: string;
  expires_at: Dayjs | null;
  is_enabled: boolean;
  name: string;
  operation_note?: string;
  permissions: ApiTokenPermission[];
  project_ids: number[];
}

const PERMISSION_OPTIONS: Array<{ label: string; value: ApiTokenPermission }> = [
  { label: "读取邮件摘要", value: "read:mail" },
  { label: "读取验证码/提取结果", value: "read:code" },
  { label: "读取附件", value: "read:attachment" },
  { label: "读取规则命中结果", value: "read:rule-result" },
];

const PERMISSION_LABELS = new Map(PERMISSION_OPTIONS.map(item => [item.value, item.label]));

const INITIAL_VALUES: ApiTokenFormValues = {
  access_scope: "all",
  description: "",
  expires_at: null,
  is_enabled: true,
  name: "",
  operation_note: "",
  permissions: ["read:mail"],
  project_ids: [],
};

function formatPermissionLabel(permission: ApiTokenPermission) {
  return PERMISSION_LABELS.get(permission) || permission;
}

export default function ApiTokensPage({ currentUser, onUnauthorized }: ApiTokensPageProps) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<ApiTokenFormValues>();
  const watchedAccessScope = Form.useWatch("access_scope", form);
  const [items, setItems] = useState<ApiTokenRecord[]>([]);
  const [projects, setProjects] = useState<WorkspaceProjectRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ApiTokenRecord | null>(null);
  const { clearSelection, rowSelection, selectedItems } = useTableSelection(items, "id");
  const canManageTokens = canWriteAnyResource(currentUser);
  const isProjectScoped = isProjectScopedUser(currentUser);
  const accessibleProjectIds = useMemo(() => getAccessibleProjectIds(currentUser), [currentUser]);
  const accessTag = getAccessModeTag(currentUser, { readOnlyLabel: "受限视角" });
  const accessNotice = getWriteScopeNotice(currentUser, "API Token", {
    readOnlyDescription: "API Token 属于自动化接入凭证，当前只对可写管理员开放。只读角色不会显示签发与维护入口。",
    readOnlyTitle: "当前账号不能查看或管理 API Token",
    projectScopedDescription: "你可以签发和维护项目绑定 Token，但不能创建或编辑全局 Token，且只能选择自己已绑定的项目。",
    projectScopedTitle: "当前账号为项目级 Token 视角",
  });

  const boundCount = useMemo(
    () => items.filter(item => item.access_scope === "bound").length,
    [items],
  );
  const enabledCount = useMemo(
    () => items.filter(item => item.is_enabled).length,
    [items],
  );
  const { loading, handlePageError, notifyBatchActionResult, runPageLoad } = usePageFeedback(onUnauthorized);

  useEffect(() => {
    if (!canManageTokens) return;
    void loadData();
  }, [canManageTokens]);

  async function loadData() {
    const payload = await runPageLoad(() => Promise.all([
      loadAllPages(getApiTokens),
      getWorkspaceCatalog(true),
    ]));
    if (payload !== null) {
      const [tokens, catalog] = payload;
      setItems(tokens);
      setProjects(catalog.projects);
    }
  }

  function openCreate() {
    setEditing(null);
    form.setFieldsValue({
      ...INITIAL_VALUES,
      access_scope: isProjectScoped ? "bound" : INITIAL_VALUES.access_scope,
      operation_note: "",
      project_ids: isProjectScoped ? accessibleProjectIds : [],
    });
    setDrawerOpen(true);
  }

  function openEdit(record: ApiTokenRecord) {
    setEditing(record);
    form.setFieldsValue({
      access_scope: record.access_scope,
      description: record.description,
      expires_at: record.expires_at ? dayjs(record.expires_at) : null,
      is_enabled: record.is_enabled,
      name: record.name,
      operation_note: "",
      permissions: record.permissions,
      project_ids: record.projects.map(project => project.id),
    });
    setDrawerOpen(true);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const values = await form.validateFields();
      const payload: ApiTokenMutationPayload = {
        access_scope: values.access_scope,
        description: values.description.trim(),
        expires_at: values.expires_at ? values.expires_at.valueOf() : null,
        is_enabled: values.is_enabled,
        name: values.name.trim(),
        operation_note: String(values.operation_note || "").trim(),
        permissions: values.permissions,
        project_ids: values.access_scope === "bound" ? values.project_ids || [] : [],
      };

      if (editing) {
        await updateApiToken(editing.id, payload);
        message.success("API Token 已更新");
      } else {
        const result = await createApiToken(payload);
        modal.info({
          title: "新 API Token 已签发",
          width: 720,
          content: (
            <div style={{ marginTop: 16 }}>
              <Typography.Paragraph type="secondary">
                这是唯一一次显示完整 Token，请立即保存。后续页面只保留前缀和预览值。
              </Typography.Paragraph>
              <Typography.Paragraph copyable={{ text: result.plain_text_token }}>
                <code>{result.plain_text_token}</code>
              </Typography.Paragraph>
            </div>
          ),
        });
        message.success("API Token 已创建");
      }

      setDrawerOpen(false);
      await loadData();
    } catch (error) {
      handlePageError(error, { ignoreFallbackMessage: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const record = items.find(item => item.id === id);
    const operationNote = await promptOperationNote(modal, {
      title: "删除 API Token",
      description: `将删除 ${record?.name || `Token ${id}`}。可选填写本次删除备注，便于后续审计追溯。`,
      okText: "确认删除",
    });
    if (operationNote === null) return;

    try {
      await removeApiToken(id, { operation_note: operationNote });
      message.success("API Token 已删除");
      await loadData();
    } catch (error) {
      handlePageError(error);
    }
  }

  async function handleBatchToggle(is_enabled: boolean) {
    const result = await runBatchAction(selectedItems, item =>
      updateApiToken(item.id, {
        access_scope: item.access_scope,
        description: item.description,
        expires_at: item.expires_at,
        is_enabled,
        name: item.name,
        permissions: item.permissions,
        project_ids: item.projects.map(project => project.id),
      }),
    );

    if (result.successCount > 0) {
      clearSelection();
      await loadData();
    }

    notifyBatchActionResult(is_enabled ? "批量启用 Token" : "批量停用 Token", result);
  }

  async function handleBatchDelete() {
    const operationNote = await promptOperationNote(modal, {
      title: "批量删除 API Token",
      description: `将删除 ${selectedItems.length} 个 Token。填写的备注会写入每条 Token 的审计记录。`,
      okText: "确认批量删除",
    });
    if (operationNote === null) return;

    const result = await runBatchAction(
      selectedItems,
      item => removeApiToken(item.id, { operation_note: operationNote }),
    );
    if (result.successCount > 0) {
      clearSelection();
      await loadData();
    }

    notifyBatchActionResult("批量删除 Token", result);
  }

  const visibleProjects = useMemo(
    () => projects.filter(project => !isProjectScoped || accessibleProjectIds.includes(project.id)),
    [accessibleProjectIds, isProjectScoped, projects],
  );

  function canManageTokenRecord(record: ApiTokenRecord) {
    if (!canManageTokens) return false;
    if (!isProjectScoped) return true;
    if (record.access_scope === "all") return false;
    return record.projects.some(project => accessibleProjectIds.includes(project.id));
  }

  const tokenRowSelection = useMemo(
    () => (canManageTokens ? {
      ...rowSelection,
      getCheckboxProps: (record: ApiTokenRecord) => ({
        disabled: !canManageTokenRecord(record),
      }),
    } : undefined),
    [canManageTokens, rowSelection, accessibleProjectIds, isProjectScoped],
  );

  const columns = buildApiTokenColumns({
    canManageTokenRecord,
    formatPermissionLabel,
    isProjectScoped,
    onDelete: record => void handleDelete(record.id),
    onEdit: openEdit,
  });

  return (
    <div>
      <PageHeader
        title="API Token"
        subtitle="为自动化脚本签发全局或项目级访问令牌，支持权限拆分、过期时间和批量启停。"
        extra={canManageTokens ? (
          <Button type="primary" onClick={openCreate}>
            新建 Token
          </Button>
        ) : undefined}
        tags={accessTag ? [accessTag] : undefined}
      />

      {accessNotice ? (
        <Alert
          showIcon
          type={canManageTokens ? "info" : "warning"}
          message={accessNotice.title}
          description={accessNotice.description}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        项目绑定 Token 只能访问被授权项目下的邮件、提取结果和附件。新建成功后，完整 Token 只会展示一次。
      </Typography.Paragraph>

      <ApiTokensMetrics
        totalCount={items.length}
        boundCount={boundCount}
        enabledCount={enabledCount}
      />

      <DataTable
        cardTitle="Token 列表"
        cardToolbar={canManageTokens ? (
          <BatchActionsBar selectedCount={selectedItems.length} onClear={clearSelection}>
            <Button onClick={() => void handleBatchToggle(true)}>
              批量启用
            </Button>
            <Button onClick={() => void handleBatchToggle(false)}>
              批量停用
            </Button>
            <Popconfirm
              title={`确定删除选中的 ${selectedItems.length} 个 Token 吗？`}
              onConfirm={() => void handleBatchDelete()}
            >
              <Button danger>
                批量删除
              </Button>
            </Popconfirm>
          </BatchActionsBar>
        ) : undefined}
        columns={columns}
        dataSource={items}
        loading={loading}
        rowSelection={tokenRowSelection}
        rowKey="id"
        pageSize={10}
      />

      {canManageTokens ? (
        <ApiTokenFormDrawer
          editingId={editing?.id ?? null}
          form={form}
          isProjectScoped={isProjectScoped}
          loading={saving}
          onClose={() => setDrawerOpen(false)}
          onSubmit={() => void handleSubmit()}
          open={drawerOpen}
          permissionOptions={PERMISSION_OPTIONS}
          visibleProjects={visibleProjects}
          watchedAccessScope={watchedAccessScope}
        />
      ) : null}
    </div>
  );
}
