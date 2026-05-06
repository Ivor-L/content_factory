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

## 已完成：Capability Export / Skill Generator

新增：

```text
scripts/export-nextide-capabilities.ts
scripts/generate-nextide-skills.ts
```

新增命令：

```bash
npm run capabilities:export
npm run skills:generate
```

已生成：

```text
artifacts/capabilities/capabilities.json
artifacts/capabilities/*.input.schema.json
```

`skills:generate` 会：

- 按 capability registry 更新 `.claude/skills/*/SKILL.md` 中的自动生成区块
- 自动生成/覆盖 `nextide-skill-router-cn` 路由表
- 对已有手写内容，只追加或替换 `<!-- BEGIN NEXTIDE AUTO-GENERATED -->` 到 `<!-- END NEXTIDE AUTO-GENERATED -->` 区块

已验证：

```bash
npm run capabilities:export
npm run skills:generate
npm run typecheck
npm run build:nextide-cli
```

## 已完成：CLI Doctor / Skills Release Package

新增 CLI 命令：

```bash
nextide doctor
```

当前检查项：

```text
api_base_url
capability_list
device_code_endpoint
stored_nexTide_api_key
```

线上验证：

```bash
node packages/nextide-cli/dist/index.js doctor --api-base-url https://atomx.top
```

结果：`ok: true`，capability count = 14，device login endpoint 正常，NexTide API Key 已保存。

新增 skills 发布包命令：

```bash
npm run skills:package
```

输出：

```text
artifacts/skills/nextide-skills.zip
```

当前 zip 大小约 55KB，包含：

```text
.claude/skills
skills/wechat-longform-writer
artifacts/capabilities
```

## 已完成：Capability Registry v2 分类拆分

`lib/agent-capabilities/registry.ts` 已从单文件定义改为分类聚合入口：

```text
lib/agent-capabilities/registry.ts
lib/agent-capabilities/registry/xhs.ts
lib/agent-capabilities/registry/video.ts
lib/agent-capabilities/registry/social.ts
lib/agent-capabilities/registry/product.ts
lib/agent-capabilities/registry/writing.ts
```

当前聚合顺序：

```text
XHS → Video → Social → Product → Writing
```

已验证：

```bash
npm run typecheck
npm run capabilities:export
npm run skills:generate
npm run build:nextide-cli
```

导出 capability 数量仍为 14。

## 已完成：Capability Metadata v2

新增 capability metadata 字段：

```ts
version
category
costLevel
requiredAuth
requiredEnv
examples
docsUrl
```

类型定义位置：

```text
lib/agent-capabilities/types.ts
```

集中增强逻辑：

```text
lib/agent-capabilities/registry/enrich.ts
```

`NEXTIDE_CAPABILITIES` 聚合后会自动补齐 metadata，不需要每个分类文件重复写通用字段。

`skills:generate` 现在会把以下字段写入每个 Skill 的自动生成 contract：

```text
Version
Category
Cost level
Required auth
Required env
Examples
```

`nextide doctor` 已增加：

```text
capability_environment_metadata
```

本地 artifacts 已确认 14 个 capability 都包含 metadata v2 字段。

## 已完成：Capability Examples / Fixture Generator

新增 CLI 命令：

```bash
nextide capability list --examples
nextide capability example <capability-id> --output input.json
```

行为：

- 如果线上 capability 已部署 `examples` metadata，直接输出对应 example input。
- 如果线上还没有 metadata v2，会根据 `inputSchema` 自动生成 skeleton input。

新增脚本：

```text
scripts/generate-nextide-fixtures.ts
```

新增命令：

```bash
npm run fixtures:generate
```

并已接入：

```bash
npm run skills:package
```

当前生成 5 个 example fixture 到：

```text
.nextide/input
```

已验证：

```bash
npm run fixtures:generate
npm run build:nextide-cli
nextide capability example viral.midform.video.generate --output .nextide/input/cli-example-viral-midform.json
npm run typecheck
npm run skills:package
```

## 已完成：CLI Run Wait / Polling

新增 CLI 能力：

```bash
nextide run wait <run-id> --timeout 1800 --interval 5
nextide capability run <id> --input input.json --mode submit --wait
```

行为：

```text
submit run
  ↓
如果状态为 queued / running / waiting_callback
  ↓
按 interval 轮询 /api/agent/runs/[id]
  ↓
直到 succeeded / failed / cancelled / timeout
  ↓
输出最终 run JSON
```

已验证：

```bash
nextide run wait run_498e0175-7c3d-4ab4-8cad-60657e1b9982 --api-base-url https://atomx.top
```

返回 `succeeded`。

