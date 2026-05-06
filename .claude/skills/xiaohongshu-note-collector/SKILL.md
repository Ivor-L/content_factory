---
name: xiaohongshu-note-collector
description: 采集小红书笔记链接并沉淀到 NexTide 爆款广场/我的分类/viral references。适合“采集这个小红书链接”“把这条笔记加入爆款广场”“收集小红书爆款笔记”等请求。
allowed-tools: Read, Write, Bash
---

# Xiaohongshu Note Collector

Follow shared NexTide rules in:

- `nextide-shared`

Use this skill when the user wants to:

- 采集一个或多个小红书笔记链接
- 把小红书图文/视频保存到 NexTide 爆款广场或“我的”分类
- 为图文复刻、爆款拆解、卡片生成准备参考素材

MVP scope:

- Supports direct Xiaohongshu note URL collection.
- Keyword search collection is registered in NexTide capability registry but not wired to production runner yet.

## Capability

Capability id:

```text
xhs.note.collect
```

CLI contract:

```bash
npm run nextide -- capability run xhs.note.collect \
  --input .nextide/input/xhs-note-collect.json \
  --output .nextide/output/xhs-note-collect-result.json \
  --mode wait \
  --user-api-key <NEX用户积分API_KEY>
```

## Input JSON

Single URL:

```json
{
  "source": "url",
  "url": "https://www.xiaohongshu.com/explore/...",
  "saveToHotSquare": true
}
```

Multiple URLs:

```json
{
  "source": "url",
  "urls": [
    "https://www.xiaohongshu.com/explore/...",
    "https://xhslink.com/..."
  ],
  "saveToHotSquare": true
}
```

## Workflow

1. Extract Xiaohongshu URLs from user input.
2. Create `.nextide/input/xhs-note-collect.json`.
3. Run the capability command.
4. Read `.nextide/output/xhs-note-collect-result.json`.
5. Return saved task IDs, titles, statuses, video URLs if any, and errors if partial failure occurs.

## Output Handling

Expected result shape:

```json
{
  "run": {
    "status": "succeeded",
    "result": {
      "items": [
        {
          "url": "https://...",
          "result": {
            "taskId": "...",
            "status": "BREAKDOWN_PENDING",
            "title": "...",
            "videoUrl": null,
            "message": "采集成功，已加入“我的”分类"
          }
        }
      ],
      "errors": []
    }
  }
}
```

If the note is an image note, NexTide may asynchronously trigger image-text breakdown after collection.

If the note is a video note, status may be `VIDEO_COLLECTED`.

## Rules

- Do not invent note metadata if collection fails.
- Do not treat keyword search as available in MVP.
- For multiple URLs, report partial failures clearly.
- Do not ask the user to paste cookies; NexTide server handles downloader configuration.
