import { FullscreenExitOutlined, FullscreenOutlined } from "@ant-design/icons";
import { Button, ConfigProvider, Drawer, Form, Row, theme } from "antd";
import { useState, type ReactNode } from "react";
import type { FormInstance, FormProps } from "antd";

interface BaseDrawerProps {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
  width?: string;
}

interface FormDrawerProps extends BaseDrawerProps {
  cancelText?: string;
  footer?: ReactNode;
  form?: FormInstance;
  formProps?: Omit<FormProps, "form">;
  labelLayout?: "hidden" | "left" | "top";
  loading?: boolean;
  onSubmit?: () => void;
  submitText?: string;
}

export function FormDrawer({
  cancelText = "取消",
  children,
  footer,
  form,
  formProps,
  labelLayout = "left",
  loading = false,
  onClose,
  onSubmit,
  open,
  submitText = "确定",
  title,
  width = "50vw",
}: FormDrawerProps) {
  const { token } = theme.useToken();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const formLayout = labelLayout === "top" ? "vertical" : "horizontal";
  const labelCol = labelLayout === "hidden" ? { span: 0 } : labelLayout === "left" ? { span: 6 } : undefined;
  const wrapperCol = labelLayout === "hidden" ? { span: 24 } : labelLayout === "left" ? { span: 18 } : undefined;

  return (
    <Drawer
      title={title}
      open={open}
      onClose={onClose}
      styles={{
        wrapper: { width: isFullscreen ? "100vw" : width },
        header: {
          background: token.colorPrimaryBg,
          borderBottom: `1px solid ${token.colorPrimaryBorder}`,
          padding: "6px 14px",
        },
        body: {
          overflow: "auto",
          flex: 1,
          minHeight: 0,
        },
        footer: {
          padding: "8px 14px",
          borderTop: `1px solid ${token.colorBorderSecondary}`,
        },
      }}
      extra={(
        <Button
          type="text"
          icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          onClick={() => setIsFullscreen(value => !value)}
        />
      )}
      footer={footer ?? (
        <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
          <Button onClick={onClose}>{cancelText}</Button>
          <Button type="primary" onClick={onSubmit} loading={loading}>
            {submitText}
          </Button>
        </div>
      )}
    >
      {form ? (
        <Form
          form={form}
          layout={formLayout}
          labelCol={labelCol}
          wrapperCol={wrapperCol}
          {...formProps}
        >
          <Row gutter={16}>{children}</Row>
        </Form>
      ) : children}
    </Drawer>
  );
}

export function DetailDrawer({
  children,
  footer,
  onClose,
  open,
  title,
  width = "50vw",
}: BaseDrawerProps & { footer?: ReactNode }) {
  const { token } = theme.useToken();
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <Drawer
      title={title}
      open={open}
      onClose={onClose}
      styles={{
        wrapper: { width: isFullscreen ? "100vw" : width },
        header: {
          background: token.colorPrimaryBg,
          borderBottom: `1px solid ${token.colorPrimaryBorder}`,
          padding: "6px 14px",
        },
        body: {
          overflow: "auto",
          flex: 1,
          minHeight: 0,
        },
        footer: {
          padding: "8px 14px",
          borderTop: `1px solid ${token.colorBorderSecondary}`,
        },
      }}
      extra={(
        <Button
          type="text"
          icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          onClick={() => setIsFullscreen(value => !value)}
        />
      )}
      footer={footer}
    >
      {children}
    </Drawer>
  );
}

export function ViewDrawer({
  children,
  form,
  labelLayout = "left",
  onClose,
  open,
  title,
  width = "50vw",
}: BaseDrawerProps & { form?: FormInstance; labelLayout?: "hidden" | "left" | "top" }) {
  const { token } = theme.useToken();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const formLayout = labelLayout === "top" ? "vertical" : "horizontal";
  const labelCol = labelLayout === "hidden" ? { span: 0 } : labelLayout === "left" ? { span: 6 } : undefined;
  const wrapperCol = labelLayout === "hidden" ? { span: 24 } : labelLayout === "left" ? { span: 18 } : undefined;

  return (
    <Drawer
      title={title}
      open={open}
      onClose={onClose}
      styles={{
        wrapper: { width: isFullscreen ? "100vw" : width },
        header: {
          background: token.colorPrimaryBg,
          borderBottom: `1px solid ${token.colorPrimaryBorder}`,
          padding: "6px 14px",
        },
        body: {
          overflow: "auto",
          flex: 1,
          minHeight: 0,
        },
        footer: {
          padding: "8px 14px",
          borderTop: `1px solid ${token.colorBorderSecondary}`,
        },
      }}
      extra={(
        <Button
          type="text"
          icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          onClick={() => setIsFullscreen(value => !value)}
        />
      )}
      footer={(
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button onClick={onClose}>关闭</Button>
        </div>
      )}
    >
      <ConfigProvider
        theme={{
          components: {
            DatePicker: { colorBgContainerDisabled: "transparent" },
            Input: { colorBgContainerDisabled: "transparent" },
            InputNumber: { colorBgContainerDisabled: "transparent" },
            Select: { colorBgContainerDisabled: "transparent" },
            TreeSelect: { colorBgContainerDisabled: "transparent" },
          },
        }}
      >
        {form ? (
          <Form form={form} layout={formLayout} labelCol={labelCol} wrapperCol={wrapperCol} disabled>
            <Row gutter={16}>{children}</Row>
          </Form>
        ) : children}
      </ConfigProvider>
    </Drawer>
  );
}
