# GitHub Actions Secrets 清单

下面这份可以直接复制到 GitHub 仓库的 `Settings -> Secrets and variables -> Actions -> New repository secret` 中逐项填写。

## 必填 Secrets

```text
CLOUDFLARE_API_TOKEN=<你的 Cloudflare API Token>
CLOUDFLARE_ACCOUNT_ID=<你的 Cloudflare Account ID>
ADMIN_TOKEN=<后台初始管理员令牌>
API_TOKEN=<公共 API 调用令牌>
SESSION_SECRET=<后台 Session 签名密钥>
```

## 建议一并填写的 Secrets

```text
MAILBOX_DOMAIN=<你的主收件域名，例如 vixenahri.cn>
CLOUDFLARE_ZONE_ID=<主收件域名对应的 Zone ID>
CLOUDFLARE_EMAIL_WORKER=<Cloudflare Email Routing 指向的 Worker 名称，例如 temp-email-worker>
FORWARD_TO=<可留空，原始邮件转发地址>
ALLOWED_API_ORIGINS=<可留空，允许跨域访问 /api/* 的来源，多个逗号分隔>
ERROR_WEBHOOK_URL=<可留空，错误事件回调地址>
RESEND_API_KEY=<你的 Resend API Key>
RESEND_FROM_DOMAIN=<已验证的发信域名，例如 vixenahri.cn>
RESEND_DEFAULT_FROM_NAME=<默认发件人名称，例如 Ahri TempMail ConsoleMail>
RESEND_DEFAULT_FROM=<默认发件地址，例如 TempMail@vixenahri.cn>
RESEND_DEFAULT_REPLY_TO=<可留空，默认 reply-to 地址>
```

## 最终推荐完整清单

```text
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
ADMIN_TOKEN=
API_TOKEN=
SESSION_SECRET=
MAILBOX_DOMAIN=
CLOUDFLARE_ZONE_ID=
CLOUDFLARE_EMAIL_WORKER=
FORWARD_TO=
ALLOWED_API_ORIGINS=
ERROR_WEBHOOK_URL=
RESEND_API_KEY=
RESEND_FROM_DOMAIN=
RESEND_DEFAULT_FROM_NAME=
RESEND_DEFAULT_FROM=
RESEND_DEFAULT_REPLY_TO=
```

## 说明

- 这些值只填到 GitHub Actions Secrets，不要写进仓库文件。
- `.dev.vars` 是本地开发文件，已经在 `.gitignore` 中忽略，不要提交。
- `wrangler.toml` 里的 `database_id` 不是机密，它只是 D1 绑定标识，不等同于访问令牌。
- 真正敏感的是：
  - API Token
  - Session Secret
  - 管理员令牌
  - Resend API Key
