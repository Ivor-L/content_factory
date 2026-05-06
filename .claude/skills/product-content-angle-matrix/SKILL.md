---
name: product-content-angle-matrix
description: 产品内容角度矩阵：把一个产品拆成可持续生产内容的角度矩阵：人群、痛点、场景、证据、反对意见、内容形式和转化路径。
allowed-tools: Read, Write, Bash
---

# 产品内容角度矩阵

Follow shared NexTide rules in:

- `nextide-shared`

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 产品内容角度矩阵

- Capability: `product.angle.matrix`
- Version: `0.2.0`
- Category: `product`
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
- Tags: `product`, `angle-matrix`, `content-strategy`, `local-agent`

Description:

把一个产品拆成可持续生产内容的角度矩阵：人群、痛点、场景、证据、反对意见、内容形式和转化路径。

Examples:

- none

Input fields:

- `product` (string, required)：产品名称、描述、卖点或分析结果。
- `audience` (string)：目标人群。
- `channels` (array)：内容渠道。

Output fields:

- `matrix` (array)：内容角度矩阵行。

CLI:

```bash
nextide capability run product.angle.matrix \
  --input .nextide/input/product.angle.matrix.json \
  --output .nextide/output/product.angle.matrix-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/product.angle.matrix-result.json'); console.log(r.run && r.run.runId)")
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
