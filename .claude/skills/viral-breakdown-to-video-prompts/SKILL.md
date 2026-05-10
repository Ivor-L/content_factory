---
name: viral-breakdown-to-video-prompts
description: NexTide 爆款拆解并反推视频提示词。调用小程序「爆款复刻 / 智能复刻」viral_clone 分镜拆解链路，适合“拆解这个爆款视频”“反推 Seedance/Veo 视频提示词”“把参考视频变成复刻分镜”。
allowed-tools: Read, Write, Bash
---

# Viral Breakdown To Video Prompts

Follow shared NexTide rules in:

- `nextide-shared`

Use this skill when the user provides a viral video URL or uploaded reference video and wants a reusable breakdown / prompt base.

This skill is now aligned with the miniapp smart remix path:

```text
小程序爆款复刻 → 智能复刻 → viral_clone storyboard breakdown
```

For image-text note/card references, use the image-text replication / Xiaohongshu skills instead.

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

## Mandatory Intake

Before submitting `viral.breakdown.video_prompts`, always confirm the following if the user has not already specified them:

1. Target duration: `15` / `30` / `60` seconds, or custom.
2. Target language: use Chinese labels in the interaction: 跟随原视频 / 中文 / 英文 / 日语 / 韩语 / 西语. Internally map them to `source` / `zh-CN` / `en` / `ja` / `ko` / `es`.
3. Product binding: no product / choose product library product / manually provided product info.
4. Prompt format: `seedance` / `veo` / `generic`.
5. Next step: breakdown only / continue generating video clips.

Do not submit the smart remix job until at least `durationSeconds` and `targetLanguage` are confirmed.

Recommended interactive prompt:

```text
请选择复刻参数：

目标时长：
A. 15 秒
B. 30 秒
C. 60 秒
D. 自定义

目标语言：
A. 跟随原视频
B. 中文
C. 英文
D. 日语
E. 韩语
F. 西语

产品绑定：
A. 不绑定，只拆解提示词
B. 绑定产品库产品
C. 手动提供产品信息

提示词格式：Seedance / Veo / 通用
下一步：只拆解提示词 / 继续生成视频片段
```

## Input: Video Reference

```json
{
  "referenceVideo": "https://.../video.mp4",
  "sourcePlatform": "tiktok",
  "description": "可选参考说明",
  "targetLanguage": "zh-CN",
  "durationSeconds": 15,
  "productId": "可选：用户产品库产品 ID",
  "promptProvider": "seedance"
}
```

The runner calls the miniapp smart remix API:

```text
POST /api/miniapp/storyboard/viral-clone/jobs
```

with `pipeline_key=viral_clone`. It returns a StoryboardTask id and usually enters `waiting_callback` until n8n calls back.

## Output Handling

The callback writes results to:

```text
StoryboardTask.detailedBreakdown
StoryboardSegment.imagePrompt
StoryboardSegment.videoPrompt
```

Initial submit returns:

```json
{
  "taskId": "...",
  "status": "ANALYZING"
}
```

After callback, `nextide run status <run-id>` / `nextide run result <run-id>` should resolve the linked `storyboardTask` and expose the generated segments.

## Prompt Rule

This capability creates the smart-remix storyboard prompt base. To refine final Seedance/Veo prompts, combine with:

- `reference-opening-decoder`
- `video-prompt-preflight-qa`
- `seedance`

## Reference Contract

Always separate:

- learn: hook structure, pacing, scene grammar, information hierarchy
- do not copy: person identity, brand, exact text, logo, creator face, proprietary visual elements

## Rules

- Do not invent or default required intake values. If `durationSeconds` or `targetLanguage` is missing, ask first.
- Do not invent prompts if storyboard breakdown is pending.
- If only a platform post URL is provided and it is not a direct playable video URL, collect/normalize it first with the relevant collector skill.
- Treat this as a smart-remix storyboard breakdown capability, not final video generation.

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
- Tags: `viral-breakdown`, `video-prompts`, `replication`, `viral-clone`, `smart-remix`

Description:

调用小程序「爆款复刻 / 智能复刻」viral_clone 分镜拆解链路，拆解参考视频并生成可用于 Seedance/Veo 的分段 imagePrompt/videoPrompt。

Examples:

- none

Input fields:

- `referenceUrl` (string)：参考爆款视频链接；没有 referenceVideo 时会作为 reference_video_url 使用。
- `referenceVideo` (string)：参考视频 URL，优先使用。
- `productId` (string)：可选，用户产品库中的产品 ID，用于智能复刻替换产品。
- `targetProduct` (object)：目标产品信息；如包含 id/productId 会映射为 product_id。
- `durationSeconds` (number, required)：目标复刻视频时长，秒。必须由用户确认，常用值：15 / 30 / 60。
- `targetLanguage` (string, required)：目标语言。必须由用户用中文选项确认：跟随原视频 / 中文 / 英文 / 日语 / 韩语 / 西语；内部值分别映射为 source / zh-CN / en / ja / ko / es。
- `promptProvider` (string)：目标视频模型或提示词格式。 默认：`"seedance"`

Output fields:

- `taskId` (string)：StoryboardTask ID。
- `status` (string)：任务状态，例如 ANALYZING / BREAKDOWN_COMPLETED。
- `breakdown` (object)：回调完成后写入 StoryboardTask.detailedBreakdown 的爆款拆解结果。
- `videoPrompts` (array)：回调完成后写入 StoryboardSegment.videoPrompt 的分段视频提示词。

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