已验证线上异步 capability 自动等待：

```bash
nextide capability run viral.midform.video.generate \
  --api-base-url https://atomx.top \
  --input .nextide/input/viral-midform-video-standalone-example.json \
  --output .nextide/output/atomx-viral-midform-wait-result.json \
  --mode submit \
  --wait \
  --timeout 120 \
  --interval 5
```

返回 `succeeded`，并拿到 `creativeTaskId` / `storyboardTaskId` / `shots`。

## 已完成：Run Result Artifact Normalization

新增统一结果归一化：

```text
lib/agent-runs/normalize.ts
```

`GET /api/agent/runs/[id]/result` 现在返回统一结构：

```json
{
  "run": {},
  "result": {},
  "artifacts": [],
  "business": {},
  "error": null
}
```

归一化规则覆盖：

```text
viral.midform.video.generate       → storyboard-shots.json / storyboard-task.json / video artifact
viral.breakdown.video_prompts      → video-prompts.json
xhs.card.layout                    → xhs-card-pages.json
xhs.infographic.generate           → image artifacts
digital-human.video.generate       → digital-human.mp4
motion.replication.image_to_video  → motion-replication.mp4
social.*                           → social-items.json
product.selling_point.analysis     → product-selling-points.json
content.wechat.longform.write      → wechat-article.md
```

CLI polling 已同步升级：

```text
nextide run wait
nextide capability run --wait
```

在 run 成功后会优先请求：

```text
/api/agent/runs/[id]/result
```

因此输出会尽量是 normalized result，而不是裸 status。

已验证：

```bash
npm run typecheck
npm run build:nextide-cli
nextide run result run_ceab901e-32ae-406d-aaa8-af9028046876 --api-base-url https://atomx.top
```

线上旧版本仍兼容；部署新代码后会返回新增 `business` 和增强 `artifacts`。

## 已完成：CLI Artifact Export

新增 CLI 命令：

```bash
nextide run artifacts <run-id> --output-dir .nextide/output/run_xxx
```

行为：

```text
读取 /api/agent/runs/[id]/result
  ↓
读取 normalized artifacts
  ↓
json/text artifact 写成本地文件
  ↓
url/path artifact 写入 manifest，不下载远程资源
  ↓
写 manifest.json
```

manifest 示例字段：

```json
{
  "runId": "run_xxx",
  "exportedAt": "...",
  "apiBaseUrl": "https://atomx.top",
  "artifactCount": 0,
  "artifacts": [],
  "business": {},
  "run": {}
}
```

已验证：

```bash
nextide run artifacts run_ceab901e-32ae-406d-aaa8-af9028046876 \
  --api-base-url https://atomx.top \
  --output-dir .nextide/output/run_ceab901e-artifacts
```

线上旧 result 当前 artifactCount 为 0，但成功写出：

```text
.nextide/output/run_ceab901e-artifacts/manifest.json
```

部署 normalized result 后，中视频等任务会导出：

```text
storyboard-task.json
storyboard-shots.json
manifest.json
```

已验证：

```bash
npm run build:nextide-cli
npm run typecheck
```

## 已完成：Skills Artifact-first Workflow Upgrade

`skills:generate` 已升级自动生成区块：

```text
scripts/generate-nextide-skills.ts
```

异步 capability 的 CLI 标准流程现在是：

```bash
nextide capability run <capability-id> \
  --input .nextide/input/<capability-id>.json \
  --output .nextide/output/<capability-id>-result.json \
  --mode submit \
  --wait \
  --timeout <maxWaitSeconds> \
  --interval 5

RUN_ID=$(node -e "const r=require('./.nextide/output/<capability-id>-result.json'); console.log(r.run && r.run.runId)")
nextide run artifacts "$RUN_ID" \
  --output-dir .nextide/output/$RUN_ID
```

自动生成区块新增 Artifact-first reading order：

```text
1. Read .nextide/output/$RUN_ID/manifest.json
2. Return local artifact paths when present
3. If a remote URL artifact is present, return the URL from manifest
4. Only inspect the full result JSON when manifest is insufficient
```

General Rules 也更新为：

```text
- Async tasks 优先 --wait
- Finished run 后使用 nextide run artifacts
- 优先返回 manifest 中的本地 artifact 路径，避免贴巨大 JSON
```

已验证：

```bash
npm run skills:generate
npm run typecheck
npm run skills:package
```

并抽查：

```text
.claude/skills/viral-midform-video-generator/SKILL.md
```

已包含 `--wait` / `nextide run artifacts` / `Artifact-first reading order`。

## 已完成：CLI npm pack / publish-ready validation

