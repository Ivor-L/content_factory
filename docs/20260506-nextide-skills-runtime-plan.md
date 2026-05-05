# NexTide Skills Runtime 计划书

> 日期：2026-05-06  
> 项目：Content Factory Web / NexTide  
> 目标：将 NexTide 现有 SaaS、小程序、n8n、云端生成与内容生产能力，抽象成一套可被本地 AI Agent 调用的 PostPlus-style Skills Runtime。  
> 状态：计划阶段

---

## 1. 背景与目标

NexTide 目前已经具备一套内容生产 SaaS 能力，包括：

- 小红书爆款广场与笔记采集
- 小红书图文卡片排版与生成
- 风格库 / 风格提炼 / 信息卡片生成
- 产品库与产品卖点分析
- 智能复刻、爆款拆解、视频提示词反推
- 数字人生成，包括图片数字人和视频数字人
- 动作复刻：单图人物按参考视频动作生成
- 中视频生成：当前已有 3D 骨骼主题，未来会扩展更多主题
- TikTok / Instagram / Facebook 数据采集与爆款复刻链路
- n8n 工作流、云雾 API、积分系统、Webhook 回调与异步任务链路
- 已有本地 skills，例如卡兹克公众号写作、DBS 小红书标题/内容诊断、配图、Seedance 等

本计划的目标，是把这些能力抽象成一套 **NexTide Skills**：

```text
本地 Agent / Pi / Claude / Codex / Cursor
  ↓
NexTide Skill：SKILL.md + references + scripts
  ↓
NexTide CLI / Skill Runner
  ↓
NexTide Agent Capability API
  ↓
Content Factory Web API / n8n / 云雾 API / Supabase / Prisma
  ↓
结构化结果文件
  ↓
Agent 继续分析、整理、生成报告、脚本、卡片或视频提示词
```

最终效果：用户在本地 Agent 里可以直接说：

- “帮我采集 30 条小红书护肤仪爆款笔记，并整理选题机会。”
- “把这个 MD 文档排版成小红书 3:4 卡片。”
- “参考这个风格，生成一组信息卡片。”
- “用这张人物图生成数字人视频。”
- “拆解这个爆款视频，并反推出 Seedance/Veo 可用的视频提示词。”
- “帮我抓 TikTok/Instagram/Facebook 上的同类爆款案例。”

Agent 只理解 skill 契约；闭源工作流、模型调用、n8n 编排、积分与异步任务全部留在 NexTide 服务端。

---

## 2. 核心原则

### 2.1 Skill 是能力壳，不暴露闭源实现

NexTide Skills 只暴露：

- 使用场景
- 输入字段
- 输出结构
- 工作流步骤
- 本地临时文件规范
- 失败处理规则
- 调用 capability 的 CLI contract

不暴露：

- n8n 内部节点
- 云雾 API 密钥
- 第三方供应商 Key
- Supabase service role key
- 私有 prompt chain
- 代理池 / 账号池 / 浏览器集群
- 计费、积分、风控内部逻辑

### 2.2 Agent-facing API 与现有业务 API 解耦

现有 API 多为 Web / 小程序 UI 服务，例如：

- `/api/miniapp/hot-square/collect-xhs`
- `/api/xhs-layout/render`
- `/api/xhs-text2img/plan`
- `/api/products/analyze`
- `/api/image-text-replication/*`
- `/api/storyboard/*`
- `/api/canvas/*`
- `/api/digital-human/*`
- `/api/social-scraper/start`

不建议让 skills 直接记这些内部 API。

应新增统一的 Agent Capability 层：

```text
/api/agent/capabilities
/api/agent/capabilities/[id]/run
/api/agent/runs/[id]
/api/agent/runs/[id]/result
```

这层负责把稳定的 capability id 映射到现有 API、n8n workflow 或自定义闭源服务。

### 2.3 长任务必须异步化

数字人、视频生成、动作复刻、中视频生成等任务最长可能 60 分钟，不能依赖本地 Agent 长时间阻塞等待。

统一采用：

```text
submit run
  → return runId
  → CLI poll / status
  → result ready 后下载结构化结果
```

Agent 侧应允许两种模式：

1. **等待模式**：CLI 持续轮询直到完成或超时。
2. **提交模式**：提交任务后返回 runId，用户稍后用 `nex skill status <runId>` 查询。

### 2.4 文件契约优先

所有 skills 都应使用真实文件作为输入输出：

```bash
nextide capability run xhs.note.collect \
  --input .nextide/input/xhs-note-collect.json \
  --output .nextide/raw/xhs-note-collect-result.json
```

禁止把大段 JSON 直接塞到命令参数里。

### 2.5 先小样本，再扩展

