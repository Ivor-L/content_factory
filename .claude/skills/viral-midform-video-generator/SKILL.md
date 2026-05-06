---
name: viral-midform-video-generator
description: NexTide 爆款中视频生成。接入小程序/我的作品 T2V 中视频分镜规划链路，支持 3D 骨骼主题；没有现成 creativeTaskId 时会自动创建 NexTide 任务。适合“生成 3D 骨骼中视频”“把这段文案做成中视频分镜”等请求。
allowed-tools: Read, Write, Bash
---

# Viral Midform Video Generator

Follow shared NexTide rules in:

- `nextide-shared`

Use this skill when the user wants to generate a midform/video storyboard workflow from a script, topic, or existing creative task content.

## Capability

Capability id:

```text
viral.midform.video.generate
```

CLI contract:

```bash
npm run nextide -- capability run viral.midform.video.generate \
  --input .nextide/input/viral-midform-video.json \
  --output .nextide/output/viral-midform-video-result.json \
  --mode submit \
  --user-api-key <NEX用户积分API_KEY>
```

## Scope

This capability triggers NexTide's T2V storyboard planning API:

```text
/api/my-works/t2v
```

If `creativeTaskId` / `taskId` is omitted, NexTide creates a `CreativeTask` automatically and then triggers T2V.

The n8n callback writes results back to the creative task metadata:

```text
t2v_status
t2v_storyboard_id
```

and creates a `StoryboardTask` plus `StoryboardSegment` records.

## Input JSON

```json
{
  "title": "久坐为什么让肩颈越来越僵",
  "scriptText": "完整中视频脚本文案...",
  "theme": "3d-skeleton",
  "allowText": false
}
```

Aliases:

- `creativeTaskId` / `creative_task_id` → `taskId`
- `topic` → `title`
- `script` / `content` / `text` → `scriptText`
- `category` → `theme`

## Output Handling

Expected immediate result:

```json
{
  "run": {
    "status": "waiting_callback",
    "result": {
      "ok": true,
      "taskId": "...",
      "theme": "3d-skeleton"
    }
  }
}
```

After callback, inspect the creative task in NexTide UI or DB metadata for:

```text
t2v_status = done
t2v_storyboard_id = ...
```

## Rules

- Do not claim final videos are generated at this stage.
- This MVP creates/plans storyboard segments; downstream image/video generation happens in storyboard workflows.
- If user does not have an existing creative task, omit `taskId`; standalone task creation is supported.
- Default theme is `3d-skeleton`.
