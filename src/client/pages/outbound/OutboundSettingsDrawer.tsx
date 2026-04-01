import { Col, Form, Input, Switch } from "antd";
import type { FormInstance } from "antd";

import { FormDrawer } from "../../components";
import type { OutboundEmailSettingsPayload } from "../../types";

interface OutboundSettingsDrawerProps {
  form: FormInstance<OutboundEmailSettingsPayload>;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
}

export function OutboundSettingsDrawer({
  form,
  loading,
  onClose,
  onSubmit,
  open,
}: OutboundSettingsDrawerProps) {
  return (
    <FormDrawer
      title="发件设置"
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      form={form}
      labelLayout="top"
      loading={loading}
    >
      <Col span={24}>
        <Form.Item label="默认发件人名称" name="default_from_name" rules={[{ required: true, message: "请输入默认发件人名称" }]}>
          <Input />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="默认发件地址" name="default_from_address" rules={[{ required: true, message: "请输入默认发件地址" }]}>
          <Input />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="默认 Reply-To" name="default_reply_to">
          <Input placeholder="可留空" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="允许外部收件人" name="allow_external_recipients" valuePropName="checked">
          <Switch checkedChildren="已开启" unCheckedChildren="已关闭" />
        </Form.Item>
      </Col>
    </FormDrawer>
  );
}
