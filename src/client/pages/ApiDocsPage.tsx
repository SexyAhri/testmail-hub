import {
  ApiOutlined,
  ExportOutlined,
  KeyOutlined,
  LinkOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  UnlockOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Col, List, Row, Space, Tabs, Tag, Typography } from "antd";
import type { ReactNode } from "react";

import { PageHeader } from "../components";
import {
  NOTIFICATION_EVENT_CATEGORY_LABELS,
  NOTIFICATION_EVENT_DEFINITIONS,
} from "../../utils/constants";

interface ApiDocsPageProps {
  mailboxDomain: string;
}

interface EndpointItem {
  description: string;
  endpoint: string;
}

interface PermissionItem {
  color: string;
  description: string;
  value: string;
}

const WEBHOOK_EVENT_ITEMS = NOTIFICATION_EVENT_DEFINITIONS.map(item => ({
  categoryLabel: NOTIFICATION_EVENT_CATEGORY_LABELS[item.category],
  description: item.description,
  key: item.key,
  label: item.label,
}));

function CodeBlock({ children }: { children: string }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 10,
        background: "rgba(79, 110, 247, 0.06)",
        fontFamily: "monospace",
        whiteSpace: "pre-wrap",
        overflowX: "auto",
        lineHeight: 1.7,
      }}
    >
      {children}
    </div>
  );
}

function EndpointListCard({
  icon,
  items,
  title,
}: {
  icon: ReactNode;
  items: EndpointItem[];
  title: string;
}) {
  return (
    <Card
      size="small"
      title={(
        <Space>
          {icon}
          {title}
        </Space>
      )}
      style={{ borderRadius: 12, height: "100%" }}
    >
      <List
        size="small"
        dataSource={items}
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
  );
}

