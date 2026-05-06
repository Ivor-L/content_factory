---
name: short-video-storyboard-planner
description: 短视频分镜脚本规划：把 Hook brief、产品卖点或内容选题转成短视频分镜脚本，包含镜头、画面、台词、字幕、产品露出和 AI 视频提示词草案。
allowed-tools: Read, Write, Bash
---

# 短视频分镜脚本规划

Follow shared NexTide rules in:

- `nextide-shared`

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 短视频分镜脚本规划

- Capability: `script.storyboard.plan`
- Version: `0.2.0`
- Category: `system`
- Status: `available`
- Execution: `local_agent`
- Async: `false`
- Cost level: `low`
- Required auth: `nexTideApiKey`
- Required env: `none`
- Required plan: `none`
- Rate limit: `none`
- Estimated credits: 1
- Estimated duration: 120 seconds
- Tags: `storyboard`, `short-video`, `script`, `prompt`, `local-agent`

Description:

把 Hook brief、产品卖点或内容选题转成短视频分镜脚本，包含镜头、画面、台词、字幕、产品露出和 AI 视频提示词草案。

Examples:

- none

Input fields:

- `brief` (string, required)：Hook brief、产品卖点、选题或脚本需求。
- `durationSeconds` (number)：目标视频时长。 默认：`30`
- `style` (string)：视频风格或平台。

Output fields:

- `storyboard` (array)：分镜脚本，含镜头、台词、字幕、视觉提示词。

CLI:

```bash
nextide capability run script.storyboard.plan \
  --input .nextide/input/script.storyboard.plan.json \
  --output .nextide/output/script.storyboard.plan-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/script.storyboard.plan-result.json'); console.log(r.run && r.run.runId)")
nextide run artifacts "$RUN_ID" \
  --output-dir .nextide/output/$RUN_ID \
  --download \
  --gallery \
  --datatable
```

Then read `summary.json` first, followed by `manifest.json`.

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
