---
name: product-selling-point-analysis
description: 分析产品图片、产品名和描述，提炼卖点、目标人群、痛点、使用场景和内容角度。适合“小程序产品库的产品分析”“帮我分析这个产品卖点”“从图片提炼卖点”等请求。
allowed-tools: Read, Write, Bash
---

# Product Selling Point Analysis

Follow shared NexTide rules in:

- `nextide-shared`

Use this skill when the user wants to:

- 分析产品卖点
- 从产品图和描述中提炼 Product DNA
- 生成目标人群、痛点、使用场景
- 为短视频脚本、小红书卡片、广告创意准备产品基础信息

Do not use this skill for:

- 供应链选品判断：可后续接 `sourcing-selection`
- 小红书笔记采集：用 `xiaohongshu-note-collector`
- 直接生成视频：用视频相关 skill

## Capability

Capability id:

```text
product.selling_point.analysis
```

CLI contract:

```bash
npm run nextide -- capability run product.selling_point.analysis \
  --input .nextide/input/product-selling-point-analysis.json \
  --output .nextide/output/product-selling-point-analysis-result.json \
  --mode wait
```

For local debugging only, credentials may be supplied via config/env/flag. Prefer `nextide auth login` or `NEXTIDE_USER_API_KEY=<redacted>` over putting keys in commands.

Auth note:

- Pass a NexTide user API key through CLI/env/config, for example `--user-api-key <key>` or `NEXTIDE_USER_API_KEY=<key>`.
- Do not write secrets into reusable fixture files.
- The runner uses the authenticated user's profile API key; `apiKey` / `api_key` in input is only a backward-compatible fallback.
- If missing or invalid, the capability returns `unauthorized`.

## Input JSON

```json
{
  "name": "家用射频美容仪",
  "description": "产品描述...",
  "images": ["https://..."]
}
```

Field rules:

- `name` is required.
- `description` is recommended.
- `images` should include at least one product image URL when visual analysis matters.
- Do not include `apiKey` in the JSON fixture; pass it through CLI/env/config.

## Workflow

1. Collect product name, description, and image URLs from the user.
2. Ask for missing essentials only when the analysis would be misleading; otherwise run a bounded first pass.
3. Create `.nextide/input/product-selling-point-analysis.json` with business input only, no credentials.
4. Run the capability command.
5. If a `runId` exists, export the artifact/data bundle:

   ```bash
   RUN_ID=$(node -e "const r=require('./.nextide/output/product-selling-point-analysis-result.json'); console.log(r.run && r.run.runId)")
   npm run nextide -- run artifacts "$RUN_ID" \
     --output-dir .nextide/output/$RUN_ID \
     --download \
     --gallery \
     --datatable
   ```

6. Read `summary.json` and `datatable.json` first when present.
7. Summarize into user-facing product insight, separating facts from hypotheses.

## Output Handling

Expected successful result shape:

```json
{
  "run": {
    "status": "succeeded",
    "result": {
      "sellingPoints": [],
      "detailedDescription": "...",
      "workflowData": {}
    }
  }
}
```

If status is `waiting_callback`, report that the n8n flow accepted the job but full structured results may arrive asynchronously.

Return:

- core selling points
- target audience
- pain points
- usage scenarios
- content angles
- `datatable` preview for the product insight table when generated
- warnings about unverifiable claims
- suggested next actions: sales page, short video script, XHS seed copy, competitor comparison

Output format preference:

1. One-paragraph executive summary.
2. Structured bullets grouped by 卖点 / 痛点 / 人群 / 场景 / 内容角度.
3. Datatable block if `datatable.json` exists.
4. Compliance notes and missing evidence.
5. Next actions.

## Compliance Rules

- Distinguish observed product facts from marketing hypotheses.
- Avoid medical, guaranteed-result, or exaggerated efficacy claims.
- If the image or product data is insufficient, say what is missing and lower confidence.
- Do not invent product specs, certifications, prices, ingredients, dimensions, materials, or efficacy not present in the source.
- For health/beauty products, phrase claims as perceived benefit or content angle unless evidence is supplied.
- If CLI returns `explanation`, stop and give the user the recommended next actions.

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 产品卖点分析

- Capability: `product.selling_point.analysis`
- Version: `0.2.0`
- Category: `product`
- Status: `available`
- Execution: `internal_api`
- Async: `false`
- Cost level: `low`
- Required auth: `nexTideApiKey`
- Required env: `none`
- Required plan: `none`
- Rate limit: `none`
- Estimated credits: 2
- Estimated duration: 40 seconds
- Tags: `product`, `selling-points`, `analysis`

Description:

分析产品图片与描述，提炼卖点、目标人群、痛点和内容角度。

Examples:

- 产品卖点分析

  ```json
  {
    "name": "护颈枕",
    "description": "适合久坐人群的支撑枕",
    "images": []
  }
  ```

Input fields:

- `name` (string, required)：产品名称。
- `description` (string)：产品描述。
- `images` (string[])：产品图片 URL 列表。
- `productId` (string)：已有产品 ID。可选。

Output fields:

- `sellingPoints` (string[])：卖点列表。
- `detailedDescription` (string)：详细产品分析文本。
- `workflowData` (object)：完整结构化结果。

CLI:

```bash
nextide capability run product.selling_point.analysis \
  --input .nextide/input/product.selling_point.analysis.json \
  --output .nextide/output/product.selling_point.analysis-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/product.selling_point.analysis-result.json'); console.log(r.run && r.run.runId)")
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