数据采集类 skill 默认 bounded first pass：

- 小红书：先 10-30 条笔记
- TikTok / Instagram / Facebook：先少量关键词/账号/帖子
- 评论抓取：先抓候选爆款，再抓评论
- 视频生成：先生成短片段或低变量版本

避免一开始大规模采集或生成，浪费积分与时间。

---

## 3. 总体架构

### 3.1 本地 Skill 目录结构

建议项目内开发目录：

```text
.claude/skills/
  nextide-shared/
  nextide-skill-router-cn/
  xiaohongshu-note-collector/
  xiaohongshu-card-layout/
  xiaohongshu-infographic-generator/
  digital-human-generator/
  motion-replication/
  viral-midform-video-generator/
  social-data-collector/
  product-selling-point-analysis/
  viral-breakdown-to-video-prompts/
```

发布到用户本地时安装到：

```text
~/.agents/skills/
```

每个 skill 标准结构：

```text
skill-name/
  SKILL.md
  references/
    workflow.md
    capability-contract.md
    input-schema.md
    output-schema.md
    failure-modes.md
  scripts/
    build_input.mjs
    run_capability.mjs
    normalize_output.mjs
    generate_report.mjs
  templates/
    example-input.json
```

### 3.2 NexTide CLI / Skill Runner

建议命令名：

```bash
nextide
```

基础命令：

```bash
nextide auth login
nextide status
nextide capability list
nextide capability run <capability-id> --input <file> --output <file>
nextide run status <run-id>
nextide run result <run-id> --output <file>
```

开发期也可支持环境变量：

```bash
NEXTIDE_API_BASE_URL=http://localhost:3000
NEXTIDE_AUTH_TOKEN=...
```

生产期通过 OAuth / Device Login 写入：

```text
~/.nextide/config.json
```

### 3.3 Capability Registry

新增服务端注册表：

```text
lib/agent-capabilities/
  registry.ts
  runner.ts
  types.ts
  errors.ts
  serializers.ts
```

示例：

```ts
export const NEXTIDE_CAPABILITIES = [
  {
    id: 'xhs.note.collect',
    skillName: 'xiaohongshu-note-collector',
    title: '小红书笔记采集',
    source: 'miniapp.hot-square.collect-xhs',
    async: true,
  },
  {
    id: 'xhs.card.layout',
    skillName: 'xiaohongshu-card-layout',
    title: '小红书图文排版',
    source: 'xhs-layout.render',
    async: false,
  },
  {
    id: 'xhs.infographic.generate',
    skillName: 'xiaohongshu-infographic-generator',
    title: '小红书信息卡片生成',
    source: 'xhs-text2img.plan + xhs-layout.render',
    async: true,
  },
];
```

### 3.4 统一 Run 状态

所有异步任务统一状态：

```text
queued
running
waiting_callback
succeeded
failed
cancelled
timeout
```

统一结果结构：

```json
{
  "runId": "run_xxx",
  "capabilityId": "xhs.note.collect",
  "status": "succeeded",
  "createdAt": "2026-05-06T00:00:00.000Z",
  "finishedAt": "2026-05-06T00:03:00.000Z",
  "result": {},
  "artifacts": [],
  "usage": {
    "credits": 0,
    "provider": "n8n",
    "durationMs": 180000
  },
  "error": null
}
```

---

## 4. 第一批 Skills 设计

## 4.1 小红书笔记采集

### Skill ID

```text
xiaohongshu-note-collector
```

### Capability ID

```text
xhs.note.collect
```

### 对应现有功能

小程序目前爆款广场的功能，尤其：

```text
app/api/miniapp/hot-square/collect-xhs/route.ts
app/api/admin/hot-square-data-center/collect/route.ts
app/api/viral-references/import/route.ts
app/api/social-scraper/start/route.ts
app/api/webhook/social-scraper/route.ts
```

### 用户场景

- 采集某个关键词下的小红书爆款笔记
- 采集某个小红书链接并沉淀到资料库
- 为内容选题、爆款分析、图文复刻提供原始数据
- 给后续 `xiaohongshu-content-benchmark`、`xiaohongshu-card-notes` 提供数据源

### 输入示例

```json
{
  "source": "keyword",
  "keywords": ["护肤仪", "射频美容仪"],
  "limit": 30,
  "collectComments": false,
  "saveToHotSquare": true,
  "costMode": "bounded"
}
```

或：

```json
{
  "source": "url",
  "urls": ["https://www.xiaohongshu.com/explore/xxx"],
  "saveToHotSquare": true
}
```

### 输出示例

