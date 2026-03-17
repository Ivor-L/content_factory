# 本地开发指南（Development）

本指南覆盖：如何启动项目、如何配置数据库/工作流、以及常见排障入口。

## 1. 前置条件

- Node.js（建议使用 LTS）
- npm（项目已包含 `package-lock.json`）
- 可用的 PostgreSQL（通常是 Supabase Postgres）
- 可用的 Supabase 项目（Auth + Storage）
- 可用的 n8n 实例（用于工作流编排；本项目通过 webhook 触发）

## 2. 安装与启动

```bash
npm install
npm run dev
```

默认访问：`http://localhost:3000`

## 3. 环境变量（本地）

- Next.js 运行必须：`.env.local`
- Vibe/维护脚本：`.vibe/credentials.env`

建议先阅读：[环境变量与密钥管理（含 Vibe）](ENV_AND_SECRETS.md)

## 4. 常用命令

- 本地开发：`npm run dev`
- 构建：`npm run build`
- 代码检查：`npm run lint`

## 5. 关键调试入口

### 5.1 API Routes

后端接口都在 `app/api/*`（Next.js Route Handlers）。常见入口：

- 产品分析触发：`POST /api/products/analyze`（触发 n8n）：[route.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/products/analyze/route.ts)
- 脚本拆解触发：`POST /api/scripts/breakdown`：[route.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/scripts/breakdown/route.ts)
- 积分代理：`GET /api/integration/credits`：[route.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/integration/credits/route.ts)

### 5.2 Webhook 回调

n8n/第三方平台回调入口（务必只在服务端使用）：

- 复刻回调：`POST /api/webhook/replication`：[route.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/webhook/replication/route.ts)
- 复刻 prompt 回调：`POST /api/webhook/replication/prompt`：[route.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/webhook/replication/prompt/route.ts)
- 故事板拆分回调：`POST /api/webhook/storyboard-split`：[route.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/webhook/storyboard-split/route.ts)
- 数字人回调：`POST /api/webhook/digital-human`：[route.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/webhook/digital-human/route.ts)

## 6. 维护脚本（scripts/maintenance）

`scripts/maintenance/` 是用于排障/同步 n8n 工作流/修复连接的离线工具集合。它们通常依赖：

- `.vibe/credentials.env`（n8n api key、Supabase key、DB 连接等）
- `workflows/exports/`（历史导出或修复后的 workflow JSON）

如果你需要“同步/导出/修复”工作流，建议先看：

- [n8n 集成与回调接口](N8N_INTEGRATION.md)
- [工作流与 Webhook 清单（n8n）](WORKFLOWS.md)

## 7. 数据库与迁移（Prisma + Supabase）

- Prisma 模型权威： [schema.prisma](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/prisma/schema.prisma)
- Supabase SQL 迁移：`supabase/migrations/*`

建议先阅读：[数据库与 Prisma/Supabase](DATABASE.md)

