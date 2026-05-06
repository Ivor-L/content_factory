---
name: social-data-collector
description: NexTide TK/Instagram/Facebook 数据采集。适合“采集 TikTok 爆款”“抓 Instagram Reels/帖子”“采集 Facebook 公开视频/主页内容”“为爆款复刻导入参考素材”等请求。
allowed-tools: Read, Write, Bash
---

# Social Data Collector

Follow shared NexTide rules in:

- `nextide-shared`

Use this skill for platform collection feeding NexTide viral references / hot clone workflows.

Use it when the user asks to:

- collect TikTok / Instagram / Facebook public posts or videos
- import reference URLs into NexTide viral references
- prepare a benchmark pool for viral breakdown or prompt generation
- collect comments after the user explicitly asks for comment mining
- do a bounded first-pass trend/material scan

Do not use it for:

- private account scraping or bypassing platform permissions
- full account crawling without a bounded limit
- sentiment/comment analysis unless collection output exists first
- claiming import completion before callback/result confirms it

## Capabilities

```text
social.tiktok.collect
social.instagram.collect
social.facebook.collect
social.comments.collect
```

Default bounds:

- first pass: 10-30 public items
- smoke test: 5-10 public items
- comments: off by default; only collect when user explicitly asks
- high-volume collection: ask for confirmation and explain cost/time risk

## TikTok

Keyword collection:

```json
{
  "queries": ["neck pain relief", "posture correction"],
  "limit": 20
}
```

URL collection:

```json
{
  "mode": "video",
  "urls": ["https://www.tiktok.com/@user/video/..."]
}
```

CLI:

```bash
npm run nextide -- capability run social.tiktok.collect \
  --input .nextide/input/social-tiktok-collect.json \
  --output .nextide/output/social-tiktok-collect-result.json \
  --mode submit \
  --user-api-key <NEX用户积分API_KEY>
```

## Instagram

MVP supports post/Reels URL collection.

```json
{
  "urls": ["https://www.instagram.com/reel/..."]
}
```

CLI:

```bash
npm run nextide -- capability run social.instagram.collect \
  --input .nextide/input/social-instagram-collect.json \
  --output .nextide/output/social-instagram-collect-result.json \
  --mode wait \
  --user-api-key <NEX用户积分API_KEY>
```

## Facebook

MVP supports public URL collection with creator/video mode.

```json
{
  "mode": "video",
  "urls": ["https://www.facebook.com/..."],
  "limit": 20
}
```

CLI:

```bash
npm run nextide -- capability run social.facebook.collect \
  --input .nextide/input/social-facebook-collect.json \
  --output .nextide/output/social-facebook-collect-result.json \
  --mode submit \
  --user-api-key <NEX用户积分API_KEY>
```

## Comments Collection

Capability id:

```text
social.comments.collect
```

Requires one of these server env vars:

```text
N8N_TIKTOK_COMMENTS_WEBHOOK
N8N_SOCIAL_COMMENTS_WEBHOOK
SOCIAL_COMMENTS_WEBHOOK_URL
```

Input:

```json
{
  "platform": "tiktok",
  "urls": ["https://www.tiktok.com/@user/video/..."],
  "limit": 100
}
```

CLI:

```bash
npm run nextide -- capability run social.comments.collect \
  --input .nextide/input/social-comments-collect.json \
  --output .nextide/output/social-comments-collect-result.json \
  --mode submit
```

## Output Handling

TikTok/Facebook normally return `waiting_callback` because n8n imports results asynchronously into viral references.

Instagram may return synchronously if the Instagram workflow returns `post_data` immediately.

For any run with a `runId`, prefer:

```bash
npm run nextide -- run follow <run-id> \
  --output-dir .nextide/output/<run-id> \
  --timeout 1800 \
  --interval 5
```

If the run is already finished, export:

```bash
npm run nextide -- run artifacts <run-id> \
  --output-dir .nextide/output/<run-id> \
  --download \
  --gallery \
  --datatable
```

Return:

- platform and collection mode
- submitted queries/URLs count
- imported count if available
- `datatable` block when `datatable.json` exists
- `summary.recommendedResponse.nextActions` when present
- workflow/import errors or `explanation` next actions if failed

## Rules

- Bounded first pass: default 10-30 items.
- Do not collect comments by default; use comments capability only when explicitly requested.
- Do not invent collected records before callback/import completes.
- Keyword mode is TikTok-only in the current Web API.
- Only use public URLs or user-provided materials.
- Do not imply platform endorsement or access to private metrics.
- If output is `waiting_callback`, clearly say the job was submitted and show follow/status commands.
- If `datatable.json` exists, prefer it over dumping raw workflow JSON.

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### TikTok 数据采集

