# NexTide Skills Runtime Phase 2 开发记录

> 日期：2026-05-07
> 阶段目标：产品化与长任务闭环

## 已完成：Agent Run Store MVP

### 新增数据库模型

```prisma
AgentCapabilityRun
```

迁移文件：

```text
prisma/migrations/20260506090000_add_agent_capability_runs/migration.sql
```

表名：

```text
public.agent_capability_runs
```

核心字段：

```text
id
capability_id
user_id
status
mode
input_json
result_json
error_json
artifacts_json
usage_json
business_type
business_id
business_status
idempotency_key
client_json
created_at
updated_at
finished_at
```

### 新增代码

```text
lib/agent-runs/store.ts
lib/agent-runs/business-status.ts
```

### 已实现 API

```text
GET /api/agent/runs/[id]
GET /api/agent/runs/[id]/result
```

行为：

- run 不存在返回 `404 run_not_found`
- run 未完成时 result API 返回 `202 run_not_finished`
- run 完成时 result API 返回 `{ run, result, artifacts }`
- run status API 会根据 `businessType/businessId` 实时刷新底层业务状态

### 已接入 runner

`runAgentCapability()` 现在会：

1. 创建 `AgentCapabilityRun`
2. 执行 capability runner
3. 持久化 result/error/artifacts/usage
4. 尽量推断业务映射
5. 后续 `run status/result` 可通过统一接口查询

## 当前业务映射

| Capability | businessType | businessId 来源 |
|---|---|---|
| `digital-human.video.generate` | `digitalHumanVideo` | response `data.id` |
| `motion.replication.image_to_video` | `digitalHumanVideo` | response `data.id` |
| `xhs.infographic.generate` | `creativeTask` | response `taskId` / `data.id` |
| `xhs.infographic.style.extract` | `stylePreset` | response `data.id` |
| `viral.midform.video.generate` | `creativeTask` | input/result `taskId` |
| `viral.breakdown.video_prompts` | `imageTextReplicationTask` | response `data.id` / `taskId` |
| `social.tiktok.collect` | `socialCollection` | response `taskId` / platform |
| `social.facebook.collect` | `socialCollection` | response `taskId` / platform |
| `social.instagram.collect` | `socialCollection` | synchronous import summary / platform |

## 状态映射

统一 Agent 状态：

```text
queued
running
waiting_callback
succeeded
failed
cancelled
timeout
```

业务状态转换：

```text
COMPLETED / SUCCESS / DONE → succeeded
FAILED / ERROR → failed
CANCELLED → cancelled
TIMEOUT → timeout
其他 → waiting_callback
```

## 验证

已执行：

```bash
npx prisma generate
npm run typecheck
```

结果：通过。

## 已补充：callback 更新 Agent Run Store

以下 webhook 已在业务完成时同步更新 Agent Run Store：

```text
/api/webhook/image-text-result
/api/webhook/style-analysis
/api/webhook/t2v-callback
/api/webhook/social-scraper
```

同时 `social-scraper/start` 现在会返回 `taskId/task_id/callbackUrl`，便于 Agent run 记录外部 workflow task id。

## 已完成：Device Login 直连系统 API Key

根据当前产品实际情况，CLI device login 不再创建或使用历史遗留 NexAPI key，而是读取用户注册时分配的系统 API Key：

```text
profiles.api_key
```

新增：

```text
AgentCliDeviceLogin
/api/agent/auth/device/code
/api/agent/auth/device/token
/api/agent/auth/device/approve
/agent-login
packages/nextide-cli
```

CLI 命令：

```bash
nextide auth login
```

流程：

```text
CLI 请求 device code
  ↓
用户打开 /agent-login?user_code=xxx
  ↓
Web 端登录态批准
  ↓
服务端读取 profiles.api_key
  ↓
CLI 轮询 token endpoint
  ↓
保存 userApiKey 到 ~/.nextide/config.json
```

已验证：

```bash
npm run typecheck
npm run build:nextide-cli
```

数据库迁移说明：SSH 隧道恢复后已执行成功：

```bash
npx prisma migrate deploy
```

已应用：

```text
20260506090000_add_agent_capability_runs
20260506091000_add_agent_cli_device_logins
```

已确认线上库存在：

```text
public.agent_capability_runs
public.agent_cli_device_logins
```

## 下一步建议

### 已完成：基础 smoke test

已启动本地服务并验证：

```bash
node packages/nextide-cli/dist/index.js capability list --api-base-url http://localhost:3000
```

结果：

```text
count 14
available 14
```

已验证 device login code 创建：

```bash
node packages/nextide-cli/dist/index.js auth login --api-base-url http://localhost:3000
```

线上库 `agent_cli_device_logins` 已出现 `pending` 记录。

已验证 failed run 可落库并查询：

```bash
node packages/nextide-cli/dist/index.js capability run xhs.card.layout ...
node packages/nextide-cli/dist/index.js run status <run-id>
```

`run status` 可从 `agent_capability_runs` 返回失败记录。

完整授权后 smoke 仍需人工浏览器登录批准 device code。

### P0.2 端到端授权后 smoke

启动服务后执行：

```bash
npm run nextide -- capability run xhs.card.layout \
  --input .nextide/input/xhs-card-layout-smoke.json \
  --output .nextide/output/xhs-card-layout-result.json \
  --mode wait

npm run nextide -- run status <run-id>
npm run nextide -- run result <run-id> --output .nextide/output/run-result.json
```

### P1 实现正式 CLI package

目标：

```bash
nextide auth login
nextide status
nextide capability list
nextide capability run ...
nextide run status ...
nextide run result ...
```

### P1 补业务映射

继续补：

- social collection import result ids
- XHS style preset async DNA status
- XHS poster jobs final images
- StoryboardTask for T2V result

### 已完成：Standalone 中视频任务

`viral.midform.video.generate` 已不再要求已有 `creativeTaskId`。

现在输入：

```json
{
  "title": "久坐为什么让肩颈越来越僵",
  "scriptText": "完整脚本...",
  "theme": "3d-skeleton"
}
```

会自动：

```text
创建 CreativeTask
  ↓
创建/更新 TaskSummary
  ↓
调用 /api/my-works/t2v
  ↓
等待 /api/webhook/t2v-callback 写回 t2v_storyboard_id
```
