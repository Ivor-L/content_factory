---
name: competitor-benchmark-brief
description: 竞品对标 Brief：把竞品链接、账号、文案或观察记录整理成对标 brief：可学什么、不能抄什么、差异化机会和下一步验证任务。
allowed-tools: Read, Write, Bash
---

# 竞品对标 Brief

Follow shared NexTide rules in:

- `nextide-shared`

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 竞品对标 Brief

- Capability: `competitor.benchmark.brief`
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
- Estimated duration: 90 seconds
- Tags: `competitor`, `benchmark`, `brief`, `local-agent`

Description:

把竞品链接、账号、文案或观察记录整理成对标 brief：可学什么、不能抄什么、差异化机会和下一步验证任务。

Examples:

- none

Input fields:

- `references` (string, required)：竞品链接、账号、内容摘要或观察记录。
- `ownProduct` (string)：自己的产品/账号/业务。
- `goal` (string)：对标目标：选题/视觉/转化/账号定位/广告等。

Output fields:

- `brief` (object)：可学习点、禁止复制点、差异机会、验证任务。

CLI:

```bash
nextide capability run competitor.benchmark.brief \
  --input .nextide/input/competitor.benchmark.brief.json \
  --output .nextide/output/competitor.benchmark.brief-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/competitor.benchmark.brief-result.json'); console.log(r.run && r.run.runId)")
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
