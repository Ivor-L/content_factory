# NexTide Skills Runtime 交付说明

> 日期：2026-05-06
> 对应计划：`docs/20260506-nextide-skills-runtime-plan.md`

## 1. 本次交付范围

本次已完成 NexTide Agent Skills Runtime 的 MVP 开发，包含：

- Agent-facing Capability Registry
- Agent Capability Run API
- NexTide CLI MVP
- 第一批项目级 `.claude/skills`
- 多个现有 SaaS / 小程序 / n8n 能力的 capability runner 接入
- 小红书、数字人、动作复刻、中视频、社媒采集、爆款拆解等第一批能力

## 2. 新增/改动的核心文件

### Capability 层

```text
lib/agent-capabilities/types.ts
lib/agent-capabilities/registry.ts
lib/agent-capabilities/runner.ts
```

### Agent API

```text
app/api/agent/capabilities/route.ts
app/api/agent/capabilities/[id]/run/route.ts
app/api/agent/runs/[id]/route.ts
app/api/agent/runs/[id]/result/route.ts
```

### CLI

```text
scripts/nextide-cli.mjs
package.json  # 新增 npm run nextide
```

### 共享服务

```text
lib/xhs-card-layout-service.ts
app/api/xhs-layout/render/route.ts  # 普通 Markdown 渲染路径复用 renderXhsCardLayout
```

### 项目级 Skills

```text
.claude/skills/nextide-shared/SKILL.md
.claude/skills/nextide-skill-router-cn/SKILL.md
.claude/skills/xiaohongshu-note-collector/SKILL.md
.claude/skills/xiaohongshu-card-layout/SKILL.md
.claude/skills/xiaohongshu-infographic-generator/SKILL.md
.claude/skills/product-selling-point-analysis/SKILL.md
.claude/skills/digital-human-generator/SKILL.md
.claude/skills/motion-replication/SKILL.md
.claude/skills/viral-midform-video-generator/SKILL.md
.claude/skills/social-data-collector/SKILL.md
.claude/skills/viral-breakdown-to-video-prompts/SKILL.md
```

### 示例输入

```text
.nextide/input/xhs-card-layout-smoke.json
.nextide/input/xhs-note-collect-example.json
.nextide/input/xhs-infographic-generate-example.json
.nextide/input/xhs-style-extract-example.json
.nextide/input/digital-human-video-example.json
.nextide/input/motion-replication-example.json
.nextide/input/viral-midform-video-example.json
.nextide/input/social-tiktok-collect-example.json
.nextide/input/social-instagram-collect-example.json
.nextide/input/social-facebook-collect-example.json
.nextide/input/social-comments-collect-example.json
.nextide/input/viral-breakdown-video-example.json
.nextide/input/viral-breakdown-image-text-example.json
```

## 3. CLI 使用

```bash
npm run nextide -- status
npm run nextide -- capability list
npm run nextide -- capability list --json
npm run nextide -- capability run <capability-id> --input <file.json> --output <file.json> [--mode wait|submit]
npm run nextide -- run status <run-id>
npm run nextide -- run result <run-id> --output <file.json>
```

认证/配置：

```bash
--api-base-url <url>
--auth-token <token>
--user-api-key <key>
--nexapi-key <key>
```

也支持环境变量：

```text
NEXTIDE_API_BASE_URL
NEXTIDE_AUTH_TOKEN
NEXTIDE_USER_API_KEY
NEXTIDE_NEXAPI_KEY
```

配置文件：

```text
~/.nextide/config.json
```

## 4. 已接入 Capability

| Capability | 状态 | 对应 Skill | 后端入口 |
|---|---|---|---|
| `xhs.note.collect` | available | `xiaohongshu-note-collector` | `/api/miniapp/hot-square/collect-xhs` |
| `xhs.card.layout` | available | `xiaohongshu-card-layout` | `renderXhsCardLayout()` |
| `xhs.infographic.style.extract` | available | `xiaohongshu-infographic-generator` | `/api/assets/styles/upload` |
| `xhs.infographic.generate` | available | `xiaohongshu-infographic-generator` | `/api/xhs-text2img/plan` |
| `product.selling_point.analysis` | available | `product-selling-point-analysis` | `lib/n8n.ts analyzeProduct()` |
| `digital-human.video.generate` | available | `digital-human-generator` | `/api/digital-human/videos` |
| `motion.replication.image_to_video` | available | `motion-replication` | `/api/action-transfer/videos` |
| `viral.midform.video.generate` | available | `viral-midform-video-generator` | `/api/my-works/t2v` |
| `social.tiktok.collect` | available | `social-data-collector` | `/api/social-scraper/start` |
| `social.instagram.collect` | available | `social-data-collector` | `/api/social-scraper/start` |
| `social.facebook.collect` | available | `social-data-collector` | `/api/social-scraper/start` |
| `social.comments.collect` | available* | `social-data-collector` | configurable n8n webhook |
| `viral.breakdown.video_prompts` | available | `viral-breakdown-to-video-prompts` | `/api/replication/copy/extract` or `/api/image-text-replication/start` |
| `content.wechat.longform.write` | available | `khazix-writer` | local agent skill |

`social.comments.collect` 需要配置：

```text
N8N_TIKTOK_COMMENTS_WEBHOOK
或 N8N_SOCIAL_COMMENTS_WEBHOOK
或 SOCIAL_COMMENTS_WEBHOOK_URL
```

## 5. 关键调用示例

### 小红书 MD 卡片排版

```bash
npm run nextide -- capability run xhs.card.layout \
  --input .nextide/input/xhs-card-layout-smoke.json \
  --output .nextide/output/xhs-card-layout-result.json \
  --mode wait \
  --user-api-key <key>
```

