# NexTide Skills Runtime 新开发计划与当前进度

> 日期：2026-05-06  
> 项目：`/Users/kaka/Desktop/软件开发/content-factory-web 3.2`  
> 品牌：NexTide  
> 在线地址：`https://atomx.top`  
> 参考文档：
> - `docs/20260506-nextide-skills-runtime-plan.md`
> - `docs/20260507-nextide-skills-runtime-phase2-plan.md`
> - `docs/20260506-nextide-agent-runtime-deploy-checklist.md`
> - `/Users/kaka/Downloads/ClipcatSkill - 让 OpenClaw 创作Tiktok爆款短视频.docx`

---

## 0. 总体结论

NexTide Skills Runtime 第一阶段已经从“计划”进入“生产化收口”阶段。首批 14 个 capability、正式 CLI、Device Login、Run Store、长任务 callback、credit hold/capture/release、admin visibility、release bundle、smoke script 都已经完成本地实现。

接下来开发重点不再是继续堆单点 capability，而是：

```text
1. 先把线上更新到本地最新 runtime 状态
2. 完成用户侧积分流水单表 + 来源端口展示的产品化
3. 从用户积分记录进入 Agent run 结果
4. 标准化首批 capability 的 result/artifacts
5. 吸收 ClipcatSkill 的 TikTok Commerce 场景，扩展第二批 NexTide Skills
6. 补齐 PostPlus-style skills 包结构与安装体验
```

---

## 1. 当前进度总览

### 1.1 已完成：核心 Runtime

| 模块 | 状态 | 说明 |
|---|---:|---|
| Capability Registry | ✅ 已完成 | 14 个首批能力，registry v2 已拆分 xhs/video/social/product/writing |
| Agent API | ✅ 已完成 | capabilities / run / status / result / cancel |
| Agent Run Store | ✅ 已完成 | `public.agent_capability_runs`，支持 business mapping |
| Long-running callback | ✅ 已完成 | image-text / style / t2v / social scraper webhook 已同步 run store |
| Formal CLI | ✅ 已完成 | `@nextide/cli@0.2.0`，支持 login/run/wait/result/artifacts/cancel/doctor |
| Device Login | ✅ 已完成 | 使用 `profiles.api_key`，名称为 NexTide API Key |
| Skills generation | ✅ 已完成 | `.claude/skills/*/SKILL.md` 自动生成区块 |
| Capability export | ✅ 已完成 | `artifacts/capabilities/capabilities.json` + schema |
| Release bundle | ✅ 已完成 | `artifacts/release/nextide-agent-runtime-0.2.0.zip` |
| Unified auth guard | ✅ 本地完成 | run/status/result 需要 NexTide API Key，owner/admin check |
| Cost/rate/plan guard | ✅ 已完成 | medium/high/variable capability guard |
| Credit config audit | ✅ 已完成 | 复用 `public.credit_configs`，admin 可一键修复 |
| Credit hold/capture/release | ✅ 已完成 | `public.agent_capability_credit_holds`，成功 capture，失败/取消/超时 release |
| Admin Agent Runs | ✅ 已完成 | `/admin/agent-runs` 查看 run + hold + business status |
| Smoke script | ✅ 已完成 | `npm run smoke:agent-runtime` |
| Stale cleanup script | ✅ 已完成 | `npm run cleanup:agent-runs` |
| 用户积分使用列表端口来源 | ✅ 已完成 | Agent/Web/API/小程序 source badge |
| 用户积分流水单表 | ✅ 已完成 | 用户侧 `/api/nexapi/usage` 统一读 `public.transactions` |

---

### 1.2 首批 capability 当前状态

