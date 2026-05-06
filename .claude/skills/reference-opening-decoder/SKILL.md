---
name: reference-opening-decoder
description: NexTide 参考视频/参考帧开头结构解码器。把爆款视频、benchmark、分镜、首帧、contact sheet 或粗略参考拆成可复用开头结构：hook essence、viewer question、must-copy visual grammar、product timing、forbidden drift。适合“拆这个参考视频的开头逻辑”“这个爆款为什么前 3 秒抓人”“哪些结构可复制，哪些不能抄”。
allowed-tools: Read, Write
---

# Reference Opening Decoder

Use this skill when a reference exists and the goal is to extract reusable opening logic before prompt writing or video generation.

It is for:

- decoding benchmark videos, frames, contact sheets, or rough references
- separating structure from identity
- deciding what can be copied and what must not be copied
- creating stable handoff to hook design / visual hook / preflight QA

It is not for:

- copying a benchmark literally
- writing the final video prompt by itself
- downloading videos or bypassing platform restrictions

## Core Rule

Do not summarize references as mood words:

```text
good vibe / nice pacing / cinematic energy / premium feeling
```

Extract operating objects:

```text
hookEssence
viewerQuestion
mustCopyVisualGrammar
forbiddenDrift
```

## Required Output

```text
Hook essence:
Viewer question:
Must-copy visual grammar:
Visible scene anchors:
Product timing:
What not to copy:
Forbidden drift:
Next handoff:
```

## Decode Rules

Keep:

- camera grammar
- shot order
- visible object logic
- timing logic
- relationship logic
- first 0-5 seconds promise

Do not keep:

- exact face / creator identity
- exact wardrobe
- exact text overlay
- exact location
- copyrighted brand-specific expression

## NexTide Integration

Use after:

```text
viral.breakdown.video_prompts
social.tiktok.collect
 tiktok-creator-distiller
```

Use before:

```text
short-video-hook-designer
visual-hook-optimizer
video-prompt-preflight-qa
viral-midform-video-generator
```

## No-reference proxy mode

If no benchmark is available, you may decode from the brief, but mark it clearly:

```text
This is proxy decode from the brief, not observed footage.
```

## References

- `references/NOTICE.md`

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 参考开头结构解码

- Capability: `reference.decode`
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
- Estimated duration: 90 seconds
- Tags: `reference`, `hook`, `decode`, `short-video`, `local-agent`

Description:

把爆款参考视频、首帧或分镜拆成可复用开头结构：hook essence、viewer question、must-copy visual grammar、forbidden drift。

Examples:

- 爆款开头结构解码

  ```json
  {
    "referenceSummary": "开头 1 秒是女生在办公室突然把一杯难喝奶昔推开，字幕说：Stop drinking this after lunch。",
    "targetProduct": "便携榨汁杯"
  }
  ```

Input fields:

- `referenceSummary` (string, required)：参考视频/首帧/分镜/benchmark 的描述或已拆解结果。
- `targetProduct` (string)：要迁移到的新产品或内容主题。

Output fields:

- `decodedOpening` (object)：Hook essence、viewer question、must-copy grammar、forbidden drift。

CLI:

```bash
nextide capability run reference.decode \
  --input .nextide/input/reference.decode.json \
  --output .nextide/output/reference.decode-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/reference.decode-result.json'); console.log(r.run && r.run.runId)")
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