`@nextide/cli` 发布配置已补齐：

```text
packages/nextide-cli/package.json
packages/nextide-cli/README.md
packages/nextide-cli/LICENSE
packages/nextide-cli/.npmignore
```

package metadata：

```json
{
  "name": "@nextide/cli",
  "version": "0.2.0",
  "license": "MIT",
  "bin": { "nextide": "dist/index.js" },
  "files": ["dist", "README.md", "LICENSE", "package.json"],
  "engines": { "node": ">=18.17" },
  "publishConfig": { "access": "public" }
}
```

根项目新增：

```bash
npm run nextide:pack
```

打包输出：

```text
artifacts/cli/nextide-cli-0.2.0.tgz
```

tarball 内容已验证仅包含：

```text
package/LICENSE
package/README.md
package/dist/index.js
package/package.json
```

本地安装 smoke test：

```bash
npm install --prefix /tmp/nextide-cli-pack-smoke ./artifacts/cli/nextide-cli-0.2.0.tgz
/tmp/nextide-cli-pack-smoke/node_modules/.bin/nextide doctor --api-base-url https://atomx.top
```

结果：

```text
ok: true
api_base_url: true
capability_list: true
device_code_endpoint: true
stored_nexTide_api_key: true
capability_environment_metadata: true
```

已验证：

```bash
npm run typecheck
```

## 已完成：Release Bundle / Agent Runtime Distribution

新增发布包脚本：

```text
scripts/package-nextide-agent-runtime.ts
```

根项目新增命令：

```bash
npm run release:agent-runtime
```

该命令会串联：

```text
npm run nextide:pack
npm run skills:package
tsx scripts/package-nextide-agent-runtime.ts
```

输出：

```text
artifacts/release/nextide-agent-runtime-0.2.0.zip
```

发布包内容：

```text
nextide-agent-runtime-0.2.0/
  cli/nextide-cli-0.2.0.tgz
  skills/nextide-skills.zip
  capabilities/capabilities.json
  capabilities/*.input.schema.json
  fixtures/*.json
  manifest.json
  INSTALL.md
```

`INSTALL.md` 包含：

```text
安装 CLI
安装 Skills
Device Login
doctor 验证
运行 example
导出 artifacts
安全规则
```

已验证 release zip 内容，共 44 个文件。

安装 smoke test：

```bash
unzip artifacts/release/nextide-agent-runtime-0.2.0.zip -d /tmp/nextide-runtime-smoke
npm install --prefix /tmp/nextide-runtime-smoke/install \
  /tmp/nextide-runtime-smoke/nextide-agent-runtime-0.2.0/cli/nextide-cli-0.2.0.tgz
/tmp/nextide-runtime-smoke/install/node_modules/.bin/nextide doctor --api-base-url https://atomx.top
```

结果：

```text
ok: true
checks: 5
```

已验证：

```bash
npm run typecheck
```

## 已完成：Agent Capability Unified Auth Guard

已为高风险写接口接入统一 NexTide API Key 鉴权：

```text
POST /api/agent/capabilities/[id]/run
```

新增：

```text
lib/agent-auth/api-key.ts
```

鉴权来源：

```text
x-user-api-key: <profiles.api_key>
x-nextide-api-key: <profiles.api_key>
Authorization: Bearer <profiles.api_key>
```

鉴权规则：

```text
- 缺少 key → 401 unauthorized
- key 不存在于 public.profiles.api_key → 401 unauthorized
- profile.is_banned = true → 403 forbidden
```

成功后返回 `userId`，并传入：

```text
runAgentCapability({ userId })
```

`AgentCapabilityRun.userId` 现在会记录真实用户 ID，便于审计、owner check、额度和限流。

已验证：

```bash
npm run typecheck
npm run build:nextide-cli
nextide capability run xhs.card.layout --api-base-url https://atomx.top --mode wait
```

线上已登录 CLI 调用仍成功：

```text
status: succeeded
capabilityId: xhs.card.layout
```

注意：当前本地代码已加 guard；线上匿名拦截需部署后生效。

## 已完成：Run Status / Result Owner Check

已为 Agent run 读取接口接入统一鉴权和 owner check：

```text
GET /api/agent/runs/[id]
GET /api/agent/runs/[id]/result
```

使用同一套 NexTide API Key 鉴权：

```text
x-user-api-key
x-nextide-api-key
Authorization: Bearer
```

owner check 规则：

```text
- admin profile 可读取所有 run
- run.userId 为空的历史 run 暂时允许读取，用于兼容旧数据和 smoke test
- run.userId 存在时，必须等于当前 profile.id
- 不匹配则 403 forbidden
```

