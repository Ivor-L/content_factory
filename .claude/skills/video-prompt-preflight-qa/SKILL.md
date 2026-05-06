---
name: video-prompt-preflight-qa
description: NexTide 视频生成前 Prompt QA。用于在消耗积分前检查短视频 prompt、分镜、爆款复刻请求或 AI 视频生成请求，识别弱开头、产品过早露出、viewer question 不清、漂移风险、缺少负向约束、UGC 真实感不足和输出格式错误。适合“生成前帮我检查”“这个提示词能不能跑”“别浪费积分先 QA 一下”。
allowed-tools: Read, Write
---

# Video Prompt Preflight QA

Use this skill immediately before NexTide video/image generation or batch generation.

It is for:

- checking prompt quality before credits are spent
- catching weak openings and early product reveal
- identifying drift risk from vague prompts
- producing concise fix notes for rerun
- deciding whether a generation task can run now

It is not for:

- original hook creation → use `short-video-hook-designer`
- reference decoding → use `reference-opening-decoder`
- first-frame design → use `visual-hook-optimizer`

## Core Rule

Judge prompt quality by controllability, not impressive prose.

## Checklist

Check:

- opening strength
- first 1-3 seconds mechanism legibility
- viewer question clarity
- visible evidence / proof path
- promise-delivery match
- product reveal timing
- ad-detection risk
- negative constraints
- realism / UGC control
- identity/product consistency constraints
- output format correctness
- cost/risk if batch or high-cost generation

## Required Output

```text
Verdict:
Major risks:
- ...
Missing fields:
- ...
Likely drift:
- ...
Fix now:
- ...
Can run now:
```

Verdict values:

```text
PASS
PASS_WITH_FIXES
RISKY_DO_NOT_RUN
UNDER_SPECIFIED
```

## Blame Rule

Point weak prompts to the right upstream stage:

- bad route → `short-video-hook-designer`
- benchmark unclear → `reference-opening-decoder`
- frame one weak → `visual-hook-optimizer`
- generation payload missing required fields → target NexTide generation skill

## NexTide Generation Guard

Before high/variable-cost runs, remind the user to use bounded inputs and cost confirmation when available:

```text
--max-credits
--yes only after review
```

Never silently approve large batch generation with vague prompts.

## References

- `references/NOTICE.md`

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 视频提示词生成前 QA

- Capability: `prompt.preflight.qa`
- Version: `0.2.0`
- Category: `system`
- Status: `available`
- Execution: `local_agent`
- Async: `false`
- Cost level: `free`
- Required auth: `none`
- Required env: `none`
- Required plan: `none`
- Rate limit: `none`
- Estimated credits: 0
- Estimated duration: 60 seconds
- Tags: `prompt-qa`, `preflight`, `video`, `cost-guard`, `local-agent`

Description:

在消耗积分前检查短视频 prompt、分镜或 AI 视频生成请求，识别弱开头、产品过早露出、漂移风险和缺少约束。

Examples:

- 视频生成前 QA

  ```json
  {
    "prompt": "生成一个 15 秒产品种草视频，开头展示便携榨汁杯，然后女生说它很好用。",
    "targetCapability": "viral.midform.video.generate"
  }
  ```

Input fields:

- `prompt` (string, required)：准备执行的视频/图片生成 prompt 或 storyboard。
- `targetCapability` (string)：计划调用的 NexTide capability，例如 viral.midform.video.generate。

Output fields:

- `verdict` (string)：PASS / PASS_WITH_FIXES / RISKY_DO_NOT_RUN / UNDER_SPECIFIED。
- `fixes` (array)：必须修复的问题。

CLI:

```bash
nextide capability run prompt.preflight.qa \
  --input .nextide/input/prompt.preflight.qa.json \
  --output .nextide/output/prompt.preflight.qa-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/prompt.preflight.qa-result.json'); console.log(r.run && r.run.runId)")
nextide run artifacts "$RUN_ID" \
  --output-dir .nextide/output/$RUN_ID
```

## General Rules

- Use NexTide capability IDs, not internal n8n webhook URLs.
- Do not expose API secrets or internal webhook URLs in prompts or output.
- If status is not `available`, fail fast and explain what is missing.
- For async tasks, prefer `--wait` when the user wants a finished result in the same turn.
- After a finished run, use `nextide run artifacts <run-id> --output-dir .nextide/output/<run-id>` and read `manifest.json` first.
- Prefer returning local artifact paths from `manifest.json` over pasting huge raw JSON.

<!-- END NEXTIDE AUTO-GENERATED -->
