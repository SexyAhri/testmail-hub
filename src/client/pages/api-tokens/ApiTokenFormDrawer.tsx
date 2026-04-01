import { Col, DatePicker, Form, Input, Select, Switch } from "antd";
import type { FormInstance } from "antd";
import type { Dayjs } from "dayjs";

import { FormDrawer } from "../../components";
import type {
  ApiTokenPermission,
  WorkspaceProjectRecord,
} from "../../types";

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

interface ApiTokenFormDrawerProps {
  editingId?: string | null;
  form: FormInstance<ApiTokenFormValues>;
  isProjectScoped: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
  permissionOptions: Array<{ label: string; value: ApiTokenPermission }>;
  visibleProjects: WorkspaceProjectRecord[];
  watchedAccessScope?: "all" | "bound";
}

export function ApiTokenFormDrawer({
  editingId,
  form,
  isProjectScoped,
  loading,
  onClose,
  onSubmit,
  open,
  permissionOptions,
  visibleProjects,
  watchedAccessScope,
}: ApiTokenFormDrawerProps) {
  return (
    <FormDrawer
      title={editingId ? "编辑 API Token" : "新建 API Token"}
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      form={form}
      loading={loading}
    >
      <Col span={24}>
        <Form.Item label="名称" name="name" rules={[{ required: true, message: "请输入名称" }]}>
          <Input placeholder="例如：Playwright Staging Token" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="说明" name="description">
          <Input.TextArea rows={3} placeholder="描述这个 Token 的用途" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item
          label="访问范围"
          name="access_scope"
          rules={[{ required: true, message: "请选择访问范围" }]}
        >
          <Select
            disabled={isProjectScoped}
            options={[
              { label: "全局", value: "all" },
              { label: "项目绑定", value: "bound" },
            ]}
          />
        </Form.Item>
      </Col>
      {watchedAccessScope === "bound" ? (
        <Col span={24}>
          <Form.Item
            label="绑定项目"
            name="project_ids"
            rules={[{ required: true, message: "请至少选择一个项目" }]}
          >
            <Select
              mode="multiple"
              options={visibleProjects.map(project => ({
                label: project.name,
                value: project.id,
              }))}
              placeholder="限制 Token 只能访问这些项目"
            />
          </Form.Item>
        </Col>
      ) : null}
      <Col span={24}>
        <Form.Item
          label="权限"
          name="permissions"
          rules={[{ required: true, message: "请至少选择一个权限" }]}
        >
          <Select mode="multiple" options={permissionOptions} />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item
          label="本次操作备注"
          name="operation_note"
          extra="这条说明不会写入 Token 配置，只会进入审计日志。"
        >
          <Input.TextArea rows={2} placeholder="例如：签发给 Playwright 任务、收缩访问范围、轮换旧 Token 权限" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="过期时间" name="expires_at">
          <DatePicker showTime style={{ width: "100%" }} placeholder="留空则不过期" />
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