新增 helper：

```text
assertAgentRunReadable(auth, record)
```

已验证：

```bash
npm run typecheck
npm run build:nextide-cli
nextide run status run_ceab901e-32ae-406d-aaa8-af9028046876 --api-base-url https://atomx.top
nextide run result run_ceab901e-32ae-406d-aaa8-af9028046876 --api-base-url https://atomx.top
```

线上旧版本兼容 smoke 均返回 `succeeded`。

注意：当前本地代码已加 owner check；线上读取保护需部署后生效。

## 已完成：Per-capability Cost Guard / Rate Limit Skeleton

新增高成本 capability 保护骨架：

```text
lib/agent-capabilities/cost-guard.ts
```

已接入：

```text
POST /api/agent/capabilities/[id]/run
```

执行顺序：

```text
requireAgentApiKey
  ↓
assertAgentCapabilityCostAllowed
  ↓
parse body
  ↓
runAgentCapability
```

当前规则：

```text
free / low      暂不限流
medium          10/minute, 60/hour
high / variable 5/minute, 20/hour，并要求 paid plan
admin           跳过 cost guard
```

paid plan 白名单：

```text
pro, plus, premium, team, enterprise
```

错误响应：

```text
plan_required → 403
rate_limited  → 429
```

Capability metadata 已增加：

```ts
requiredPlan?: string
rateLimit?: {
  perMinute?: number
  perHour?: number
}
```

导出 artifacts 已包含：

```text
requiredPlan
rateLimit
```

`skills:generate` 已输出：

```text
Required plan
Rate limit
```

已验证：

```bash
npm run typecheck
npm run capabilities:export
npm run skills:generate
npm run build:nextide-cli
nextide capability run xhs.card.layout --api-base-url https://atomx.top --mode wait
```

线上已登录低成本 capability 仍返回 `succeeded`。

注意：当前 cost guard 本地代码已完成；线上需部署后生效。

## 已完成：Quota / Wallet Preflight Skeleton

新增额度预检骨架：

```text
lib/agent-capabilities/quota-preflight.ts
```

已接入：

```text
POST /api/agent/capabilities/[id]/run
```

执行顺序现在是：

```text
requireAgentApiKey
  ↓
assertAgentCapabilityCostAllowed
  ↓
assertAgentCapabilityQuotaAvailable
  ↓
parse body
  ↓
runAgentCapability
```

当前只做 preflight，不真实扣费。

额度来源：

```text
public.wallets.balance_credits
```

预估 credits：

```text
xhs.card.layout                    1
product.selling_point.analysis     2
medium social/xhs/breakdown        5-10
digital-human.video.generate       30
motion.replication.image_to_video  30
viral.midform.video.generate       25
```

余额不足返回：

```text
402 insufficient_credits
```

响应 details：

```json
{
  "capabilityId": "viral.midform.video.generate",
  "estimatedCredits": 25,
  "balanceCredits": 0
}
```

Capability metadata 新增：

```ts
estimatedCredits?: number
```

`capabilities:export` 和 `skills:generate` 已输出 `estimatedCredits` / `Estimated credits`。

已验证：

```bash
npm run typecheck
npm run capabilities:export
npm run skills:generate
npm run build:nextide-cli
nextide capability run xhs.card.layout --api-base-url https://atomx.top --mode wait
```

导出确认：

```text
xhs.card.layout = 1 credits
viral.midform.video.generate = 25 credits
digital-human.video.generate = 30 credits
```

线上已登录低成本 capability 仍返回 `succeeded`。

注意：当前 quota preflight 本地代码已完成；线上需部署后生效。

## 已完成：CreditConfig-driven Quota + Credit Hold Skeleton

根据产品要求，Agent capability 积分不再以代码硬编码为准，而是优先读取后台管理系统配置表：

```text
public.credit_configs
```

使用字段：

```text
feature_key
amount
enabled
```

feature key 规则：

```text
capability.featureKey || agent.<capability-id>
```

如果后台配置存在且 enabled=true：

```text
estimatedCredits = credit_configs.amount
source = credit_configs
```

如果不存在配置：

```text
使用 fallback 默认值，仅作为兜底，方便未配置时 fail-safe 运行
source = fallback
```

新增积分占用表：

```text
public.agent_capability_credit_holds
```

migration：

```text
prisma/migrations/20260506100000_add_agent_capability_credit_holds/migration.sql
```

Prisma model：

```text
AgentCapabilityCreditHold
```

字段：

```text
id
run_id
user_id
capability_id
feature_key
estimated_credits
status: held
reason
metadata_json
created_at
updated_at
finished_at
```

