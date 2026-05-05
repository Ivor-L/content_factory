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
  --mode wait \
  --user-api-key <NEX用户积分API_KEY>
```

Current MVP note:

- The runner currently requires `apiKey` or `api_key` in the input JSON, or a compatible key passed by CLI/env/config.
- For local debugging, prefer `--user-api-key <key>` or `NEXTIDE_USER_API_KEY=<key>` instead of writing secrets into reusable fixture files.
- If missing, the capability returns `unauthorized`.

## Input JSON

```json
{
  "name": "家用射频美容仪",
  "description": "产品描述...",
  "images": ["https://..."],
  "apiKey": "用户积分 API Key"
}
```

Field rules:

- `name` is required.
- `description` is recommended.
- `images` should include at least one product image URL when visual analysis matters.
- `apiKey` is required in MVP.

## Workflow

1. Collect product name, description, and image URLs from the user.
2. Create `.nextide/input/product-selling-point-analysis.json`.
3. Run the capability command.
4. Read `.nextide/output/product-selling-point-analysis-result.json`.
5. Summarize the result into user-facing product insight.

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
- warnings about unverifiable claims

## Compliance Rules

- Distinguish observed product facts from marketing hypotheses.
- Avoid medical, guaranteed-result, or exaggerated efficacy claims.
- If the image or product data is insufficient, say what is missing.
- Do not invent product specs not present in the source.