- Capability: `social.tiktok.collect`
- Version: `0.2.0`
- Category: `social`
- Status: `available`
- Execution: `internal_api`
- Async: `true`
- Cost level: `medium`
- Required auth: `nexTideApiKey`
- Required env: `N8N_SOCIAL_SCRAPER_WEBHOOK`, `SOCIAL_SCRAPER_APIFY_TOKEN or APIFY_API_TOKEN`
- Required plan: `none`
- Rate limit: `10/minute`, `60/hour`
- Estimated credits: 5
- Estimated duration: 180 seconds
- Tags: `tiktok`, `social`, `collection`, `creator-research`

Description:

采集 TikTok 爆款视频、账号与可选评论，用于爆款复刻、博主蒸馏和用户语言分析。

Examples:

- TikTok 关键词采集

  ```json
  {
    "platform": "tiktok",
    "mode": "keyword",
    "queries": [
      "neck pain"
    ],
    "limit": 20
  }
  ```
- TikTok 博主账号采集：博主蒸馏器第一步：采集账号热门视频。

  ```json
  {
    "platform": "tiktok",
    "mode": "creator",
    "targets": [
      "@quinclips3"
    ],
    "limit": 20,
    "sortBy": "likes"
  }
  ```

Input fields:

- `mode` (string)：采集模式：keyword / creator / video。 默认：`"keyword"`
- `queries` (string[])：keyword 模式下的搜索关键词。
- `keywords` (string[])：keyword 模式下的搜索关键词别名。
- `targets` (string[])：creator 模式下的账号名或账号 URL，例如 @creator。
- `creators` (string[])：creator 模式下的账号名列表。
- `urls` (string[])：video 模式下的视频 URL，或 creator 模式下的账号 URL。
- `limit` (number)：目标采集数量。 默认：`30`
- `sortBy` (string)：排序方式：likes / views / comments / shares / recent。 默认：`"likes"`
- `collectComments` (boolean)：是否采集评论。 默认：`false`

Output fields:

- `items` (array)：归一化内容列表。
- `creators` (array)：创作者列表。
- `comments` (array)：评论列表。

CLI:

```bash
nextide capability run social.tiktok.collect \
  --input .nextide/input/social.tiktok.collect.json \
  --output .nextide/output/social.tiktok.collect-result.json \
  --mode submit \
  --wait \
  --timeout 900 \
  --interval 5

RUN_ID=$(node -e "const r=require('./.nextide/output/social.tiktok.collect-result.json'); console.log(r.run && r.run.runId)")
nextide run follow "$RUN_ID" \
  --output-dir .nextide/output/$RUN_ID \
  --timeout 900 \
  --interval 5
```

Artifact-first reading order:

1. Read `.nextide/output/$RUN_ID/summary.json`.
2. Read `.nextide/output/$RUN_ID/manifest.json`.
3. Return `preview.html` / `gallery.html` with rich preview when supported.
4. Return `datatable.json` for data/table results.
5. Return local artifact paths when present.
6. If a remote URL artifact is present, return the URL from manifest.
7. Only inspect the full result JSON when manifest is insufficient.

### Instagram 数据采集

- Capability: `social.instagram.collect`
- Version: `0.2.0`
- Category: `social`
- Status: `available`
- Execution: `internal_api`
- Async: `true`
- Cost level: `medium`
- Required auth: `nexTideApiKey`
- Required env: `N8N_INSTAGRAM_SCRAPER_WEBHOOK`
- Required plan: `none`
- Rate limit: `10/minute`, `60/hour`
- Estimated credits: 5
- Estimated duration: 180 seconds
- Tags: `instagram`, `social`, `collection`

Description:

采集 Instagram 账号、帖子或 Reels 数据。

Examples:

- none

Input fields:

- `queries` (string[])：关键词或账号。
- `urls` (string[])：帖子或账号 URL。
- `limit` (number)：目标采集数量。 默认：`30`

Output fields:

- `items` (array)：归一化内容列表。
- `creators` (array)：创作者列表。

CLI:

```bash
nextide capability run social.instagram.collect \
  --input .nextide/input/social.instagram.collect.json \
  --output .nextide/output/social.instagram.collect-result.json \
  --mode submit \
  --wait \
  --timeout 900 \
  --interval 5

RUN_ID=$(node -e "const r=require('./.nextide/output/social.instagram.collect-result.json'); console.log(r.run && r.run.runId)")
nextide run follow "$RUN_ID" \
  --output-dir .nextide/output/$RUN_ID \
  --timeout 900 \
  --interval 5
```