| Capability ID | 状态 | 当前说明 |
|---|---:|---|
| `xhs.note.collect` | ✅ 已接入 | URL-only MVP，调用 hot-square collect |
| `xhs.card.layout` | ✅ 已接入 | 直接调用 `renderXhsCardLayout()` |
| `xhs.infographic.style.extract` | ✅ 已接入 | 文件/URL multipart 上传，waiting_callback |
| `xhs.infographic.generate` | ✅ 已接入 | 调用 xhs-text2img plan，waiting_callback |
| `digital-human.video.generate` | ✅ 已接入 | 调用 digital-human videos，waiting_callback |
| `motion.replication.image_to_video` | ✅ 已接入 | 调用 action-transfer videos，waiting_callback |
| `viral.midform.video.generate` | ✅ 已接入 | 支持 standalone 创建 CreativeTask + t2v |
| `viral.breakdown.video_prompts` | ✅ 已接入 | 视频 extract / image-text replication 双路径 |
| `social.tiktok.collect` | ✅ 已接入 | social-scraper start |
| `social.instagram.collect` | ✅ 已接入 | social-scraper start |
| `social.facebook.collect` | ✅ 已接入 | social-scraper start |
| `social.comments.collect` | ✅ 已接入 | n8n webhook env |
| `product.selling_point.analysis` | ✅ 已接入 | 产品卖点分析 |
| `content.wechat.longform.write` | ✅ 已接入 | 原 khazix-writer 已改为公众号长文 |

---

### 1.3 当前线上差异 / 待部署项

本地已完成，但线上 `https://atomx.top` 可能还未完全更新：

```text
- /api/agent/runs/[id]/cancel 线上可能仍 404
- anonymous/invalid run 线上可能仍是 HTTP 400 + run.error.code=unauthorized，而不是 HTTP 401
- creditAudit 线上可能仍未完整暴露
- public.agent_capability_credit_holds migration 需要确认已部署
- 用户积分流水单表 `/api/nexapi/usage` 需要部署后线上验证
```

---

## 2. 线上更新计划

### 2.1 上线前本地验证

```bash
cd "/Users/kaka/Desktop/软件开发/content-factory-web 3.2"

npm run typecheck
npx prisma generate
npm run build:nextide-cli
npm run capabilities:export
npm run skills:generate
npm run skills:package
npm run release:agent-runtime
```

如部署流程要求完整 Next build，再执行：

```bash
npm run build
```

---

### 2.2 部署数据库 migration

```bash
npx prisma migrate deploy
```

必须确认线上表存在：

```sql
select to_regclass('public.agent_capability_runs');
select to_regclass('public.agent_cli_device_logins');
select to_regclass('public.agent_capability_credit_holds');
```

---

### 2.3 部署最新 app code

部署完成后，重点检查这些 API：

```text
GET  /api/agent/capabilities?includeCreditAudit=1
POST /api/agent/capabilities/[id]/run
GET  /api/agent/runs/[id]
GET  /api/agent/runs/[id]/result
POST /api/agent/runs/[id]/cancel
GET  /api/nexapi/usage
```

---

### 2.4 部署后 smoke

```bash
node packages/nextide-cli/dist/index.js doctor --api-base-url https://atomx.top
npm run smoke:agent-runtime -- --api-base-url=https://atomx.top
```

部署后目标状态：

```text
anonymous_run_401             → HTTP 401
invalid_key_run_401           → HTTP 401
authorized_low_cost_run       → succeeded
run_status_owner_read         → 200
run_result_owner_read         → 200
cancel_completed_run_409      → HTTP 409 run_not_cancellable
cancel_missing_run_404        → HTTP 404 run_not_found
credit_config_audit           → creditAudit.ok = true
```

---

### 2.5 部署后收紧 smoke

线上确认已更新后，修改 `scripts/smoke-nextide-agent-security.ts`：

```text
移除 acceptedPreDeploy400 兼容
移除 server_does_not_expose_run_cancel_yet skipped 兼容
creditAudit 必须完整返回并 ok=true
```

---

## 3. 用户积分流水单表计划

### 3.1 当前产品决策

用户侧积分使用列表统一只用一张表：

```text
public.transactions
```

其他表职责：

