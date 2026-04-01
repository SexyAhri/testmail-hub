# 文档导航

更新日期：2026-04-01

这份索引用来说明当前仓库里的文档分别解决什么问题，方便上传前、自测前和部署前快速找到入口。

## 建议阅读顺序

### 如果你是第一次看这个仓库

1. [README](../README.md)
2. [计划书实现对照表](./计划书实现对照表.md)
3. [产品与研发计划书](./产品与研发计划书.md)

### 如果你准备部署

1. [GitHub Actions Secrets 清单](./GITHUB-SECRETS.md)
2. [CI/CD 说明](./CI-CD.md)
3. [Cloudflare 多账号域名部署说明](./CLOUDFLARE-MULTI-ACCOUNT.md)

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

- [Cloudflare 多账号域名部署说明](./CLOUDFLARE-MULTI-ACCOUNT.md)
  - 多 Cloudflare 账号下的域名治理边界、推荐部署方案、集中收件方式

- [计划书实现对照表](./计划书实现对照表.md)
  - 当前仓库已经落地的能力、仍未完成的能力、适合对外说明的实现状态

- [产品与研发计划书](./产品与研发计划书.md)
  - 原始阶段目标、路线图和产品规划

- [GitHub 发布说明模板](./GITHUB-RELEASE-NOTES.md)
  - 上传仓库、写 PR、写 Release 时可直接复用的文案模板

## 上传前最少确认

- README 的描述、截图和功能状态与当前代码一致
- `.dev.vars`、真实 Token、API Key、Session Secret 没有进入仓库
- 如果要直接部署，GitHub Secrets 已按 [GITHUB-SECRETS.md](./GITHUB-SECRETS.md) 配好
- 如果要写 Release，先把 [GitHub 发布说明模板](./GITHUB-RELEASE-NOTES.md) 按本次版本改一遍
