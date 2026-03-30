# GitHub 提交说明 / Release Notes

更新日期：2026-03-30

这份文档适合直接复制到 GitHub 提交说明、Pull Request 描述或 Release 页面。

## 推荐品牌与仓库名

- 产品名：`TestMail Hub`
- GitHub 仓库名：`testmail-hub`

## 推荐提交标题

```text
feat: rebrand project to TestMail Hub and sync GitHub release docs
```

## 推荐提交正文

```text
- rebrand product naming from Temp Mail Console to TestMail Hub
- sync README, CI/CD, Secrets and roadmap docs with current implementation status
- add GitHub-ready release notes for publishing this version
- keep Cloudflare Worker name unchanged for deployment compatibility
```

## 推荐 Release 标题

```text
TestMail Hub v0.5.0
```

如果你不想带版本号，也可以直接用：

```text
TestMail Hub - Multi-domain asset center baseline
```

## 可直接发布的 Release Notes

```md
## 概览

这一版把项目正式收敛为更符合定位的 **TestMail Hub**，整体口径统一到“团队测试邮箱与验证码中台 / 邮件资产管理后台 / 私有部署邮件平台”。

## 本次更新

- 完成项目品牌统一，名称调整为 TestMail Hub
- 更新 README、CI/CD、GitHub Secrets、计划书和实现对照表
- 补齐适合 GitHub 发布的文档说明和仓库口径
- 多域名资产中心继续推进，当前已支持：
  - 域名资产管理
  - 域名与项目 / 环境绑定
  - 工作空间过滤域名池与推荐默认域名
  - Catch-all 策略管理与同步
  - 域名维度监控卡片、排行图表、接入概览
- 项目 / 环境 / 邮箱池隔离已可用
- 项目级 API Token 与 Webhook 已可用
- Resend 发信中心、模板、联系人、发送记录已可用

## 部署与兼容性

- 当前仍推荐使用 GitHub Actions 作为唯一正式发布入口
- GitHub Actions 部署不会自动清空线上 D1 数据库
- 出于兼容性考虑，Cloudflare Worker 名仍保留为 `temp-email-worker`
- 这意味着线上自定义域名、Email Routing、Secrets 和 D1 绑定不需要因为这次品牌调整立刻重配

## 当前版本定位

当前版本已经可以作为：

- 团队测试邮箱与验证码中台
- 私有部署邮件资产管理后台
- 自动化测试邮件平台

## 下一步

- 继续补完多域名策略中心
- 抽象 routing profile / catch-all 独立模型
- 推进团队治理和 retention 策略中心
```

## 上传前建议

1. 确认 `.dev.vars` 没有提交
2. 确认 `.wrangler/` 没有提交
3. 确认 GitHub Secrets 已在仓库里配置好
4. 如果要同步线上仓库改名，先确保你有该仓库管理员权限

## 兼容性提示

这次改的是：

- 产品品牌
- 文档口径
- 包名
- 本地仓库目录名建议
- GitHub 仓库名建议

这次刻意没改的是：

- Cloudflare Worker 名 `temp-email-worker`

原因：

- 改 Worker 名会影响线上路由、自定义域名、Email Routing、Secrets 和 D1 绑定
- 更适合单独安排一次维护窗口处理
