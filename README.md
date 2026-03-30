# TestMail Hub

基于 `Cloudflare Workers + D1 + React + Vite + TypeScript + Ant Design` 构建的团队测试邮箱与验证码中台。

它不是面向大众的“临时邮箱站”，而是一套更偏团队内部使用、自动化测试、私有部署和邮件资产治理的控制台，覆盖收件、提取、规则、白名单、项目隔离、Webhook、API Token、发信中心和系统日志。

## 项目定位

推荐对外口径：

- 团队测试邮箱与验证码中台
- 私有部署邮件资产管理后台
- 自动化测试邮件平台

## 当前已实现的能力

### 邮件接收与查看

- 完整存储邮件正文、头信息、附件元数据
- 邮件详情页支持查看正文、规则命中、提取结果、附件下载
- 支持单封删除、恢复、彻底删除
- 支持标签、备注、验证码列展示与复制
- 支持回收站页面

### 验证码 / 链接提取

- 提取常见数字验证码和数字字母混合验证码
- 提取验证链接、登录链接、魔法链接、重置链接、邀请链接
- 识别 GitHub、Google、Apple、PayPal、Steam、Discord、Microsoft、Amazon、Notion、Slack、OpenAI 等常见平台邮件
- API 与 Webhook 可返回提取结果

### 规则与白名单

- 规则 CRUD 与规则测试器
- 白名单 CRUD
- 全局白名单开关
- 更细化的常见平台识别规则

### 邮箱资产与多域名

- 邮箱生成、启停、批量创建、到期控制
- Cloudflare Email Routing 路由同步
- 多域名资产管理
- 域名与项目 / 环境绑定
- 按工作空间过滤域名池与默认域名
- Catch-all 策略管理与同步
- 域名维度监控卡片、排行图表、接入概览

### 项目 / 环境隔离

- 项目、环境、邮箱池三层模型
- 邮件、邮箱、域名、Webhook、API Token 支持项目范围
- 项目级管理员绑定
- 工作空间目录接口与后台管理页面

### 管理与治理

- 管理员登录与 Session
- Bootstrap Token 登录
- 管理员、项目绑定、访问范围控制
- 审计日志
- 系统错误日志中心

### API 与自动化

- 托管 API Token
- Token 权限拆分
- Project-scoped API Token
- 公共 API：
  - `GET /api/emails/latest`
  - `GET /api/emails/latest/extraction`
  - `GET /api/emails/code`
  - `GET /api/emails/:messageId`
  - `GET /api/emails/:messageId/extractions`
  - `GET /api/emails/:messageId/attachments/:attachmentId`

### Webhook

- 邮件接收、命中、验证码提取、链接提取等事件推送
- Secret 签名
- 投递记录
- 自动重试
- 手动重放
- Project-scoped Webhook

### 发信中心

- Resend 接入
- 发信设置可视化管理
- 草稿、立即发送、计划发送
- 发信记录、发送统计
- 模板管理
- 联系人管理
- 外部收件人开关

### 工程能力

- 全仓统一 TypeScript
- React + Vite 前端
- Cloudflare Workers + D1 部署
- GitHub Actions CI / CD
- Docker 本地运行支持

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

### API 文档

![API 文档](images/api.png)

## 项目结构

```text
.
├─ src/
│  ├─ client/         React 管理后台
│  ├─ core/           鉴权、数据库、发信、通知、Cloudflare 同步等核心逻辑
│  ├─ handlers/       Worker 路由处理
│  ├─ server/         前后端共享类型
│  ├─ utils/          常量与工具函数
│  └─ index.ts        Worker 入口
├─ migrations/        D1 迁移脚本
├─ docs/              部署、Secrets、计划书等文档
├─ images/            README 截图
├─ test/              单元测试与 E2E
├─ Dockerfile
├─ docker-compose.yml
├─ wrangler.toml
└─ package.json
```

## 技术栈

- Runtime: Cloudflare Workers
- Database: Cloudflare D1
- Frontend: React 19 + Vite 7 + TypeScript 5
- UI: Ant Design 5 + ECharts
- Mail Parse: `postal-mime`
- Outbound: Resend
- CI/CD: GitHub Actions + Wrangler

## 环境要求

- Node.js 20+
- npm 10+
- Cloudflare 账号
- Resend 账号（仅发信中心需要）
- Docker / Docker Compose（可选，仅本地容器运行时需要）

