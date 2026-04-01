import { Col, Form, Input, Switch } from "antd";
import type { FormInstance } from "antd";

import { FormDrawer } from "../../components";
import type { WhitelistMutationPayload, WhitelistRecord } from "../../types";

interface WhitelistFormDrawerProps {
  editing: WhitelistRecord | null;
  form: FormInstance<WhitelistMutationPayload>;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
}

export function WhitelistFormDrawer({
  editing,
  form,
  loading,
  onClose,
  onSubmit,
  open,
}: WhitelistFormDrawerProps) {
  return (
    <FormDrawer
      title={editing ? "编辑白名单规则" : "新增白名单规则"}
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      form={form}
      loading={loading}
    >
      <Col span={24}>
        <Form.Item
          label="发件人模式"
          name="sender_pattern"
          rules={[{ required: true, message: "请输入发件人模式" }]}
        >
          <Input.TextArea rows={6} placeholder="示例: notifications@github\\.com$" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="备注" name="note">
          <Input placeholder="示例: GitHub 官方通知" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="启用状态" name="is_enabled" valuePropName="checked">
          <Switch checkedChildren="开" unCheckedChildren="关" />
        </Form.Item>
      </Col>
    </FormDrawer>
  );
}
