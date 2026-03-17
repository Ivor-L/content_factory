# 环境变量与密钥管理（含 Vibe）

本项目同时包含「运行时环境变量」与「本地维护/排障脚本环境变量」。为避免泄露、便于团队协作，统一采用“固定位置 + 不入库”的方式管理敏感信息。

## 1. 文件约定

### 1.1 运行时（Next.js）

- `.env.local`：本地开发使用（不入库）
- `.env`：仓库内仅保留占位（不含真实值）
- `.env.production.example`：生产环境示例（不含真实值）

Next.js 会自动加载 `.env.local`、`.env` 等（构建日志中可见）。

### 1.2 Vibe/维护脚本（本地）

- 固定位置：`.vibe/credentials.env`（不入库）
- 模板文件：`.vibe/credentials.env.example`（入库）

维护脚本（`scripts/maintenance/*`）会优先读取 `.vibe/credentials.env`，用于连接 n8n / Supabase / Postgres 等。

## 2. 一次性配置步骤（推荐）

1) 创建本地凭据文件：

```bash
cp .vibe/credentials.env.example .vibe/credentials.env
```

2) 将你用于 Vibe coding 的连接信息填入 `.vibe/credentials.env`。

3) 本地开发仍然可以继续使用 `.env.local`（建议把 Next.js 运行必须的变量也放进去，避免跑不起来）。

## 3. 环境变量清单（按用途）

### 3.1 数据库（Prisma / Postgres）

- `DATABASE_URL`：Prisma 运行时连接串（由 [prisma.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/prisma.ts) 使用）
- `DIRECT_URL`：部分迁移/直连场景用（如果你们有用 Prisma migrate/push）

### 3.2 Supabase（前端/后端）

- `NEXT_PUBLIC_SUPABASE_URL`：Supabase API Base URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`：前端 anon key（允许暴露在前端，但仍建议通过 env 管理）
- `SUPABASE_SERVICE_ROLE_KEY`：服务端 service role key（禁止出现在前端；用于服务端读取 `profiles` 等）
- `SUPABASE_JWT_SECRET`：仅在服务端解析 JWT（可选；见 [authServer.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/authServer.ts)）

### 3.3 n8n Webhook（触发端）

这些变量用于触发 n8n 工作流，集中在 [n8n.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/n8n.ts)：

- `N8N_PRODUCT_ANALYSIS_WEBHOOK`
- `N8N_SCRIPT_BREAKDOWN_WEBHOOK`
- `N8N_REPLICATION_WEBHOOK`
- `N8N_GENERATION_SELLING_POINTS_WEBHOOK`
- `N8N_GENERATION_SCRIPT_WEBHOOK`
- `N8N_REPLICATION_SCENE_WEBHOOK`（可选）
- `N8N_API_URL`（历史/调试用默认 webhook base，见 [api.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/api.ts)）

### 3.4 外部积分系统

- `POINTS_API_BASE`：积分系统 API Base URL（默认 `https://api.atomx.top`，见 [credits.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/credits.ts)）
- `DEFAULT_USER_API_KEY`：当无法从用户 profile 获取 api_key 时的兜底（只建议在开发/排障环境使用；见 [authServer.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/authServer.ts)）

### 3.5 n8n 管理 API（维护脚本用）

用于 `scripts/maintenance/*.js|*.cjs`（导出/修复/上传工作流）：

- `N8N_BASE_URL`：例如 `https://n8n.atomx.top`
- `N8N_HOST`：例如 `n8n.atomx.top`（部分脚本使用 Node https 需要 hostname）
- `N8N_API_KEY`：n8n public API key（敏感）

### 3.6 云雾模型聚合 & Asset Worker

- `CLOUD_API_KEY`：统一的 Yunwu 密钥（用于文本/视觉/视频模型）
- `CLOUD_API_BASE_URL`：默认 `https://api.yunwu.example/v1`
- `CLOUD_DEFAULT_MODEL`、`CLOUD_HISTORY_MODEL`、`CLOUD_STORY_MODEL`、`CLOUD_STYLE_MODEL`、`CLOUD_WRITING_MODEL`：可按业务自定义
- `ASSET_HISTORY_MAX_TOKENS` / `ASSET_STORY_MAX_TOKENS` / `ASSET_STYLE_MAX_TOKENS`：每个任务的 token ceiling
- `QUEUE_DATABASE_URL`：pg-boss 数据源（留空则沿用 `DATABASE_URL`）
- `PG_BOSS_SCHEMA`：建议独立 schema（默认 `pgboss`）
- `ASSET_JOB_RETRY_LIMIT` / `ASSET_JOB_RETRY_DELAY`：队列失败自动重试策略
- `ASSET_HISTORY_CONCURRENCY` / `ASSET_STORY_CONCURRENCY` / `ASSET_STYLE_CONCURRENCY`：worker 并发度（按服务器资源调整）

## 4. 安全与协作建议

- 不要把任何密钥写进：
  - `workflows/**/*.json`（尤其是 n8n 的 `pinData`）
  - `scripts/maintenance/*`（改为从 `.vibe/credentials.env` 读取）
  - 文档/README
- 一旦发生泄露，优先轮换：
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `N8N_API_KEY`
  - 数据库密码（如使用直连/Pooler）
  - `DEFAULT_USER_API_KEY`（如果被当作真实用户 key 使用）
