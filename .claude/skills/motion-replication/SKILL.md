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

If `resultUrl` is present, export multimodal artifacts and return the local video/preview paths:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/motion-replication-result.json'); console.log(r.run && r.run.runId)")
npm run nextide -- run artifacts "$RUN_ID" \
  --output-dir .nextide/output/$RUN_ID \
  --download \
  --gallery
```

Return:

- generated video URL
- local downloaded video path if available
- `preview.html` path if generated
- status/task id

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

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 动作复刻

- Capability: `motion.replication.image_to_video`
- Version: `0.2.0`
- Category: `video`
- Status: `available`
- Execution: `internal_api`
- Async: `true`
- Cost level: `high`
- Required auth: `nexTideApiKey`
- Required env: `N8N_ACTION_TRANSFER_WEBHOOK`
- Required plan: `paid`
- Rate limit: `5/minute`, `20/hour`
- Estimated credits: 30
- Estimated duration: 900 seconds
- Tags: `motion`, `replication`, `image-to-video`

Description:

使用一张人物图片，让图片人物按参考视频动作生成视频。

Examples:

- none

Input fields:

- `personImage` (string, required)：待驱动人物图片。
- `motionReferenceVideo` (string, required)：动作参考视频。
- `duration` (number)：目标时长，秒。 默认：`5`

Output fields:

- `videoUrl` (string)：动作复刻视频 URL。

CLI:

```bash
nextide capability run motion.replication.image_to_video \
  --input .nextide/input/motion.replication.image_to_video.json \
  --output .nextide/output/motion.replication.image_to_video-result.json \
  --mode submit \
  --wait \
  --timeout 3600 \
  --interval 5

RUN_ID=$(node -e "const r=require('./.nextide/output/motion.replication.image_to_video-result.json'); console.log(r.run && r.run.runId)")
nextide run artifacts "$RUN_ID" \
  --output-dir .nextide/output/$RUN_ID
```

Artifact-first reading order:

1. Read `.nextide/output/$RUN_ID/manifest.json`.
2. Return local artifact paths when present.
3. If a remote URL artifact is present, return the URL from manifest.
4. Only inspect the full result JSON when manifest is insufficient.

## General Rules

- Use NexTide capability IDs, not internal n8n webhook URLs.
- Do not expose API secrets or internal webhook URLs in prompts or output.
- If status is not `available`, fail fast and explain what is missing.
- For async tasks, prefer `--wait` when the user wants a finished result in the same turn.
- After a finished run, use `nextide run artifacts <run-id> --output-dir .nextide/output/<run-id>` and read `manifest.json` first.
- Prefer returning local artifact paths from `manifest.json` over pasting huge raw JSON.

<!-- END NEXTIDE AUTO-GENERATED -->