```json
{
  "items": [
    {
      "platform": "xiaohongshu",
      "noteId": "xxx",
      "url": "...",
      "title": "...",
      "desc": "...",
      "coverUrl": "...",
      "imageUrls": [],
      "author": {
        "name": "...",
        "profileUrl": "..."
      },
      "metrics": {
        "likes": 0,
        "collects": 0,
        "comments": 0,
        "shares": 0
      },
      "raw": {}
    }
  ],
  "savedReferences": []
}
```

### 注意事项

- 图片 URL 有效期问题：采集后应尽快转存到 NexTide/Supabase/OSS。
- 默认不抓评论，除非用户明确需要评论洞察。
- 失败时不能编造笔记结果。

---

## 4.2 小红书图文排版：MD → 优美卡片

### Skill ID

```text
xiaohongshu-card-layout
```

### Capability ID

```text
xhs.card.layout
```

### 对应现有功能

小程序目前图文卡片功能：

```text
app/api/xhs-layout/normalize/route.ts
app/api/xhs-layout/render/route.ts
app/api/xhs-layout/publish/route.ts
app/api/xhs-layout/meta/route.ts
```

以及相关计划：

```text
docs/20260504-xhs-markdown-table-render-plan.md
docs/20260502-image-text-replication-parallel-and-xhs-html-plan.md
```

### 用户场景

- 将 Markdown 文档排版成小红书 3:4 图文卡片
- 将公众号/长文/访谈稿切成卡片页
- 保留原文结构，同时优化视觉层级
- 输出 HTML / PNG / ZIP / 可发布素材

### 输入示例

```json
{
  "markdown": "# 标题\n\n正文...",
  "style": "clean-editorial",
  "aspectRatio": "3:4",
  "pageMode": "auto",
  "density": "medium-high",
  "exportFormats": ["html", "png"]
}
```

### 输出示例

```json
{
  "pages": [
    {
      "index": 1,
      "title": "...",
      "markdown": "...",
      "html": "...",
      "imageUrl": "..."
    }
  ],
  "htmlUrl": "...",
  "zipUrl": "...",
  "previewUrl": "..."
}
```

### 注意事项

- 排版不能重写用户原文，除非用户明确要求润色。
- 表格、引用、列表要有稳定渲染策略。
- 输出需要可复查，最好保留 HTML 源文件。

---

## 4.3 小红书信息卡片生成：风格提炼 + 生成

### Skill ID

```text
xiaohongshu-infographic-generator
```

### Capability IDs

```text
xhs.infographic.style.extract
xhs.infographic.generate
```

### 对应现有功能

第一部分：风格提炼，来自风格库：

```text
app/api/assets/styles/upload/route.ts
app/api/assets/styles/route.ts
app/api/assets/styles/preview/route.ts
app/api/webhook/style-analysis/route.ts
workers/assetProcessor.ts
```

第二部分：生成，参考小程序信息卡片生成：

```text
app/api/xhs-text2img/plan/route.ts
app/api/xhs-images/jobs/route.ts
app/api/xhs-images/jobs/[id]/route.ts
app/api/miniapp/canvas/images/jobs/route.ts
app/api/webhook/xhs_text2img_web/route.ts
```

### 用户场景

- 上传/引用一组优秀小红书信息卡，提炼视觉风格 DNA
- 根据内容主题生成同风格信息卡片
- 将知识型内容转成适合小红书传播的信息图
- 批量生成多版风格候选

### 输入示例：风格提炼

```json
{
  "referenceImages": ["file-or-url-1", "file-or-url-2"],
  "styleName": "高密度知识卡",
  "extract": ["layout", "typography", "color", "contentHierarchy", "promptKit"]
}
```

### 输入示例：生成

```json
{
  "topic": "为什么 30 岁后更需要抗炎护肤",
  "content": "...",
  "stylePresetId": "style_xxx",
  "pageCount": 6,
  "aspectRatio": "3:4",
  "exportFormats": ["png", "html"]
}
```

### 输出示例

```json
{
  "styleDna": {
    "layout": "...",
    "typography": "...",
    "colorPalette": [],
    "promptKit": "..."
  },
  "cards": [
    {
      "index": 1,
      "imageUrl": "...",
      "htmlUrl": "...",
      "prompt": "..."
    }
  ]
}
```

### 注意事项

- 风格提炼与生成要拆成两个 capability，允许用户只做其中一步。
- 风格学习必须避免直接复制原图中的品牌标识、人物、版权元素。
- 生成失败应返回可重试的 jobId 与失败原因。

---

## 4.4 数字人：图片数字人 + 视频数字人

### Skill ID

```text
digital-human-generator
```

### Capability IDs

```text
digital-human.image.generate
digital-human.video.generate
```

### 对应现有功能