Artifact-first reading order:

1. Read `.nextide/output/$RUN_ID/summary.json`.
2. Read `.nextide/output/$RUN_ID/manifest.json`.
3. Return `preview.html` / `gallery.html` with rich preview when supported.
4. Return `datatable.json` for data/table results.
5. Return local artifact paths when present.
6. If a remote URL artifact is present, return the URL from manifest.
7. Only inspect the full result JSON when manifest is insufficient.

### Facebook 数据采集

- Capability: `social.facebook.collect`
- Version: `0.2.0`
- Category: `social`
- Status: `available`
- Execution: `internal_api`
- Async: `true`
- Cost level: `medium`
- Required auth: `nexTideApiKey`
- Required env: `N8N_SOCIAL_SCRAPER_WEBHOOK`, `SOCIAL_SCRAPER_APIFY_TOKEN or APIFY_API_TOKEN`
- Required plan: `none`
- Rate limit: `10/minute`, `60/hour`
- Estimated credits: 5
- Estimated duration: 180 seconds
- Tags: `facebook`, `social`, `collection`

Description:

采集 Facebook 公开页面、帖子或相关爆款内容。

Examples:

- none

Input fields:

- `queries` (string[])：关键词或页面。
- `urls` (string[])：帖子或页面 URL。
- `limit` (number)：目标采集数量。 默认：`30`

Output fields:

- `items` (array)：归一化内容列表。
- `creators` (array)：主页/创作者列表。

CLI:

```bash
nextide capability run social.facebook.collect \
  --input .nextide/input/social.facebook.collect.json \
  --output .nextide/output/social.facebook.collect-result.json \
  --mode submit \
  --wait \
  --timeout 900 \
  --interval 5

RUN_ID=$(node -e "const r=require('./.nextide/output/social.facebook.collect-result.json'); console.log(r.run && r.run.runId)")
nextide run follow "$RUN_ID" \
  --output-dir .nextide/output/$RUN_ID \
  --timeout 900 \
  --interval 5
```

Artifact-first reading order:

1. Read `.nextide/output/$RUN_ID/summary.json`.
2. Read `.nextide/output/$RUN_ID/manifest.json`.
3. Return `preview.html` / `gallery.html` with rich preview when supported.
4. Return `datatable.json` for data/table results.
5. Return local artifact paths when present.
6. If a remote URL artifact is present, return the URL from manifest.
7. Only inspect the full result JSON when manifest is insufficient.

### 社媒评论抓取

- Capability: `social.comments.collect`
- Version: `0.2.0`
- Category: `social`
- Status: `available`
- Execution: `n8n_workflow`
- Async: `true`
- Cost level: `medium`
- Required auth: `nexTideApiKey`
- Required env: `N8N_TIKTOK_COMMENTS_WEBHOOK or N8N_SOCIAL_COMMENTS_WEBHOOK`
- Required plan: `none`
- Rate limit: `10/minute`, `60/hour`
- Estimated credits: 5
- Estimated duration: 180 seconds
- Tags: `comments`, `audience-language`, `tiktok`

Description:

抓取 TikTok 等平台评论，用于用户语言、痛点、异议和购买意图分析。

Examples:

- none

Input fields:

- `platform` (string, required)：平台，如 tiktok。
- `urls` (string[], required)：帖子/视频 URL 列表。
- `limit` (number)：评论数量上限。 默认：`100`

Output fields:

- `comments` (array)：评论列表。
- `clusters` (array)：可选的评论聚类结果。

CLI:

```bash
nextide capability run social.comments.collect \
  --input .nextide/input/social.comments.collect.json \
  --output .nextide/output/social.comments.collect-result.json \
  --mode submit \
  --wait \
  --timeout 900 \
  --interval 5

RUN_ID=$(node -e "const r=require('./.nextide/output/social.comments.collect-result.json'); console.log(r.run && r.run.runId)")
nextide run follow "$RUN_ID" \
  --output-dir .nextide/output/$RUN_ID \
  --timeout 900 \
  --interval 5
```

Artifact-first reading order:

1. Read `.nextide/output/$RUN_ID/summary.json`.
2. Read `.nextide/output/$RUN_ID/manifest.json`.
3. Return `preview.html` / `gallery.html` with rich preview when supported.
4. Return `datatable.json` for data/table results.
5. Return local artifact paths when present.
6. If a remote URL artifact is present, return the URL from manifest.
7. Only inspect the full result JSON when manifest is insufficient.

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
