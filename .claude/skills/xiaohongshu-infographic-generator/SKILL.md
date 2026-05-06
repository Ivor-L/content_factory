---
name: xiaohongshu-infographic-generator
description: 小红书信息卡片风格提炼与生成。适合“提炼这组卡片风格”“用这个风格生成信息卡片”“生成小红书知识信息图”等请求。
allowed-tools: Read, Write, Bash
---

# Xiaohongshu Infographic Generator

Follow shared NexTide rules in:

- `nextide-shared`

This skill has two related capabilities:

1. Style extraction from reference cards.
2. Infographic/card generation from topic + content + style preset.

## Capability A: Style Extraction

Capability id:

```text
xhs.infographic.style.extract
```

Use this when the user wants to analyze visual style from reference images.

CLI contract:

```bash
npm run nextide -- capability run xhs.infographic.style.extract \
  --input .nextide/input/xhs-style-extract.json \
  --output .nextide/output/xhs-style-extract-result.json \
  --mode submit \
  --user-api-key <NEX用户积分API_KEY>
```

Input JSON:

```json
{
  "referenceImages": ["/absolute/path/to/reference.png"],
  "styleName": "高密度知识卡",
  "styleGoal": "适合知识卡片/小红书封面风格",
  "sceneType": "图文讲解详情图"
}
```

The runner supports the first image from `referenceImages` as either a local file path or `http(s)` URL. Style extraction is async; the style preset is created immediately and Style DNA is written back after callback.

## Capability B: Infographic Generation

Capability id:

```text
xhs.infographic.generate
```

CLI contract:

```bash
npm run nextide -- capability run xhs.infographic.generate \
  --input .nextide/input/xhs-infographic-generate.json \
  --output .nextide/output/xhs-infographic-generate-result.json \
  --mode submit \
  --user-api-key <NEX用户积分API_KEY>
```

## Input JSON

```json
{
  "title": "为什么 30 岁后更需要抗炎护肤",
  "text": "正文内容...",
  "styleId": "style_preset_id",
  "imageCount": 3,
  "language": "简体"
}
```

Aliases accepted by runner:

- `topic` → `title`
- `content` / `markdown` → `text`
- `stylePresetId` → `styleId`
- `pageCount` → `imageCount`

## Workflow

1. Confirm whether the user wants style extraction or card generation.
2. For generation, require a `styleId` from NexTide style library.
3. Create `.nextide/input/xhs-infographic-generate.json`.
4. Run the capability command.
5. Report returned `taskId` and async status.
6. Tell the user that card images complete through NexTide callback/UI when the workflow finishes.

## Output Handling

Expected result shape:

```json
{
  "run": {
    "status": "waiting_callback",
    "result": {
      "data": {
        "taskId": "...",
        "summaryId": "..."
      },
      "queued": true,
      "note": "XHS infographic generation is async..."
    }
  }
}
```

## Rules

- Do not claim generated images are ready until callback completes.
- Do not invent style IDs.
- If user only gives reference images but no styleId, route to style extraction first.
- If content is too long, suggest fewer cards or a summarized card plan first.
