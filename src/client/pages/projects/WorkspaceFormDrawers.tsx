import { Col, Form, Input, Select, Switch } from "antd";
import type { FormInstance } from "antd";

import { FormDrawer } from "../../components";
import type {
  MailboxPoolPayload,
  MailboxPoolRecord,
  WorkspaceEnvironmentPayload,
  WorkspaceEnvironmentRecord,
  WorkspaceProjectPayload,
  WorkspaceProjectRecord,
} from "../../types";

interface ProjectFormDrawerProps {
  editing: WorkspaceProjectRecord | null;
  form: FormInstance<WorkspaceProjectPayload>;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
}

export function ProjectFormDrawer({
  editing,
  form,
  loading,
  onClose,
  onSubmit,
  open,
}: ProjectFormDrawerProps) {
  return (
    <FormDrawer
      title={editing ? "编辑项目" : "新增项目"}
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      form={form}
      loading={loading}
    >
      <Col span={24}>
        <Form.Item label="项目名称" name="name" rules={[{ required: true, message: "请输入项目名称" }]}>
          <Input placeholder="例如：账号体系测试" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="项目标识" name="slug">
          <Input placeholder="例如：account-auth" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="描述" name="description">
          <Input.TextArea rows={3} placeholder="补充项目用途、业务线或交付说明" />
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

interface EnvironmentFormDrawerProps {
  editing: WorkspaceEnvironmentRecord | null;
  form: FormInstance<WorkspaceEnvironmentPayload>;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
  projectOptions: Array<{ label: string; value: number }>;
}

export function EnvironmentFormDrawer({
  editing,
  form,
  loading,
  onClose,
  onSubmit,
  open,
  projectOptions,
}: EnvironmentFormDrawerProps) {
  return (
    <FormDrawer
      title={editing ? "编辑环境" : "新增环境"}
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      form={form}
      loading={loading}
    >
      <Col span={24}>
        <Form.Item label="所属项目" name="project_id" rules={[{ required: true, message: "请选择项目" }]}>
          <Select options={projectOptions} placeholder="选择项目" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="环境名称" name="name" rules={[{ required: true, message: "请输入环境名称" }]}>
          <Input placeholder="例如：staging" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="环境标识" name="slug">
          <Input placeholder="例如：staging" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="描述" name="description">
          <Input.TextArea rows={3} placeholder="说明环境用途，例如联调、灰度、生产" />
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

interface MailboxPoolFormDrawerProps {
  editing: MailboxPoolRecord | null;
  environmentOptions: Array<{ label: string; value: number }>;
  form: FormInstance<MailboxPoolPayload>;
  loading: boolean;
  onClose: () => void;
  onProjectChange: () => void;
  onSubmit: () => void;
  open: boolean;
  projectId?: number | null;
  projectOptions: Array<{ label: string; value: number }>;
}

export function MailboxPoolFormDrawer({
  editing,
  environmentOptions,
  form,
  loading,
  onClose,
  onProjectChange,
  onSubmit,
  open,
  projectId,
  projectOptions,
}: MailboxPoolFormDrawerProps) {
  return (
    <FormDrawer
      title={editing ? "编辑邮箱池" : "新增邮箱池"}
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      form={form}
      loading={loading}
    >
      <Col span={24}>
        <Form.Item label="所属项目" name="project_id" rules={[{ required: true, message: "请选择项目" }]}>
          <Select
            options={projectOptions}
            placeholder="选择项目"
            onChange={onProjectChange}
          />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="所属环境" name="environment_id" rules={[{ required: true, message: "请选择环境" }]}>
          <Select
            options={environmentOptions}
            placeholder={projectId ? "选择环境" : "请先选择项目"}
            disabled={!projectId}
          />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="邮箱池名称" name="name" rules={[{ required: true, message: "请输入邮箱池名称" }]}>
          <Input placeholder="例如：登录验证码池" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="邮箱池标识" name="slug">
          <Input placeholder="例如：login-codes" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="描述" name="description">
          <Input.TextArea rows={3} placeholder="说明该邮箱池服务的测试场景或团队" />
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
