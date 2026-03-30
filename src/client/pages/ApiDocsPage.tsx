import {
  ApiOutlined,
  ExportOutlined,
  KeyOutlined,
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
  const latestCodeEndpoint = `${baseUrl}/api/emails/code?address=${sampleAddress}`;
  const latestExtractionEndpoint = `${baseUrl}/api/emails/latest/extraction?address=${sampleAddress}`;

  const authEndpoints = [
    {
      endpoint: "POST /auth/login",
      description: "支持 Bootstrap 管理令牌登录，也支持管理员用户名 + 密码登录，成功后写入签名 Session Cookie。",
    },
    {
      endpoint: "GET /auth/session",
      description: "读取当前登录状态，返回管理员角色、访问范围以及默认邮箱域名。",
    },
    {
      endpoint: "POST /auth/logout",
      description: "清理当前 Session Cookie，退出后台控制台。",
    },
  ];

  const publicEndpoints = [
    {
      endpoint: "GET /api/emails/latest",
      description: "按邮箱地址返回最新一封邮件摘要，要求 Bearer Token 具备 `read:mail` 权限。",
    },
    {
      endpoint: "GET /api/emails/code",
      description: "按邮箱地址或 `message_id` 返回验证码，要求 Bearer Token 具备 `read:code` 权限。",
    },
    {
      endpoint: "GET /api/emails/latest/extraction",
      description: "只返回验证码、链接、平台识别等结构化提取结果，要求 Bearer Token 具备 `read:code` 权限。",
    },
    {
      endpoint: "GET /api/emails/:messageId",
      description: "返回指定邮件正文、头信息和附件元数据，要求 `read:mail` 权限。",
    },
    {
      endpoint: "GET /api/emails/:messageId/attachments/:attachmentId",
      description: "下载指定附件二进制内容，要求 `read:attachment` 权限。",
    },
    {
      endpoint: "GET /api/emails/:messageId/extractions",
      description: "返回提取结果、规则命中和最终验证码，要求 `read:rule-result` 权限。",
    },
  ];

  const permissionTags = [
    { color: "blue", value: "read:mail", description: "读取最新邮件摘要和邮件详情" },
    { color: "gold", value: "read:code", description: "读取验证码和验证码接口返回结果" },
    { color: "purple", value: "read:attachment", description: "下载邮件附件二进制内容" },
    { color: "cyan", value: "read:rule-result", description: "读取结构化提取结果和规则命中信息" },
  ];

  const adminEndpoints = [
    "GET /admin/stats/overview",
    "GET /admin/workspace/catalog",
    "POST|PUT|DELETE /admin/projects",
    "POST|PUT|DELETE /admin/environments",
    "POST|PUT|DELETE /admin/mailbox-pools",
    "GET /admin/emails",
    "GET /admin/emails/:messageId",
    "GET /admin/emails/:messageId/attachments/:attachmentId",
    "PUT /admin/emails/:messageId/metadata",
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
    "GET|POST|PUT|DELETE /admin/api-tokens",
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
        subtitle="这里汇总了登录会话、公开查询接口、项目级 API Token，以及支持项目绑定的 Webhook 对接方式。"
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
                自动化脚本通常先通过最新邮件接口获取 `message_id`，再按需读取验证码、邮件详情、附件或提取结果。
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

              <div
                style={{
                  padding: 16,
                  borderRadius: 8,
                  background: "rgba(79, 110, 247, 0.04)",
                  fontFamily: "monospace",
                }}
              >
                验证码接口: {latestCodeEndpoint}
              </div>

              <div
                style={{
                  padding: 16,
                  borderRadius: 8,
                  background: "rgba(79, 110, 247, 0.04)",
                  fontFamily: "monospace",
                }}
              >
                提取结果接口: {latestExtractionEndpoint}
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
                Authorization: Bearer YOUR_MANAGED_TOKEN
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
Invoke-RestMethod -Uri "${latestCodeEndpoint}" -Headers $headers`}
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
                {`const latest = await fetch("${latestEmailEndpoint}", {
  headers: { Authorization: "Bearer YOUR_API_TOKEN" },
}).then(res => res.json());

const detail = await fetch(
  "${baseUrl}/api/emails/" + latest.data.message_id + "/extractions",
  { headers: { Authorization: "Bearer YOUR_API_TOKEN" } },
).then(res => res.json());`}
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
                    公开接口
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
                  `/admin/*` 默认使用 Cookie Session 鉴权，并按管理员角色和项目绑定范围校验权限。
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
                    公开接口支持两种 Bearer Token：传统全局 `API_TOKEN`，或在控制台创建的托管 API Token。后台接口仍然只接受登录后的 HttpOnly Session。
                  </Typography.Paragraph>
                </div>
              </Space>
            </Card>

            <Card
              size="small"
              title={(
                <Space>
                  <KeyOutlined style={{ color: "#4f6ef7" }} />
                  项目级 API Token
                </Space>
              )}
              style={{ borderRadius: 12 }}
            >
              <Space wrap size={[8, 8]} style={{ marginBottom: 12 }}>
                {permissionTags.map(item => (
                  <Tag key={item.value} color={item.color}>
                    {item.value}
                  </Tag>
                ))}
              </Space>
              <List
                size="small"
                dataSource={permissionTags}
                renderItem={item => (
                  <List.Item>
                    <List.Item.Meta
                      title={<Typography.Text code>{item.value}</Typography.Text>}
                      description={item.description}
                    />
                  </List.Item>
                )}
              />
              <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                如果 Token 的 `access_scope = bound`，它只能读取绑定项目下的邮件和附件资源。
              </Typography.Paragraph>
            </Card>

            <Alert
              type="info"
              showIcon
              message="CORS 策略"
              description="当前仅对 `/api/*` 公开 CORS，并可通过 `ALLOWED_API_ORIGINS` 精确限制。`/auth/*` 与 `/admin/*` 不建议跨站调用。"
            />

            <Alert
              type="success"
              showIcon
              message="接口组合建议"
              description="推荐先调用 `/api/emails/latest` 获取 `message_id`，再按需访问 `/api/emails/code`、`/api/emails/:messageId`、`/api/emails/:messageId/extractions` 或附件下载接口。"
            />

            <Card
              size="small"
              title={(
                <Space>
                  <ThunderboltOutlined style={{ color: "#4f6ef7" }} />
                  项目级 Webhook
                </Space>
              )}
              style={{ borderRadius: 12 }}
            >
              <Typography.Paragraph type="secondary">
                通知中心支持全局 Webhook 和项目绑定 Webhook。项目绑定端点只会接收命中绑定项目的事件。
              </Typography.Paragraph>
              <div
                style={{
                  padding: 16,
                  borderRadius: 8,
                  background: "rgba(79, 110, 247, 0.06)",
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                }}
              >
                {`{
  "event": "email.received",
  "source": "testmail-hub",
  "sent_at": 1774760671582,
  "scope": {
    "project_id": 1,
    "project_ids": [1],
    "environment_id": 2,
    "mailbox_pool_id": 3
  },
  "payload": {
    "message_id": "msg_123",
    "subject": "GitHub 登录验证码",
    "verification_code": "123456"
  }
}`}
              </div>
              <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                如果配置了 Secret，请校验 `X-Temp-Mail-Signature`；事件类型会通过 `X-Temp-Mail-Event` 请求头一并传出。
              </Typography.Paragraph>
            </Card>

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
              description="自动化脚本优先使用项目级 Bearer Token 调用公开 API；需要管理规则、邮箱、管理员和 Webhook 时，再通过控制台登录态访问后台接口。"
            />
          </Space>
        </Col>
      </Row>
    </div>
  );
}
