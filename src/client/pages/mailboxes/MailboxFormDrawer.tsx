import { Alert, Button, Col, DatePicker, Form, Input, Select, Switch } from "antd";
import type { FormInstance } from "antd";
import type { Dayjs } from "dayjs";

import { FormDrawer, RetentionSummary } from "../../components";
import { formatRetentionHours } from "../../retention";
import type { MailboxRecord, ResolvedRetentionPolicy } from "../../types";

interface DomainOption {
  label: string;
  value: string;
}

interface ScopeOption {
  label: string;
  value: number;
}

interface MailboxFormValues {
  batch_count: number;
  domain: string;
  environment_id?: number;
  expires_at?: Dayjs | null;
  is_enabled: boolean;
  local_part: string;
  mailbox_pool_id?: number;
  note: string;
  project_id?: number;
  tags: string;
}

interface MailboxFormDrawerProps {
  domainOptions: DomainOption[];
  editing: MailboxRecord | null;
  environmentOptions: ScopeOption[];
  form: FormInstance<MailboxFormValues>;
  formResolvedRetention: ResolvedRetentionPolicy;
  isProjectScoped: boolean;
  loading: boolean;
  mailboxPoolOptions: ScopeOption[];
  onClose: () => void;
  onProjectChange: () => void;
  onRandomizeLocalPart: () => void;
  onSubmit: () => void;
  open: boolean;
  projectOptions: ScopeOption[];
  watchedEnvironmentId?: number;
  watchedProjectId?: number;
}

export function MailboxFormDrawer({
  domainOptions,
  editing,
  environmentOptions,
  form,
  formResolvedRetention,
  isProjectScoped,
  loading,
  mailboxPoolOptions,
  onClose,
  onProjectChange,
  onRandomizeLocalPart,
  onSubmit,
  open,
  projectOptions,
  watchedEnvironmentId,
  watchedProjectId,
}: MailboxFormDrawerProps) {
  return (
    <FormDrawer
      title={editing ? "编辑邮箱" : "新建邮箱"}
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      form={form}
      loading={loading}
    >
      <Col span={24}>
        <Alert
          showIcon
          type="info"
          message="生效中的生命周期"
          description={(
            <div style={{ display: "grid", gap: 8 }}>
              <RetentionSummary resolved={formResolvedRetention} nowrap={false} />
              <span>
                {formResolvedRetention.mailbox_ttl_hours !== null
                  ? `若未填写到期时间，该邮箱会继承 ${formatRetentionHours(formResolvedRetention.mailbox_ttl_hours)} 的 TTL；收到的邮件仍会按当前归档与清理策略处理。`
                  : "当前作用域没有生效的默认邮箱 TTL；收到的邮件仍会按当前归档与清理策略处理。"}
              </span>
            </div>
          )}
        />
      </Col>
      <Col span={24}>
        <Form.Item label="前缀" name="local_part" extra="留空时会自动生成随机前缀。">
          <Input
            placeholder="例如：openai-login"
            addonAfter={(
              <Button type="link" style={{ paddingInline: 0 }} onClick={onRandomizeLocalPart}>
                随机
              </Button>
            )}
          />
        </Form.Item>
      </Col>
      {!editing ? (
        <Col span={24}>
          <Form.Item label="批量数量" name="batch_count" initialValue={1}>
            <Input type="number" min={1} max={50} />
          </Form.Item>
        </Col>
      ) : null}
      <Col span={24}>
        <Form.Item label="域名" name="domain" rules={[{ required: true, message: "请选择域名。" }]}>
          <Select showSearch options={domainOptions} placeholder="选择已接入域名" optionFilterProp="label" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item
          label="项目"
          name="project_id"
          rules={isProjectScoped ? [{ required: true, message: "项目范围管理员必须选择已绑定项目。" }] : []}
        >
          <Select
            allowClear={!isProjectScoped}
            options={projectOptions}
            placeholder={isProjectScoped ? "选择已绑定项目" : "可选，留空表示该邮箱暂不归属任何项目。"}
            onChange={onProjectChange}
          />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="环境" name="environment_id">
          <Select
            allowClear
            options={environmentOptions}
            placeholder={watchedProjectId ? "选择环境" : "请先选择项目"}
            disabled={!watchedProjectId}
            onChange={() => form.setFieldValue("mailbox_pool_id", undefined)}
          />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="邮箱池" name="mailbox_pool_id">
          <Select
            allowClear
            options={mailboxPoolOptions}
            placeholder={watchedEnvironmentId ? "选择邮箱池" : "请先选择环境"}
            disabled={!watchedEnvironmentId}
          />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="备注" name="note">
          <Input placeholder="例如：GitHub 登录测试" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="标签" name="tags" extra="多个标签请用逗号分隔。">
          <Input placeholder="例如：github, login, ci" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="到期时间" name="expires_at">
          <DatePicker showTime style={{ width: "100%" }} />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="启用" name="is_enabled" valuePropName="checked">
          <Switch checkedChildren="开" unCheckedChildren="关" />
        </Form.Item>
      </Col>
    </FormDrawer>
  );
}
