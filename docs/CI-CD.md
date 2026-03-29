# CI / CD Setup

本项目现在统一使用：

- `GitHub Actions` 做持续集成
- `GitHub Actions + Wrangler` 做自动部署

不再把 `Cloudflare Workers Builds / Git 直连部署` 作为主方案，避免和 GitHub Actions 重复发布。

## 当前仓库内置工作流

- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`

## 工作流说明

### `ci.yml`

触发时机：

- push 到 `main`
- push 到 `master`
- pull request

执行内容：

1. 安装依赖
2. 运行 `npm run typecheck`
3. 运行 `npm test`
4. 运行 `npm run build`

### `deploy.yml`

触发时机：

- push 到 `main`
- push 到 `master`
- 手动执行 `workflow_dispatch`

执行内容：

1. 安装依赖
2. 运行 `npm run typecheck`
3. 运行 `npm test`
4. 运行 `npm run build`
5. 导出远程 D1 数据库备份
6. 上传备份为 GitHub Actions Artifact
7. 同步 Worker secrets / variables
8. 执行远程 D1 迁移
9. 发布 Worker

## 为什么只保留 GitHub Actions 自动部署

这样做的好处是：

- 部署链路统一，便于排查
- 数据库迁移和 Worker 发布由同一套流程控制
- 不会出现同一次 push 被 Cloudflare 和 GitHub 同时发布两遍
- 备份、迁移、发布顺序固定，更稳

## 必填 GitHub Secrets

至少需要这些：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `ADMIN_TOKEN`
- `API_TOKEN`
- `SESSION_SECRET`

## 可选 GitHub Secrets

- `FORWARD_TO`
- `MAILBOX_DOMAIN`
- `ALLOWED_API_ORIGINS`
- `ERROR_WEBHOOK_URL`
- `RESEND_API_KEY`
- `RESEND_FROM_DOMAIN`
- `RESEND_DEFAULT_FROM_NAME`
- `RESEND_DEFAULT_FROM`
- `RESEND_DEFAULT_REPLY_TO`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_EMAIL_WORKER`

## 数据库备份说明

每次自动部署前，工作流都会先执行一次远程 D1 导出：

- Artifact 名称：
  - `d1-backup-<run_id>-<run_attempt>`
- 保留时间：
  - 7 天

这是一层额外兜底。

如果你要做更强的回滚保障，仍建议结合：

- Cloudflare D1 Time Travel

## 推荐发布流程

### 日常开发

- 功能分支提交代码
- 发起 Pull Request
- 等待 `ci.yml` 通过

### 正式发布

- 合并到 `main`
- GitHub Actions 自动执行备份、迁移和发布

### 紧急发布

- 在 GitHub Actions 里手动触发 `Deploy`

## 官方文档

- GitHub Actions 集成：
  - https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- Cloudflare CI/CD 总览：
  - https://developers.cloudflare.com/workers/ci-cd/
- D1 导入导出：
  - https://developers.cloudflare.com/d1/best-practices/import-export-data/
- D1 Time Travel：
  - https://developers.cloudflare.com/d1/platform/time-travel/