| 表 | 用户侧积分列表是否读取 | 职责 |
|---|---:|---|
| `transactions` | ✅ 是 | 唯一用户侧积分流水事实源 |
| `usage_logs` | ❌ 否 | 可保留为历史/技术日志 |
| `credit_usage_logs` | ❌ 否 | 后台 feature 统计/审计 |
| `agent_capability_credit_holds` | ❌ 否 | Agent hold/capture/release 审计 |

---

### 3.2 已完成

已修改：

```text
app/api/nexapi/usage/route.ts
app/api/nexapi/wallet/route.ts
app/api/nexapi/console/summary/route.ts
app/(site)/nexapi/console/page.tsx
lib/nexapi/proxyHandler.ts
lib/agent-capabilities/quota-preflight.ts
```

当前 `/api/nexapi/usage` 返回：

```ts
{
  ok: true,
  sourceTable: 'transactions',
  items: [
    {
      id,
      type,
      modelId,
      route,
      port,
      source,
      capabilityId,
      refId,
      promptTokens,
      completionTokens,
      chargedCredits,
      amountCredits,
      priceCny,
      responseMs,
      createdAt
    }
  ]
}
```

---

### 3.3 待补齐

1. 给 `/api/nexapi/usage` 增加筛选：

```text
?port=agent
?port=api
?port=web
?port=miniapp
?type=deduct
```

2. Recent Usage 增加来源筛选：

```text
全部 / Web / 小程序 / API / Agent
```

3. 全局扫描扣费入口，统一写：

```ts
channel: 'web' | 'miniapp' | 'api' | 'agent' | 'admin'
meta: {
  port,
  source,
  featureKey?,
  capabilityId?,
  businessType?,
  businessId?,
  model?,
  route?
}
```

4. smoke 增加 `/api/nexapi/usage` 检查：

```text
sourceTable === transactions
items[].source exists when items non-empty
```

---

## 4. 用户从积分记录查看 Agent 结果

### 4.1 目标

不单独做 Agent 扣费列表，而是在统一积分流水中让用户从 Agent 扣费记录进入对应 run 结果。

### 4.2 判断规则

```text
transactions.type = agent_capability_capture
transactions.refId = runId
transactions.meta.capabilityId exists
```

### 4.3 待开发

1. 新增用户侧 API：

```text
GET /api/nexapi/agent-runs/[id]
```

规则：

```text
只能本人查看
admin 可读全部
历史 userId=null run 可按兼容策略处理
```

2. Recent Usage 中 Agent 流水增加：

```text
查看结果
```

3. 展示 run detail：

```text
runId
capability title
status
createdAt / finishedAt
charged credits
result summary
artifacts manifest
```

4. 支持 artifact 类型：

```text
json
text
image
video
url
datatable
```

### 4.4 验收标准

```text
用户能从一笔 Agent 扣费进入对应 run 结果
积分流水仍然只读 transactions
run 详情有 owner/admin 权限保护
```

---

## 5. 首批 capability result/artifacts 标准化

### 5.1 目标

所有 P0 capability 的 `run result` 和 `run artifacts` 都统一成 Agent / CLI / 前端可直接消费的结构。

### 5.2 标准 artifact 类型

```ts
{ type: 'json', name, data }
{ type: 'text', name, content }
{ type: 'image', name, url }
{ type: 'video', name, url }
{ type: 'datatable', name, rows, columns }
```

### 5.3 优先 capability

```text
digital-human.video.generate
motion.replication.image_to_video
viral.midform.video.generate
xhs.infographic.generate
xhs.infographic.style.extract
social.tiktok.collect
social.instagram.collect
social.facebook.collect
social.comments.collect
viral.breakdown.video_prompts
```

### 5.4 标准字段建议

社媒采集 datatable：

```text
platform
keyword/account/url
post_url
author
likes
comments
shares
caption
collected_at
```

视频类 artifact：

```text
video_url
cover_url
provider_task_id
duration
status
```

拆解/提示词类：

