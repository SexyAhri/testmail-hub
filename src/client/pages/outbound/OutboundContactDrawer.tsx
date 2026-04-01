import { Col, Form, Input, Switch } from "antd";
import type { FormInstance } from "antd";

import { FormDrawer } from "../../components";
import type { OutboundContactRecord } from "../../types";
import type { ContactFormValues } from "./outbound-utils";

const { TextArea } = Input;

interface OutboundContactDrawerProps {
  editingContact: OutboundContactRecord | null;
  form: FormInstance<ContactFormValues>;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
}

export function OutboundContactDrawer({
  editingContact,
  form,
  loading,
  onClose,
  onSubmit,
  open,
}: OutboundContactDrawerProps) {
  return (
    <FormDrawer
      title={editingContact ? "编辑联系人" : "新建联系人"}
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      form={form}
      labelLayout="top"
      loading={loading}
    >
      <Col span={24}>
        <Form.Item label="联系人名称" name="name" rules={[{ required: true, message: "请输入联系人名称" }]}>
          <Input />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="邮箱地址" name="email" rules={[{ required: true, message: "请输入邮箱地址" }]}>
          <Input />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="标签" name="tags" extra="多个标签用逗号分隔">
          <Input placeholder="例如：客户, 付款, 测试" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="备注" name="note">
          <TextArea rows={4} />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="收藏联系人" name="is_favorite" valuePropName="checked">
          <Switch checkedChildren="收藏" unCheckedChildren="普通" />
        </Form.Item>
      </Col>
    </FormDrawer>
  );
}
