# 文档导航

更新日期：2026-04-08

这份索引用来说明当前仓库里的文档分别解决什么问题，方便上传前、自测前和部署前快速找到入口。

## 建议阅读顺序

### 如果你是第一次看这个仓库

1. [README](../README.md)
2. [架构与代码组织说明](./ARCHITECTURE.md)
3. [计划书实现对照表](./计划书实现对照表.md)
4. [产品与研发计划书](./产品与研发计划书.md)

### 如果你准备接手维护或继续开发

1. [README](../README.md)
2. [架构与代码组织说明](./ARCHITECTURE.md)
3. [计划书实现对照表](./计划书实现对照表.md)
4. [CI/CD 说明](./CI-CD.md)
5. [GitHub Actions Secrets 清单](./GITHUB-SECRETS.md)

### 如果你准备部署

1. [GitHub Actions Secrets 清单](./GITHUB-SECRETS.md)
2. [CI/CD 说明](./CI-CD.md)
3. [Cloudflare 多账号域名部署说明](./CLOUDFLARE-MULTI-ACCOUNT.md)

### 如果你准备继续做域名资产 / Cloudflare 治理

1. [README](../README.md)
2. [架构与代码组织说明](./ARCHITECTURE.md)
3. [Cloudflare 多账号域名部署说明](./CLOUDFLARE-MULTI-ACCOUNT.md)
4. [计划书实现对照表](./计划书实现对照表.md)

### 如果你准备继续做通知配置 / Webhook 治理

1. [README](../README.md)
2. [架构与代码组织说明](./ARCHITECTURE.md)
3. [计划书实现对照表](./计划书实现对照表.md)

### 如果你准备上传仓库或发版

1. [README](../README.md)
2. [GitHub 发布说明模板](./GITHUB-RELEASE-NOTES.md)
3. [计划书实现对照表](./计划书实现对照表.md)

## 文档用途一览

- [README](../README.md)
  - 仓库首页说明、能力概览、快速开始、部署入口

- [CI/CD 说明](./CI-CD.md)
  - GitHub Actions 工作流、远程迁移、发布顺序、常见部署排障

- [GitHub Actions Secrets 清单](./GITHUB-SECRETS.md)
  - Deploy 工作流真正依赖的 Secrets、最小集合、完整推荐值

- [架构与代码组织说明](./ARCHITECTURE.md)
  - 当前真实代码结构、请求流、模块边界、扩展方式与维护建议

- [Cloudflare 多账号域名部署说明](./CLOUDFLARE-MULTI-ACCOUNT.md)
  - 多 Cloudflare 账号下的域名治理边界、推荐部署方案、集中收件方式

- [README](../README.md) 中的“域名资产中心速览”
  - 适合先快速理解域名层级、Catch-all 继承规则、漂移和治理受阻这些页面概念

- [README](../README.md) 中的“Webhook”
  - 适合先快速理解通知端点、自定义请求头、测试投递和告警能力边界

- [计划书实现对照表](./计划书实现对照表.md)
  - 当前仓库已经落地的能力、仍未完成的能力、适合对外说明的实现状态

- [产品与研发计划书](./产品与研发计划书.md)
  - 原始阶段目标、路线图和产品规划

- [GitHub 发布说明模板](./GITHUB-RELEASE-NOTES.md)
  - 上传仓库、写 PR、写 Release 时可直接复用的文案模板

## 上传前最少确认

- README 的描述、截图和功能状态与当前代码一致
- README 里关于域名层级、漂移和多账号治理的描述与当前页面行为一致
- README 里关于通知端点、自定义请求头和测试投递的描述与当前页面行为一致
- README 与 [架构与代码组织说明](./ARCHITECTURE.md) 中的目录结构要和当前仓库一致
- `.dev.vars`、真实 Token、API Key、Session Secret 没有进入仓库
- 如果要直接部署，GitHub Secrets 已按 [GITHUB-SECRETS.md](./GITHUB-SECRETS.md) 配好
- 如果要写 Release，先把 [GitHub 发布说明模板](./GITHUB-RELEASE-NOTES.md) 按本次版本改一遍