```text
script
hook
shots
style
environment
tone_and_pacing
camera
lighting
character
background_sound
transition_editing
```

### 5.5 验收标准

```text
每个 P0 capability 至少产出一个 normalized artifact
nextide run artifacts 能导出有意义 manifest
用户侧 Agent run 结果页无需理解内部业务表即可展示
```

---

## 6. ClipcatSkill 可直接吸收内容

已学习文档：

```text
/Users/kaka/Downloads/ClipcatSkill - 让 OpenClaw 创作Tiktok爆款短视频.docx
```

该文档的核心价值不是代码，而是 TikTok Commerce Skill 的产品场景、workflow、prompt contract、异步任务模式、算力说明和用户教育结构。

### 6.1 可直接复用到 NexTide 的内容

| Clipcat 内容 | NexTide 用法 | 是否直接可用 |
|---|---|---:|
| 版本说明结构 | 用于 release notes / changelog | ✅ |
| CLI 安装 + API Key 配置流程 | 改为 `nextide auth login` / `nextide doctor` | ✅ |
| 能力清单包装 | 改写为 NexTide Skills 能力页 | ✅ |
| 场景化 prompt | 放入 NexTide skill examples/templates | ✅ |
| 搜索 → 分析 → 复刻 workflow | 作为 TikTok Commerce pipeline | ✅ |
| 异步提交 + 1 小时后检查 | 直接映射 runId/status/result/artifacts | ✅ |
| 算力表 | 映射 `credit_configs` / estimatedCredits | ✅ |
| 失败退回算力说明 | 映射 hold release | ✅ |

---

### 6.2 Clipcat 场景与 NexTide 当前能力映射

| Clipcat 场景 | NexTide 当前可复用 capability | 当前可做程度 |
|---|---|---:|
| TikTok 爆款视频搜索 | `social.tiktok.collect` | ✅ 可做 |
| 爆款视频批量搜索 + 深度拆解报告 | `social.tiktok.collect` + `viral.breakdown.video_prompts` | ✅ 可做 |
| 视频分析，提取脚本和画面 | `viral.breakdown.video_prompts` | ✅ 可做 |
| 反推视频提示词 | `viral.breakdown.video_prompts` | ✅ 可做 |
| 爆款复刻生成新视频 | `viral.breakdown.video_prompts` + `viral.midform.video.generate` | 🟡 可做 MVP |
| 商品图生视频 | `viral.midform.video.generate` / video capabilities | 🟡 可做 MVP |
| 热门视频自动追踪 + 批量复刻 | collect + breakdown + generate + run store | 🟡 先做一次性，定时后置 |
| 同品多风格视频矩阵 | `product.selling_point.analysis` + `viral.midform.video.generate` | 🟡 需成本确认 |
| 多市场本地化视频 | `viral.midform.video.generate` batch wrapper | 🟡 需成本确认 |
| 批量竞品评论 + 用户画像 | `social.comments.collect` + analysis | 🟡 可做 MVP |
| TK 博主蒸馏器 | account collect + TOP N breakdown + report | 🟡 最值得做 |
| 竞对账号矩阵周报 | account collect + report + schedule | 🔵 未来集成 |
| 自有账号复盘 | account collect + report | 🔵 未来集成，需要账号授权 |
| TikTok Shop 商品搜索 | 新 capability | 🔵 未来集成 |
| TikTok Shop 商品详情 | 新 capability | 🔵 未来集成 |
| TikTok Shop 商品评论 | 扩展 comments capability | 🔵 未来集成 |
| 视频无水印下载 | 新 capability，但合规风险 | ⚠️ 后置 |
| 直接发布到 TikTok | publisher auth + audit | ⚠️ 后置 |

---

## 7. Clipcat 启发下的第二批 NexTide Skills

### 7.1 第二批优先做：TikTok Commerce Surface

这些能力最能复用当前 NexTide 已有能力，风险相对低，产物以报告/脚本/视频任务为主。

#### 1. `tiktok-viral-breakdown-report`