执行流程：

```text
quota preflight 读取 credit_configs.amount
  ↓
检查 wallets.balance_credits 是否足够
  ↓
create AgentCapabilityRun
  ↓
create AgentCapabilityCreditHold(status=held)
  ↓
后续阶段再 capture / release / failed
```

当前仍不真实扣费，只记录 hold。

已验证：

```bash
npx prisma generate
npm run typecheck
npm run capabilities:export
npm run skills:generate
npm run build:nextide-cli
```

## 已完成：Credit Hold Capture / Release Integration

已为 Agent capability credit hold 接入终态结算：

```text
lib/agent-capabilities/quota-preflight.ts
lib/agent-runs/store.ts
```

新增函数：

```ts
settleAgentCapabilityCreditHoldForRun()
```

结算规则：

```text
run.status = succeeded
  → capture hold
  → wallets.balance_credits decrement
  → transactions insert type=agent_capability_capture
  → credit_usage_logs insert
  → hold.status = captured

run.status = failed / cancelled / timeout
  → release hold
  → 不扣费
  → hold.status = released
```

capture 使用事务：

```text
prisma.$transaction
```

并且扣费时二次检查：

```text
wallet.balance_credits >= estimated_credits
```

如果完成时余额不足：

```text
hold.status = capture_failed
reason = insufficient_credits_at_capture
```

不会把钱包扣成负数。

接入点：

```text
updateAgentCapabilityRunFromResult()
markAgentCapabilityRunFailed()
```

因此 callback / business-status / runner 所有通过 run store 更新终态的路径都会触发结算。

已验证：

```bash
npx prisma generate
npm run typecheck
npm run build:nextide-cli
npm run capabilities:export
```

注意：该功能需要先部署 migration：

```text
20260506100000_add_agent_capability_credit_holds
```

然后线上终态 run 才会自动 capture/release。

## 已调整：Agent 功能积分并入统一 CreditConfig 管理

根据产品确认：Agent 功能积分不应该另起一套，而是和现有功能积分统一管理。

已调整为复用现有统一函数：

```text
lib/creditCosts.ts#getCreditCostForModel
```

也就是说 Agent capability 现在和其他 Web/小程序功能一样，通过：

```text
public.credit_configs
```

统一配置、统一缓存、统一后台管理。

Agent 不再要求使用独立 `agent.<capability-id>` 配置。规则是：

```text
capability.featureKey = 现有业务功能 feature_key
```

当前映射：

```text
xhs.note.collect                    → smart_creation
xhs.card.layout                     → smart_creation
xhs.infographic.style.extract       → xhs_vision_style_web
xhs.infographic.generate            → smart_creation
digital-human.video.generate        → digital_human
motion.replication.image_to_video   → action_transfer
viral.midform.video.generate        → storyboard_video
viral.breakdown.video_prompts       → image_text_replication
social.tiktok.collect               → social_tiktok_collect
social.instagram.collect            → monetization_channels_video_share
social.facebook.collect             → monetization_channels_video_share
social.comments.collect             → monetization_channels_video_share
product.selling_point.analysis      → product_analysis
content.wechat.longform.write       → script_generation
```

quota preflight 现在读取：

```ts
getCreditCostForModel(featureKey, workflowId || workflowName, fallback)
```

这与其他功能保持一致：

```text
优先 featureKey:modelKey
再 featureKey
最后 fallback
```

因此后台只需要在现有“积分配置”页面管理这些 feature key，不需要单独做 Agent 积分页面。

同时修复了一个现有 typecheck 问题：

```text
app/api/webhook/digital-human/route.ts
```

`workflowMeta` 可空时改为 optional chaining。

已验证：

```bash
npm run typecheck
npm run capabilities:export
npm run skills:generate
npm run build:nextide-cli
```

## 已完成：Agent Capability FeatureKey Audit / Admin Visibility

为确保 Agent 功能积分和其他功能积分统一管理，新增 credit config audit：

```text
lib/agent-capabilities/credit-audit.ts
```

审计内容：

```text
1. 每个 Agent capability 是否有 featureKey
2. featureKey 是否存在于 public.credit_configs
3. credit_config 是否 enabled
4. 输出后台配置 amount/category/modelKey
```

Capabilities API 支持：

```bash
GET /api/agent/capabilities?includeCreditAudit=1
```

返回新增：

```json
{
  "creditAudit": {
    "ok": true,
    "total": 14,
    "okCount": 14,
    "missingFeatureKey": [],
    "missingCreditConfig": [],
    "disabledCreditConfig": [],
    "items": []
  }
}
```

CLI doctor 新增检查：

