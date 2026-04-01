import { Col, Form, Input, Switch } from "antd";
import type { FormInstance } from "antd";

import { FormDrawer } from "../../components";
import type { OutboundTemplateRecord } from "../../types";
import type { TemplateFormValues } from "./outbound-utils";

const { TextArea } = Input;

interface OutboundTemplateDrawerProps {
  editingTemplate: OutboundTemplateRecord | null;
  form: FormInstance<TemplateFormValues>;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
}

export function OutboundTemplateDrawer({
  editingTemplate,
  form,
  loading,
  onClose,
  onSubmit,
  open,
}: OutboundTemplateDrawerProps) {
  return (
    <FormDrawer
      title={editingTemplate ? "编辑模板" : "新建模板"}
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      form={form}
      labelLayout="top"
      width="56vw"
      loading={loading}
    >
      <Col span={24}>
        <Form.Item label="模板名称" name="name" rules={[{ required: true, message: "请输入模板名称" }]}>
          <Input />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="主题模板" name="subject_template" rules={[{ required: true, message: "请输入主题模板" }]}>
          <Input placeholder="例如：{{product}} 登录验证码" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="文本模板" name="text_template">
          <TextArea rows={6} placeholder="支持 {{variable}} 占位符" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="HTML 模板" name="html_template">
          <TextArea rows={8} placeholder="支持 {{variable}} 占位符" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="变量列表" name="variables" extra="多个变量使用逗号分隔">
          <Input placeholder="例如：product, code, username" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="启用模板" name="is_enabled" valuePropName="checked">
          <Switch checkedChildren="启用" unCheckedChildren="停用" />
        </Form.Item>
      </Col>
    </FormDrawer>
  );
}
