---
name: viral-breakdown-to-video-prompts
description: NexTide 爆款拆解并反推视频提示词。MVP 接入图文复刻任务创建与视频文案提取链路，适合“拆解这个爆款”“提取视频文案并反推提示词”“把参考内容变成复刻基底”等请求。
allowed-tools: Read, Write, Bash
---

# Viral Breakdown To Video Prompts

Follow shared NexTide rules in:

- `nextide-shared`

Use this skill when the user provides:

- a viral video URL
- a viral image-text note/card reference
- source title/text/images already collected from a platform

and wants a reusable breakdown or prompt base.

## Capability

Capability id:

```text
viral.breakdown.video_prompts
```

CLI contract:

```bash
npm run nextide -- capability run viral.breakdown.video_prompts \
  --input .nextide/input/viral-breakdown-video-prompts.json \
  --output .nextide/output/viral-breakdown-video-prompts-result.json \
  --mode submit \
  --user-api-key <NEX用户积分API_KEY>
```

## Input: Video Reference

```json
{
  "referenceVideo": "https://.../video.mp4",
  "sourcePlatform": "tiktok",
  "description": "可选参考说明",
  "language": "zh-CN"
}
```

The runner calls video copy extraction. If callback URL is configured, it may return `waiting_callback`.

## Input: Image-text Reference

```json
{
  "sourceTitle": "爆款标题",
  "sourceText": "原文正文...",
  "sourceImages": ["https://.../1.png"],
  "sourcePlatform": "xiaohongshu",
  "sourceUrl": "https://..."
}
```

The runner creates an image-text replication task.

## Output Handling

Video path may return transcript/copy data synchronously or pending async status.

Image-text path returns:

```json
{
  "taskId": "...",
  "status": "BREAKDOWN_COMPLETED"
}
```

## Prompt Rule

This capability creates/extracts the source base. To produce final Seedance/Veo prompts, combine with:

- `reference-decode`
- `reference-contract-builder`
- `video-request-architect`
- `prompt-preflight-qa`
- `seedance`

## Reference Contract

Always separate:

- learn: hook structure, pacing, scene grammar, information hierarchy
- do not copy: person identity, brand, exact text, logo, creator face, proprietary visual elements

## Rules

- Do not invent transcript or prompts if extraction is pending.
- If only a platform post URL is provided, collect it first with the relevant collector skill.
- Treat this as a source-prep capability, not final video generation.

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 爆款拆解并反推视频提示词

- Capability: `viral.breakdown.video_prompts`
- Version: `0.2.0`
- Category: `video`
- Status: `available`
- Execution: `internal_api`
- Async: `true`
- Cost level: `medium`
- Required auth: `nexTideApiKey`
- Required env: `none`
- Required plan: `none`
- Rate limit: `10/minute`, `60/hour`
- Estimated credits: 8
- Estimated duration: 180 seconds
- Tags: `viral-breakdown`, `video-prompts`, `replication`

Description:

拆解爆款视频/图文结构，并反推可用于视频模型的提示词与 reference contract。MVP 接入图文复刻任务创建与视频文案提取链路。

Examples:

- none

Input fields:

- `referenceUrl` (string)：参考爆款链接。
- `referenceVideo` (string)：参考视频 URL。
- `targetProduct` (object)：目标产品信息。
- `promptProvider` (string)：目标视频模型或提示词格式。 默认：`"seedance"`

Output fields:

- `breakdown` (object)：爆款拆解结果。
- `referenceContract` (object)：学习/禁止复制契约。
- `videoPrompts` (array)：分段视频提示词。

CLI:

```bash
nextide capability run viral.breakdown.video_prompts \
  --input .nextide/input/viral.breakdown.video_prompts.json \
  --output .nextide/output/viral.breakdown.video_prompts-result.json \
  --mode submit \
  --wait \
  --timeout 900 \
  --interval 5

RUN_ID=$(node -e "const r=require('./.nextide/output/viral.breakdown.video_prompts-result.json'); console.log(r.run && r.run.runId)")
nextide run follow "$RUN_ID" \
  --output-dir .nextide/output/$RUN_ID \
  --timeout 900 \
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