```text
capability_credit_config_audit
```

如果线上还没部署新 API，CLI 会 fallback 到本地兼容检查：

```text
只检查 capability.featureKey 是否存在
```

已验证：

```bash
npm run typecheck
npm run build:nextide-cli
nextide doctor --api-base-url https://atomx.top
```

线上旧版本兼容结果：

```text
ok: true
capability_credit_config_audit: true
```

部署后 doctor 会显示完整 credit_configs 缺失/禁用列表。

## 已完成：Admin Credits UI Agent Visibility

已让现有后台积分配置页面直接显示哪些配置被 Agent capability 复用。

API 修改：

```text
app/api/admin/credits/route.ts
```

每条 credit config 现在返回：

```ts
usedByAgent: boolean
agentCapabilities: Array<{
  id: string
  title: string
  skillName: string
}>
```

数据来源：

```text
listAgentCapabilities()
  ↓
按 capability.featureKey 聚合
  ↓
挂到对应 credit_configs 行
```

UI 修改：

```text
app/(admin)/admin/credits/page.tsx
```

后台页面现在在功能名旁显示：

```text
Agent ×N
```

并在下一行显示 capability IDs：

```text
Agent: digital-human.video.generate, viral.midform.video.generate
```

CSV 导出也新增：

```text
agentCapabilities
```

这样管理员在 `/admin/credits` 里可以直接看到：

```text
digital_human
  - Web/小程序数字人使用
  - Agent digital-human.video.generate 也使用

storyboard_video
  - 分镜视频使用
  - Agent viral.midform.video.generate 也使用
```

已验证：

```bash
npm run typecheck
npm run build:nextide-cli
npm run capabilities:export
```

## 已完成：Agent CreditConfig Missing Prompt / Admin Fix Actions

后台积分页新增 Agent 功能积分检查与一键修复。

新增 API：

```text
POST /api/admin/credits/agent-audit/fix
```

支持 action：

```text
fix_all
create_missing
enable_disabled
```

行为：

```text
create_missing
  → 根据 listAgentCapabilities() 和 featureKey 创建缺失 credit_configs
  → 不覆盖已有配置
  → amount 使用 fallbackEstimatedCredits / estimatedCredits

enable_disabled
  → 将 disabled credit_configs enabled=true

fix_all
  → 两者都执行
```

后台 UI 修改：

```text
app/(admin)/admin/credits/page.tsx
```

新增模块：

```text
Agent 功能积分检查
```

显示：

```text
缺少 featureKey
缺少积分配置
已禁用配置
```

提供：

```text
一键修复
```

如果存在 missingFeatureKey，会禁用一键修复，因为这需要开发侧先补 registry featureKey 映射。

Admin credits API 现在返回：

```text
agentCreditAudit
```

页面加载时即可显示 Agent 积分配置健康状态。

已验证：

```bash
npm run typecheck
npm run build:nextide-cli
npm run capabilities:export
```

## 已完成：Online Agent Runtime Smoke Script

新增线上部署前/后 smoke 脚本：

```text
scripts/smoke-nextide-agent-security.ts
```

根命令：

```bash
npm run smoke:agent-runtime
```

支持环境变量：

```bash
NEXTIDE_API_BASE_URL=https://atomx.top
NEXTIDE_USER_API_KEY=<NexTide API Key>
```

也支持参数：

```bash
npm run smoke:agent-runtime -- --api-base-url=https://atomx.top --user-api-key=<key>
```

当前自动检查：

```text
capability_list
credit_config_audit
anonymous_run_401
invalid_key_run_401
authorized_low_cost_run（有 key 时）
run_status_owner_read（有 run 时）
run_result_owner_read（有 run 时）
```

输出目录：

```text
.nextide/output/smoke-agent-runtime/report.json
.nextide/output/smoke-agent-runtime/authorized-low-cost-run.json
.nextide/output/smoke-agent-runtime/run-status.json
.nextide/output/smoke-agent-runtime/run-result.json
```

兼容逻辑：

```text
线上旧版本尚未部署 unified auth guard 时，匿名/无效 key 可能返回 HTTP 400 + run.error.code=unauthorized。
脚本会将其视为 pre-deploy acceptable，并标记 acceptedPreDeploy400=true。
部署新版本后期望返回 HTTP 401。
```

已验证：

```bash
npm run typecheck
npm run smoke:agent-runtime -- --api-base-url=https://atomx.top
```

结果：

```text
ok: true
capability_list: true
credit_config_audit: true
anonymous_run_401: true
invalid_key_run_401: true
authorized_low_cost_run: skipped because NEXTIDE_USER_API_KEY not set
```

