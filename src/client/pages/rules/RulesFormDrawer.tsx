import { Col, Form, Input, Switch } from "antd";
import type { FormInstance } from "antd";

import { FormDrawer } from "../../components";
import type { RuleMutationPayload, RuleRecord } from "../../types";

interface RulesFormDrawerProps {
  editing: RuleRecord | null;
  form: FormInstance<RuleMutationPayload>;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
}

export function RulesFormDrawer({
  editing,
  form,
  loading,
  onClose,
  onSubmit,
  open,
}: RulesFormDrawerProps) {
  return (
    <FormDrawer
      title={editing ? "编辑规则" : "新增规则"}
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      form={form}
      loading={loading}
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
  );
}
