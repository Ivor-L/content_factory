---
name: xiaohongshu-card-layout
description: 将 Markdown 文档、长文、备忘录、脚本或结构化正文排版成小红书 3:4 图文卡片。适合“把这篇 md 做成小红书卡片”“排版成图文卡片”“生成小红书轮播图”等请求。
allowed-tools: Read, Write, Bash
---

# Xiaohongshu Card Layout

Follow shared NexTide rules in:

- `nextide-shared`

Use this skill when the user wants to:

- 把 Markdown 文档排版成小红书图文卡片
- 把长文/公众号/备忘录切成 3:4 卡片
- 生成小红书轮播图页面
- 保留原文但增强信息层级和视觉排版
- 输出可预览/可下载的卡片图片 URL

Do not use this skill for:

- 从零写小红书正文：用写作类 skill
- 爆款笔记采集：用 `xiaohongshu-note-collector`
- 信息图生图：用 `xiaohongshu-infographic-generator`

## Capability

Capability id:

```text
xhs.card.layout
```

CLI contract:

```bash
npm run nextide -- capability run xhs.card.layout \
  --input .nextide/input/xhs-card-layout.json \
  --output .nextide/output/xhs-card-layout-result.json \
  --mode wait
```

## Input JSON

Write a real JSON file:

```json
{
  "markdown": "# 标题\n\n正文...",
  "title": "可选标题",
  "templateId": "minimal",
  "includeCover": true,
  "maxPages": 8,
  "persist": false
}
```

Field rules:

- `markdown` is required.
- `title` is optional; if omitted, NexTide extracts a title.
- `templateId` can be omitted unless the user specifies a style.
- `maxPages` should usually be 6-10.
- `persist=false` by default for agent tests unless the user wants it saved to NexTide projects.

## Workflow

1. Read or receive the Markdown content.
2. If the content is not already Markdown, convert it lightly without changing wording.
3. Create `.nextide/input/xhs-card-layout.json`.
4. Run the capability command.
5. Read `.nextide/output/xhs-card-layout-result.json`.
6. Export multimodal artifacts when the user wants preview/download:

   ```bash
   RUN_ID=$(node -e "const r=require('./.nextide/output/xhs-card-layout-result.json'); console.log(r.run && r.run.runId)")
   npm run nextide -- run artifacts "$RUN_ID" \
     --output-dir .nextide/output/$RUN_ID \
     --download \
     --gallery
   ```

7. Return the generated image URLs, local image paths, `gallery.html`, and any useful task metadata.

## Output Handling

Expected successful result shape:

```json
{
  "run": {
    "status": "succeeded",
    "result": {
      "data": {
        "taskId": "",
        "title": "...",
        "templateId": "...",
        "images": ["https://..."]
      }
    },
    "artifacts": [
      { "type": "image", "url": "https://...", "name": "xhs-card-1.png" }
    ]
  }
}
```

Return:

- status
- title
- template used
- card image URLs
- local downloaded image paths if artifact export was run
- `gallery.html` path if generated
- note if the run failed and why

## Quality Rules

- Do not rewrite the user’s source text unless explicitly asked.
- Preserve dense information if the user gave a memo-style source.
- If a source is too long, tell the user it may need pagination or maxPages increase.
- Do not invent image URLs if generation fails.

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 小红书图文排版

- Capability: `xhs.card.layout`
- Version: `0.2.0`
- Category: `xhs`
- Status: `available`
- Execution: `internal_api`
- Async: `false`
- Cost level: `low`
- Required auth: `nexTideApiKey`
- Required env: `none`
- Required plan: `none`
- Rate limit: `none`
- Estimated credits: 1
- Estimated duration: 20 seconds
- Tags: `xiaohongshu`, `layout`, `markdown`, `cards`

Description:

将 Markdown 文档排版并渲染为小红书 3:4 卡片图片。

Examples:

- Markdown 生成小红书卡片

  ```json
  {
    "title": "AI 工具清单",
    "markdown": "# AI 工具清单\n\n- Claude\n- NexTide",
    "includeCover": true,
    "maxPages": 6
  }
  ```

Input fields:

- `markdown` (string, required)：要排版的 Markdown 正文。
- `title` (string)：卡片标题。为空时自动从 Markdown 提取。
- `templateId` (string)：卡片模板 ID。 默认：`"minimal"`
- `includeCover` (boolean)：是否生成封面页。 默认：`true`
- `maxPages` (number)：最多生成页数。 默认：`8`
- `persist` (boolean)：是否保存为创作任务。 默认：`false`

Output fields:

- `taskId` (string)：保存任务 ID；persist=false 时为空。
- `title` (string)：渲染标题。
- `templateId` (string)：实际使用模板。
- `images` (string[])：生成的卡片图片 URL。

CLI:

```bash
nextide capability run xhs.card.layout \
  --input .nextide/input/xhs.card.layout.json \
  --output .nextide/output/xhs.card.layout-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/xhs.card.layout-result.json'); console.log(r.run && r.run.runId)")
nextide run artifacts "$RUN_ID" \
  --output-dir .nextide/output/$RUN_ID
```

## General Rules

- Use NexTide capability IDs, not internal n8n webhook URLs.
- Do not expose API secrets or internal webhook URLs in prompts or output.
- If status is not `available`, fail fast and explain what is missing.
- For async tasks, prefer `--wait` when the user wants a finished result in the same turn.
- After a finished run, use `nextide run artifacts <run-id> --output-dir .nextide/output/<run-id>` and read `manifest.json` first.
- Prefer returning local artifact paths from `manifest.json` over pasting huge raw JSON.

<!-- END NEXTIDE AUTO-GENERATED -->