export default function ApiDocsPage({ mailboxDomain }: ApiDocsPageProps) {
  const baseUrl = typeof window === "undefined" ? "" : window.location.origin;
  const sampleAddress = `demo@${mailboxDomain || "example.com"}`;
  const latestEmailEndpoint = `${baseUrl}/api/emails/latest?address=${sampleAddress}`;
  const latestCodeEndpoint = `${baseUrl}/api/emails/code?address=${sampleAddress}`;
  const latestExtractionEndpoint = `${baseUrl}/api/emails/latest/extraction?address=${sampleAddress}`;

  const authEndpoints: EndpointItem[] = [
    {
      endpoint: "POST /auth/login",
      description: "支持 Bootstrap 管理令牌登录，也支持管理员账号密码登录，成功后写入签名 Session Cookie。",
    },
    {
      endpoint: "GET /auth/session",
      description: "读取当前登录状态，返回管理员角色、访问范围以及默认邮箱域名。",
    },
    {
      endpoint: "POST /auth/logout",
      description: "清理当前 Session Cookie，用于主动退出控制台登录态。",
    },
  ];

  const publicEndpoints: EndpointItem[] = [
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
      description: "返回指定邮件正文、头信息与附件元数据，要求具备 `read:mail` 权限。",
    },
    {
      endpoint: "GET /api/emails/:messageId/attachments/:attachmentId",
      description: "下载指定附件的二进制内容，要求具备 `read:attachment` 权限。",
    },
    {
      endpoint: "GET /api/emails/:messageId/extractions",
      description: "返回提取结果、规则命中与最终验证码，要求具备 `read:rule-result` 权限。",
    },
  ];

  const permissionTags: PermissionItem[] = [
    { color: "blue", value: "read:mail", description: "读取最新邮件摘要与邮件详情。" },
    { color: "gold", value: "read:code", description: "读取验证码以及验证码提取结果。" },
    { color: "purple", value: "read:attachment", description: "下载邮件附件的原始内容。" },
    { color: "cyan", value: "read:rule-result", description: "读取规则命中、结构化提取与平台识别信息。" },
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

  const exportResources = [
    "emails",
    "trash",
    "rules",
    "whitelist",
    "mailboxes",
    "admins",
    "notifications",
    "audit",
  ];

  return (
    <div className="page-tab-stack">
      <PageHeader
        title="开放 API"
        subtitle="这里汇总登录会话、公开查询接口、项目级 API Token，以及支持项目绑定的 Webhook 对接方式。"
        extra={(
          <Button type="primary" href="/emails">
            返回邮件中心
          </Button>
        )}
      />

      <Tabs
        className="page-section-tabs"
        items={[
          {
            key: "quick-start",
            label: "快速开始",
            children: (
              <div className="page-scroll-panel">
                <Row gutter={[16, 16]}>
                  <Col xs={24} xxl={16}>
                    <Space direction="vertical" size={16} style={{ width: "100%" }}>
                      <Card
                        size="small"
                        title={(
                          <Space>
                            <ApiOutlined style={{ color: "#4f6ef7" }} />
                            快速调用示例
                          </Space>
                        )}
                        style={{ borderRadius: 12 }}
                      >
                        <Space direction="vertical" size={12} style={{ width: "100%" }}>
                          <Space wrap size={[8, 8]}>
                            <Tag icon={<ApiOutlined />} color="processing">
                              GET /api/emails/latest
                            </Tag>
                            <Tag icon={<LinkOutlined />} color="blue">
                              {baseUrl || "当前访问域名"}
                            </Tag>
                          </Space>

                          <Typography.Paragraph style={{ marginBottom: 0 }}>
                            自动化脚本通常先通过最新邮件接口拿到 `message_id`，再按需读取验证码、邮件详情、附件或提取结果。
                          </Typography.Paragraph>

                          <Typography.Text strong>最新邮件接口</Typography.Text>
                          <CodeBlock>{latestEmailEndpoint}</CodeBlock>

                          <Typography.Text strong>验证码接口</Typography.Text>
                          <CodeBlock>{latestCodeEndpoint}</CodeBlock>

                          <Typography.Text strong>结构化提取接口</Typography.Text>
                          <CodeBlock>{latestExtractionEndpoint}</CodeBlock>

                          <Typography.Text strong>请求头</Typography.Text>
                          <CodeBlock>Authorization: Bearer YOUR_MANAGED_TOKEN</CodeBlock>

                          <Typography.Text strong>PowerShell 示例</Typography.Text>
                          <CodeBlock>{`$headers = @{ Authorization = "Bearer YOUR_API_TOKEN" }
Invoke-RestMethod -Uri "${latestCodeEndpoint}" -Headers $headers`}</CodeBlock>

                          <Typography.Text strong>JavaScript 示例</Typography.Text>
                          <CodeBlock>{`const latest = await fetch("${latestEmailEndpoint}", {
  headers: { Authorization: "Bearer YOUR_API_TOKEN" },
}).then(res => res.json());

const extraction = await fetch(
  "${baseUrl}/api/emails/" + latest.data.message_id + "/extractions",
  { headers: { Authorization: "Bearer YOUR_API_TOKEN" } },
).then(res => res.json());`}</CodeBlock>
                        </Space>
                      </Card>

                      <Row gutter={[16, 16]}>
                        <Col xs={24} lg={12}>
                          <EndpointListCard
                            title="登录与 Session"
                            icon={<UnlockOutlined style={{ color: "#4f6ef7" }} />}
                            items={authEndpoints}
                          />
                        </Col>
                        <Col xs={24} lg={12}>
                          <EndpointListCard
                            title="公开接口"
                            icon={<ApiOutlined style={{ color: "#4f6ef7" }} />}
                            items={publicEndpoints}
                          />
                        </Col>
                      </Row>
                    </Space>
                  </Col>

                  <Col xs={24} xxl={8}>
                    <Space direction="vertical" size={16} style={{ width: "100%" }}>
                      <Alert
                        type="info"
                        showIcon
                        message="鉴权方式"
                        description="公开接口支持两种 Bearer Token：传统全局 `API_TOKEN`，或者在控制台创建的项目级 API Token。后台管理接口仍然只接受登录后的 HttpOnly Session。"
                      />

                      <Alert
                        type="success"
                        showIcon
                        message="推荐调用顺序"
                        description="推荐先调 `/api/emails/latest` 获取 `message_id`，再按需访问 `/api/emails/code`、`/api/emails/:messageId`、`/api/emails/:messageId/extractions` 或附件下载接口。"
                      />

                      <Card
                        size="small"
                        title={(
                          <Space>
                            <KeyOutlined style={{ color: "#4f6ef7" }} />
                            公开 API Token 权限
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
                          如果 Token 的 `access_scope = bound`，它只会读取绑定项目下的邮件与附件资源。
                        </Typography.Paragraph>
                      </Card>
                    </Space>
                  </Col>
                </Row>
              </div>
            ),
          },
          {
            key: "catalog",
            label: "接口清单",
            children: (
              <div className="page-scroll-panel">
                <Row gutter={[16, 16]}>
                  <Col xs={24} xl={10}>
                    <Space direction="vertical" size={16} style={{ width: "100%" }}>
                      <EndpointListCard
                        title="登录与 Session"
                        icon={<UnlockOutlined style={{ color: "#4f6ef7" }} />}
                        items={authEndpoints}
                      />
                      <EndpointListCard
                        title="公开接口"
                        icon={<ApiOutlined style={{ color: "#4f6ef7" }} />}
                        items={publicEndpoints}
                      />
                      <Card
                        size="small"
                        title={(
                          <Space>
                            <ExportOutlined style={{ color: "#4f6ef7" }} />
                            可导出资源
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
                    </Space>
                  </Col>

                  <Col xs={24} xl={14}>
                    <Card
                      size="small"
                      title={(
                        <Space>
                          <ThunderboltOutlined style={{ color: "#4f6ef7" }} />
                          后台管理接口
                        </Space>
                      )}
                      style={{ borderRadius: 12, height: "100%" }}
                    >
                      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                        `/admin/*` 默认使用 Cookie Session 鉴权，并按管理员角色与项目绑定范围校验访问权限。
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
              </div>
            ),
          },
          {
            key: "auth-webhook",
            label: "鉴权与 Webhook",
            children: (
              <div className="page-scroll-panel">
                <Row gutter={[16, 16]}>
                  <Col xs={24} xl={9}>
                    <Space direction="vertical" size={16} style={{ width: "100%" }}>
                      <Card size="small" style={{ borderRadius: 12 }}>
                        <Space align="start">
                          <SafetyCertificateOutlined
                            style={{ fontSize: 20, color: "#4f6ef7", marginTop: 4 }}
                          />
                          <div>
                            <Typography.Title level={5} style={{ marginTop: 0 }}>
                              鉴权要求
                            </Typography.Title>
                            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                              公开 API 建议使用 Bearer Token 接入；后台管理接口请保持浏览器登录态，避免把高权限 Session 暴露给自动化脚本。
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
                      </Card>

                      <Alert
                        type="info"
                        showIcon
                        message="CORS 策略"
                        description="当前仅对 `/api/*` 公开 CORS，并通过 `ALLOWED_API_ORIGINS` 精确限制。`/auth/*` 与 `/admin/*` 不建议跨站调用。"
                      />

                      <Alert
                        type="warning"
                        showIcon
                        message="接入建议"
                        description="自动化脚本优先使用项目级 Bearer Token 调用公开 API；需要管理规则、邮箱、管理员或 Webhook 时，再通过控制台登录态访问后台接口。"
                      />
                    </Space>
                  </Col>

                  <Col xs={24} xl={15}>
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
                        通知中心同时支持全局 Webhook 和项目绑定 Webhook。项目绑定端点只会接收命中绑定项目的事件。
                      </Typography.Paragraph>

                      <List<(typeof WEBHOOK_EVENT_ITEMS)[number]>
                        size="small"
                        dataSource={WEBHOOK_EVENT_ITEMS}
                        style={{ marginBottom: 12 }}
                        renderItem={item => (
                          <List.Item>
                            <List.Item.Meta
                              title={(
                                <Space wrap size={[8, 4]}>
                                  <Tag color="blue">{item.categoryLabel}</Tag>
                                  <Typography.Text strong>{item.label}</Typography.Text>
                                  <Typography.Text code>{item.key}</Typography.Text>
                                </Space>
                              )}
                              description={item.description}
                            />
                          </List.Item>
                        )}
                      />

                      <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 12 }}
                        message="事件命名收敛"
                        description="控制台会把旧别名自动归一到标准事件名，例如 `email.match` 会保存为 `email.matched`。推荐始终使用文档里的标准事件名。"
                      />

                      <CodeBlock>{`{
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
}`}</CodeBlock>

                      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                        如果配置了 Secret，请校验 `X-Temp-Mail-Signature`；事件类型会通过 `X-Temp-Mail-Event` 请求头一并传出。
                      </Typography.Paragraph>
                    </Card>
                  </Col>
                </Row>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
