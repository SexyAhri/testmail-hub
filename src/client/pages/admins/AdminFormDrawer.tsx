import { UserOutlined } from "@ant-design/icons";
import { Col, Form, Input, Select, Switch } from "antd";
import type { FormInstance } from "antd";

import { FormDrawer } from "../../components";
import type {
  AdminMutationPayload,
  AdminRole,
  AdminUserRecord,
  WorkspaceProjectRecord,
} from "../../types";

interface AdminFormDrawerProps {
  assignableRoleOptions: Array<{ label: string; value: AdminRole }>;
  editing: AdminUserRecord | null;
  form: FormInstance<AdminMutationPayload>;
  isProjectScoped: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
  requiresBoundScope: boolean;
  requiresGlobalScope: boolean;
  visibleProjects: WorkspaceProjectRecord[];
  watchedAccessScope?: "all" | "bound";
  watchedRole?: AdminRole;
}

export function AdminFormDrawer({
  assignableRoleOptions,
  editing,
  form,
  isProjectScoped,
  loading,
  onClose,
  onSubmit,
  open,
  requiresBoundScope,
  requiresGlobalScope,
  visibleProjects,
  watchedAccessScope,
}: AdminFormDrawerProps) {
  return (
    <FormDrawer
      title={editing ? "编辑成员" : "新增成员"}
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      form={form}
      loading={loading}
    >
      <Col span={24}>
        <Form.Item
          label="用户名"
          name="username"
          rules={[{ required: !editing, message: "请输入用户名" }]}
        >
          <Input disabled={Boolean(editing)} placeholder="例如：ops-admin" prefix={<UserOutlined />} />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item
          label="显示名称"
          name="display_name"
          rules={[{ required: true, message: "请输入显示名称" }]}
        >
          <Input placeholder="例如：项目运维负责人" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="备注" name="note">
          <Input.TextArea rows={3} placeholder="记录成员职责、归属团队或授权说明" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item
          label="本次操作备注"
          name="operation_note"
          extra="这条说明不会写入成员资料，只会进入审计日志和最近变更记录。"
        >
          <Input.TextArea rows={2} placeholder="例如：补充值班权限、项目交接、按申请单调整角色" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item
          label="角色"
          name="role"
          rules={[{ required: true, message: "请选择角色" }]}
        >
          <Select options={assignableRoleOptions} />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item
          label="访问范围"
          name="access_scope"
          rules={[{ required: true, message: "请选择访问范围" }]}
        >
          <Select
            disabled={isProjectScoped || requiresGlobalScope || requiresBoundScope}
            options={[
              { label: "全局", value: "all" },
              { label: "项目绑定", value: "bound" },
            ]}
          />
        </Form.Item>
      </Col>
      {watchedAccessScope === "bound" && !requiresGlobalScope ? (
        <Col span={24}>
          <Form.Item
            label="绑定项目"
            name="project_ids"
            rules={[{ required: true, message: "请至少选择一个项目" }]}
          >
            <Select
              mode="multiple"
              options={visibleProjects.map(project => ({
                label: project.is_enabled ? project.name : `${project.name}（已停用）`,
                value: project.id,
              }))}
              placeholder="选择该成员可访问的项目"
            />
          </Form.Item>
        </Col>
      ) : null}
      <Col span={24}>
        <Form.Item
          label="密码"
          name="password"
          rules={editing ? [] : [{ required: true, message: "请输入密码" }]}
        >
          <Input.Password
            placeholder={editing ? "留空则不重置密码" : "至少 8 位"}
          />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="启用状态" name="is_enabled" valuePropName="checked">
          <Switch checkedChildren="启用" unCheckedChildren="停用" />
        </Form.Item>
      </Col>
    </FormDrawer>
  );
}
