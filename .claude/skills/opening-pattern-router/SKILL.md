---
name: opening-pattern-router
description: NexTide 短视频开头模式路由器。用于在写 hook/prompt/storyboard 前，先判断短视频开头应该走哪种路线：自我识别、证明优先、好奇缺口、打断模式、社会后果、生活方式吸引等。适合“这个开头该走什么路线”“帮我先定 hook 方向”“不知道该用哪种开头机制”。
allowed-tools: Read, Write
---

# Opening Pattern Router

Use this skill at the start of hook design.

It is for:

- choosing the right opening route before prompt writing
- mapping a brief into a concrete stop-scroll job
- reducing prompt drift when references are uneven
- handing off to `short-video-hook-designer`

## Core Rule

Do not start from taste words:

```text
viral / premium / cinematic / scroll-stopping
```

Start from:

```text
segment type
viewer question
opening mechanism
product reveal timing
```

## Segment types

- hook
- benefit
- cta
- creator
- lifestyle
- testimonial

## Pattern families

- self-recognition first
- proof first
- curiosity gap
- pattern interrupt
- social consequence
- lifestyle pull

## Required Output

```text
Segment type:
Primary pattern:
Support pattern:
Viewer question:
Opening mechanism:
Product reveal rule:
Need explicit hook mechanism:
Why this route fits:
Next skill:
```

## Handoff

- mechanism unclear → `short-video-hook-designer`
- reference exists → `reference-opening-decoder`
- visual first frame problem → `visual-hook-optimizer`
- prompt already drafted → `video-prompt-preflight-qa`

## References

- `references/NOTICE.md`

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 短视频开头模式路由

- Capability: `content.opening_pattern.route`
- Version: `0.2.0`
- Category: `writing`
- Status: `available`
- Execution: `local_agent`
- Async: `false`
- Cost level: `free`
- Required auth: `nexTideApiKey`
- Required env: `none`
- Required plan: `none`
- Rate limit: `none`
- Estimated credits: 0
- Estimated duration: 45 seconds
- Tags: `hook-router`, `opening-pattern`, `short-video`, `local-agent`

Description:

在写 hook/prompt/storyboard 前判断开头路线：自我识别、证明优先、好奇缺口、打断模式、社会后果或生活方式吸引。

Examples:

- 短视频开头路线选择

  ```json
  {
    "brief": "便携榨汁杯，面向办公室人群，希望突出健康和方便。",
    "segmentType": "hook"
  }
  ```

Input fields:

- `brief` (string, required)：短视频任务、产品、观众或已有开头想法。
- `segmentType` (string)：hook / benefit / cta / creator / lifestyle / testimonial。

Output fields:

- `routeSummary` (object)：Segment type、primary pattern、viewer question、product reveal rule、next skill。

CLI:

```bash
nextide capability run content.opening_pattern.route \
  --input .nextide/input/content.opening_pattern.route.json \
  --output .nextide/output/content.opening_pattern.route-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/content.opening_pattern.route-result.json'); console.log(r.run && r.run.runId)")
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
