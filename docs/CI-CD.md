# CI / CD 说明

更新日期：2026-04-01

> 兼容性说明
>
> 本轮仅调整项目品牌与 GitHub 仓库命名，不修改 Cloudflare Worker 名 `temp-email-worker`。
> 这样可以避免线上自定义域名、Email Routing、Secrets 和 D1 绑定被立即打断。

本项目当前统一使用 `GitHub Actions + Wrangler` 做持续集成与持续部署。

如果你计划接入多个 Cloudflare 账号下的域名，请先阅读：

- [Cloudflare 多账号域名部署说明](./CLOUDFLARE-MULTI-ACCOUNT.md)

如果你只是想先快速找到部署相关文档入口，也可以先看：

- [文档导航](./README.md)

不推荐同时再启用 Cloudflare Git 直连自动部署，原因很简单：

- 部署链路会重复
- 数据库迁移顺序不好控
- 排障时不容易定位到底是哪条流水线发的版

## 当前工作流

仓库内置两个工作流：

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
- [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

## `ci.yml` 做什么

触发条件：

- push 到 `main`
- push 到 `master`
- pull request

执行步骤：

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`

用途：

- 检查代码是否可编译
- 检查测试是否通过
- 检查前端与 Worker 是否都能成功构建

## `deploy.yml` 做什么

触发条件：

- push 到 `main`
- push 到 `master`
- 手动执行 `workflow_dispatch`

执行顺序：

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. 导出远程 D1 备份
6. 上传备份 Artifact
7. 同步 Worker Secrets
8. 执行远程 D1 迁移
9. 发布 Worker

说明：

- 当前 `deploy.yml` 仍然是单账号部署工作流
- 它不会自动把 Worker 同时发布到多个 Cloudflare 账号
- 多账号域名统一治理已经支持，但多账号多 Worker 发布需要你额外做矩阵工作流或多套环境

并发策略：

- 工作流使用固定 `concurrency group`
- 默认不会取消已经在跑的生产发布

## 会不会重置线上数据库

结论：正常不会。

当前部署流程不是“重建数据库”，而是：

1. 先尝试导出远程 D1 备份
2. 执行 `npm run db:migrate:remote`
3. 只应用还没执行过的迁移
4. 再部署 Worker

也就是说：

- 不会因为一次正常发布自动清空历史邮件
- 不会因为重新部署 Worker 自动重置 D1
- 真正有风险的是你自己写了破坏性 SQL 迁移，例如手动 `DROP TABLE`、误删字段、覆盖数据

## 当前部署工作流依赖的 Secrets

### 必填

这些是当前 `deploy.yml` 必须要有的：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `ADMIN_TOKEN`
- `API_TOKEN`
- `SESSION_SECRET`

### 强烈建议

如果你要正常收件、同步路由、使用多域名资产中心，建议同时配置：

- `MAILBOX_DOMAIN`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_EMAIL_WORKER`

### 发信中心需要

- `RESEND_API_KEY`
- `RESEND_FROM_DOMAIN`
- `RESEND_DEFAULT_FROM_NAME`
- `RESEND_DEFAULT_FROM`
- `RESEND_DEFAULT_REPLY_TO`

### 可选

- `FORWARD_TO`
- `ALLOWED_API_ORIGINS`
- `ERROR_WEBHOOK_URL`

完整可复制清单见：

- [GITHUB-SECRETS.md](./GITHUB-SECRETS.md)

## Cloudflare 侧前置条件

在 GitHub Actions 能成功部署之前，你需要先确认：

### 1. Worker 与 D1 绑定正确

检查：

- [`wrangler.toml`](../wrangler.toml) 中的 `name`
- `main = "src/index.ts"`
- `[[d1_databases]]`
- 线上 D1 数据库名称和 ID 是否正确

### 2. API Token 权限足够

这个 Token 至少要能完成三类事：

- 发布 Worker
- 写入 Worker Secrets
- 导出 / 迁移 D1

如果权限不够，典型报错是：

```text
Authentication error [code: 10000]
Unable to authenticate request [code: 10001]
```

### 3. 自定义域名已在 Cloudflare 控制台绑定

注意：

- 当前工作流负责“部署 Worker”
- 不负责“自动创建自定义域名路由”
- 也不负责“自动改 DNS”

如果你的线上地址是 `https://tempmail.vixenahri.cn/`，这一步仍然要在 Cloudflare 控制台里手动确认已经绑定到当前 Worker。

### 4. Email Routing 已准备好

如果你要使用 Cloudflare 路由同步，还需要：

- 目标域名已启用 Email Routing
- 对应 `Zone ID` 正确
- `Email Worker` 名称正确

## 当前工作流会同步哪些 Secrets

`deploy.yml` 里会通过 `wrangler secret put` 同步这些值到 Worker：

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

说明：

- 前三项是硬依赖，必须非空
- 其他是可选项，工作流里做了非空判断，空值会跳过同步

## 远程 D1 备份说明

当前工作流在部署前会尝试执行：

```bash
npx wrangler d1 export temp-email-db --remote --output backups/...
```

备份行为：

- 成功时会上传为 GitHub Actions Artifact
- 保留 7 天
- 失败不会阻塞部署，只会给出 warning

这样设计的原因：

- 避免“备份失败导致紧急修复完全发不出去”
- 保留一层基础兜底

如果你对数据安全要求更高，建议再额外结合：

- Cloudflare D1 Time Travel
- 自己的周期性备份策略

## 推荐发布方式

### 日常开发

1. 在功能分支开发
2. 提交 Pull Request
3. 等 `CI` 通过

### 正式发布

1. 合并到 `main`
2. GitHub Actions 自动执行 Deploy

### 紧急发布

1. 进入 GitHub Actions
2. 手动运行 `Deploy`
3. 观察 Secrets 同步、迁移、发布日志

## 本地手工发布

如果你不走 GitHub Actions，也可以在本地执行：

```bash
npm run deploy
```

它会执行：

1. `npm run build`
2. `npm run db:migrate:remote`
3. `wrangler deploy`

注意：

- 本地发布前同样要确保 Cloudflare 登录状态有效
- 本地发布不会自动同步 GitHub Secrets，需要你自己先在 Worker 上配好 secrets

## 常见问题排查

### 1. `wrangler secret put` 报认证错误

优先检查：

- `CLOUDFLARE_API_TOKEN` 是否填错
- Token 是否属于正确账号
- Token 是否能管理目标 Worker
- Token 是否有 D1 / Worker / Secret 所需权限

### 2. 迁移失败

优先检查：

- `wrangler.toml` 的 D1 绑定
- 远程数据库是否就是当前线上库
- 迁移脚本是否含语法错误
- 是否有旧迁移与新结构冲突

### 3. 自定义域名打开是空白页

优先检查：

- Worker 是否重新部署成功
- [`wrangler.toml`](../wrangler.toml) 的 `[assets]` 配置是否还在
- 域名是否真的绑定到了当前 Worker 版本

### 4. 部署成功但收件 / 路由同步异常

优先检查：

- `MAILBOX_DOMAIN`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_EMAIL_WORKER`
- `CLOUDFLARE_API_TOKEN`
- 域名资产中心里对应域名配置是否正确

## 推荐维护习惯

- 每次发布前先看一遍待执行迁移
- 不要把真实 Secrets 写进仓库
- 发布前本地先跑一次 `npm run check`
- 线上问题优先看：
  - GitHub Actions 日志
  - 后台系统日志
  - 审计日志

## 相关文档

- [文档导航](./README.md)
- [README](../README.md)
- [GitHub Secrets 清单](./GITHUB-SECRETS.md)
- [Cloudflare 多账号域名部署说明](./CLOUDFLARE-MULTI-ACCOUNT.md)
- [产品与研发计划书](./产品与研发计划书.md)
- [计划书实现对照表](./计划书实现对照表.md)
