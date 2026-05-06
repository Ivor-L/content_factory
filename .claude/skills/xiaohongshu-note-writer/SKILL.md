---
name: xiaohongshu-note-writer
description: 小红书笔记正文写作：把产品卖点、使用体验、选题或长文素材转成小红书笔记正文，包含开头、正文结构、种草逻辑、标签和合规提醒。
allowed-tools: Read, Write, Bash
---

# 小红书笔记正文写作

Follow shared NexTide rules in:

- `nextide-shared`

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 小红书笔记正文写作

- Capability: `content.xhs.note.write`
- Version: `0.2.0`
- Category: `writing`
- Status: `available`
- Execution: `local_agent`
- Async: `false`
- Cost level: `low`
- Required auth: `nexTideApiKey`
- Required env: `none`
- Required plan: `none`
- Rate limit: `none`
- Estimated credits: 1
- Estimated duration: 90 seconds
- Tags: `xiaohongshu`, `note`, `copywriting`, `local-agent`

Description:

把产品卖点、使用体验、选题或长文素材转成小红书笔记正文，包含开头、正文结构、种草逻辑、标签和合规提醒。

Examples:

- none

Input fields:

- `material` (string, required)：产品信息、体验素材、选题或已有草稿。
- `audience` (string)：目标人群。
- `tone` (string)：语气：真实体验/专业测评/朋友安利/避坑/清单等。
- `complianceLevel` (string)：合规严格度：normal / strict。 默认：`"normal"`

Output fields:

- `note` (object)：标题、开头、正文、CTA、标签、合规提示。

CLI:

```bash
nextide capability run content.xhs.note.write \
  --input .nextide/input/content.xhs.note.write.json \
  --output .nextide/output/content.xhs.note.write-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/content.xhs.note.write-result.json'); console.log(r.run && r.run.runId)")
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