```text
app/api/digital-human/videos/route.ts
app/api/digital-human/videos/[id]/route.ts
app/api/digital-human/videos/[id]/retry/route.ts
app/api/webhook/digital-human/route.ts
app/api/canvas/digital-human/route.ts
```

n8n workflow：

```text
flow_Digital_Human
Digital_Human_web
human_cb_web
```

### 用户场景

- 生成图片数字人形象
- 用人像 + 文案生成口播数字人视频
- 用视频参考生成更稳定的人物风格
- 为短视频批量生产准备数字人素材

### 输入示例

```json
{
  "mode": "video",
  "personImage": "file-or-url",
  "script": "大家好，今天讲一个...",
  "voice": {
    "type": "preset",
    "id": "voice_xxx"
  },
  "duration": 30,
  "aspectRatio": "9:16",
  "language": "zh-CN"
}
```

### 长任务处理

数字人视频最长可能 60 分钟。必须采用异步 run：

```bash
nextide capability run digital-human.video.generate \
  --input .nextide/input/digital-human.json \
  --output .nextide/runs/digital-human-run.json \
  --mode submit
```

返回：

```json
{
  "runId": "run_xxx",
  "status": "queued",
  "estimatedWaitMinutes": 10,
  "statusCommand": "nextide run status run_xxx",
  "resultCommand": "nextide run result run_xxx --output result.json"
}
```

Agent 在默认情况下不应等待 60 分钟。建议：

- 5 分钟以内任务：可 poll 等待。
- 超过 5 分钟任务：默认提交后返回 runId。
- 用户明确说“等它完成”时再持续轮询，但设置最大超时。

### 注意事项

- 数字人涉及肖像权，skill 中要提醒用户仅使用有授权素材。
- 长任务必须可查询、可重试、可取消。
- 回调应幂等，避免重复扣费或重复写结果。

---

## 4.5 动作复刻：单图人物按视频动作生成

### Skill ID

```text
motion-replication
```

### Capability ID

```text
motion.replication.image_to_video
```

### 对应现有/待映射能力

当前需求：使用一张图片，让图片人物按照视频人物一样动作。

可能映射到：

```text
app/api/canvas/videos/route.ts
app/api/canvas/replication/route.ts
app/api/replication/generate/route.ts
app/api/webhook/replication/route.ts
```

若现有 n8n workflow 尚未单独拆出，应新增专门 capability。

### 用户场景

- 输入人物图 + 参考动作视频
- 输出动作复刻视频
- 用于广告、数字人、角色短视频、带货素材

### 输入示例

```json
{
  "personImage": "file-or-url",
  "motionReferenceVideo": "file-or-url",
  "duration": 5,
  "aspectRatio": "9:16",
  "preserveIdentity": true,
  "motionStrength": "medium"
}
```

### 输出示例

```json
{
  "videoUrl": "...",
  "thumbnailUrl": "...",
  "providerTaskId": "...",
  "warnings": ["identity may drift"]
}
```

### 注意事项

- 明确区分“动作学习”和“人物身份复制”。
- 对参考视频人物身份要设置 do-not-copy 规则，只学习动作、节奏、镜头，不复制脸、服装、品牌元素。
- 这是长任务，应接入异步 run。

---

## 4.6 爆款中视频生成：3D 骨骼主题及未来主题

### Skill ID

```text
viral-midform-video-generator
```

### Capability ID

```text
viral.midform.video.generate
```

### 对应现有功能

小程序中视频生成，目前已有 3D 骨骼主题：

```text
app/api/storyboard/*
app/api/storyboard-gen/*
app/api/canvas/videos/*
app/api/my-works/t2v/route.ts
app/api/webhook/t2v-callback/route.ts
```

相关计划：

```text
docs/20260505-miniapp-skeleton-storyboard-reference-duration-plan.md
docs/20260506-miniapp-remix-video-generation-page-plan.md
```

### 用户场景

- 生成 3D 骨骼主题中视频
- 根据产品/文案/主题生成中视频脚本、分镜、视频片段
- 后续扩展更多主题：知识讲解、剧情、产品演示、虚拟角色、信息流广告等

### 输入示例

```json
{
  "theme": "3d-skeleton",
  "topic": "久坐为什么会让肩颈越来越僵",
  "duration": 60,
  "language": "zh-CN",
  "referenceImages": [],
  "script": "可选，如果为空则自动生成"
}
```

### 输出示例

```json
{
  "script": "...",
  "storyboard": [],
  "segments": [
    {
      "index": 1,
      "prompt": "...",
      "videoUrl": "..."
    }
  ],
  "finalVideoUrl": "..."
}
```

### 注意事项

