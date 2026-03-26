# 架构总览（Architecture）

本项目是一个基于 Next.js App Router 的内容生成平台：前端提供产品/脚本/复刻/分镜/数字人等工作台，后端通过 Prisma 访问 PostgreSQL（Supabase），并通过 n8n 编排 AI/第三方平台调用，最终将结果回写数据库并在 UI 展示。

## 1. 技术栈与边界

- Web 框架：Next.js（App Router，`app/`）
- 数据层：Prisma + PostgreSQL（常见部署为 Supabase Postgres + Pooler）
- 身份认证：Supabase Auth（前端 session / 后端解析 token）
- 工作流编排：n8n（以 Webhook 作为触发入口，部分链路通过本项目的 Webhook API 回调）
- 积分系统：外部积分服务（通过 `profiles.api_key` 做用户绑定）

## 2. 目录结构（按职责）

- `app/`
  - `app/(site)`：营销站页面（不需要登录）
  - `app/(auth)`：登录/注册页面
  - `app/(main)`：主应用页面（需要登录）
  - `app/api/*`：后端 API Routes（触发 n8n / 读写 DB / Webhook 回调入口）
  - `app/actions/*`：Server Actions（主应用内的服务端写库/触发工作流）
- `lib/`：核心 SDK 与业务封装（n8n 调用、credits、auth、prisma、tenant）
- `prisma/`：Prisma schema（数据模型权威来源）
- `supabase/migrations/`：数据库迁移脚本（RLS/表结构增量）
- `workflows/`：n8n 工作流导出（作为对接与排障的“事实参考”）
- `scripts/maintenance/`：运维/排障/导入导出/工作流修复脚本（离线工具）
- `.vibe/credentials.env`：本地凭据集中位置（不入库；用于 Vibe / 维护脚本）

## 3. 关键代码入口（开发定位）

### 3.1 多租户（Tenant）

- URL 首段识别 + rewrite： [middleware.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/middleware.ts)
- 租户配置与 feature flags： [config.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/tenants/config.ts)
- 前端读取租户（生成 basePath、切换 UI）： [useTenant.tsx](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/hooks/useTenant.tsx)

### 3.2 鉴权（Supabase）

- 前端主应用路由保护： [app/(main)/layout.tsx](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/(main)/layout.tsx)
- 服务端解析 token / 读取 `profiles.api_key`： [authServer.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/authServer.ts)
- Supabase 客户端封装： [supabase.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/supabase.ts)、[supabaseAdmin.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/supabaseAdmin.ts)

### 3.3 数据访问（Prisma）

- Prisma 初始化（pg pool + adapter）： [prisma.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/prisma.ts)
- 数据模型权威定义： [schema.prisma](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/prisma/schema.prisma)

### 3.4 n8n 触发与回调

- n8n 调用与兼容层（payload 统一、网络绕行等）： [n8n.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/n8n.ts)
- 主要回调入口：
  - 复刻回调： [replication webhook](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/webhook/replication/route.ts)
  - 复刻 prompt 回调： [replication prompt webhook](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/webhook/replication/prompt/route.ts)
  - 故事板拆分回调： [storyboard-split webhook](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/webhook/storyboard-split/route.ts)
  - 数字人回调： [digital-human webhook](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/webhook/digital-human/route.ts)

## 4. 业务数据流（从 UI 到落库）

下面用“触发端/编排端/回写端”描述系统的主干路径。

### 4.1 产品分析（Product DNA）

1) UI：产品页触发分析（产品创建/编辑后）
2) 后端：`POST /api/products/analyze` 写入 Product 状态，并调用 n8n： [route.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/products/analyze/route.ts)
3) n8n：下载图片 → 调模型 → 生成 DNA JSON → 更新产品（常见直接在 n8n 内写 Supabase）
4) UI：读取 Product 的 `selling_points/selling_points_text/analysisResult` 展示

### 4.2 脚本拆解（Script Breakdown）

1) UI：脚本页提交拆解
2) 后端：`POST /api/scripts/breakdown` 调 n8n： [route.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/scripts/breakdown/route.ts)
3) UI：轮询 `GET /api/scripts/[id]/status`： [route.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/scripts/%5Bid%5D/status/route.ts)

### 4.3 爆款复刻（Replication）

1) UI：复刻页提交任务
2) 后端：创建/更新 Replication，并触发 n8n（见 `lib/n8n.ts`）
3) n8n：调用第三方平台生成，完成后回调本项目：
   - `/api/webhook/replication`
   - `/api/webhook/replication/prompt`
4) 后端：回调路由更新 `replications.result/status`，UI 展示任务进度与结果

### 4.4 故事板/九宫格/分镜（Storyboard）

1) UI：创建 StoryboardTask（选择素材、产品、角色等）
2) Server Action：创建 task 并触发 n8n： [storyboard.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/actions/storyboard.ts)
3) n8n：生成九宫格/拆分/生成提示词等；拆分完成回调：
   - `/api/webhook/storyboard-split`：写入 `storyboard_tasks.storyboardImages/...` 并扣积分
4) UI：通过任务列表/详情页展示九宫格与分镜结果

### 4.5 数字人（Digital Human）

1) UI：提交数字人任务
2) Server Action：写 `digital_human_videos` 并触发 n8n： [digital-human.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/actions/digital-human.ts)
3) n8n：第三方平台生成 → 回调 `/api/webhook/digital-human` → 更新结果/扣费

## 5. “最容易出问题”的交界面

- 凭据与环境：不要在代码/工作流 JSON/脚本中硬编码密钥；统一放到 `.vibe/credentials.env`（本地）
- 回调幂等：n8n/第三方回调可能重复，回调路由要可重复写入且不产生多次扣费
- payload 兼容：同一业务字段在不同节点/平台可能有多个别名（snake_case/camelCase），建议统一在后端做收敛
- 多租户 basePath：前端跳转/请求路径要用 tenant basePath（避免登录后跳错租户）

