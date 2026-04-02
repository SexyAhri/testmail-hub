# TestMail Hub 架构与代码组织说明

更新日期：2026-04-02

这份文档面向准备接手维护、继续开发或做二次集成的人，重点解释当前仓库的代码组织、主要运行链路、模块边界和推荐扩展方式。

## 1. 总体架构

TestMail Hub 当前是一套典型的 Cloudflare Worker 单服务架构：

- 运行时：Cloudflare Workers
- 数据库：Cloudflare D1
- 管理后台：React 19 + Vite + Ant Design
- 邮件接收：Cloudflare Email Routing -> Worker
- 事件通知：Worker -> Webhook
- 对外发信：Worker -> Resend

整体上可以分成 5 层：

1. `src/index.ts`
   统一 Worker 入口，负责请求分发、鉴权、定时任务与全局错误兜底。
2. `src/handlers/`
   路由处理层，负责把 HTTP 请求转换成具体的业务操作。
3. `src/core/`
   业务核心层，包含数据库访问、通知、发信、同步、鉴权等核心逻辑。
4. `src/client/`
   React 管理后台，负责页面、表格、抽屉、过滤器、表单和 API 调用。
5. `migrations/`
   D1 数据结构迁移脚本，是所有线上数据结构变更的唯一正式入口。

## 2. 主要运行链路

### 2.1 邮件接收链路

1. Cloudflare Email Routing 把邮件投递给 Worker。
2. Worker 在 [src/index.ts](../src/index.ts) 中进入邮件处理入口。
3. [src/core/logic.ts](../src/core/logic.ts) 负责解析原始邮件、提取验证码与链接、命中规则。
4. 数据落到 D1，主要由 `src/core/db-*.ts` 模块完成。
5. 如果命中通知条件，再由 [src/core/notifications.ts](../src/core/notifications.ts) 发出 Webhook 事件。
6. 管理后台、公共 API、Webhook 消费方后续都从同一份邮件数据读取。

### 2.2 后台管理请求链路

1. 浏览器调用 `src/client/api/*.ts` 中的接口方法。
2. Worker 在 [src/index.ts](../src/index.ts) 中匹配 `/admin/*` 路由。
3. [src/handlers/handlers.ts](../src/handlers/handlers.ts) 作为路由出口聚合层，转发到具体 feature handler。
4. feature handler 完成：
   - 请求体解析
   - 权限判断
   - 参数校验
   - 调用 `core` 层
   - 记录审计日志
5. `core` 层完成持久化、同步、通知、统计等实际逻辑。
6. 结果返回给前端页面，页面再更新表格、详情和指标卡。

### 2.3 公共 API 链路

1. 外部系统使用 API Token 调用 `/api/*`。
2. [src/core/auth.ts](../src/core/auth.ts) 校验 Bearer Token 和权限范围。
3. `public email routes` 返回最新邮件、提取结果、验证码或附件。
4. 响应数据依旧来自同一份邮件主数据，不存在单独一套“API 专用存储”。

### 2.4 定时任务与后台任务链路

当前有 3 类重要的异步 / 定时链路：

- 生命周期清理
  - 入口在 [src/index.ts](../src/index.ts)
  - 规则与持久化主要在 [src/core/db-retention-policies.ts](../src/core/db-retention-policies.ts) 和 [src/core/db-job-runs.ts](../src/core/db-job-runs.ts)
- Webhook 重试
  - 核心在 [src/core/notifications.ts](../src/core/notifications.ts)
  - 投递与 attempt 持久化在 [src/core/db-notification-endpoints.ts](../src/core/db-notification-endpoints.ts)
- 发信队列处理
  - 核心在 [src/core/outbound-service.ts](../src/core/outbound-service.ts)
  - 发信数据持久化在 [src/core/db-outbound.ts](../src/core/db-outbound.ts)

### 2.5 Cloudflare 域名同步链路

1. 后台域名页或邮箱页发起同步请求。
2. `handlers/domains` 或 `handlers/mailboxes` 接收请求。
3. [src/core/mailbox-sync.ts](../src/core/mailbox-sync.ts) 读取域名资产、路由策略、邮箱列表和治理规则。
4. 根据 provider 能力定义决定是否执行 Catch-all、邮箱路由或状态探测。
5. 同步结果和运行记录写入 D1。
6. 审计日志记录操作备注、变更前后快照和变更字段摘要。

## 3. 代码目录说明

### 3.1 `src/index.ts`

这是整个 Worker 的主入口，负责：

- HTTP 路由分发
- `/admin/*` 与 `/api/*` 请求入口
- 邮件接收入口
- 定时任务触发
- Webhook 重试和发信队列调度
- 全局错误捕获与错误日志落库

