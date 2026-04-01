import {
  DashboardOutlined,
  DatabaseOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Checkbox, Form, Input, Segmented, theme } from "antd";
import { useState } from "react";

import { APP_COPYRIGHT } from "../../brand";
import { BrandLogo } from "../../components/layout/BrandLogo";
import type { LoginPayload } from "../../types";

interface LoginPageProps {
  loading: boolean;
  onLogin: (payload: LoginPayload) => Promise<void>;
}

type LoginMode = "account" | "token";

export default function LoginPage({ loading, onLogin }: LoginPageProps) {
  const { token } = theme.useToken();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<LoginMode>("token");

  const features = [
    {
      icon: <DashboardOutlined />,
      title: "统一监控",
      desc: "收件状态与规则趋势集中总览",
    },
    {
      icon: <DatabaseOutlined />,
      title: "正文留存",
      desc: "完整保存邮件正文、详情与附件信息",
    },
    {
      icon: <SafetyCertificateOutlined />,
      title: "安全访问",
      desc: "支持会话鉴权、角色权限与审计追踪",
    },
    {
      icon: <ThunderboltOutlined />,
      title: "高效运维",
      desc: "后台体验与自动化部署能力",
    },
  ];

  return (
    <div className="login-layout" style={{ background: token.colorBgLayout }}>
      <div className="login-shell">
        <div
          className="login-brand-panel"
          style={{
            background: "linear-gradient(180deg, #1d2736 0%, #10161d 100%)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "60px 64px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 50% 10%, rgba(79, 110, 247, 0.18) 0%, transparent 28%), radial-gradient(circle at 50% 100%, rgba(79, 110, 247, 0.08) 0%, transparent 34%)",
            }}
          />

          <div
            className="page-content login-brand-content"
            style={{ position: "relative", zIndex: 1 }}
          >
            <div style={{ marginBottom: 48 }}>
              <BrandLogo
                animated
                iconBoxSize={44}
                iconSize={20}
                textSize={23}
              />
            </div>

            <h2
              style={{
                fontSize: 36,
                fontWeight: 700,
                color: "#fff",
                lineHeight: 1.18,
                letterSpacing: "-0.02em",
                margin: 0,
                marginBottom: 16,
              }}
            >
              企业级临时邮箱
              {/* <br /> */}
              管理平台
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "rgba(255, 255, 255, 0.56)",
                margin: 0,
                marginBottom: 42,
                lineHeight: 1.9,
              }}
            >
              统一处理收件、规则、白名单、邮箱资产、审计和通知，让运维更简单，也让邮件管理更稳。
            </p>

            <div className="login-feature-grid">
              {features.map((item) => (
                <div
                  key={item.title}
                  style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "rgba(79, 110, 247, 0.14)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#6b8cff",
                      fontSize: 15,
                      flexShrink: 0,
                    }}
                  >
                    {item.icon}
                  </div>
                  <div>
                    <div
                      style={{
                        color: "#fff",
                        fontWeight: 600,
                        fontSize: 14,
                        marginBottom: 3,
                      }}
                    >
                      {item.title}
                    </div>
                    <div
                      style={{
                        color: "rgba(255, 255, 255, 0.42)",
                        fontSize: 12,
                        lineHeight: 1.7,
                      }}
                    >
                      {item.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              position: "absolute",
              bottom: 26,
              left: 64,
              color: "rgba(255, 255, 255, 0.28)",
              fontSize: 12,
            }}
          >
            {APP_COPYRIGHT}
          </div>
        </div>

        <div
          className="login-form-panel"
          style={{
            background: token.colorBgElevated,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "60px 64px",
            boxShadow: "0 0 24px rgba(15, 23, 42, 0.03)",
          }}
        >
          <div className="page-content login-form-content">
            <h2
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: token.colorText,
                margin: 0,
                marginBottom: 8,
              }}
            >
              欢迎回来
            </h2>
            <p
              style={{
                color: token.colorTextSecondary,
                margin: 0,
                marginBottom: 24,
                fontSize: 14,
              }}
            >
              支持管理员令牌登录，也支持创建后的管理员账号密码登录。
            </p>

            <Segmented<LoginMode>
              block
              value={mode}
              options={[
                { label: "令牌登录", value: "token" },
                { label: "账号登录", value: "account" },
              ]}
              onChange={(value) => {
                setMode(value);
                form.resetFields();
              }}
              style={{ marginBottom: 24 }}
            />

            <Form
              form={form}
              layout="vertical"
              initialValues={{ remember: true }}
              size="large"
              onFinish={async (values: {
                password?: string;
                remember?: boolean;
                token?: string;
                username?: string;
              }) => {
                setSubmitting(true);
                try {
                  if (mode === "token") {
                    await onLogin({ token: values.token || "" });
                  } else {
                    await onLogin({
                      password: values.password || "",
                      username: values.username || "",
                    });
                  }
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {mode === "token" ? (
                <Form.Item
                  label="管理员令牌"
                  name="token"
                  rules={[{ required: true, message: "请输入管理员令牌" }]}
                >
                  <Input.Password
                    prefix={
                      <LockOutlined
                        style={{ color: token.colorTextTertiary }}
                      />
                    }
                    placeholder="请输入 ADMIN_TOKEN"
                    style={{ height: 40, borderRadius: 8 }}
                  />
                </Form.Item>
              ) : (
                <>
                  <Form.Item
                    label="用户名"
                    name="username"
                    rules={[{ required: true, message: "请输入用户名" }]}
                  >
                    <Input
                      prefix={
                        <UserOutlined
                          style={{ color: token.colorTextTertiary }}
                        />
                      }
                      placeholder="请输入用户名"
                      style={{ height: 40, borderRadius: 8 }}
                    />
                  </Form.Item>
                  <Form.Item
                    label="密码"
                    name="password"
                    rules={[{ required: true, message: "请输入密码" }]}
                  >
                    <Input.Password
                      prefix={
                        <LockOutlined
                          style={{ color: token.colorTextTertiary }}
                        />
                      }
                      placeholder="请输入密码"
                      style={{ height: 40, borderRadius: 8 }}
                    />
                  </Form.Item>
                </>
              )}

              <Form.Item>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Form.Item name="remember" valuePropName="checked" noStyle>
                    <Checkbox>记住登录状态</Checkbox>
                  </Form.Item>
                  <a style={{ color: token.colorPrimary }}>HttpOnly Session</a>
                </div>
              </Form.Item>

              <Form.Item style={{ marginBottom: 24 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading || submitting}
                  block
                  style={{
                    height: 40,
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 500,
                  }}
                >
                  {loading || submitting ? "登录中..." : "登录"}
                </Button>
              </Form.Item>
            </Form>

            <div
              style={{
                padding: 16,
                background: token.colorFillQuaternary,
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              <div
                style={{
                  color: token.colorTextSecondary,
                  fontSize: 13,
                  marginBottom: 8,
                }}
              >
                登录说明:
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontFamily: "monospace",
                  lineHeight: 1.8,
                }}
              >
                <div>
                  <span style={{ color: token.colorTextTertiary }}>
                    令牌模式:{" "}
                  </span>
                  <span style={{ color: token.colorText }}>
                    ADMIN_TOKEN 换签会话
                  </span>
                </div>
                <div>
                  <span style={{ color: token.colorTextTertiary }}>
                    账号模式:{" "}
                  </span>
                  <span style={{ color: token.colorText }}>
                    使用 admin_users 表中的用户名和密码
                  </span>
                </div>
                <div>
                  <span style={{ color: token.colorTextTertiary }}>
                    浏览器态:{" "}
                  </span>
                  <span style={{ color: token.colorText }}>
                    HttpOnly Cookie + User-Agent 绑定
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