用途：

```text
搜索 TikTok 爆款视频 → 选 TOP N → 批量拆解 → 输出爆款拆解报告
```

调用链：

```text
social.tiktok.collect
→ viral.breakdown.video_prompts
→ report artifact
```

输出：

```text
TOP 视频列表
每条脚本全文
画面结构
开头钩子
转化话术
节奏分析
共性规律
创作建议
```

优先级：P1。

---

#### 2. `tiktok-creator-distiller`

用途：

```text
输入 TikTok 账号，蒸馏该账号爆款打法，生成可复用内容操作系统
```

调用链：

```text
social.tiktok.collect(account mode)
→ select TOP N
→ viral.breakdown.video_prompts × N
→ creator formula report
```

输出：

```text
账号定位
核心数据概览
爆款率
TOP 视频共性
开头钩子公式
脚本结构模型
视觉风格
BGM/声音策略
发布策略
TOP 视频逐条拆解
选题方向 TOP10
创作 SOP
基于该账号风格的脚本生成模板
```

优先级：P1，建议作为 NexTide 第二批标杆 skill。

---

#### 3. `tiktok-viral-to-video-pipeline`

用途：

```text
搜索爆款 → 拆解 → 基于我的产品生成新带货视频
```

调用链：

```text
social.tiktok.collect
→ viral.breakdown.video_prompts
→ product.selling_point.analysis
→ viral.midform.video.generate
→ run artifacts
```

工作模式：

```text
默认 submit-only，不等待视频完成
保存 runId
稍后 nextide run wait/result/artifacts
```

优先级：P1/P2。

---

#### 4. `tiktok-product-review-insights`

用途：

```text
批量采集竞品/商品评论，输出用户画像、共性好评、共性差评、卖点建议
```

调用链：

```text
social.comments.collect
→ product/review insight report
```

输出：

```text
用户最关注 TOP5 购买因素
共性好评关键词
共性差评痛点
不同价位评论差异
选品定位建议
营销卖点建议
```

优先级：P1/P2。

---

#### 5. `product-creative-matrix-generator`

用途：

```text
同一个产品生成多种风格视频素材矩阵
```

调用链：

```text
product.selling_point.analysis
→ viral.midform.video.generate × N
```

典型风格：

```text
口播种草
开箱测评
OOTD/使用展示
使用前后对比
多市场本地化
```

前置要求：

```text
--yes
--max-credits
高成本任务确认
batch run cancellation
```

优先级：P2。

---

### 7.2 未来集成：TikTok Shop / 电商图 / 发布

这些能力价值高，但需要新增数据源、合规、账号授权或高成本 UX，建议后置。

```text
social.tiktok.shop.product.search
social.tiktok.shop.product.detail
social.tiktok.shop.comments.collect
product.image.generate
product.image.translate
product.image.competitor_benchmark
social.tiktok.competitor.weekly_report
social.tiktok.account.audit
social.video.download
social-media-publisher
```

其中：

```text
social.video.download
social-media-publisher
```

需要特别注意版权、平台条款、账号授权、审计日志和人工确认，不进入近期 P1。

---

## 8. PostPlus-style skills 包结构补齐

### 8.1 背景

原计划要求每个 skill 具备：

```text
SKILL.md
references/workflow.md
references/capability-contract.md
references/input-schema.md
references/output-schema.md
references/failure-modes.md
scripts/build_input.mjs
scripts/run_capability.mjs
scripts/normalize_output.mjs
templates/example-input.json
```

当前主要完成了 `SKILL.md` 自动生成和 `.nextide/input` fixtures。

---

### 8.2 待开发

扩展：

```text
scripts/generate-nextide-skills.ts
```

自动生成：

```text
references/capability-contract.md
references/input-schema.md
references/output-schema.md
references/failure-modes.md
templates/example-input.json
scripts/run_capability.mjs
scripts/normalize_output.mjs
```

---

### 8.3 failure modes 标准

