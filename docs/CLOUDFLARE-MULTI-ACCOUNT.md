# Cloudflare 多账号域名部署说明

更新日期：2026-04-01

这份文档用于说明 TestMail Hub 在 `多个 Cloudflare 账号` 场景下的真实能力边界、推荐部署方式，以及当前仓库已经支持的配置手段。

## 先说结论

- 可以统一管理多个 Cloudflare 账号下的域名路由配置。
- 前提是这些域名本来就归你管理，或者你拿到了对应账号下该域名的有效 Token / Zone 权限。
- 不能绕过 Cloudflare 权限去控制第三方账号下的域名。
- Cloudflare Email Routing 不能直接把别的账号下的域名投递到你账号里的 Worker。
- 如果你想把多个账号下的域名集中收进一套后台，当前推荐做法是：
  - 主账号部署 Worker 和后台
  - 其他账号的域名使用 `forward` 转发到主账号下一个已验证的中继地址
  - 在 TestMail Hub 里为这些域名单独填写对应账号的 Token / Zone / 路由转发地址

## 当前仓库已经支持什么

### 1. 同账号多域名

如果多个域名都在同一个 Cloudflare 账号下：

- 可以直接共用一个全局 `CLOUDFLARE_API_TOKEN`
- 每个域名分别填写自己的 `Zone ID`
- 默认继续使用同一个 Worker 名称

这是当前最简单、最直接的用法。

### 2. 多账号域名统一治理

如果多个域名分别在不同 Cloudflare 账号下：

- 每个域名现在都可以在后台保存独立的：
  - `Cloudflare API Token`
  - `Zone ID`
  - `Email Worker`
  - `邮箱路由转发到`
- 这样一套后台就能分别读取、同步这些域名自己的 Catch-all 和邮箱路由配置

说明：

- 这里的“统一治理”是控制面统一，不代表 Cloudflare 会跨账号共享 Worker。
- 域名级独立 Token 只对该域名生效，适合权限隔离和跨账号场景。

## 为什么不能直接跨账号共用同一个 Worker

当前 Cloudflare Email Routing 的 Worker 动作是基于目标账号 / 目标 Zone 内可见的 Email Worker。

这意味着：

- A 账号里的域名，不能直接在 Email Routing 规则里引用 B 账号下的 Worker
- 所以“我只部署一份 Worker，所有其他账号的域名直接路由到这个 Worker”这条路走不通

这不是 TestMail Hub 的限制，而是 Cloudflare Email Routing 本身的边界。

## 推荐方案 A：主账号集中收件，其他账号转发中继

这是当前最推荐的多账号集中收件方案。

### 适用场景

- 你想只有一套线上后台
- 主收件和数据库都放在一个 Cloudflare 主账号下
- 其他 Cloudflare 账号下的域名，只负责把邮件转发进来

### 具体做法

1. 在主账号部署当前仓库，正常使用 `deploy.yml`
2. 在主账号准备一个已验证的中继地址，例如：
   - `relay@primary.example.com`
3. 在其他账号的目标域名里：
   - 开启 Email Routing
   - 把 Catch-all 或指定邮箱规则转发到这个中继地址
4. 在 TestMail Hub 的域名资产里，为该域名填写：
   - 该域名所属账号的独立 `Cloudflare Token`
   - 该域名对应的 `Zone ID`
   - `邮箱路由转发到 = relay@primary.example.com`

### 这样做的好处

- 所有邮件最终都能汇总到主账号这一套后台
- 其他账号不需要单独跑完整后台
- 系统后续自动创建 / 更新该域名的邮箱路由时，会优先写入 `forward` 动作，不再依赖 Cloudflare 里提前埋一条模板规则

### 你需要额外准备什么

- 其他账号的域名对应的可用 Token
- 其他账号里要允许访问对应 Zone 的 Email Routing
- 主账号里要先把中继地址收通

## 推荐方案 B：每个账号各部署一套 Worker

如果你不想走中继转发，或者你希望每个账号都直接本地收件，可以改用每账号一套 Worker 的模式。

### 适用场景

- 每个 Cloudflare 账号都希望独立完成收件
- 不希望跨账号转发邮件
- 更看重账号隔离而不是统一入口

### 做法

- 在每个 Cloudflare 账号里分别部署一份相同代码
- 每个账号维护自己的：
  - Worker
  - D1
  - Secrets
  - Email Routing

### 说明

- 当前仓库自带的 [deploy.yml](../.github/workflows/deploy.yml) 仍然是 `单账号部署`
- 如果你要做“多账号分别部署”，通常需要：
  - 多套 GitHub Actions environment / secret
  - 或者单独再做一个矩阵部署工作流

## 当前工作流的真实边界

当前仓库的默认发布流还是单账号：

- GitHub Actions 只读取一组：
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
- 最终只会把 Worker 发布到一个 Cloudflare 账号

这意味着：

- 域名资产中心现在已经可以管理多个账号下的域名配置
- 但默认工作流不会帮你把 Worker 同时部署到多个账号

## 多账号场景建议怎么选

### 如果你的目标是“只要一套后台”

选 `方案 A：主账号集中收件 + 其他账号 forward 中继`

### 如果你的目标是“每个账号自治，互不依赖”

选 `方案 B：每个账号各部署一套 Worker`

## 常见误解

### 1. 多账号治理是不是等于能控制别人的 Cloudflare 账号

不是。

只有当你持有该域名对应账号的有效 Token / Zone 权限时，系统才能去读写它的 Email Routing。

### 2. 多账号是不是等于自动跨账号共用一个 Worker

不是。

跨账号直接复用 Worker 不成立，必须走：

- 各账号分别部署 Worker
- 或者其他账号 forward 到主账号中继地址

### 3. “无限邮箱”是不是等于把别人的域名也变成你的邮箱域名

不是。

“无限邮箱”本质上仍然是你自己有权限控制的域名，通过 Catch-all、forward 或邮箱路由规则去承接更多地址。

## 相关文档

- [文档导航](./README.md)
- [README](../README.md)
- [CI / CD 说明](./CI-CD.md)
- [GitHub Actions Secrets 清单](./GITHUB-SECRETS.md)