- 主题系统应配置化，而不是写死 3D 骨骼。
- 每个主题应有独立 prompt template、素材要求、时长规则、输出规则。
- 视频生成长任务必须异步化。

---

## 4.7 TikTok / Instagram / Facebook 数据采集

### Skill ID

```text
social-data-collector
```

兼容 PostPlus-style 可拆成：

```text
tiktok-research
instagram-content-benchmark
instagram-account-research
facebook-research
```

### Capability IDs

```text
social.tiktok.collect
social.instagram.collect
social.facebook.collect
social.comments.collect
```

### 对应现有功能

Web 端爆款复刻相关能力：

```text
app/api/social-scraper/start/route.ts
app/api/webhook/social-scraper/route.ts
app/api/viral-references/import/route.ts
app/api/viral-creators/route.ts
app/api/viral-creators/[id]/sync/route.ts
app/api/replication/copy/extract/route.ts
app/api/replication/copy/route.ts
```

以及用户已有 n8n：

```text
TikTok 评论抓取工作流
```

### 用户场景

- 抓取 TikTok / Instagram / Facebook 爆款内容
- 收集竞品视频/帖子
- 抓取评论，提取用户语言
- 为爆款复刻、脚本生成、hook 提取提供输入

### 输入示例

```json
{
  "platform": "tiktok",
  "mode": "keyword",
  "queries": ["neck pain relief", "posture correction"],
  "limit": 30,
  "collectComments": false,
  "country": "US",
  "costMode": "bounded"
}
```

### 输出示例

```json
{
  "items": [],
  "creators": [],
  "comments": [],
  "normalized": {
    "posts": [],
    "authors": []
  }
}
```

### 注意事项

- 不同平台采集 schema 必须归一化。
- TikTok 评论抓取作为独立子 capability，避免默认高成本抓评论。
- 需要遵守平台公开数据与用户授权边界。

---

## 4.8 产品卖点分析

### Skill ID

```text
product-selling-point-analysis
```

### Capability ID

```text
product.selling_point.analysis
```

### 对应现有功能

小程序产品库 / Web 产品库：

```text
app/api/products/analyze/route.ts
app/api/products/route.ts
app/api/products/[id]/route.ts
lib/n8n.ts → analyzeProduct()
```

n8n workflow：

```text
flow_product_dna
product_dna_web
```

### 用户场景

- 上传产品图片和描述，分析产品卖点
- 提炼目标人群、痛点、使用场景、内容角度
- 给后续短视频脚本、小红书卡片、广告创意提供基础

### 输入示例

```json
{
  "productName": "家用射频美容仪",
  "description": "...",
  "images": ["file-or-url"],
  "targetMarket": "CN",
  "outputLanguage": "zh-CN"
}
```

### 输出示例

```json
{
  "sellingPoints": [],
  "targetAudience": [],
  "painPoints": [],
  "usageScenarios": [],
  "contentAngles": [],
  "workflowData": {}
}
```

### 注意事项

- 结果应区分事实观察、推测卖点、需验证声明。
- 涉及功效类产品时，要避免医疗/夸大承诺。

---

## 4.9 爆款拆解并反推视频提示词

### Skill ID

```text
viral-breakdown-to-video-prompts
```

### Capability ID

```text
viral.breakdown.video_prompts
```

### 对应现有功能

小程序智能复刻功能：

```text
app/api/image-text-replication/*
app/api/replication/copy/extract/route.ts
app/api/replication/copy/route.ts
app/api/storyboard-breakdown/*
app/api/webhook/storyboard-breakdown/route.ts
```

相关已有 skill 可复用：

```text
reference-decode
video-request-architect
prompt-preflight-qa
seedance
```

### 用户场景

- 输入爆款视频/图文链接或文件
- 拆解开头、结构、镜头、节奏、视觉 hook、字幕、CTA
- 反推可用于 Seedance / Veo / Sora 的视频提示词
- 支持“学习结构，不复制身份/品牌/素材”的 reference contract

### 输入示例

```json
{
  "referenceVideo": "file-or-url",
  "targetProduct": {
    "name": "...",
    "sellingPoints": []
  },
  "promptProvider": "seedance",
  "output": ["breakdown", "promptPlan", "shotList"]
}
```

### 输出示例

```json
{
  "breakdown": {
    "hook": "...",
    "beats": [],
    "visualGrammar": "..."
  },
  "referenceContract": {
    "learn": [],
    "doNotCopy": []
  },
  "videoPrompts": [
    {
      "segment": 1,
      "duration": 5,
      "prompt": "..."
    }
  ]
}
```

### 注意事项

- 必须加入 reference contract，防止模型复制原作者身份、商标、场景细节。
- 拆解和生成请求应分两步，先让用户确认拆解逻辑，再生成最终 prompts。

