# GitHub 发布说明模板

更新日期：2026-04-01

这份文档用于上传仓库、写 Pull Request、写 Release 页面时快速复用当前版本的对外文案。

## 推荐仓库简介

```text
团队测试邮箱与验证码中台，支持私有部署、域名资产治理、Webhook、API Token、生命周期策略与发信中心。
```

## 推荐 GitHub Topics

```text
cloudflare-workers
d1
react
typescript
email
test-automation
verification-code
mailbox-management
```

## 推荐提交标题

### 如果这次主要是整理仓库并准备上传

```text
docs: refresh upload-ready repository documentation
```

### 如果这次是功能发布

```text
feat: ship latest governance and domain management updates
```

## 推荐 Pull Request 描述

```md
## 本次改动

- 整理 README、部署文档、Secrets 清单和发布说明模板
- 同步当前功能状态与计划书实现对照表
- 收口上传前需要的文档入口与检查项

## 验证

- npm run typecheck
- npm test
- npm run build
```

## 推荐 Release 标题

```text
TestMail Hub v0.6.0
```

如果你暂时不想带版本号，也可以用：

```text
TestMail Hub - Upload Ready Snapshot
```

## 可直接复用的 Release Notes

```md
## 概览

TestMail Hub 是一套面向团队测试、自动化测试和私有部署场景的邮件接收、验证码提取与邮箱资产治理控制台。

当前版本已经把收件、提取、规则、白名单、项目隔离、Webhook、API Token、生命周期策略、多域名资产和发信中心收进同一套后台。

## 当前已具备的核心能力

- 邮件接收、正文存储、附件元数据与邮件详情查看
- 验证码、登录链接、魔法链接和平台邮件识别
- 规则中心、白名单、项目 / 环境 / 邮箱池隔离
- 多域名资产中心与 Cloudflare Email Routing 同步
- 托管 API Token、公共 API 与 Webhook
- 生命周期策略中心、执行记录与保留治理
- 发信中心、模板、联系人、发送记录与发送统计
- 管理员体系、审计日志、系统日志与关键治理留痕

## 这一版值得关注的点

- 文档已整理为上传友好结构，部署、Secrets、多账号方案和 Release 模板都有单独说明
- 关键高风险删除动作已补齐“操作备注 -> 删除快照 -> 审计日志”链路
- 多 Cloudflare 账号场景已有清晰边界说明和推荐部署方案
- 当前仓库状态已同步到《计划书实现对照表》，更适合对外说明能力边界

## 部署与兼容性说明

- 当前仍推荐 GitHub Actions + Wrangler 作为正式发布入口
- 默认部署流程不会自动清空线上 D1 数据库
- Cloudflare Worker 名默认仍保持 `temp-email-worker`，避免影响现有自定义域名、Email Routing、Secrets 和 D1 绑定
- 多账号域名治理已支持，但默认工作流仍是单账号发布

## 相关文档

- README
- docs/CI-CD.md
- docs/GITHUB-SECRETS.md
- docs/CLOUDFLARE-MULTI-ACCOUNT.md
- docs/计划书实现对照表.md
```

## 上传前检查

1. README 的功能描述、截图和文档链接可正常打开。
2. `.dev.vars`、真实 Token、API Key、Session Secret 没有进入仓库。
3. GitHub Actions 需要的 Secrets 已按 [GITHUB-SECRETS.md](./GITHUB-SECRETS.md) 配置。
4. 如果要对外说明能力范围，先核对 [计划书实现对照表](./计划书实现对照表.md)。
5. 如果要发 Release，先把上面的模板按本次版本改一遍，不要原样直接发。

## 相关文档

- [文档导航](./README.md)
- [README](../README.md)
- [CI/CD 说明](./CI-CD.md)
- [GitHub Actions Secrets 清单](./GITHUB-SECRETS.md)
- [Cloudflare 多账号域名部署说明](./CLOUDFLARE-MULTI-ACCOUNT.md)
- [计划书实现对照表](./计划书实现对照表.md)
