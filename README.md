# Temp Mail Console

基于 `Cloudflare Workers + D1 + React + Vite + TypeScript + Ant Design` 构建的临时邮箱管理控制台，支持收信、规则提取、白名单、邮箱资产管理、管理员体系、Webhook 通知、系统日志中心，以及可视化发信中心。

## 项目定位

这个项目的核心目标不是做一个简单的临时邮箱接口，而是做成一套可实际使用的邮件运营后台：

- 收取并存储完整邮件正文
- 提取验证码与规则命中结果
- 管理邮箱资产、白名单、规则和管理员
- 可视化查看审计日志与错误日志
- 接入 Resend 做后台发信
- 与 Cloudflare Email Routing / Workers / D1 配合使用

## 功能概览

### 收件能力

- 完整存储邮件正文
- 存储附件元数据并支持附件下载
- 支持单封邮件删除、恢复、彻底删除
- 邮件详情页查看正文、头信息、附件、规则命中结果
- 自动提取常见验证码，支持纯数字和数字字母混合验证码
- 支持邮件标签、备注

### 筛选与规则

- 邮件列表多条件搜索
- 规则管理、规则测试器
- 白名单管理
- 全局白名单开关
- 更细化的验证码 / 平台邮件识别规则

### 邮箱资产管理

- 邮箱生成与管理
- 支持随机生成邮箱
- 支持生命周期与启停控制
- 支持与 Cloudflare Email Routing 路由同步

### 管理后台能力

- 管理员登录与 Session
- 多管理员与角色权限
- 审计日志
- 系统日志中心
- Webhook 通知
- 错误事件采集与展示

### 发信中心

- Resend 接入
- 发信设置可视化管理
- 草稿 / 定时 / 发送记录
- 模板管理
- 联系人管理
- 外部邮箱发信开关

### 工程能力

- React + TypeScript 前后端统一 TS
- Vite 构建
- 懒加载拆包
- GitHub Actions CI / CD
- Docker 一键启动本地容器
- Docker 一键发布到 Cloudflare

## 页面截图

### 监控中心

![监控中心](images/monitor.png)

### 邮件中心

![邮件中心](images/emails.png)

### 邮箱资产

![邮箱资产](images/mailboxes.png)

### 规则中心

![规则中心](images/rules.png)

### 发信中心

![发信中心](images/outbound.png)

### API 文档页

![API 文档页](images/api.png)

## 目录结构

```text
.
├─ src/
│  ├─ client/        React 管理后台前端
│  ├─ core/          鉴权、数据库、发信、通知、Cloudflare 同步等核心逻辑
│  ├─ handlers/      Worker 接口处理器
│  ├─ server/        前后端共享类型
│  ├─ utils/         常量与工具函数
│  └─ index.ts       Worker 入口
├─ migrations/       D1 数据库迁移
├─ images/           README 截图
├─ docs/             补充文档
├─ test/             单元测试与 E2E
├─ Dockerfile
├─ docker-compose.yml
├─ vite.config.ts
└─ wrangler.toml
```

## 环境要求

- Node.js 20+
- npm 10+
- Docker / Docker Compose（如需容器化）
- Cloudflare 账号（如需正式部署）
- Resend 账号（如需后台发信）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 `.dev.vars`

先复制示例文件：

```bash
copy .dev.vars.example .dev.vars
```

然后按实际情况填写。

## 环境变量说明

