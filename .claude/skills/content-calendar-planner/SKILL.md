---
name: content-calendar-planner
description: 内容日历规划：根据产品、目标人群、渠道和营销目标，规划 7/14/30 天内容日历，包含选题、形式、素材需求和转化目标。
allowed-tools: Read, Write, Bash
---

# 内容日历规划

Follow shared NexTide rules in:

- `nextide-shared`

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 内容日历规划

- Capability: `content.calendar.plan`
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
- Tags: `calendar`, `planning`, `content-strategy`, `local-agent`

Description:

根据产品、目标人群、渠道和营销目标，规划 7/14/30 天内容日历，包含选题、形式、素材需求和转化目标。

Examples:

- none

Input fields:

- `product` (string, required)：产品、账号或业务描述。
- `audience` (string)：目标人群。
- `days` (number)：规划天数。 默认：`14`
- `platforms` (array)：平台列表。

Output fields:

- `calendar` (array)：按日期/阶段排列的内容计划。

CLI:

```bash
nextide capability run content.calendar.plan \
  --input .nextide/input/content.calendar.plan.json \
  --output .nextide/output/content.calendar.plan-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/content.calendar.plan-result.json'); console.log(r.run && r.run.runId)")
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
