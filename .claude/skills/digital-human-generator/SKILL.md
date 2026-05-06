---
name: digital-human-generator
description: NexTide 数字人生成。使用人物图片/视频、音频和口播文本创建图片源或视频源数字人口播任务。适合“生成数字人视频”“用这张人物图做口播”“图片数字人/视频数字人”等请求。
allowed-tools: Read, Write, Bash
---

# Digital Human Generator

Follow shared NexTide rules in:

- `nextide-shared`

Use this skill when the user wants to create a digital human video from:

- person image + audio
- person image + audio + script
- person video + audio

## Capability

Capability id:

```text
digital-human.video.generate
```

CLI contract:

```bash
npm run nextide -- capability run digital-human.video.generate \
  --input .nextide/input/digital-human-video.json \
  --output .nextide/output/digital-human-video-result.json \
  --mode submit \
  --user-api-key <NEX用户积分API_KEY>
```

## Input JSON

Image source lip-sync:

```json
{
  "sourceType": "IMAGE",
  "imageUrl": "https://.../person.png",
  "audioUrl": "https://.../voice.mp3",
  "type": "LIP_SYNC"
}
```

Voice clone / script-aware task:

```json
{
  "sourceType": "IMAGE",
  "personImage": "https://.../person.png",
  "audioUrl": "https://.../voice.mp3",
  "script": "大家好，今天讲一个...",
  "type": "VOICE_CLONE",
  "durationSeconds": 30
}
```

Aliases:

- `personImage` / `sourceImage` → `imageUrl`
- `personVideo` / `sourceVideo` → `videoUrl`
- `voiceUrl` → `audioUrl`
- `script` / `text` → `scriptContent`

## Long-running Rule

Digital human generation can take up to 60 minutes.

The capability usually returns:

```text
waiting_callback
```

The result contains a `data.id`, which is the NexTide `digitalHumanVideo` record id.

Progress can be inspected in NexTide UI or through the underlying API:

```text
GET /api/digital-human/videos/<id>
```

## Output Handling

Expected result shape:

```json
{
  "run": {
    "status": "waiting_callback",
    "result": {
      "data": {
        "id": "...",
        "status": "GENERATING",
        "resultUrl": null
      }
    }
  }
}
```

If `resultUrl` is present, export multimodal artifacts and return the local video/preview paths:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/digital-human-video-result.json'); console.log(r.run && r.run.runId)")
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

## Rules

- Do not wait 60 minutes by default.
- Do not claim the video is finished until `resultUrl` exists or status is completed.
- User must have rights to the face/image/video/audio source.
- This skill does not generate TTS/audio in MVP; require `audioUrl`.

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 视频数字人生成

- Capability: `digital-human.video.generate`
- Version: `0.2.0`
- Category: `video`
- Status: `available`
- Execution: `internal_api`
- Async: `true`
- Cost level: `high`
- Required auth: `nexTideApiKey`
- Required env: `N8N_DIGITAL_HUMAN_WEBHOOK or DIGITAL_HUMAN_WEBHOOK_URL`
- Required plan: `paid`
- Rate limit: `5/minute`, `20/hour`
- Estimated credits: 30
- Estimated duration: 1200 seconds
- Tags: `digital-human`, `video`, `long-running`

Description:

使用人物图、文案和声音生成口播数字人视频。最长可能 60 分钟。

Examples:

- 图片数字人口播

  ```json
  {
    "personImage": "https://example.com/person.png",
    "audioUrl": "https://example.com/audio.mp3",
    "script": "口播文案"
  }
  ```

Input fields:

- `personImage` (string, required)：人物图片 URL。
- `script` (string, required)：口播文案。
- `voiceId` (string)：声音 ID 或预设。
- `duration` (number)：目标时长，秒。

Output fields:

- `videoUrl` (string)：生成视频 URL。
- `taskId` (string)：内部任务 ID。

CLI:

```bash
nextide capability run digital-human.video.generate \
  --input .nextide/input/digital-human.video.generate.json \
  --output .nextide/output/digital-human.video.generate-result.json \
  --mode submit \
  --wait \
  --timeout 3600 \
  --interval 5

RUN_ID=$(node -e "const r=require('./.nextide/output/digital-human.video.generate-result.json'); console.log(r.run && r.run.runId)")
nextide run follow "$RUN_ID" \
  --output-dir .nextide/output/$RUN_ID \
  --timeout 3600 \
  --interval 5
```

Artifact-first reading order:

1. Read `.nextide/output/$RUN_ID/summary.json`.
2. Read `.nextide/output/$RUN_ID/manifest.json`.
3. Return `preview.html` / `gallery.html` with rich preview when supported.
4. Return `datatable.json` for data/table results.
5. Return local artifact paths when present.
6. If a remote URL artifact is present, return the URL from manifest.
7. Only inspect the full result JSON when manifest is insufficient.

## General Rules

- Use NexTide capability IDs, not internal n8n webhook URLs.
- Do not expose API secrets or internal webhook URLs in prompts or output.
- If status is not `available`, fail fast and explain what is missing.
- For async tasks, prefer `--wait` when the user wants a finished result in the same turn.
- After a finished run, use `nextide run artifacts <run-id> --output-dir .nextide/output/<run-id> --download --gallery --datatable` and read `summary.json` then `manifest.json`.
- For long-running runs, prefer `nextide run follow <run-id> --output-dir .nextide/output/<run-id> --timeout 1800 --interval 5`.
- Prefer returning `summary.recommendedResponse.message`, `preview.html`, `datatable.json`, and local artifact paths over pasting huge raw JSON.
- If the CLI output includes `explanation`, convert it into a clear user-facing failure message with next actions.

<!-- END NEXTIDE AUTO-GENERATED -->