## 已完成：Authorized Smoke with Existing CLI Config

smoke 脚本已支持自动读取本机 CLI 配置：

```text
~/.nextide/config.json
```

读取字段：

```ts
apiBaseUrl
userApiKey
```

优先级：

```text
NEXTIDE_API_BASE_URL / NEXTIDE_USER_API_KEY
  ↓
--api-base-url / --user-api-key
  ↓
~/.nextide/config.json
  ↓
默认 https://atomx.top
```

因此已经执行过：

```bash
nextide auth login --api-base-url https://atomx.top
```

后，可以直接运行完整授权 smoke：

```bash
npm run smoke:agent-runtime -- --api-base-url=https://atomx.top
```

已验证：

```bash
npm run typecheck
npm run smoke:agent-runtime -- --api-base-url=https://atomx.top
npm run build:nextide-cli
```

结果：

```text
ok: true
hasUserApiKey: true
userApiKeySource: /Users/kaka/.nextide/config.json
capability_list: true
credit_config_audit: true
anonymous_run_401: true
invalid_key_run_401: true
authorized_low_cost_run: true
run_status_owner_read: true
run_result_owner_read: true
```

本次授权 smoke 创建 run：

```text
run_e74c3862-1c53-4587-81f1-7216d81c4885
```

result artifactCount：

```text
2
```

## 已完成：Credit Hold Admin Viewer / Agent Runs Admin Page

新增后台 Agent run / 扣费记录查看能力。

新增 API：

```text
GET /api/admin/agent-runs
```

支持参数：

```text
page
limit
q
status
holdStatus
capabilityId
```

返回：

```text
run
hold
profile
pagination
holdStats
```

新增页面：

```text
/admin/agent-runs
app/(admin)/admin/agent-runs/page.tsx
```

页面能力：

```text
- 查看 Agent runId / capabilityId
- 查看用户、plan、admin 标记
- 查看 run.status / mode
- 查看 credit hold.status / estimatedCredits / featureKey / reason
- 查看 businessType / businessId / businessStatus
- 查看 createdAt / finishedAt
- 按 run 状态筛选
- 按 hold 状态筛选
- 搜索 runId / capabilityId / businessId / businessTaskId
- 分页
- holdStats 汇总卡片
```

用途：

```text
排查为什么扣费
排查为什么没扣费
查看 held/captured/released/capture_failed
发现卡住的 waiting_callback / held
```

已验证：

```bash
npm run typecheck
npm run build:nextide-cli
npm run capabilities:export
```

## 已完成：Run Cancel Endpoint / CLI Command

新增 Run Cancel API：

```text
POST /api/agent/runs/[id]/cancel
```

规则：

```text
- 必须 NexTide API Key
- owner/admin check
- 只有 queued / running / waiting_callback 可取消
- 非可取消状态返回 409 run_not_cancellable
- 取消成功后 run.status = cancelled
- 触发 updateAgentCapabilityRunFromResult()
- credit hold 自动 released
```

新增 CLI：

```bash
nextide run cancel <run-id> --output cancel.json
```

已更新 CLI help。

已验证：

```bash
npm run typecheck
npm run build:nextide-cli
```

线上兼容 smoke：

```bash
nextide run cancel run_e74c3862-1c53-4587-81f1-7216d81c4885 --api-base-url https://atomx.top
```

当前线上尚未部署 cancel API，返回 404，符合预期。部署后应返回：

```text
409 run_not_cancellable
```

因为该 run 已经 succeeded。

## 已完成：Stale Waiting Callback Cleanup

新增 stale Agent run 清理脚本：

```text
scripts/cleanup-stale-agent-runs.ts
```

根命令：

```bash
npm run cleanup:agent-runs -- --older-than-minutes=120 --dry-run
npm run cleanup:agent-runs -- --older-than-minutes=120
```

清理对象：

```text
agent_capability_runs.status in queued / running / waiting_callback
createdAt < now - olderThanMinutes
```

执行行为：

```text
--dry-run
  → 只输出 would_timeout，不修改 DB

非 dry-run
  → updateAgentCapabilityRunFromResult(status=timeout)
  → businessStatus=timeout
  → credit hold 自动 released
```

输出报告：

```text
.nextide/output/cleanup-agent-runs/report-*.json
```

本地无 DB 环境变量时不会失败，会输出 skipped 报告：

```text
reason: DATABASE_URL or DIRECT_URL is not set
```

已验证：

```bash
npm run typecheck
npm run cleanup:agent-runs -- --older-than-minutes=999999 --dry-run
npm run build:nextide-cli
```

本地结果：