它应该继续保持“入口编排层”角色，不适合再塞入新的大段业务实现。

### 3.2 `src/handlers/`

`handlers` 现在已经按功能域拆目录，结构上更接近“接口层”。

当前主要目录：

- `admins/`
- `api-tokens/`
- `auth/`
- `domains/`
- `emails/`
- `insights/`
- `mailboxes/`
- `notifications/`
- `outbound/`
- `retention/`
- `rules/`
- `whitelist/`
- `workspace/`

共享文件：

- [src/handlers/handlers.ts](../src/handlers/handlers.ts)
  - 统一 re-export，对 `src/index.ts` 暴露稳定入口
- [src/handlers/access-control.ts](../src/handlers/access-control.ts)
  - 后端权限边界、项目范围判断
- [src/handlers/audit.ts](../src/handlers/audit.ts)
  - 审计相关工具
- [src/handlers/request-helpers.ts](../src/handlers/request-helpers.ts)
  - 通用请求辅助函数

### 3.3 `validation` 模块

原先的大文件 `src/handlers/validation.ts` 已拆成目录模块，当前保留一个兼容出口：

- [src/handlers/validation.ts](../src/handlers/validation.ts)
  - 仅作为 re-export 入口，避免外部 import 大面积改动

实际拆分文件：

- [src/handlers/validation/shared.ts](../src/handlers/validation/shared.ts)
- [src/handlers/validation/rules.ts](../src/handlers/validation/rules.ts)
- [src/handlers/validation/workspace.ts](../src/handlers/validation/workspace.ts)
- [src/handlers/validation/domains.ts](../src/handlers/validation/domains.ts)
- [src/handlers/validation/mailboxes.ts](../src/handlers/validation/mailboxes.ts)
- [src/handlers/validation/admins.ts](../src/handlers/validation/admins.ts)
- [src/handlers/validation/notifications.ts](../src/handlers/validation/notifications.ts)
- [src/handlers/validation/api-tokens.ts](../src/handlers/validation/api-tokens.ts)
- [src/handlers/validation/retention.ts](../src/handlers/validation/retention.ts)

推荐约定：

- 新增参数校验时，优先继续放到 `validation/<feature>.ts`
- `validation.ts` 不再重新堆积实现，只保留兼容出口

### 3.4 `src/core/`

`core` 是业务主干层，职责包括：

- 鉴权与 Token 校验
- 数据库访问
- 域名同步
- Webhook 事件投递
- 对外发信
- 错误采集

### `db.ts` 的角色

[src/core/db.ts](../src/core/db.ts) 现在更像“数据库聚合出口”，而不是所有 SQL 的唯一文件。

已经拆出的数据库模块包括：

- [src/core/db-admin-users.ts](../src/core/db-admin-users.ts)
- [src/core/db-api-tokens.ts](../src/core/db-api-tokens.ts)
- [src/core/db-audit.ts](../src/core/db-audit.ts)
- [src/core/db-domain-assets.ts](../src/core/db-domain-assets.ts)
- [src/core/db-emails.ts](../src/core/db-emails.ts)
- [src/core/db-job-runs.ts](../src/core/db-job-runs.ts)
- [src/core/db-mailboxes.ts](../src/core/db-mailboxes.ts)
- [src/core/db-notification-endpoints.ts](../src/core/db-notification-endpoints.ts)
- [src/core/db-outbound.ts](../src/core/db-outbound.ts)
- [src/core/db-retention-policies.ts](../src/core/db-retention-policies.ts)
- [src/core/db-rules-whitelist.ts](../src/core/db-rules-whitelist.ts)
- [src/core/db-workspace-entities.ts](../src/core/db-workspace-entities.ts)

当前推荐约定：

- 新增一类明显独立的数据实体时，优先新建 `db-<feature>.ts`
- [src/core/db.ts](../src/core/db.ts) 只保留：
  - 统一导出
  - 跨 feature 的聚合查询
  - 仍未拆完但确实跨域的统计 / 导出逻辑

### 3.5 `src/client/`

前端目前也已经从“大页面单文件”逐步拆到按功能目录组织。

主要结构：

- `api/`
  - 后端接口调用封装
- `components/`
  - 通用 UI 组件与布局
- `hooks/`
  - 通用交互逻辑，如分页反馈、表格选择
- `pages/<feature>/`
  - 每个页面自己的指标卡、筛选器、抽屉、列定义和工具函数

典型页面目录示例：

- [src/client/pages/domains/](../src/client/pages/domains)
- [src/client/pages/mailboxes/](../src/client/pages/mailboxes)
- [src/client/pages/outbound/](../src/client/pages/outbound)
- [src/client/pages/notifications/](../src/client/pages/notifications)
- [src/client/pages/retention/](../src/client/pages/retention)

