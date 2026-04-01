import { Alert, Col, Form, Input, InputNumber, Select, Switch } from "antd";
import type { FormInstance } from "antd";

import { FormDrawer } from "../../components";
import type {
  MailboxPoolRecord,
  RetentionPolicyPayload,
  RetentionPolicyRecord,
  WorkspaceEnvironmentRecord,
  WorkspaceProjectRecord,
} from "../../types";
import { buildMailboxPoolOptionsForForm } from "./retention-utils";

interface RetentionPolicyFormDrawerProps {
  accessibleProjectIds: number[];
  editing: RetentionPolicyRecord | null;
  form: FormInstance<RetentionPolicyPayload>;
  formEnvironmentId?: number | null;
  formProjectId?: number | null;
  isProjectScoped: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
  visibleEnvironments: WorkspaceEnvironmentRecord[];
  visibleMailboxPools: MailboxPoolRecord[];
  visibleProjects: WorkspaceProjectRecord[];
}

export function RetentionPolicyFormDrawer({
  accessibleProjectIds,
  editing,
  form,
  formEnvironmentId,
  formProjectId,
  isProjectScoped,
  loading,
  onClose,
  onSubmit,
  open,
  visibleEnvironments,
  visibleMailboxPools,
  visibleProjects,
}: RetentionPolicyFormDrawerProps) {
  return (
    <FormDrawer
      title={editing ? "编辑生命周期策略" : "新建生命周期策略"}
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      loading={loading}
      form={form}
      formProps={{ layout: "vertical" }}
      width="42vw"
    >
      <Col span={24}>
        <Alert
          showIcon
          type="info"
          message="未填写的保留字段会继续继承上层作用域；默认邮箱 TTL 仅在新建邮箱且未手动指定过期时间时生效。"
        />
      </Col>

      <Col span={24}>
        <Form.Item
          label="策略名称"
          name="name"
          rules={[{ required: true, message: "请输入策略名称" }]}
        >
          <Input placeholder="例如：项目默认保留策略" />
        </Form.Item>
      </Col>

      <Col span={24}>
        <Form.Item label="说明" name="description">
          <Input.TextArea rows={3} placeholder="描述这条策略覆盖的范围和用途" />
        </Form.Item>
      </Col>

      <Col span={24}>
        <Form.Item
          label="本次操作备注"
          name="operation_note"
          extra="这条说明不会写入策略本身，只会进入审计日志。"
        >
          <Input.TextArea rows={2} placeholder="例如：按归档要求新增默认 TTL、缩短测试环境保留期、统一清理窗口" />
        </Form.Item>
      </Col>

      <Col span={12}>
        <Form.Item label="项目" name="project_id">
          <Select
            allowClear={!isProjectScoped}
            disabled={isProjectScoped && accessibleProjectIds.length === 1}
            placeholder={isProjectScoped ? "请选择绑定项目" : "留空表示全局策略"}
            options={visibleProjects.map(project => ({ label: project.name, value: project.id }))}
            onChange={() => {
              form.setFieldsValue({ environment_id: null, mailbox_pool_id: null });
            }}
          />
        </Form.Item>
      </Col>

      <Col span={12}>
        <Form.Item label="环境" name="environment_id">
          <Select
            allowClear
            disabled={!formProjectId}
            placeholder="可选，继承项目策略"
            options={visibleEnvironments.map(environment => ({
              label: `${environment.project_name} / ${environment.name}`,
              value: environment.id,
            }))}
            onChange={() => {
              form.setFieldsValue({ mailbox_pool_id: null });
            }}
          />
        </Form.Item>
      </Col>

      <Col span={24}>
        <Form.Item label="邮箱池" name="mailbox_pool_id">
          <Select
            allowClear
            disabled={!formEnvironmentId}
            placeholder="可选，最细粒度策略"
            options={buildMailboxPoolOptionsForForm(visibleMailboxPools)}
          />
        </Form.Item>
      </Col>

      <Col span={8}>
        <Form.Item label="自动归档（小时）" name="archive_email_hours">
          <InputNumber min={1} max={24 * 365 * 5} precision={0} style={{ width: "100%" }} placeholder="例如 24" />
        </Form.Item>
      </Col>

      <Col span={8}>
        <Form.Item label="默认邮箱 TTL（小时）" name="mailbox_ttl_hours">
          <InputNumber min={1} max={24 * 365 * 5} precision={0} style={{ width: "100%" }} placeholder="例如 24" />
        </Form.Item>
      </Col>

      <Col span={8}>
        <Form.Item label="邮件保留（小时）" name="email_retention_hours">
          <InputNumber min={1} max={24 * 365 * 5} precision={0} style={{ width: "100%" }} placeholder="例如 48" />
        </Form.Item>
      </Col>

      <Col span={8}>
        <Form.Item label="已删邮件保留（小时）" name="deleted_email_retention_hours">
          <InputNumber min={1} max={24 * 365 * 5} precision={0} style={{ width: "100%" }} placeholder="例如 720" />
        </Form.Item>
      </Col>

      <Col span={24}>
        <Form.Item label="启用策略" name="is_enabled" valuePropName="checked">
          <Switch checkedChildren="启用" unCheckedChildren="停用" />
        </Form.Item>
      </Col>
    </FormDrawer>
  );
}