```text
ok: true
skipped: true
reason: DATABASE_URL or DIRECT_URL is not set
```

线上/带 DB 环境时可用于释放长期 held 的 credit hold，避免 waiting_callback 永久卡住。

## 已完成：Run Cancel / Cleanup Smoke Coverage

smoke 脚本已覆盖 run cancel：

```text
scripts/smoke-nextide-agent-security.ts
```

新增检查：

```text
cancel_completed_run_409
cancel_missing_run_404
```

行为：

```text
cancel_completed_run_409
  → 对刚成功的 low-cost run 调用 /cancel
  → 部署后预期 409 run_not_cancellable
  → 当前线上未部署 cancel API 时接受 404，并标记 skipped

cancel_missing_run_404
  → 对 run_missing_smoke 调用 /cancel
  → 预期 404 run_not_found
  → 当前线上未部署 cancel API 时会返回 Next.js HTML 404，视为通过
```

部署安全清单也已加入：

```text
Run cancel / cleanup checks
```

包括：

```text
- cancel completed run → 409 run_not_cancellable
- cancel missing run → 404 run_not_found
- cleanup dry-run
- cleanup execute after reviewing dry-run
```

已验证：

```bash
npm run typecheck
npm run smoke:agent-runtime -- --api-base-url=https://atomx.top
npm run build:nextide-cli
```

结果：

```text
ok: true
cancel_completed_run_409: true/skipped because server_does_not_expose_run_cancel_yet
cancel_missing_run_404: true
```

## 已完成：用户积分使用列表增加使用端口字段

根据产品要求，Agent 扣费不单独做用户侧历史页，而是整合到用户现有积分使用列表里，并增加“端口/来源”字段。

已修改 API：

```text
app/api/nexapi/wallet/route.ts
app/api/nexapi/console/summary/route.ts
app/api/nexapi/usage/route.ts
```

交易记录现在返回：

```ts
port: 'agent' | 'web' | 'api' | 'miniapp'
source: 'Agent' | 'Web' | 'API' | '小程序'
capabilityId?: string | null
refId?: string | null
```

Agent 扣费识别规则：

```text
transactions.type = agent_capability_capture
  → port = agent
  → source = Agent
  → refId = runId
  → capabilityId 从 agent_capability_runs 关联读取
```

NexAPI usage 记录识别规则：

```text
route/modelId 包含 agent 或 /api/agent → Agent
route 包含 miniapp/wechat → 小程序
route 包含 nexapi → API
其他 → Web
```

已修改用户控制台：

```text
app/(site)/nexapi/console/page.tsx
```

Recent Usage 中现在显示来源 badge：

```text
Agent / Web / API / 小程序
```

这样用户在积分使用列表里可以直接看到每一笔是在什么端口使用的。

已验证：

```bash
npm run typecheck
npm run build:nextide-cli
```

## 已完成：积分使用列表统一使用 transactions 单表

根据产品要求：用户积分使用列表不再同时依赖 usage_logs / credit_usage_logs / agent holds，而统一以：

```text
public.transactions
```

作为用户侧积分流水唯一展示表。

已调整：

```text
app/api/nexapi/usage/route.ts
```

现在 `/api/nexapi/usage` 直接读取 `prisma.transaction.findMany()`，并返回兼容前端的 item shape：

```ts
modelId
route
port
source
chargedCredits
amountCredits
capabilityId
refId
promptTokens
completionTokens
priceCny
responseMs
createdAt
```

已调整 NexAPI 代理扣费：

```text
lib/nexapi/proxyHandler.ts
```

NexAPI 使用扣费不再新增 `usage_logs` 作为用户积分列表数据源，而是只通过 `adjustWalletCreditsInTransaction()` 写入 `transactions`：

```ts
channel: 'api'
meta: {
  port: 'api',
  source: 'API',
  model,
  route,
  apiKeyId,
  promptTokens,
  completionTokens,
  priceCny,
  chargedCredits,
  responseMs
}
```

已调整 Agent 扣费交易：

```text
lib/agent-capabilities/quota-preflight.ts
```

Agent capture 写入：

```ts
channel: 'agent'
meta: {
  port: 'agent',
  source: 'Agent',
  capabilityId,
  featureKey,
  holdId
}
```

保留说明：

```text
usage_logs 可以作为历史/技术日志保留，但用户侧积分使用列表不再依赖它。
credit_usage_logs 继续可作为后台 feature 统计/审计日志，不作为用户侧流水表。
agent_capability_credit_holds 继续作为 hold/capture/release 审计表，不作为用户侧流水表。
```

已验证：

```bash
npm run typecheck
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