## 本地快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 准备本地环境变量

```bash
copy .dev.vars.example .dev.vars
```

至少填好这些值：

- `ADMIN_TOKEN`
- `API_TOKEN`
- `SESSION_SECRET`
- `MAILBOX_DOMAIN`

如果你要本地调试 Cloudflare 路由同步，还需要：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_EMAIL_WORKER`

如果你要调试发信中心，还需要：

- `RESEND_API_KEY`
- `RESEND_FROM_DOMAIN`
- `RESEND_DEFAULT_FROM`

### 3. 初始化本地 D1

```bash
npm run db:migrate:local
```

### 4. 启动开发环境

```bash
npm run dev
```

默认访问：

```text
http://127.0.0.1:4173
```

### 5. 常用命令

```bash
npm run typecheck
npm test
npm run build
npm run check
```

如果本机已经装了 Chrome，想直接跑登录冒烟：

```bash
npx playwright test test/e2e/login.spec.ts -c playwright.local.config.ts
```

## 核心环境变量

| 变量名                     | 建议级别            | 说明                                |
| -------------------------- | ------------------- | ----------------------------------- |
| `ADMIN_TOKEN`              | 必填                | Bootstrap 管理员登录令牌            |
| `API_TOKEN`                | 必填                | 全局公共 API 令牌                   |
| `SESSION_SECRET`           | 必填                | 后台 Session 签名密钥               |
| `MAILBOX_DOMAIN`           | 强烈建议            | 默认邮箱域名，也是回退主域名        |
| `FORWARD_TO`               | 可选                | 原始邮件转发地址                    |
| `ALLOWED_API_ORIGINS`      | 可选                | 允许跨域访问 `/api/*` 的浏览器源    |
| `ERROR_WEBHOOK_URL`        | 可选                | 错误事件回调地址                    |
| `CLOUDFLARE_API_TOKEN`     | 路由同步 / 部署需要 | Cloudflare API Token                |
| `CLOUDFLARE_ZONE_ID`       | 路由同步需要        | 默认主域名对应 Zone ID              |
| `CLOUDFLARE_EMAIL_WORKER`  | 路由同步建议        | Email Routing 指向的 Worker 名称    |
| `CLOUDFLARE_ACCOUNT_ID`    | CI/CD 建议          | GitHub Actions / Docker deploy 使用 |
| `RESEND_API_KEY`           | 发信需要            | Resend API Key                      |
| `RESEND_FROM_DOMAIN`       | 发信需要            | 已验证的发件域名                    |
| `RESEND_DEFAULT_FROM_NAME` | 发信建议            | 默认发件人名称                      |
| `RESEND_DEFAULT_FROM`      | 发信建议            | 默认发件地址                        |
| `RESEND_DEFAULT_REPLY_TO`  | 可选                | 默认 Reply-To                       |

完整示例见 [.dev.vars.example](.dev.vars.example)。

## 登录方式

当前支持两种登录方式：

- 使用 `ADMIN_TOKEN` 进行 Bootstrap 登录
- 创建正式管理员账号后，使用用户名 + 密码登录

推荐做法：

1. 首次部署后先用 `ADMIN_TOKEN` 登录。
2. 进入后台创建正式管理员。
3. 后续主要使用正式管理员账号。
4. 保留 `ADMIN_TOKEN` 作为应急入口，不对外公开。

## 公共 API 快速示例

Windows PowerShell 推荐这样调用：

```powershell
$headers = @{ Authorization = "Bearer <API_TOKEN>" }
Invoke-RestMethod -Uri "https://your-domain/api/emails/latest?address=code@your-domain" -Headers $headers
```

常见用途：

- 拉取最新地址的最新邮件
- 直接获取验证码
- 获取提取结果
- 下载附件
- 用托管 Token 做项目级自动化测试接入

完整接口说明可在后台 `API 文档` 页面查看。

## 后台页面一览

当前已经有这些页面：

- 监控中心
- 项目空间
- 域名资产
- 邮件中心
- 邮件详情
- 回收站
- 规则管理
- 白名单
- 邮箱资产
- 发信中心
- 管理员
- 通知配置
- API Token
- 审计日志
- 系统日志
- API 文档

## GitHub Actions 持续部署

推荐把 GitHub Actions 作为唯一正式发布入口。

当前仓库内置：

- [.github/workflows/ci.yml](.github/workflows/ci.yml)
- [.github/workflows/deploy.yml](.github/workflows/deploy.yml)

默认流程：

1. Push 到 `main` 或 `master`
2. 运行 `typecheck`
3. 运行 `test`
4. 运行 `build`
5. 导出远程 D1 备份
6. 同步 Worker Secrets
7. 执行远程迁移
8. 发布 Worker

重要说明：

- 正常部署不会重置线上数据库数据。
- `deploy.yml` 只会执行 `wrangler d1 migrations apply DB --remote`。
- 只有你自己写了破坏性迁移 SQL，才会影响已有数据。

详细见：

- [docs/CI-CD.md](docs/CI-CD.md)
- [docs/GITHUB-SECRETS.md](docs/GITHUB-SECRETS.md)

## 品牌与仓库命名

当前项目品牌统一为：

- 产品名：`TestMail Hub`
- GitHub 仓库名：`testmail-hub`

兼容性说明：

- 这次只统一项目品牌、文档、包名和本地仓库命名
- Cloudflare Worker 名仍保留为 `temp-email-worker`
- 这样可以避免立刻影响现有自定义域名、Email Routing、Worker secrets 和 D1 绑定

## 多域名支持现状

当前已经支持：

- 多域名资产录入
- `domain -> zone_id -> email_worker` 基础映射
- 域名 Catch-all 策略
- 域名状态监控
- 域名与项目 / 环境绑定
- 邮箱创建时按工作空间过滤可选域名
- 推荐默认域名

当前还没有完全做完：

- 独立的 routing profile 模型
- 多 provider 抽象
- 更细的域名权限模型
- 更完整的域名级策略中心

所以现在它已经不是“只能识别多域名”，而是已经具备一版“多域名资产中心”，但还没到最终形态。

## Docker 说明

仓库保留了 Docker 相关文件，主要用于：

- 本地体验
- 内网预览
- 非 Cloudflare 正式环境下的开发调试

正式线上仍然推荐：

- Cloudflare Workers 运行时
- GitHub Actions 持续部署

## 常见问题

### 1. GitHub Actions 部署会不会清空线上数据库？

不会。

当前工作流会先尝试导出远程 D1 备份，然后只执行待应用的迁移，再部署 Worker，不会无条件重建数据库。

### 2. 自定义域名访问正常但没有页面怎么办？

优先检查：

- `wrangler.toml` 里的 `[assets]` 配置
- 是否已重新执行构建并部署
- 自定义域名是否已经正确绑定到当前 Worker

### 3. 邮箱创建成功但 Cloudflare 路由没同步怎么办？

优先检查：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_EMAIL_WORKER`
- 域名资产里该域名是否有正确 Zone / Worker 配置

### 4. 发信失败怎么办？

优先检查：

- `RESEND_API_KEY`
- `RESEND_FROM_DOMAIN`
- `RESEND_DEFAULT_FROM`
- 当前发件地址是否属于已验证域名

### 5. 管理员新增失败或权限异常怎么办？

先看后台：

- 审计日志
- 系统日志

当前系统已经会记录管理员新增失败、权限拒绝、Cloudflare 同步失败、Resend 发送失败等关键错误。

## 当前已知限制

- 验证码提取准确率仍在持续优化中
- 多域名已可运营，但 routing profile 还未独立建模
- 团队角色体系还没细化到 `platform_admin / project_admin / operator / viewer`
- retention 策略还没有完整后台配置中心
- 自定义域名绑定和 DNS 仍需在 Cloudflare 控制台手动完成

## 发布前检查

上传或发布前建议确认：

- `.dev.vars` 没有提交
- `.wrangler/` 没有提交
- 没有把真实 Token、API Key、Session Secret 写进仓库
- `npm run check` 可以通过
- 文档与当前代码状态一致

## 相关文档

- [CI/CD 说明](docs/CI-CD.md)
- [GitHub Secrets 清单](docs/GITHUB-SECRETS.md)
- [产品与研发计划书](docs/产品与研发计划书.md)
- [计划书实现对照表](docs/计划书实现对照表.md)

## License

当前仓库默认按内部项目使用处理；如果你后续要公开发布或商业化，请自行补充正式许可证说明。
