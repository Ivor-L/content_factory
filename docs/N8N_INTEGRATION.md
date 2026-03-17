# n8n 集成与回调接口

本项目将“AI/第三方平台调用”尽量下沉到 n8n，应用侧只负责：

- 触发：把业务参数（含用户 `api_key`、`workflow_id`）发送给 n8n webhook
- 落库：创建/更新任务记录（Prisma）
- 回调：接收 n8n/第三方回调，把状态与结果写回数据库，并触发扣费

## 1. 触发端（应用 → n8n）

### 1.1 封装入口

- n8n 触发封装集中在： [n8n.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/n8n.ts)
- webhook 地址来自环境变量（见 [ENV_AND_SECRETS.md](ENV_AND_SECRETS.md)）

### 1.2 通用约定（建议遵守）

- 统一 snake_case 字段（减少 n8n 节点取值歧义）：
  - `api_key`：用户积分系统 key
  - `workflow_id` / `workflow_name`：业务侧工作流标识（用于计费/统计）
  - `task_id` / `record_id`：异步链路的主键
- 触发请求建议携带可追踪字段：
  - `tenant`（如有多租户差异）
  - `user_id`（Supabase auth user id）
  - `source`（web/app/cron）

## 2. 回调端（n8n/第三方 → 应用）

### 2.1 回调路由位置

所有回调接口都在 `app/api/webhook/*`，典型包括：

- 复刻回调： [replication webhook](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/webhook/replication/route.ts)
- 复刻 prompt 回调： [replication prompt webhook](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/webhook/replication/prompt/route.ts)
- 故事板拆分回调： [storyboard-split webhook](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/webhook/storyboard-split/route.ts)
- 数字人回调： [digital-human webhook](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/app/api/webhook/digital-human/route.ts)

### 2.2 回调 payload 设计建议

为了在多供应商、多异步阶段下保持一致性，建议所有回调至少包含：

- `task_id`：应用侧任务 id（必须）
- `status`：`queued | running | success | failed`（或映射到你们现有枚举）
- `result`：结构化结果（URL、文本、JSON 等）
- `error`：失败时的错误信息
- `meta`：可选，包含供应商任务 id、耗时、token 用量等
- `workflow_id`：用于扣费与统计（建议一直透传）

回调应当支持幂等：同一个 `task_id` 多次回调不会产生重复扣费或重复创建记录。

## 3. 工作流文件与同步

### 3.1 工作流文件位置

- `workflows/`：主用导出（与实际对接字段保持一致）
- `workflows/exports/`：历史导出、修复版、对比快照（不直接被运行时引用）

### 3.2 维护脚本（离线）

`scripts/maintenance/` 包含导出/上传/修复 workflow 的脚本。它们默认从 `.vibe/credentials.env` 读取 n8n 管理 API 凭据，并从 `workflows/exports/` 读取要处理的 JSON。

## 4. 新增一个工作流的最小步骤（推荐流程）

1) 在 n8n 创建/更新 workflow，并确认 webhook path（feature_key）
2) 在 [WORKFLOWS.md](WORKFLOWS.md) 里登记：
   - `feature_key / n8n workflow id / workflow_id / workflow_name / 是否异步`
3) 在应用侧补齐触发入口：
   - 若是 API Route：在 `app/api/*` 新增 route
   - 若是 Server Action：在 `app/actions/*` 新增 action
   - 在 [n8n.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/n8n.ts) 增加/复用调用函数与 env var
4) 若是异步链路：实现/扩展 `app/api/webhook/*` 回调路由
5) 补齐扣费逻辑（如需）：使用 [credits.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/credits.ts)

