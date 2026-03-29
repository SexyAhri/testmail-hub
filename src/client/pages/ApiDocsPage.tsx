import {
  ApiOutlined,
  ExportOutlined,
  LinkOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  UnlockOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Col, List, Row, Space, Tag, Typography } from "antd";

import { PageHeader } from "../components";

interface ApiDocsPageProps {
  mailboxDomain: string;
}

export default function ApiDocsPage({ mailboxDomain }: ApiDocsPageProps) {
  const baseUrl = typeof window === "undefined" ? "" : window.location.origin;
  const sampleAddress = `demo@${mailboxDomain || "example.com"}`;
  const latestEmailEndpoint = `${baseUrl}/api/emails/latest?address=${sampleAddress}`;

  const authEndpoints = [
    {
      endpoint: "POST /auth/login",
      description: "支持 `ADMIN_TOKEN` 登录，也支持管理员用户名 + 密码登录，成功后写入签名 Session Cookie。",
    },
    {
      endpoint: "GET /auth/session",
      description: "读取当前登录态，返回当前账号信息、角色和默认邮箱域名。",
    },
    {
      endpoint: "POST /auth/logout",
      description: "清理当前会话 Cookie，退出后台控制台。",
    },
  ];

  const publicEndpoints = [
    {
      endpoint: "GET /api/emails/latest",
      description: "对外开放的查询接口，按邮箱地址返回最新一封已入库邮件。",
    },
  ];

  const adminEndpoints = [
    "GET /admin/stats/overview",
    "GET /admin/emails",
    "GET /admin/emails/:messageId",
    "GET /admin/emails/:messageId/attachments/:attachmentId",
    "POST /admin/emails/:messageId/restore",
    "DELETE /admin/emails/:messageId",
    "DELETE /admin/emails/:messageId/purge",
    "GET|POST|PUT|DELETE /admin/rules",
    "POST /admin/rules/test",
    "GET|POST|PUT|DELETE /admin/whitelist",
    "GET|POST|PUT|DELETE /admin/mailboxes",
    "GET|POST|PUT /admin/admins",
    "GET|POST|PUT|DELETE /admin/notifications",
    "POST /admin/notifications/:id/test",
    "GET /admin/outbound/emails",
    "POST /admin/outbound/emails/send",
    "GET|PUT /admin/outbound/settings",
    "GET /admin/audit",
    "GET /admin/errors",
    "GET /admin/export/:resource?format=csv|json",
  ];

  const exportResources = ["emails", "trash", "rules", "whitelist", "mailboxes", "admins", "notifications", "audit"];

  return (
    <div>
      <PageHeader
        title="开放 API"
        subtitle="当前控制台已经包含登录会话、公共查询接口和完整的后台管理接口。这里整理了一份可直接对接的接口概览。"
        extra={(
          <Button type="primary" href="/emails">
            返回邮件中心
          </Button>
        )}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card size="small" style={{ borderRadius: 12, marginBottom: 16 }}>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Space wrap>
                <Tag icon={<ApiOutlined />} color="processing">
                  GET /api/emails/latest
                </Tag>
                <Tag icon={<LinkOutlined />} color="blue">
                  {baseUrl || "当前域名"}
                </Tag>
              </Space>

              <Typography.Paragraph style={{ marginBottom: 0 }}>
                传入邮箱地址后，返回该地址最新一封已入库邮件的 `message_id`、主题、发件人、收件人、接收时间、验证码与规则命中结果。
              </Typography.Paragraph>

              <div
                style={{
                  padding: 16,
                  borderRadius: 8,
                  background: "rgba(79, 110, 247, 0.06)",
                  fontFamily: "monospace",
                }}
              >
                {latestEmailEndpoint}
              </div>

              <Typography.Title level={5} style={{ margin: 0 }}>
                请求头
              </Typography.Title>
              <div
                style={{
                  padding: 16,
                  borderRadius: 8,
                  background: "rgba(79, 110, 247, 0.06)",
                  fontFamily: "monospace",
                }}
              >
                Authorization: Bearer YOUR_API_TOKEN
              </div>

              <Typography.Title level={5} style={{ margin: 0 }}>
                PowerShell 示例
              </Typography.Title>
              <div
                style={{
                  padding: 16,
                  borderRadius: 8,
                  background: "rgba(79, 110, 247, 0.06)",
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                }}
              >
                {`$headers = @{ Authorization = "Bearer YOUR_API_TOKEN" }
Invoke-RestMethod -Uri "${latestEmailEndpoint}" -Headers $headers`}
              </div>

              <Typography.Title level={5} style={{ margin: 0 }}>
                JavaScript 示例
              </Typography.Title>
              <div
                style={{
                  padding: 16,
                  borderRadius: 8,
                  background: "rgba(79, 110, 247, 0.06)",
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                }}
              >
                {`const response = await fetch("${latestEmailEndpoint}", {
  headers: { Authorization: "Bearer YOUR_API_TOKEN" },
});

const payload = await response.json();`}
              </div>
            </Space>
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card
                size="small"
                title={(
                  <Space>
                    <UnlockOutlined style={{ color: "#4f6ef7" }} />
                    登录与 Session
                  </Space>
                )}
                style={{ borderRadius: 12, height: "100%" }}
              >
                <List
                  size="small"
                  dataSource={authEndpoints}
                  renderItem={item => (
                    <List.Item>
                      <List.Item.Meta
                        title={<Typography.Text code>{item.endpoint}</Typography.Text>}
                        description={item.description}
                      />
                    </List.Item>
                  )}
                />
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card
                size="small"
                title={(
                  <Space>
                    <ApiOutlined style={{ color: "#4f6ef7" }} />
                    公共接口
                  </Space>
                )}
                style={{ borderRadius: 12, height: "100%" }}
              >
                <List
                  size="small"
                  dataSource={publicEndpoints}
                  renderItem={item => (
                    <List.Item>
                      <List.Item.Meta
                        title={<Typography.Text code>{item.endpoint}</Typography.Text>}
                        description={item.description}
                      />
                    </List.Item>
                  )}
                />
              </Card>
            </Col>

            <Col span={24}>
              <Card
                size="small"
                title={(
                  <Space>
                    <ThunderboltOutlined style={{ color: "#4f6ef7" }} />
                    后台管理接口
                  </Space>
                )}
                style={{ borderRadius: 12 }}
              >
                <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                  `/admin/*` 默认走 Cookie Session 鉴权，并按角色校验权限。附件下载、回收站恢复、规则测试、通知测试、导出等都已经接入。
                </Typography.Paragraph>
                <Space wrap size={[8, 8]}>
                  {adminEndpoints.map(endpoint => (
                    <Tag key={endpoint} color="blue">
                      {endpoint}
                    </Tag>
                  ))}
                </Space>
              </Card>
            </Col>
          </Row>
        </Col>

        <Col xs={24} xl={9}>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card size="small" style={{ borderRadius: 12 }}>
              <Space align="start">
                <SafetyCertificateOutlined style={{ fontSize: 20, color: "#4f6ef7", marginTop: 4 }} />
                <div>
                  <Typography.Title level={5} style={{ marginTop: 0 }}>
                    鉴权要求
                  </Typography.Title>
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    公共查询接口使用 `Authorization: Bearer &lt;API_TOKEN&gt;`。后台接口不暴露管理员令牌，而是要求先登录换取 HttpOnly Session。
                  </Typography.Paragraph>
                </div>
              </Space>
            </Card>

            <Alert
              type="info"
              showIcon
              message="CORS 策略"
              description="当前仅对 `/api/*` 公开 CORS，并受 `ALLOWED_API_ORIGINS` 精确限制。后台 `/auth/*` 与 `/admin/*` 不建议跨站调用。"
            />

            <Alert
              type="success"
              showIcon
              message="返回内容"
              description="最新邮件接口返回 `message_id`、`subject`、`from_address`、`to_address`、`received_at`、`verification_code` 和 `results`。没有邮件时返回 404。"
            />

            <Card
              size="small"
              title={(
                <Space>
                  <ExportOutlined style={{ color: "#4f6ef7" }} />
                  导出资源
                </Space>
              )}
              style={{ borderRadius: 12 }}
            >
              <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                后台支持直接导出以下资源，格式可选 `csv` 或 `json`。
              </Typography.Paragraph>
              <Space wrap size={[8, 8]}>
                {exportResources.map(resource => (
                  <Tag key={resource}>{resource}</Tag>
                ))}
              </Space>
            </Card>

            <Alert
              type="warning"
              showIcon
              message="推荐接入方式"
              description="第三方系统读取验证码或登录邮件时，优先调用 `/api/emails/latest`。需要管理规则、邮箱资产和管理员时，再通过控制台或受信任服务调用后台接口。"
            />
          </Space>
        </Col>
      </Row>
    </div>
  );
}