---

## 4.10 现有本地 Skills 与开源 Skills 接入

### 已有 skills

可纳入 NexTide skill surface：

```text
khazix-writer              # 卡兹克公众号长文
xiaohongshu-notes / dbs-content / dbs-xhs-title
seedance                   # 视频提示词 / Seedance
visual-hook                # 视觉 hook
reference-decode
reference-contract-builder
prompt-preflight-qa
```

### DBS 相关能力

适合放在内容诊断和小红书创作链路中：

- 小红书标题公式
- 内容诊断
- Hook 优化
- AI 味检测
- 商业概念拆解
- 对标分析

建议保留原 skill，同时在 `nextide-skill-router-cn` 里作为可路由组件。

### 卡兹克公众号写作

适合作为：

```text
wechat-longform-writer
```

用于：

- 长文草稿
- 公众号文章
- 深度观点文
- 从报告/拆解结果生成公众号文章

### 开源 Hook Skills

参考：

```text
https://github.com/PostPlusAI/hook-skills
```

建议处理方式：

1. 先作为参考库，不直接复制未审查内容。
2. 提取 hook taxonomy、开头结构、短视频前三秒模式。
3. 融入 NexTide 的 `visual-hook` / `dbs-hook` / `viral-breakdown-to-video-prompts`。
4. 保留 LICENSE 与来源标注。

### TikTok 评论抓取 n8n

应独立接入：

```text
social.comments.collect
```

并供以下 skills 调用：

- `tiktok-research`
- `instagram-audience-voice`
- `social-data-collector`
- `audience-language-analysis`
- `benchmark-to-brief`

---

## 5. Capability 与现有代码映射表

| 第一批 Skill | Capability ID | 现有功能/代码位置 | 同步/异步 | 优先级 |
|---|---|---|---|---|
| 小红书笔记采集 | `xhs.note.collect` | `miniapp/hot-square/collect-xhs`, `social-scraper`, `viral-references` | 异步 | P0 |
| 小红书图文排版 | `xhs.card.layout` | `xhs-layout/normalize`, `xhs-layout/render`, `xhs-layout/publish` | 同步/短异步 | P0 |
| 信息卡片风格提炼 | `xhs.infographic.style.extract` | `assets/styles`, `webhook/style-analysis`, worker | 异步 | P0 |
| 信息卡片生成 | `xhs.infographic.generate` | `xhs-text2img`, `xhs-images/jobs`, `miniapp/canvas/images/jobs` | 异步 | P0 |
| 数字人图片 | `digital-human.image.generate` | `canvas/digital-human`, 待细化 | 异步 | P1 |
| 数字人视频 | `digital-human.video.generate` | `digital-human/videos`, `webhook/digital-human` | 长异步 | P0 |
| 动作复刻 | `motion.replication.image_to_video` | `canvas/videos`, `canvas/replication`, 待新增专用 runner | 长异步 | P1 |
| 爆款中视频生成 | `viral.midform.video.generate` | `storyboard`, `storyboard-gen`, `my-works/t2v` | 长异步 | P0 |
| TK/Ins/FB 数据采集 | `social.*.collect` | `social-scraper`, `viral-references`, `viral-creators` | 异步 | P0 |
| 产品卖点分析 | `product.selling_point.analysis` | `products/analyze`, `lib/n8n.ts analyzeProduct` | 同步/异步兼容 | P0 |
| 爆款拆解反推提示词 | `viral.breakdown.video_prompts` | `image-text-replication`, `replication/copy/extract`, `storyboard-breakdown` | 异步 | P0 |
| TikTok 评论抓取 | `social.comments.collect` | 已有 n8n workflow，待注册 | 异步 | P1 |
| 卡兹克写公众号 | `content.wechat.longform.write` | 现有 `khazix-writer` skill | 本地 Agent | P1 |
| DBS 小红书相关 | `content.xhs.dbs.*` | 现有 DBS skills | 本地 Agent | P1 |
| Hook Skills | `content.hook.generate` | PostPlusAI/hook-skills 参考 | 本地/混合 | P2 |

---

## 6. 认证、权限与积分

### 6.1 CLI 登录

生产环境需要：

```bash
nextide auth login
```

登录流程建议使用 Device Login：

```text
CLI 请求 login request
  → 输出浏览器 URL + code
  → 用户浏览器登录 NexTide
  → CLI 轮询成功
  → 写入 ~/.nextide/config.json
```

### 6.2 Workspace / Tenant

NexTide 支持多租户时，CLI config 需要记录：

```json
{
  "apiBaseUrl": "https://app.nextide.com",
  "accessToken": "...",
  "workspaceId": "...",
  "tenant": "..."
}
```

