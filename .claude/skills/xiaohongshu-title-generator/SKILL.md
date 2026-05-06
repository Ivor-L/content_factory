---
name: xiaohongshu-title-generator
description: 小红书标题生成：根据选题、正文、产品卖点或人群痛点，生成多组小红书标题，并解释每个标题的点击机制与适用场景。
allowed-tools: Read, Write, Bash
---

# 小红书标题生成

Follow shared NexTide rules in:

- `nextide-shared`

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 小红书标题生成

- Capability: `content.xhs.title.generate`
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
- Estimated duration: 45 seconds
- Tags: `xiaohongshu`, `title`, `copywriting`, `local-agent`

Description:

根据选题、正文、产品卖点或人群痛点，生成多组小红书标题，并解释每个标题的点击机制与适用场景。

Examples:

- none

Input fields:

- `topic` (string, required)：选题、产品、正文摘要或内容方向。
- `audience` (string)：目标人群。
- `style` (string)：标题风格：痛点/清单/反差/经验/避坑/测评/情绪等。
- `count` (number)：需要生成的标题数量。 默认：`12`

Output fields:

- `titles` (array)：标题候选，含公式、点击机制、风险提示。

CLI:

```bash
nextide capability run content.xhs.title.generate \
  --input .nextide/input/content.xhs.title.generate.json \
  --output .nextide/output/content.xhs.title.generate-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/content.xhs.title.generate-result.json'); console.log(r.run && r.run.runId)")
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
