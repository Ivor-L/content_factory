---
name: visual-hook-optimizer
description: NexTide 视觉开头优化器。用于优化短视频第一帧、前 1-3 秒、小红书封面/首图、AI 视频首镜头，让画面产生明确 viewer question，而不是漂亮但无钩子的产品图。适合“第一帧怎么更抓人”“这个画面开头弱”“帮我设计前 3 秒视觉 hook”“封面怎么让人点”。
allowed-tools: Read, Write
---

# Visual Hook Optimizer

Use this skill when the first frame, first slide, or first 1-3 seconds need stronger stop-scroll logic.

A good visual hook is not merely pretty. It creates a clear reason to keep watching.

## Core Rule

The first image or first 1-3 seconds should make the viewer ask a concrete question:

- What happened?
- Why does it look like that?
- How is this going to change?
- What is that action doing?
- Is this about to get worse or better?

Weak questions:

- What brand is this?
- Why is this product shot here?
- Is this an ad?

## Baseline Checklist

A strong visual hook usually has:

- one obvious subject
- one visible conflict or tension
- one action already in progress
- one understandable evidence detail
- one unfinished outcome that invites the next shot

## Hook Families

1. Pain Evidence
2. Contrast / Transformation
3. Mechanism Curiosity
4. Status Loss / Social Stakes
5. Interrupted Moment
6. Proof Close-Up
7. Aspirational Leisure / Soft Status

## Required Output for creation

```text
Hook family:
First frame / first slide:
Action in progress:
Evidence detail:
Viewer question:
Next shot:
Avoid:
```

## Required Output for critique

```text
Verdict:
What works:
What weakens the stop-scroll:
Specific fix:
Rerun prompt note:
```

## NexTide Integration

Use before:

```text
viral-midform-video-generator
digital-human-generator
motion-replication
xiaohongshu-card-layout
xiaohongshu-infographic-generator
video-prompt-preflight-qa
```

## References

- `references/NOTICE.md`

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 视觉开头优化

- Capability: `content.visual_hook.design`
- Version: `0.2.0`
- Category: `writing`
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
- Tags: `visual-hook`, `first-frame`, `cover`, `short-video`, `local-agent`

Description:

优化短视频第一帧、前 1-3 秒、小红书封面/首图，让画面产生明确 viewer question。

Examples:

- 第一帧视觉 Hook 优化

  ```json
  {
    "visualDescription": "桌上摆着一个便携榨汁杯，背景干净，产品居中。",
    "goal": "让上班族想知道为什么这个杯子能解决下午犯困问题"
  }
  ```

Input fields:

- `visualDescription` (string, required)：当前第一帧/首图/前 3 秒画面描述。
- `goal` (string)：想让观众产生的问题或动作。

Output fields:

- `visualHook` (object)：Hook family、first frame、action、evidence、viewer question、next shot。

CLI:

```bash
nextide capability run content.visual_hook.design \
  --input .nextide/input/content.visual_hook.design.json \
  --output .nextide/output/content.visual_hook.design-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/content.visual_hook.design-result.json'); console.log(r.run && r.run.runId)")
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