### 6.3 积分与额度

Agent Capability API 返回中应包含：

```json
{
  "estimatedCredits": 10,
  "actualCredits": 8,
  "remainingCredits": 1200
}
```

高成本任务执行前，CLI/skill 应提醒或要求确认，尤其：

- 长视频生成
- 数字人视频
- 批量图片生成
- 大规模社媒采集
- 评论抓取

---

## 7. 失败处理规则

统一错误码：

```text
unauthorized
quota_exceeded
capability_unavailable
invalid_input
provider_failed
workflow_failed
callback_timeout
network_error
timeout
rate_limited
```

Skill 行为规则：

- `unauthorized`：提示用户运行 `nextide auth login`。
- `quota_exceeded`：提示积分不足，不自动换低成本路径。
- `capability_unavailable`：说明该 capability 当前未开放。
- `callback_timeout`：返回 runId，允许稍后查询。
- `provider_failed`：展示供应商错误摘要，但不泄露内部密钥/节点细节。
- 数据采集失败时，不得编造研究结果。

---

## 8. 分阶段实施计划

## Phase 0：能力盘点与设计确认

### 目标

完成 NexTide Skills Runtime 的最终设计与映射。

### 任务

- 梳理第一批 10 个 skills 对应的现有 API / n8n workflow。
- 确认每个 capability 的输入输出 schema。
- 确认异步任务如何查询和下载结果。
- 确认 CLI 名称、品牌文案和安装路径。

### 产物

- 本计划书
- Capability registry 草案
- 第一批 skill schema 草案

---

## Phase 1：Agent Capability API MVP

### 目标

新增统一 agent-facing API，但不重构现有业务 API。

### 新增路径

```text
app/api/agent/capabilities/route.ts
app/api/agent/capabilities/[id]/run/route.ts
app/api/agent/runs/[id]/route.ts
app/api/agent/runs/[id]/result/route.ts
lib/agent-capabilities/registry.ts
lib/agent-capabilities/runner.ts
lib/agent-capabilities/types.ts
```

### 首批接入 capability

```text
xhs.note.collect
xhs.card.layout
product.selling_point.analysis
viral.breakdown.video_prompts
```

### 验收标准

- `GET /api/agent/capabilities` 能列出 capability。
- `POST /api/agent/capabilities/[id]/run` 能触发现有功能。
- 异步 run 能查询状态。
- 结果能以统一 JSON 返回。

---

## Phase 2：NexTide CLI MVP

### 目标

让本地 skill 可以稳定调用云端能力。

### 命令

```bash
nextide status
nextide capability list
nextide capability run <id> --input <file> --output <file>
nextide run status <run-id>
nextide run result <run-id> --output <file>
```

### 开发期配置

```bash
NEXTIDE_API_BASE_URL=http://localhost:3000
NEXTIDE_AUTH_TOKEN=dev-token
```

### 验收标准

- CLI 能读取 JSON 输入文件。
- CLI 能调用本地 dev server。
- CLI 能写出 output JSON。
- CLI 对长任务能返回 runId 并轮询。

---

## Phase 3：第一批 Skills 骨架

### 目标

创建第一批 NexTide skills。

### Skills

```text
nextide-shared
nextide-skill-router-cn
xiaohongshu-note-collector
xiaohongshu-card-layout
xiaohongshu-infographic-generator
digital-human-generator
motion-replication
viral-midform-video-generator
social-data-collector
product-selling-point-analysis
viral-breakdown-to-video-prompts
```

### 每个 skill 包含

```text
SKILL.md
references/workflow.md
references/capability-contract.md
references/input-schema.md
references/output-schema.md
scripts/build_input.mjs
scripts/run_capability.mjs
scripts/normalize_output.mjs
templates/example-input.json
```

### 验收标准

- Agent 能正确识别 skill 使用场景。
- Skill 能生成标准 input JSON。
- Skill 能通过 CLI 调用 capability。
- Skill 能读取 output 并生成用户可读报告。

---

## Phase 4：长任务与回调完善

### 目标

处理 60 分钟级任务。

### 任务

- 建立统一 run store。
- 支持 submit-only 模式。
- 支持 status/result 查询。
- 支持 callback timeout。
- 支持 retry/cancel。
- 接入数字人视频、动作复刻、中视频生成。

### 验收标准

- 数字人任务不阻塞 Agent。
- 用户可通过 runId 查询结果。
- 回调重复不会重复扣费。
- 超时任务有清晰状态。

---

## Phase 5：PostPlus-compatible Surface 扩展

### 目标

逐步补齐 PostPlus 全量 skill surface。

### 策略

