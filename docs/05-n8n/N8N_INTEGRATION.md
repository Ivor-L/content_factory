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

- 脚本拆解回调（一键复刻/提取文案）：`app/api/webhook/replication/script/route.ts`
- 分镜拆解回调（分镜复刻）：`app/api/webhook/storyboard-breakdown/route.ts`
- 复刻视频回调：`app/api/webhook/replication/route.ts`
- 复刻 prompt 回调：`app/api/webhook/replication/prompt/route.ts`
- 故事板拆分回调：`app/api/webhook/storyboard-split/route.ts`
- 数字人回调：`app/api/webhook/digital-human/route.ts`

> **脚本拆解有两条不同的回调路由**，由用户上传时选择的「脚本用途」决定（见 [WORKFLOWS.md 脚本拆解章节](../04-features/WORKFLOWS.md)）：
> - `one-click` / `extract-copy` → `/api/webhook/replication/script`
> - `storyboard` → `/api/webhook/storyboard-breakdown`

### 2.2 回调鉴权（必须）

所有「回调 App」类 HTTP Request 节点需在 Header 中携带 `x-admin-token`，否则 App 返回 401。

**App 侧鉴权逻辑**（`lib/webhookAuth.ts`）：
- 读取 `process.env.ADMIN_TOKEN`（未配置则直接拒绝）
- 校验顺序：`x-admin-token` header → `Authorization: Bearer <token>` header

**n8n 节点配置规范**：

```
Header: x-admin-token
Value:  ={{ $('准备参数').first().json.adminToken }}   ← 必须用表达式，禁止硬编码
```

**完整透传链路**：
```
App 侧 process.env.ADMIN_TOKEN
  → 触发 payload: { admin_token: "xxx" }
  → 准备参数节点解析 → adminToken
  → 回调节点 Header: x-admin-token = adminToken
  → App webhookAuth.ts 校验通过
```

**环境变量（两处都要配置）**：
- `.env.local`（本地）：`ADMIN_TOKEN=<your-token>`
- Vercel Dashboard（生产）：Environment Variables → `ADMIN_TOKEN=<your-token>`

> 遇到 401 `Authorization failed` 时，检查：① `ADMIN_TOKEN` 是否在 App 环境中配置；② n8n 回调节点是否使用动态表达式而非硬编码 token。

### 2.3 回调 payload 设计建议

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

## 4. 回调工作流的 Supabase 凭据配置

爆款复刻回调工作流（`dctPumNGHBoSokUx`）在 n8n 内部直接将裁剪后的视频上传到 Supabase Storage。
上传节点使用 n8n 内置的 **Supabase API Credential**（而非 Variables），凭据只需配置一次即可复用。

> n8n Variables 是企业版功能（社区版 Settings 菜单中不显示）。本项目使用 Credential 方案替代。

### 4.1 确认 Supabase 凭据已配置

进入 n8n → **Credentials** → 搜索 `Supabase`，确认存在一条凭据，其 Host 字段为你的 Supabase 地址（如 `https://supabase-api.atomx.top`），且 Connection tested successfully。

若尚未创建：New Credential → 选择 **Supabase API** → 填写 Host 和 Service Role Secret → Test → Save。

### 4.2 在上传节点中选择凭据（一次性手动操作）

1. 打开工作流 `内容工厂-回调异步-复刻-web-云雾`（ID: `dctPumNGHBoSokUx`）
2. 双击节点 **`上传到Supabase`**
3. 在 **Credential** 下拉框中选择对应的 `Supabase account` 凭据
4. 保存节点，保存工作流

节点已配置为 `genericCredentialType: supabaseApi`，选择凭据后 n8n 会自动注入 `apikey` 和 `Authorization` 请求头，无需手动填写密钥。

### 4.3 Supabase Storage Bucket 前置要求

上传路径为 `uploads/replications/<文件名>.mp4`，确保：

1. Supabase 项目中已创建名为 `uploads` 的 Storage Bucket
2. Bucket 权限设置为 **Public**（或配置 RLS 策略允许 service_role 角色写入）

创建方法：Supabase Dashboard → Storage → New bucket → 名称 `uploads` → 勾选 Public → Create

### 4.4 验证

触发一次爆款复刻任务，在 n8n 执行历史中找到 `dctPumNGHBoSokUx` 的执行记录：

- `生成Supabase上传参数` 节点输出中 `supabase_upload_url` 包含正确域名 → URL 构造正常
- `上传到Supabase` 节点返回 HTTP 200/201 → 上传成功
- `回调App-成功` 节点的 payload 中 `result.video_url` 为可访问的公开 URL → 全链路通

---

## 5. 新增一个工作流的最小步骤（推荐流程）

1) 在 n8n 创建/更新 workflow，并确认 webhook path（feature_key）
2) 在 [WORKFLOWS.md](WORKFLOWS.md) 里登记：
   - `feature_key / n8n workflow id / workflow_id / workflow_name / 是否异步`
3) 在应用侧补齐触发入口：
   - 若是 API Route：在 `app/api/*` 新增 route
   - 若是 Server Action：在 `app/actions/*` 新增 action
   - 在 [n8n.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/n8n.ts) 增加/复用调用函数与 env var
4) 若是异步链路：实现/扩展 `app/api/webhook/*` 回调路由
5) 补齐扣费逻辑（如需）：使用 [credits.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/credits.ts)

