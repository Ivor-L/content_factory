---
name: wechat-longform-writer
description: 公众号长文写作：使用公众号长文写作 skill 将素材写成公众号长文。
allowed-tools: Read, Write, Bash
---

# 公众号长文写作

Follow shared NexTide rules in:

- `nextide-shared`

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 公众号长文写作

- Capability: `content.wechat.longform.write`
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
- Estimated duration: unknown seconds
- Tags: `wechat`, `longform`, `writing`

Description:

使用公众号长文写作 skill 将素材写成公众号长文。

Examples:

- none

Input fields:

- `material` (string, required)：写作素材。

Output fields:

- `article` (string)：公众号文章。

CLI:

```bash
nextide capability run content.wechat.longform.write \
  --input .nextide/input/content.wechat.longform.write.json \
  --output .nextide/output/content.wechat.longform.write-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/content.wechat.longform.write-result.json'); console.log(r.run && r.run.runId)")
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