```text
unauthorized → nextide auth login
insufficient_credits → 提示充值
plan_required → 提示升级套餐
rate_limited → 提示稍后重试
waiting_callback → 保存 runId，稍后查询
run_not_finished → 不编造结果
capability_unavailable → 告知未开放
workflow_failed/provider_failed → 展示摘要，不泄露内部实现
```

---

## 9. 高成本任务确认 UX

### 9.1 背景

Clipcat 文档中的批量复刻、多市场、多风格视频矩阵都会快速消耗积分。NexTide 必须先补高成本确认。

### 9.2 待开发

CLI 对 `high` / `variable` capability 默认提示：

```text
Estimated credits: xxx
This may take up to 60 minutes.
Continue? [y/N]
```

支持：

```bash
--yes
--max-credits=1000
```

服务端也支持：

```json
{
  "input": {},
  "maxCredits": 1000
}
```

如果 estimated > maxCredits：

```text
HTTP 402
error.code = cost_limit_exceeded
```

### 9.3 验收标准

```text
批量视频/高成本任务不会无提示运行
服务端不信任 CLI，仍做 maxCredits guard
```

---

## 10. Stale cleanup cron 化

### 10.1 已有基础

```text
scripts/cleanup-stale-agent-runs.ts
npm run cleanup:agent-runs
```

### 10.2 待开发

新增：

```text
POST /api/admin/agent-runs/cleanup-stale
```

或平台 cron 调用脚本。

保护方式：

```text
CRON_SECRET
```

默认：

```text
older-than-minutes=180
limit=100
```

Admin 页面增加：

```text
dry-run cleanup
execute cleanup stale
```

---

## 11. 发布包与安装体验

### 11.1 待开发

CLI 增加：

```bash
nextide skills install
nextide skills doctor
nextide skills list
```

Release bundle 增加：

```text
CHANGELOG.md
更完整 INSTALL.md
manifest.json
```

安装目录检查：

```text
~/.agents/skills
.claude/skills
```

---

## 12. 推荐 Sprint 计划

### Sprint 1：上线收口 + 积分单表产品化

1. 部署 latest migrations + app code。
2. 跑线上 doctor/smoke。
3. 收紧 smoke pre-deploy 兼容。
4. `/api/nexapi/usage` 增加 `port/type` filter。
5. Recent Usage 增加来源筛选。
6. 全局检查扣费入口，统一写 `transactions.channel/meta`。
7. smoke 增加 `sourceTable=transactions` 检查。

验收：

```text
线上 Agent Runtime 与本地一致
用户积分流水只读 transactions
端口来源展示可筛选
```

---

### Sprint 2：用户从积分记录查看 Agent 结果

1. 新增 `GET /api/nexapi/agent-runs/[id]`。
2. Recent Usage 中 Agent 流水增加“查看结果”。
3. 做 result/artifacts 弹窗或详情页。
4. owner/admin 权限验证。
5. smoke 覆盖用户侧 run detail。

验收：

```text
用户可从 Agent 扣费记录进入 run 结果
artifact 可视化展示
```

---

### Sprint 3：P0 capabilities artifacts 标准化

1. 视频类 artifact 标准化。
2. 社媒采集 datatable 标准化。
3. infographic/style artifact 标准化。
4. breakdown prompt 输出结构标准化。
5. CLI artifacts 与用户详情页一致消费 manifest。

验收：

```text
首批 P0 capability 结果都可被 Agent/CLI/前端一致消费
```

---

### Sprint 4：TikTok Commerce Skills 第一批

基于 ClipcatSkill 启发，先做低风险、可复用现有 capability 的 report/workflow 类 skill：

```text
tiktok-viral-breakdown-report
tiktok-creator-distiller
tiktok-product-review-insights
tiktok-viral-to-video-pipeline MVP
```

先以 skill workflow 实现，必要时再新增 orchestration capability。

验收：

```text
Agent 能通过 NexTide skills 完成 TikTok 爆款搜索、拆解、蒸馏、报告生成
不依赖 Clipcat API
不暴露内部 n8n/webhook
```

