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
6. Return the generated image URLs and any useful task metadata.

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
- note if the run failed and why

## Quality Rules

- Do not rewrite the user’s source text unless explicitly asked.
- Preserve dense information if the user gave a memo-style source.
- If a source is too long, tell the user it may need pagination or maxPages increase.
- Do not invent image URLs if generation fails.
