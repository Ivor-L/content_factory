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

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 爆款中视频生成

- Capability: `viral.midform.video.generate`
- Version: `0.2.0`
- Category: `video`
- Status: `available`
- Execution: `internal_api`
- Async: `true`
- Cost level: `high`
- Required auth: `nexTideApiKey`
- Required env: `N8N_T2V_WEBHOOK`
- Required plan: `paid`
- Rate limit: `5/minute`, `20/hour`
- Estimated credits: 25
- Estimated duration: 1200 seconds
- Tags: `midform-video`, `storyboard`, `3d-skeleton`

Description:

生成 3D 骨骼等主题化中视频，未来支持更多主题。

Examples:

- 3D 骨骼中视频 standalone

  ```json
  {
    "title": "久坐为什么让肩颈越来越僵",
    "scriptText": "完整脚本文案...",
    "theme": "3d-skeleton",
    "allowText": false
  }
  ```

Input fields:

- `theme` (string, required)：中视频主题。 默认：`"3d-skeleton"`
- `topic` (string, required)：视频主题或选题。
- `duration` (number)：目标时长，秒。 默认：`60`

Output fields:

- `script` (string)：生成脚本。
- `finalVideoUrl` (string)：最终视频 URL。
- `segments` (array)：分段视频结果。

CLI:

```bash
nextide capability run viral.midform.video.generate \
  --input .nextide/input/viral.midform.video.generate.json \
  --output .nextide/output/viral.midform.video.generate-result.json \
  --mode submit \
  --wait \
  --timeout 3600 \
  --interval 5

RUN_ID=$(node -e "const r=require('./.nextide/output/viral.midform.video.generate-result.json'); console.log(r.run && r.run.runId)")
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