---

### Sprint 5：Skill 包 PostPlus-style 补齐

1. generator 自动生成 references/templates/scripts。
2. skill package 包含 contract/schema/failure modes。
3. release bundle 更新。
4. CLI skills doctor 初版。

验收：

```text
nextide-skills.zip 解压后每个 skill 都是完整 PostPlus-style 结构
```

---

### Sprint 6：高成本 batch 与未来 TikTok Shop 集成

1. CLI `--yes` / `--max-credits`。
2. 服务端 `maxCredits` guard。
3. product creative matrix。
4. 多市场本地化视频 batch。
5. TikTok Shop product search/detail/comments planned capability。

验收：

```text
批量生成/批量采集安全可控
未来 TikTok Shop surface 有清晰 planned capability
```

---

## 13. 已启动开发：TikTok 博主蒸馏器 MVP

根据“这个博主蒸馏器能不能直接先开发”的决策，已先启动 workflow MVP，不等待完整 server-side orchestration capability。

新增 skill：

```text
.claude/skills/tiktok-creator-distiller/SKILL.md
```

新增 references/templates：

```text
.claude/skills/tiktok-creator-distiller/references/workflow.md
.claude/skills/tiktok-creator-distiller/references/report-template.md
.claude/skills/tiktok-creator-distiller/templates/example-input.json
```

新增 fixtures：

```text
.nextide/input/tiktok-creator-distill-example.json
.nextide/input/tiktok-creator-collect-example.json
```

已扩展 `social.tiktok.collect` registry schema：

```text
mode: keyword / creator / video
targets / creators / urls
sortBy: likes / views / comments / shares / recent
```

已增加 TikTok creator collect example，fixtures 生成后会出现：

```text
.nextide/input/social.tiktok.collect-2.json
```

已更新 router generator：

```text
TikTok 博主蒸馏、账号爆款打法拆解、创作者内容公式提炼 → tiktok-creator-distiller
```

MVP 调用链：

```text
social.tiktok.collect(mode=creator)
→ export artifacts
→ rank TOP N videos
→ viral.breakdown.video_prompts × N
→ creator-distillation-report.md
→ creator-formulas.json
```

当前限制：

```text
- 依赖线上 /api/social-scraper/start 支持 mode=creator
- 若采集 run 返回 waiting_callback，必须等待结果，不得编造视频列表
- 若采集 artifact 没有 video_url/post_url，则不能继续 TOP 视频拆解
- 默认 topN=5，超过 8 需要显式确认成本
```

后续可升级为真正 capability：

```text
social.tiktok.creator.distill
```

但第一版先作为 workflow skill 验证用户价值。

## 14. 已完成集成：NexTide Hook Skills Pack

根据 `PostPlusAI/hook-skills` 的 Apache 2.0 开源内容，已完成 NexTide-branded 一步到位集成。

### 14.1 新增 local Agent skills

```text
.claude/skills/short-video-hook-designer
.claude/skills/reference-opening-decoder
.claude/skills/video-prompt-preflight-qa
.claude/skills/visual-hook-optimizer
.claude/skills/opening-pattern-router
```

对应能力：

```text
短视频 Hook 设计
参考开头结构解码
视频提示词生成前 QA
视觉开头优化
短视频开头模式路由
```

### 14.2 新增 local_agent capabilities

Capability count 从 14 增加到 19：

```text
content.hook.design
reference.decode
prompt.preflight.qa
content.visual_hook.design
content.opening_pattern.route
```

这些能力均为：

```text
executionType = local_agent
costLevel = free
estimatedCredits = 0
requiredAuth = none
```

### 14.3 集成方式

不是原样照搬 PostPlus 品牌，而是：

```text
- 改造成 NexTide-branded skills
- 移除面向用户的 PostPlus 推广 CTA
- 保留 Apache 2.0 attribution / NOTICE
- 融入 NexTide router、capability export、fixtures、skills package、release bundle
```

