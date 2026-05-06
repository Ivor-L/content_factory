---
name: ad-copy-variant-generator
description: 广告文案变体生成：围绕同一产品卖点生成多组广告文案变体，覆盖痛点、利益、证明、限时、场景、对比等角度，并标注适用投放位置。
allowed-tools: Read, Write, Bash
---

# 广告文案变体生成

Follow shared NexTide rules in:

- `nextide-shared`

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 广告文案变体生成

- Capability: `content.ad.copy.variants`
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
- Estimated duration: 75 seconds
- Tags: `ad-copy`, `variants`, `performance`, `local-agent`

Description:

围绕同一产品卖点生成多组广告文案变体，覆盖痛点、利益、证明、限时、场景、对比等角度，并标注适用投放位置。

Examples:

- none

Input fields:

- `product` (string, required)：产品或服务描述。
- `sellingPoints` (array)：卖点列表。
- `placement` (string)：投放位置：feed/search/landing-page/video-caption 等。
- `count` (number)：变体数量。 默认：`10`

Output fields:

- `variants` (array)：广告文案变体，含角度、正文、CTA、风险提示。

CLI:

```bash
nextide capability run content.ad.copy.variants \
  --input .nextide/input/content.ad.copy.variants.json \
  --output .nextide/output/content.ad.copy.variants-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/content.ad.copy.variants-result.json'); console.log(r.run && r.run.runId)")
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
