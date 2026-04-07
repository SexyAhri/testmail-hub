import { Alert, Col, Form, Input, Select, Space, Typography } from "antd";
import type { FormInstance } from "antd";

import { FormDrawer } from "../../components";

interface NotificationTestDrawerProps {
  endpointName: string;
  eventOptions: Array<{ label: string; value: string }>;
  form: FormInstance<{ event: string; payload_json: string }>;
  loading: boolean;
  onClose: () => void;
  onResetTemplate: () => void;
  onSubmit: () => void;
  open: boolean;
}

export function NotificationTestDrawer({
  endpointName,
  eventOptions,
  form,
  loading,
  onClose,
  onResetTemplate,
  onSubmit,
  open,
}: NotificationTestDrawerProps) {
  return (
    <FormDrawer
      title={`测试投递 / ${endpointName}`}
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      form={form}
      loading={loading}
      width="42vw"
      labelLayout="top"
      submitText="发送测试"
    >
      <Col span={24}>
        <Alert
          showIcon
          type="info"
          message="测试投递"
          description="可以选择要模拟的事件，并编辑本次发送的 JSON payload。系统仍会自动附带标准事件头和签名。"
        />
      </Col>
      <Col span={24}>
        <Form.Item
          label="测试事件"
          name="event"
          rules={[{ required: true, message: "请选择测试事件。" }]}
        >
          <Select showSearch options={eventOptions} optionFilterProp="label" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <Typography.Text strong>Payload JSON</Typography.Text>
          <Typography.Link onClick={onResetTemplate}>恢复示例</Typography.Link>
        </Space>
      </Col>
      <Col span={24}>
        <Form.Item
          name="payload_json"
          rules={[{ required: true, message: "请输入测试 payload。" }]}
        >
          <Input.TextArea
            rows={14}
            placeholder="{&#10;  &quot;event&quot;: &quot;email.received&quot;&#10;}"
            spellCheck={false}
            style={{ fontFamily: "Consolas, Monaco, monospace" }}
          />
        </Form.Item>
      </Col>
    </FormDrawer>
  );
}