Attribution 文件：

```text
references/NOTICE.md
```

### 14.4 Runner 行为

`local_agent` capability 现在可以通过 Agent API 返回本地 skill 指引：

```text
runAgentCapability → runLocalAgentGuidance
```

返回：

```text
status = succeeded
usage.credits = 0
result.type = local_agent_guidance
skillPath = .claude/skills/<skill>/SKILL.md
```

同时 `POST /api/agent/capabilities/[id]/run` 对 `local_agent` 不要求 NexTide API Key，不扣费。

### 14.5 已验证

```bash
npm run typecheck
npm run capabilities:export
npm run fixtures:generate
npm run skills:generate
npm run build:nextide-cli
npm run skills:package
npm run release:agent-runtime
```

结果：

```text
capabilities exported: 19
fixtures generated: 11
nextide-skills.zip includes all hook skills
nextide-agent-runtime-0.2.0.zip includes updated capabilities/fixtures/skills
```

## 15. TikTok 博主蒸馏器线上验证与排查记录

已验证线上 `social.tiktok.collect` 的 `mode=creator`：

```bash
nextide capability run social.tiktok.collect \
  --api-base-url https://atomx.top \
  --input .nextide/input/tiktok-creator-collect-example.json \
  --mode submit --wait
```

线上 API 能成功提交任务：

```text
HTTP 200
run.status = waiting_callback
result.platform = tiktok
result.mode = creator
result.entries = ["@quinclips3"]
callbackUrl = https://atomx.top/api/webhook/social-scraper
```

本次验证 run：

```text
run_58782d8a-b126-4015-9b1d-5a99cbf7483e
```

同时验证账号 URL 形式：

```text
.nextide/input/tiktok-creator-collect-url-example.json
```

提交成功 run：

```text
run_0cbce08a-9bb1-41b9-91c2-083f27a6257a
```

但持续轮询后，两种输入都仍然：

```text
status = waiting_callback
data.importedCount = 0
artifacts = []
```

排查结论：

```text
Agent Runtime / API / auth / credit / run store 正常。
问题在 social-scraper/start 向 n8n 传 TikTok creator mode 时，当前线上代码把 creator 归并成 input_mode=url，并把 @handle 当 postURLs 传给 workflow。
如果 n8n 工作流只按 postURLs 采集单视频，则不会得到账号视频列表。
```

已本地修复：

```text
app/api/social-scraper/start/route.ts
lib/agent-capabilities/runner.ts
```

修复内容：

```text
- social runner 支持 creators 字段
- social-scraper/start 支持 body.creators/body.urls
- TikTok creator mode 不再只传 postURLs
- creator mode 会生成：
  profiles: ["@handle"]
  profileUrls/profileURLs: ["https://www.tiktok.com/@handle"]
  startUrls: [{url}]
  postURLs: [url]  // 仅保留兼容旧 n8n
  input_mode: "creator"
  request_meta.requested_mode = "creator"
```

已验证本地：

```bash
npm run typecheck
```

下一步：

```text
需要部署该 patch，并确认 n8n Social采集总工作流_Web直连版 支持 input_mode=creator 或至少使用 payload.profiles/profileUrls/startUrls。
如果 n8n 暂不支持 creator 分支，则需要在 n8n 增加 TikTok profile actor 分支，或在 Next API 侧增加 Apify profile direct runner。
```

## 16. 立即下一步

建议下一步直接执行 Sprint 1 的本地开发和部署准备：

```text
A. 给 /api/nexapi/usage 增加 port/type filter
B. 给 Recent Usage 增加来源筛选 UI
C. 全局扫描所有扣费入口，统一 transaction meta
D. smoke 增加 sourceTable=transactions 检查
E. 然后部署线上 migration + app code
F. 部署后收紧 smoke pre-deploy 兼容逻辑
```

完成后，再进入 Sprint 2：用户从积分记录查看 Agent run 结果。
