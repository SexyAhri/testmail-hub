import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Col, Form, Input, InputNumber, Select, Space, Switch, Typography } from "antd";
import type { FormInstance } from "antd";

import { FormDrawer } from "../../components";
import type {
  NotificationMutationPayload,
  WorkspaceProjectRecord,
} from "../../types";

interface NotificationFormDrawerProps {
  editingId?: number | null;
  eventOptions: Array<{ label: string; options: Array<{ label: string; value: string }> }>;
  form: FormInstance<NotificationMutationPayload>;
  isProjectScoped: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
  visibleProjects: WorkspaceProjectRecord[];
  watchedAccessScope?: "all" | "bound";
}

export function NotificationFormDrawer({
  editingId,
  eventOptions,
  form,
  isProjectScoped,
  loading,
  onClose,
  onSubmit,
  open,
  visibleProjects,
  watchedAccessScope,
}: NotificationFormDrawerProps) {
  return (
    <FormDrawer
      title={editingId ? "编辑通知端点" : "新增通知端点"}
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      form={form}
      loading={loading}
    >
      <Col span={24}>
        <Form.Item label="名称" name="name" rules={[{ required: true, message: "请输入名称" }]}>
          <Input placeholder="例如：登录回调 Webhook" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="目标地址" name="target" rules={[{ required: true, message: "请输入目标地址" }]}>
          <Input placeholder="https://example.com/webhook" />
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
              placeholder="选择需要接收事件的项目"
            />
          </Form.Item>
        </Col>
      ) : null}
      <Col span={24}>
        <Form.Item label="事件" name="events" rules={[{ required: true, message: "请选择事件" }]}>
          <Select mode="multiple" options={eventOptions} />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="签名 Secret" name="secret">
          <Input.Password placeholder="可留空" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Typography.Text strong>自定义请求头</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
          用于补充 `Authorization`、`X-App-Key` 这类 webhook 自定义请求头。系统保留 `Content-Type`、事件头和签名头。
        </Typography.Paragraph>
      </Col>
      <Col span={24}>
        <Form.List name="custom_headers">
          {(fields, { add, remove }) => (
            <div style={{ display: "grid", gap: 12 }}>
              {fields.map(field => (
                <Space key={field.key} align="start" style={{ display: "flex" }}>
                  <Form.Item
                    {...field}
                    label={false}
                    name={[field.name, "key"]}
                    rules={[{ required: true, message: "请输入请求头名称。" }]}
                    style={{ minWidth: 220, marginBottom: 0 }}
                  >
                    <Input placeholder="Header-Name" />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    label={false}
                    name={[field.name, "value"]}
                    rules={[{ required: true, message: "请输入请求头值。" }]}
                    style={{ flex: 1, marginBottom: 0 }}
                  >
                    <Input placeholder="Header Value" />
                  </Form.Item>
                  <Button
                    type="text"
                    danger
                    icon={<MinusCircleOutlined />}
                    onClick={() => remove(field.name)}
                  />
                </Space>
              ))}
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ key: "", value: "" })}>
                添加请求头
              </Button>
            </div>
          )}
        </Form.List>
      </Col>
      <Col span={24}>
        <Form.Item
          label="本次操作备注"
          name="operation_note"
          extra="这条说明不会写入通知端点配置，只会进入审计日志。"
        >
          <Input.TextArea rows={2} placeholder="例如：新增登录告警回调、切换接收地址、按值班安排调整通知范围" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="启用状态" name="is_enabled" valuePropName="checked">
          <Switch checkedChildren="启用" unCheckedChildren="停用" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Typography.Text strong>告警规则</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
          用于控制死信堆积、重试堆积、成功率和静默时长的告警阈值。
        </Typography.Paragraph>
      </Col>
      <Col span={12}>
        <Form.Item label="死信预警阈值" name={["alert_config", "dead_letter_warning_threshold"]}>
          <InputNumber min={0} style={{ width: "100%" }} />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item label="死信严重阈值" name={["alert_config", "dead_letter_critical_threshold"]}>
          <InputNumber min={0} style={{ width: "100%" }} />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item label="重试预警阈值" name={["alert_config", "retrying_warning_threshold"]}>
          <InputNumber min={0} style={{ width: "100%" }} />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item label="重试严重阈值" name={["alert_config", "retrying_critical_threshold"]}>
          <InputNumber min={0} style={{ width: "100%" }} />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item label="成功率预警阈值 (%)" name={["alert_config", "success_rate_warning_threshold"]}>
          <InputNumber min={0} max={100} style={{ width: "100%" }} />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item label="成功率严重阈值 (%)" name={["alert_config", "success_rate_critical_threshold"]}>
          <InputNumber min={0} max={100} style={{ width: "100%" }} />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item label="最小样本数 (24h)" name={["alert_config", "min_attempts_24h"]}>
          <InputNumber min={0} style={{ width: "100%" }} />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item label="静默告警时长 (小时)" name={["alert_config", "inactivity_hours"]}>
          <InputNumber min={0} style={{ width: "100%" }} />
        </Form.Item>
      </Col>
    </FormDrawer>
  );
}