推荐约定：

- 页面超过数百行时，优先拆成：
  - `xxxPage.tsx`
  - `xxxMetrics.tsx`
  - `xxxFilters.tsx`
  - `xxxFormDrawer.tsx`
  - `xxx-table-columns.tsx`
- 跨页面复用的逻辑优先沉到 `components/` 或 `hooks/`
- API 请求不要直接散落在页面里，优先放到 `src/client/api/*.ts`

### 3.6 `src/server/`、`src/shared/`、`src/utils/`

- `src/server/types.ts`
  - 前后端共享的核心类型定义
- `src/shared/`
  - 例如 `domain provider` 这种需要多层共用的能力定义
- `src/utils/`
  - 常量、提取逻辑、通用工具函数

其中 [src/utils/constants.ts](../src/utils/constants.ts) 目前承载较多角色、权限、通知事件、限制项定义，是很多模块的基础依赖。

## 4. 核心数据与作用域模型

项目当前最重要的几个业务骨架：

### 4.1 工作空间骨架

作用域链路：

`project -> environment -> mailbox_pool`

这条链路会影响：

- 邮箱归属
- 邮件可见范围
- 生命周期策略继承
- 域名资产绑定
- API Token / Webhook / 管理员的项目级边界

### 4.2 域名资产骨架

域名治理相关实体主要包括：

- domain asset
- routing profile
- provider definition
- governance flags
- sync runs / drift state

这条链路会影响：

- 邮箱创建是否允许使用某域名
- Catch-all 是否允许管理
- 邮箱路由是否允许同步
- 多 Cloudflare 账号下的域名接入方式

### 4.3 治理与权限骨架

当前后台权限核心由以下概念组成：

- `role`
  - `owner`
  - `platform_admin`
  - `project_admin`
  - `operator`
  - `viewer`
- `access_scope`
  - `all`
  - `bound`
- `project_ids`
  - 当范围为 `bound` 时用于约束可见和可写项目

前端显示态和后端强校验都依赖这套模型，所以新增后台资源时必须同时考虑：

- 页面按钮是否该显示
- 接口是否真的允许执行
- 审计日志是否记录

## 5. 推荐扩展方式

### 5.1 新增一个后台资源

推荐顺序：

1. 先补 migration
2. 在 `src/server/types.ts` 增加类型
3. 新建或扩展 `src/core/db-*.ts`
4. 在 `src/handlers/<feature>/` 增加路由处理
5. 在 `src/handlers/validation/` 增加校验
6. 在 `src/handlers/handlers.ts` 暴露出口
7. 在 `src/index.ts` 接入路由
8. 在 `src/client/api/` 增加请求封装
9. 在 `src/client/pages/<feature>/` 增加页面和抽屉
10. 补测试与文档

### 5.2 新增一类数据库实体

如果这类数据满足以下任一条件，建议直接单独新建 `db-*.ts`：

- 有独立列表 / 详情 / CRUD
- 有独立统计或分页逻辑
- 未来还会继续长
- 和现有实体只通过 ID 或少量关联相连

不要再把这类实现重新塞回一个巨大的 `db.ts`。

### 5.3 新增参数校验

推荐做法：

- 共用小工具放 `validation/shared.ts`
- feature 自己的 body 校验放 `validation/<feature>.ts`
- 维持 `handlers` 层“先校验再入 core”的顺序

### 5.4 新增审计留痕

新增高风险写动作时，至少同时补这几件事：

1. 操作备注入口
2. 后端权限校验
3. 审计日志记录
4. 关键字段 `previous / next / changed_fields`
5. 批量动作时保留摘要和样本

## 6. 当前工程状态

当前仓库已经完成几轮结构整理，整体方向是：

- 大页面按 feature 拆目录
- `handlers` 按功能域拆目录
- `validation` 从单文件拆成模块目录
- `db.ts` 逐步退化为聚合出口，SQL 实现下沉到 `db-*.ts`

这意味着后续继续优化时，优先原则不是“再造一套新架构”，而是顺着现有目录继续小步拆分。

## 7. 配套阅读

- 部署与发布：[CI-CD.md](./CI-CD.md)
- Secrets 准备：[GITHUB-SECRETS.md](./GITHUB-SECRETS.md)
- 产品阶段与完成度：[计划书实现对照表.md](./计划书实现对照表.md)
- 多 Cloudflare 账号部署：[CLOUDFLARE-MULTI-ACCOUNT.md](./CLOUDFLARE-MULTI-ACCOUNT.md)