### 小红书笔记采集

```bash
npm run nextide -- capability run xhs.note.collect \
  --input .nextide/input/xhs-note-collect-example.json \
  --output .nextide/output/xhs-note-collect-result.json \
  --mode wait \
  --user-api-key <key>
```

### 信息卡片风格提炼

```bash
npm run nextide -- capability run xhs.infographic.style.extract \
  --input .nextide/input/xhs-style-extract-example.json \
  --output .nextide/output/xhs-style-extract-result.json \
  --mode submit \
  --user-api-key <key>
```

### 信息卡片生成

```bash
npm run nextide -- capability run xhs.infographic.generate \
  --input .nextide/input/xhs-infographic-generate-example.json \
  --output .nextide/output/xhs-infographic-generate-result.json \
  --mode submit \
  --user-api-key <key>
```

### 数字人

```bash
npm run nextide -- capability run digital-human.video.generate \
  --input .nextide/input/digital-human-video-example.json \
  --output .nextide/output/digital-human-video-result.json \
  --mode submit \
  --user-api-key <key>
```

### 动作复刻

```bash
npm run nextide -- capability run motion.replication.image_to_video \
  --input .nextide/input/motion-replication-example.json \
  --output .nextide/output/motion-replication-result.json \
  --mode submit \
  --user-api-key <key>
```

### TK/Ins/FB 采集

```bash
npm run nextide -- capability run social.tiktok.collect \
  --input .nextide/input/social-tiktok-collect-example.json \
  --output .nextide/output/social-tiktok-collect-result.json \
  --mode submit \
  --user-api-key <key>
```

### 爆款拆解

```bash
npm run nextide -- capability run viral.breakdown.video_prompts \
  --input .nextide/input/viral-breakdown-video-example.json \
  --output .nextide/output/viral-breakdown-video-result.json \
  --mode submit \
  --user-api-key <key>
```

## 6. 长任务说明

Phase 2 已新增 Agent Run Store：

```text
AgentCapabilityRun
/api/agent/runs/[id]
/api/agent/runs/[id]/result
```

现在 capability run 会持久化到 `agent_capability_runs`，并尽量映射到底层业务任务，例如：

```text
digitalHumanVideo
creativeTask
storyboardTask
imageTextReplicationTask
```

以下能力通常返回 `waiting_callback`：

- `xhs.infographic.style.extract`
- `xhs.infographic.generate`
- `digital-human.video.generate`
- `motion.replication.image_to_video`
- `viral.midform.video.generate`
- `social.tiktok.collect`
- `social.facebook.collect`
- `social.comments.collect`
- 视频路径的 `viral.breakdown.video_prompts`

通用查询：

```bash
npm run nextide -- run status <run-id>
npm run nextide -- run result <run-id> --output result.json
```

长任务进度仍会实时参考各业务记录：

- 数字人/动作复刻：`DigitalHumanVideo.id`，查询 `/api/digital-human/videos/[id]`
- 信息卡片：`CreativeTask.taskId` / `TaskSummary`
- 中视频：`CreativeTask.metadata.custom.t2v_status` / `t2v_storyboard_id`
- 社媒采集：n8n callback 后写入 viral references

## 7. 环境变量依赖

部分能力需要现有服务配置：

```text
XHS_DOWNLOADER_BASE_URL
XHS_DOWNLOADER_COOKIE       # 可选
XHS_DOWNLOADER_PROXY        # 可选
N8N_STYLE_WORKFLOW_WEBHOOK
N8N_T2V_WEBHOOK
N8N_SOCIAL_SCRAPER_WEBHOOK
N8N_INSTAGRAM_SCRAPER_WEBHOOK
SOCIAL_SCRAPER_APIFY_TOKEN / APIFY_API_TOKEN / APIFY_TOKEN
N8N_ACTION_TRANSFER_WEBHOOK
N8N_TIKTOK_COMMENTS_WEBHOOK / N8N_SOCIAL_COMMENTS_WEBHOOK
ADMIN_TOKEN
NEXT_PUBLIC_APP_URL / N8N_CALLBACK_BASE_URL
```

## 8. 验证结果

已执行：

```bash
npm run typecheck
npm run nextide -- status
```

结果：通过。

说明：`npm run nextide -- capability list --json` 需要本地 dev server 或线上 `NEXTIDE_API_BASE_URL` 可访问；当前没有启动 dev server 时会等待网络请求。

## 9. 已知限制 / 后续建议

1. 通用 Agent Run Store 仍是占位，需要后续持久化 runId 与业务 taskId 的映射。
2. `viral.midform.video.generate` 当前要求已有 `creativeTaskId/taskId`，还未实现 standalone 创作任务创建。
3. `digital-human.video.generate` MVP 要求已有 `audioUrl`，未内置 TTS。
4. `xhs.infographic.style.extract` MVP 每次取第一张参考图上传；多图风格融合后续可扩展。
5. `social.comments.collect` 依赖你现有评论 n8n webhook 环境变量。
6. PostPlus 全量 51 skills 的兼容壳还可继续批量生成，但本次已完成你指定第一批业务能力。

## 10. 结论

NexTide 现在已经具备一套可用的 PostPlus-style Skills Runtime MVP：

```text
Skill 文档
  ↓
NexTide CLI
  ↓
Agent Capability API
  ↓
现有 SaaS / 小程序 / n8n / 云端工作流
```

第一批核心能力已经接入，可以开始在 Agent 侧用自然语言触发对应 skills，再由 skills 通过 CLI 调用 NexTide 后端能力。