1. 先建同名兼容壳。
2. 已有 NexTide capability 的 skill 接入真实能力。
3. 未实现能力 fail fast。
4. 通过 `nextide-skill-router-cn` 统一中文路由。

### 优先补齐

```text
xiaohongshu-content-benchmark
xiaohongshu-account-research
xiaohongshu-tools
tiktok-research
tiktok-ad-research
instagram-content-benchmark
instagram-account-research
instagram-audience-voice
facebook-research
youtube-research
benchmark-to-brief
persona-pack
reference-decode
reference-contract-builder
video-request-architect
prompt-preflight-qa
image-batch-runner
video-batch-runner
voice-batch-runner
social-media-publisher
```

---

## 9. 测试与验收

### 9.1 基线测试

根据项目规则，每次代码实现后至少执行：

```bash
npm run lint
npm run typecheck
```

涉及构建、依赖、Next 配置、Prisma 时执行：

```bash
npm run build
```

### 9.2 API 测试

为每个 capability 准备 fixture：

```text
tests/fixtures/agent-capabilities/
  xhs-note-collect.json
  xhs-card-layout.json
  product-analysis.json
```

验证：

- 输入 schema 校验
- capability 路由
- 同步结果
- 异步 run 状态
- 错误码

### 9.3 CLI 测试

验证：

```bash
nextide capability list
nextide capability run xhs.card.layout --input fixture.json --output out.json
nextide run status run_xxx
```

### 9.4 Skill 验收

每个 skill 至少测试：

- 触发描述是否准确
- 是否读取 shared rules
- 是否生成真实 input 文件
- 是否调用正确 capability
- 是否处理失败
- 是否输出用户可读结果

---

## 10. 风险与应对

| 风险 | 说明 | 应对 |
|---|---|---|
| 现有 API 偏 UI，不适合 agent | Web/小程序 API 参数复杂且不稳定 | 新增 agent capability adapter 层 |
| 长任务阻塞 Agent | 数字人/视频可能 60 分钟 | submit-only + runId + status/result 查询 |
| 多平台采集成本高 | TK/Ins/FB 评论和大规模采集成本高 | bounded first pass + 二次确认 |
| n8n 回调失败 | 第三方任务成功但系统未收到回调 | callback timeout + 手动补偿查询 |
| 数据 schema 不统一 | 小红书/TK/Ins/FB 字段差异大 | normalized post/creator/comment schema |
| Skill 数量膨胀 | PostPlus surface 很大 | shared rules + generator + capability registry |
| 闭源能力泄露 | skill 文档写出内部 URL/key/prompt | 只暴露 capability id，不暴露内部实现 |
| 品牌混淆 | 复刻 PostPlus 同名 skills 可能混淆 | 使用 NexTide 品牌，兼容 aliases 而非照搬品牌 |

---

## 11. 非目标

第一阶段不做：

- 不一次性完整实现 PostPlus 51 个 skills 的所有后端能力。
- 不把 n8n 内部节点和私有 prompt 开源。
- 不让 Agent 直接调用敏感内部 webhook。
- 不重构现有小程序/Web UI 功能。
- 不替换现有积分系统，只在 capability 层适配。
- 不要求长任务在一个 Agent 回合内完成。

---

## 12. 建议的第一阶段落地顺序

推荐 P0 顺序：

1. `nextide-shared`
2. Agent Capability Registry
3. `xhs.card.layout`：小红书 MD 卡片排版，链路短、验证快
4. `product.selling_point.analysis`：产品卖点分析，已有 n8n 封装
5. `xhs.note.collect`：小红书笔记采集，打通采集类能力
6. `viral.breakdown.video_prompts`：爆款拆解反推提示词，连接复刻主链路
7. `xhs.infographic.style.extract` + `xhs.infographic.generate`
8. 长任务系统：数字人 / 中视频 / 动作复刻
9. TK/Ins/FB 数据采集与评论抓取
10. 现有 DBS / 卡兹克 / Hook Skills 编入 router

---

## 13. 最终愿景

NexTide Skills 最终应成为 NexTide 的 Agent-native 产品入口：

```text
NexTide SaaS 是工作台
NexTide 小程序是轻量入口
NexTide Skills 是 Agent 入口
NexTide Capability API 是闭源能力边界
```

用户不需要打开复杂后台，也可以直接在 Agent 里调用 NexTide 的内容生产能力：

- 采集爆款
- 分析产品
- 拆解参考
- 写脚本
- 生成卡片
- 生成数字人
- 生成中视频
- 做跨平台内容研究
- 最终形成可发布的素材包

这套结构既能学习 PostPlus 的 skill 产品形态，又能保留 NexTide 自己的闭源工作流、SaaS 资产、积分系统和内容生产优势。
