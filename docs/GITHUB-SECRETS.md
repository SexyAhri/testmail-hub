# GitHub Actions Secrets 清单

更新日期：2026-03-30

这份文档用于整理当前仓库 `Deploy` 工作流真正会读取的 Secrets，方便直接复制到：

`GitHub Repository -> Settings -> Secrets and variables -> Actions`

## 一份可直接复制的最终清单

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

## 最小可部署集合

如果你只想先把 Worker 发上去，最少需要这些：

```text
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
ADMIN_TOKEN=
API_TOKEN=
SESSION_SECRET=
```

说明：

- 没有 `MAILBOX_DOMAIN`，系统还能部署，但默认域名相关能力会不完整
- 没有 `CLOUDFLARE_ZONE_ID` 和 `CLOUDFLARE_EMAIL_WORKER`，邮箱路由同步会受影响
- 没有 `RESEND_*`，发信中心会部署成功，但无法实际发信

## 推荐生产环境完整集合

如果你要把这个项目作为完整后台使用，推荐一次性配齐：

```text
CLOUDFLARE_API_TOKEN=<Cloudflare API Token>
CLOUDFLARE_ACCOUNT_ID=<Cloudflare Account ID>
ADMIN_TOKEN=<Bootstrap Admin Token>
API_TOKEN=<Global Public API Token>
SESSION_SECRET=<Session Signing Secret>
MAILBOX_DOMAIN=<Primary Mail Domain>
CLOUDFLARE_ZONE_ID=<Primary Domain Zone ID>
CLOUDFLARE_EMAIL_WORKER=<Email Routing Worker Name>
FORWARD_TO=<Optional Forward Address>
ALLOWED_API_ORIGINS=<Optional CORS Origins>
ERROR_WEBHOOK_URL=<Optional Error Webhook URL>
RESEND_API_KEY=<Resend API Key>
RESEND_FROM_DOMAIN=<Verified Sender Domain>
RESEND_DEFAULT_FROM_NAME=<Default Sender Name>
RESEND_DEFAULT_FROM=<Default Sender Address>
RESEND_DEFAULT_REPLY_TO=<Optional Reply-To>
```

## 每个 Secret 是干什么的

### Cloudflare 发布与迁移

- `CLOUDFLARE_API_TOKEN`
  - 用于 `wrangler secret put`
  - 用于 `wrangler d1 export`
  - 用于 `wrangler d1 migrations apply`
  - 用于最终 `wrangler deploy`

- `CLOUDFLARE_ACCOUNT_ID`
  - GitHub Actions 中 Wrangler 发布时需要
  - 不是运行时业务密钥，但也建议放在 Secret 中统一管理

### 登录与 API

- `ADMIN_TOKEN`
  - Bootstrap 登录令牌
  - 建议只作为应急入口，不对外扩散

- `API_TOKEN`
  - 全局公共 API 默认令牌
  - 控制台内还可以额外签发托管 API Token

- `SESSION_SECRET`
  - 后台登录 Session 的签名密钥
  - 不能为空

### 收件与路由

- `MAILBOX_DOMAIN`
  - 默认邮箱域名
  - 也是未配置域名资产时的回退域名

- `CLOUDFLARE_ZONE_ID`
  - 默认主域名对应的 Cloudflare Zone ID

- `CLOUDFLARE_EMAIL_WORKER`
  - Email Routing 路由要指向的 Worker 名称
  - 一般就是 `temp-email-worker`

- `FORWARD_TO`
  - 可选
  - 收到原始邮件后额外转发到某个已验证地址

### CORS 与错误通知

- `ALLOWED_API_ORIGINS`
  - 允许跨域访问 `/api/*` 的浏览器来源
  - 多个用逗号分隔

- `ERROR_WEBHOOK_URL`
  - 系统错误回调地址

### 发信中心

- `RESEND_API_KEY`
  - Resend 发信 API Key

- `RESEND_FROM_DOMAIN`
  - 已在 Resend 验证通过的发信域名

- `RESEND_DEFAULT_FROM_NAME`
  - 默认发件人名称

- `RESEND_DEFAULT_FROM`
  - 默认发件地址

- `RESEND_DEFAULT_REPLY_TO`
  - 默认 Reply-To 地址

## 哪些 Secret 会被 `deploy.yml` 同步到 Worker

当前工作流里会同步这些值：

- `ADMIN_TOKEN`
- `API_TOKEN`
- `SESSION_SECRET`
- `FORWARD_TO`
- `MAILBOX_DOMAIN`
- `ALLOWED_API_ORIGINS`
- `ERROR_WEBHOOK_URL`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_EMAIL_WORKER`
- `RESEND_API_KEY`
- `RESEND_FROM_DOMAIN`
- `RESEND_DEFAULT_FROM_NAME`
- `RESEND_DEFAULT_FROM`
- `RESEND_DEFAULT_REPLY_TO`

不会通过 `wrangler secret put` 同步到 Worker 的：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

这两个主要是给 GitHub Actions / Wrangler 本身用的。

## 生成建议

不要把真实值交给别人代填，建议你自己生成。

### PowerShell 生成随机 Token

```powershell
-join ((48..57 + 65..90 + 97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```

### 如果本机有 OpenSSL

```bash
openssl rand -base64 32
```

建议至少自行生成：

- `ADMIN_TOKEN`
- `API_TOKEN`
- `SESSION_SECRET`

## 常见错误

### 1. `Authentication error [code: 10000]`

通常说明：

- `CLOUDFLARE_API_TOKEN` 错了
- Token 权限不够
- Token 不属于目标账号

### 2. `wrangler secret put` 没提示输入值

在 GitHub Actions 里这是正常的，因为值来自：

- `env`
- `printf '%s' "$SECRET"`

不是交互式输入。

### 3. 可选 Secret 不填会怎样

当前工作流对大多数可选项做了非空判断：

- 留空会跳过同步
- 不会直接让整个部署失败

但以下能力会受影响：

- 不填 `MAILBOX_DOMAIN`：默认域名逻辑不完整
- 不填 `CLOUDFLARE_ZONE_ID` / `CLOUDFLARE_EMAIL_WORKER`：Cloudflare 路由同步能力不完整
- 不填 `RESEND_*`：发信中心无法实际发送

## 安全建议

- 只把值写进 GitHub Secrets，不要写进仓库
- `.dev.vars` 只用于本地，不能提交
- 不要把真实 API Token、Session Secret、Resend Key 放进截图和 issue
- 换人协作或怀疑泄露时，优先轮换：
  - `CLOUDFLARE_API_TOKEN`
  - `ADMIN_TOKEN`
  - `API_TOKEN`
  - `SESSION_SECRET`
  - `RESEND_API_KEY`

## 相关文档

- [README](../README.md)
- [CI/CD 说明](./CI-CD.md)
