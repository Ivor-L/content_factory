---
name: motion-replication
description: NexTide 动作复刻。使用一张人物图片，让图片中的人物按照参考视频的人物动作生成视频。适合“让这张图的人做视频里的动作”“动作迁移”“动作复刻”等请求。
allowed-tools: Read, Write, Bash
---

# Motion Replication

Follow shared NexTide rules in:

- `nextide-shared`

Use this skill when the user provides:

- a person/source image
- a motion/reference video

and wants the source person to follow the motion in the reference video.

## Capability

Capability id:

```text
motion.replication.image_to_video
```

CLI contract:

```bash
npm run nextide -- capability run motion.replication.image_to_video \
  --input .nextide/input/motion-replication.json \
  --output .nextide/output/motion-replication-result.json \
  --mode submit \
  --user-api-key <NEX用户积分API_KEY>
```

## Input JSON

```json
{
  "imageUrl": "https://.../person.png",
  "referenceVideoUrl": "https://.../motion.mp4",
  "durationSeconds": 5
}
```

Aliases:

- `personImage` / `sourceImage` → `imageUrl`
- `motionReferenceVideo` / `videoUrl` → `referenceVideoUrl`

## Output Handling

This is a long-running task.

Expected immediate result:

```json
{
  "run": {
    "status": "waiting_callback",
    "result": {
      "data": {
        "id": "...",
        "type": "ACTION_TRANSFER",
        "status": "GENERATING",
        "resultUrl": null
      }
    }
  }
}
```

If `resultUrl` is present, return the generated video URL.

## Reference Contract

The task should learn:

- body motion
- rhythm
- pose transitions
- camera/action timing

Do not copy:

- reference person identity
- face
- clothing branding
- text overlays
- unique scene/background details

## Rules

- Do not wait for completion by default.
- Tell the user the returned id is a NexTide digitalHumanVideo record with type `ACTION_TRANSFER`.
- Do not invent result URLs.