| 变量名 | 是否必填 | 说明 |
| --- | --- | --- |
| `ADMIN_TOKEN` | 建议必填 | 初始管理员登录令牌，可作为 bootstrap 登录方式 |
| `API_TOKEN` | 建议必填 | 公共 API `/api/emails/latest` 调用令牌 |
| `SESSION_SECRET` | 强烈建议必填 | 管理后台 Session 签名密钥 |
| `MAILBOX_DOMAIN` | 收件建议必填 | 当前主收件域名，也是邮箱创建默认域名 |
| `FORWARD_TO` | 可选 | 原始邮件转发地址 |
| `ALLOWED_API_ORIGINS` | 可选 | 允许跨域访问 `/api/*` 的浏览器来源，多个用逗号分隔 |
| `ERROR_WEBHOOK_URL` | 可选 | 错误事件回调地址 |
| `CLOUDFLARE_API_TOKEN` | Cloudflare 同步 / 部署时需要 | 用于 Email Routing 同步，也可供 Docker / CI 中的 Wrangler 部署使用 |
| `CLOUDFLARE_ZONE_ID` | Cloudflare 同步时需要 | 主收件域名对应的 Zone ID |
| `CLOUDFLARE_EMAIL_WORKER` | 可选 | Email Routing 绑定的 Worker 名称，默认 `temp-email-worker` |
| `CLOUDFLARE_ACCOUNT_ID` | Docker / CI 发布时建议填写 | 供 Wrangler 在非交互环境中发布 Worker |
| `RESEND_API_KEY` | 发信时必填 | Resend API Key |
| `RESEND_FROM_DOMAIN` | 发信时必填 | 已验证的发信域名 |
| `RESEND_DEFAULT_FROM_NAME` | 发信时建议填写 | 默认发件人名称 |
| `RESEND_DEFAULT_FROM` | 发信时建议填写 | 默认发件地址 |
| `RESEND_DEFAULT_REPLY_TO` | 可选 | 默认回复地址 |

示例：

```env
ADMIN_TOKEN=<set-admin-token>
API_TOKEN=<set-api-token>
SESSION_SECRET=<set-session-secret>
MAILBOX_DOMAIN=vixenahri.cn
FORWARD_TO=
ALLOWED_API_ORIGINS=
ERROR_WEBHOOK_URL=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ZONE_ID=
CLOUDFLARE_EMAIL_WORKER=temp-email-worker
CLOUDFLARE_ACCOUNT_ID=
RESEND_API_KEY=
RESEND_FROM_DOMAIN=vixenahri.cn
RESEND_DEFAULT_FROM_NAME=Ahri TempMail Console
RESEND_DEFAULT_FROM=TempMail@vixenahri.cn
RESEND_DEFAULT_REPLY_TO=
```

## 本地开发

### 初始化本地数据库

```bash
npm run db:migrate:local
```

### 启动开发环境

```bash
npm run dev
```

默认会启动本地开发环境，前端与 Worker 接口一起工作。

### 常用命令

```bash
npm run typecheck
npm test
npm run build
npm run e2e
```

## Docker 一键部署

这个仓库现在内置了：

- `Dockerfile`
- `docker-compose.yml`
- `docker/entrypoint.sh`

### 方式一：Docker 一键启动本地容器

这个模式适合：

- 本地体验 UI
- 内网自测
- 让团队成员快速跑起来
- 在容器中保留本地 D1 数据

启动命令：

```bash
docker compose up -d --build temp-mail-console
```

访问地址：

```text
http://localhost:4173
```

常用命令：

```bash
docker compose logs -f temp-mail-console
docker compose restart temp-mail-console
docker compose down
```

这个模式会自动执行：

1. 容器内安装依赖
2. 执行本地 D1 迁移
3. 启动开发服务
4. 将 `.wrangler` 挂载到命名卷 `wrangler_state`，保留本地数据库状态

### 方式二：Docker 一键发布到 Cloudflare

这个模式不是在 Docker 里长期运行 Worker，而是通过容器执行一次正式发布。

运行前请确保：

- `.dev.vars` 已配置完整
- `CLOUDFLARE_API_TOKEN` 可用于 Wrangler 发布
- `CLOUDFLARE_ACCOUNT_ID` 已提供
- D1 绑定与 `wrangler.toml` 已配置正确

发布命令：

```bash
docker compose --profile deploy run --rm temp-mail-console-deploy
```

它会自动执行：

1. `npm run typecheck`
2. `npm test`
3. `npm run deploy`
4. 自动构建前端与 Worker
5. 自动执行远程 D1 迁移
6. 自动发布 Worker

### Docker 使用说明

- 本地容器模式主要用于开发 / 测试 / 内网预览
- 正式线上运行环境仍然是 Cloudflare Workers，不是 Docker 容器常驻托管
- 如果你要真正接收公网邮件，仍然需要在 Cloudflare 上配置 Email Routing 指向当前 Worker

## Cloudflare 正式部署

### 本地命令部署

```bash
npm run deploy
```

这个命令会执行：

1. 前端构建
2. Worker 构建
3. 远程 D1 迁移
4. `wrangler deploy`

### 正式部署前建议检查

