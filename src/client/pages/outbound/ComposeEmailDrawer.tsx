import { PaperClipOutlined, SendOutlined } from "@ant-design/icons";
import { Button, Col, DatePicker, Form, Input, Select, Space, Typography, theme } from "antd";
import { useRef, type ChangeEvent } from "react";
import type { FormInstance } from "antd";

import { FormDrawer } from "../../components";
import type {
  OutboundEmailAttachmentPayload,
  OutboundEmailRecord,
  OutboundEmailSettings,
  OutboundTemplateRecord,
} from "../../types";
import { formatBytes } from "../../utils";
import type { ComposeFormValues } from "./outbound-utils";

const { Text } = Typography;
const { TextArea } = Input;

interface ComposeEmailDrawerProps {
  attachmentLoading: boolean;
  composeAttachments: OutboundEmailAttachmentPayload[];
  composeSubmitting: "draft" | "send" | null;
  contactOptions: Array<{ label: string; value: string }>;
  editingEmail: OutboundEmailRecord | null;
  form: FormInstance<ComposeFormValues>;
  onApplyTemplate: () => void;
  onAttachmentChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  onRemoveAttachment: (index: number) => void;
  onSaveDraft: () => void;
  onSend: () => void;
  open: boolean;
  sendActionText: string;
  settings: OutboundEmailSettings;
  templates: OutboundTemplateRecord[];
}

export function ComposeEmailDrawer({
  attachmentLoading,
  composeAttachments,
  composeSubmitting,
  contactOptions,
  editingEmail,
  form,
  onApplyTemplate,
  onAttachmentChange,
  onClose,
  onRemoveAttachment,
  onSaveDraft,
  onSend,
  open,
  sendActionText,
  settings,
  templates,
}: ComposeEmailDrawerProps) {
  const { token } = theme.useToken();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <FormDrawer
      title={editingEmail ? `编辑邮件 #${editingEmail.id}` : "新建邮件"}
      open={open}
      onClose={onClose}
      form={form}
      labelLayout="top"
      width="64vw"
      footer={(
        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button loading={composeSubmitting === "draft"} onClick={onSaveDraft}>
              保存草稿
            </Button>
          </Space>
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={composeSubmitting === "send"}
            disabled={!settings.api_key_configured}
            onClick={onSend}
          >
            {sendActionText}
          </Button>
        </Space>
      )}
    >
      <Col span={24}>
        <Text type="secondary">
          当前默认发件地址：{settings.default_from_address || "--"}，{settings.api_key_configured ? "已配置 Resend，可直接发送" : "尚未配置 Resend，只能保存草稿"}
        </Text>
      </Col>
      <Col xs={24} xl={12}>
        <Form.Item label="收件人" name="to" rules={[{ required: true, message: "请输入至少一个收件人" }]}>
          <Select mode="tags" options={contactOptions} tokenSeparators={[",", ";"]} placeholder="输入邮箱后回车，可选择联系人" />
        </Form.Item>
      </Col>
      <Col xs={24} xl={12}>
        <Form.Item label="主题" name="subject" rules={[{ required: true, message: "请输入邮件主题" }]}>
          <Input placeholder="请输入邮件主题" />
        </Form.Item>
      </Col>
      <Col xs={24} xl={12}>
        <Form.Item label="抄送" name="cc">
          <Select mode="tags" options={contactOptions} tokenSeparators={[",", ";"]} placeholder="可留空" />
        </Form.Item>
      </Col>
      <Col xs={24} xl={12}>
        <Form.Item label="密送" name="bcc">
          <Select mode="tags" options={contactOptions} tokenSeparators={[",", ";"]} placeholder="可留空" />
        </Form.Item>
      </Col>
      <Col xs={24} xl={8}>
        <Form.Item label="发件人名称" name="from_name" rules={[{ required: true, message: "请输入发件人名称" }]}>
          <Input placeholder="例如：TestMail Hub" />
        </Form.Item>
      </Col>
      <Col xs={24} xl={8}>
        <Form.Item label="发件地址" name="from_address" rules={[{ required: true, message: "请输入发件地址" }]}>
          <Input placeholder="例如：TestMail@vixenahri.cn" />
        </Form.Item>
      </Col>
      <Col xs={24} xl={8}>
        <Form.Item label="Reply-To" name="reply_to">
          <Input placeholder="可留空" />
        </Form.Item>
      </Col>
      <Col xs={24} xl={8}>
        <Form.Item label="模板" name="template_id">
          <Select
            options={templates.map(item => ({
              label: `${item.name}${item.is_enabled ? "" : "（已停用）"}`,
              value: item.id,
            }))}
            allowClear
            placeholder="可选模板"
          />
        </Form.Item>
      </Col>
      <Col xs={24} xl={8}>
        <Form.Item label="计划发送时间" name="scheduled_at">
          <DatePicker showTime style={{ width: "100%" }} placeholder="留空则立即发送" />
        </Form.Item>
      </Col>
      <Col xs={24} xl={8}>
        <Form.Item label="模板变量 JSON" name="template_variables">
          <Input
            addonAfter={(
              <Button type="link" style={{ paddingInline: 0 }} onClick={onApplyTemplate}>
                套用
              </Button>
            )}
            placeholder='例如：{"code":"123456"}'
          />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="文本正文" name="text_body">
          <TextArea rows={8} placeholder="纯文本正文，可与 HTML 正文二选一或同时填写" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="HTML 正文" name="html_body">
          <TextArea rows={10} placeholder="支持 HTML 内容" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item label="附件">
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Space wrap>
              <Button icon={<PaperClipOutlined />} loading={attachmentLoading} onClick={() => fileInputRef.current?.click()}>
                添加附件
              </Button>
              <Text type="secondary">支持多文件上传，发送时会一并写入 Resend</Text>
            </Space>
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={onAttachmentChange} />
            {composeAttachments.length === 0 ? (
              <Text type="secondary">暂未添加附件</Text>
            ) : (
              composeAttachments.map((item, index) => (
                <div
                  key={`${item.filename}-${index}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                >
                  <Space direction="vertical" size={2}>
                    <Text strong>{item.filename}</Text>
                    <Text type="secondary">{formatBytes(item.size_bytes)} · {item.content_type}</Text>
                  </Space>
                  <Button danger type="link" onClick={() => onRemoveAttachment(index)}>
                    移除
                  </Button>
                </div>
              ))
            )}
          </Space>
        </Form.Item>
      </Col>
    </FormDrawer>
  );
}
