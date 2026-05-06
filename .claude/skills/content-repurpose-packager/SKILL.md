---
name: content-repurpose-packager
description: 内容一鱼多吃打包：把一份长文、产品分析、直播复盘或爆款拆解，拆成小红书、短视频、朋友圈、公众号、广告文案等多平台内容包。
allowed-tools: Read, Write, Bash
---

# 内容一鱼多吃打包

Follow shared NexTide rules in:

- `nextide-shared`

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 内容一鱼多吃打包

- Capability: `content.repurpose.pack`
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
- Estimated duration: 120 seconds
- Tags: `repurpose`, `multi-platform`, `content-pack`, `local-agent`

Description:

把一份长文、产品分析、直播复盘或爆款拆解，拆成小红书、短视频、朋友圈、公众号、广告文案等多平台内容包。

Examples:

- none

Input fields:

- `source` (string, required)：原始素材或文章。
- `targetPlatforms` (array)：目标平台列表，如 xhs/douyin/wechat/moments/ads。
- `campaignGoal` (string)：转化目标或传播目标。

Output fields:

- `package` (object)：多平台内容包，包括标题、短文案、脚本、CTA 和复用策略。

CLI:

```bash
nextide capability run content.repurpose.pack \
  --input .nextide/input/content.repurpose.pack.json \
  --output .nextide/output/content.repurpose.pack-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/content.repurpose.pack-result.json'); console.log(r.run && r.run.runId)")
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