- `wrangler.toml` 中的 `d1_databases` 是否正确
- 自定义域名是否已经绑定 Worker
- `ADMIN_TOKEN` / `API_TOKEN` / `SESSION_SECRET` 是否已配置为 secret
- `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` / `CLOUDFLARE_EMAIL_WORKER` 是否已配置，避免邮箱同步失败
- `RESEND_API_KEY` 是否已配置，避免发信中心发送失败

## GitHub Actions / 持续部署

仓库已经包含 GitHub Actions 工作流。

相关文档见：

- [docs/CI-CD.md](docs/CI-CD.md)

如果你使用 GitHub 自动部署到 Cloudflare，建议同时配置：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `ADMIN_TOKEN`
- `API_TOKEN`
- `SESSION_SECRET`
- 其余发信 / 路由 / 域名变量按需补齐

## 自动部署方案

现在项目统一使用 `GitHub Actions` 做自动部署，不再推荐同时启用 Cloudflare Git 直连部署。

这样做的原因很直接：

- 备份、迁移、发布走同一条链路
- 不会重复部署
- 出问题时更容易排查
- 生产数据库迁移不会和别的发布系统打架

当前默认行为：

- Push 到 `main`
- 或 Push 到 `master`

都会自动触发：

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. 远程 D1 备份
5. 远程 D1 迁移
6. Worker 发布

详细配置和 Secrets 清单见：

- [docs/CI-CD.md](docs/CI-CD.md)
- [docs/GITHUB-SECRETS.md](docs/GITHUB-SECRETS.md)

## 多域名支持说明

### 现在能不能配置多个域名？

可以分成两层理解：

#### 1. 数据层 / 展示层

这部分是可以识别多个域名的：

- 邮件列表可以按域名筛选
- 后台统计可以展示多个域名
- 数据库里可以存在多个域名的邮箱地址和邮件记录
- 如果多个域名的邮件都已经正确路由到同一个 Worker，系统也能正常收取并展示

#### 2. 系统默认配置 / Cloudflare 自动同步层

这部分当前还是“单主域名模式”：

- `MAILBOX_DOMAIN` 目前是单值
- `CLOUDFLARE_ZONE_ID` 目前对应单个 Zone
- 邮箱生成默认使用一个主域名
- Cloudflare Email Routing 自动同步也按一个主域名工作

也就是说：

- 当前项目“可识别多域名数据”
- 但“自动生成 + 自动同步 + 主配置”仍然是单域名

### 如果你要做完整多域名

下一步需要把这些配置扩成映射关系，例如：

- `domain -> zone_id`
- `domain -> worker routing config`
- 管理后台创建邮箱时可选择多个已接入域名
- 同步接口按邮箱所属域名写入对应 Zone

如果你后面要做这块，我建议直接改成“多域名资产中心”，不要只改一个环境变量。

## 已知限制

- Docker 本地模式不能替代 Cloudflare Workers 正式线上环境
- Cloudflare 邮箱同步当前只支持单主域名
- 发信能力依赖 Resend，发件域名必须先在 Resend 完成验证
- 收件是否成功最终取决于 Cloudflare Email Routing 是否已经把邮件路由到这个 Worker

## 故障排查

### 访问到了域名，但页面空白

优先检查：

- `wrangler.toml` 的 `[assets]` 配置
- 是否已经执行 `npm run build` 后重新部署
- 自定义域名是否指向当前 Worker

### 邮箱能创建，但 Cloudflare 没有同步路由

优先检查：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_EMAIL_WORKER`
- 邮箱地址是否属于 `MAILBOX_DOMAIN`

### 发信失败

优先检查：

- `RESEND_API_KEY`
- `RESEND_FROM_DOMAIN`
- `RESEND_DEFAULT_FROM`
- 当前发件地址是否属于已验证域名

### 管理员新增失败 / 权限拒绝

请到后台查看：

- 审计日志
- 系统日志中心

日志中心已经记录这类关键业务错误。

## 推荐运维习惯

- 先用 `ADMIN_TOKEN` 完成 bootstrap 登录，再创建正式管理员账号
- `SESSION_SECRET` 不要留空
- 生产环境优先使用 Cloudflare secret，不要把敏感值直接写进仓库
- 部署前先执行一次 `npm run typecheck` 和 `npm test`
- 对外发信前先确认 Resend 域名验证完成

## License

仅供当前项目内部使用，如需开源或商用请按你的实际需求补充许可证。
