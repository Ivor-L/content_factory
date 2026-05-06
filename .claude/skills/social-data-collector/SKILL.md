---
name: social-data-collector
description: NexTide TK/Instagram/Facebook 数据采集。适合“采集 TikTok 爆款”“抓 Instagram Reels/帖子”“采集 Facebook 公开视频/主页内容”“为爆款复刻导入参考素材”等请求。
allowed-tools: Read, Write, Bash
---

# Social Data Collector

Follow shared NexTide rules in:

- `nextide-shared`

Use this skill for platform collection feeding NexTide viral references / hot clone workflows.

## Capabilities

```text
social.tiktok.collect
social.instagram.collect
social.facebook.collect
```

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

Return:

- platform
- mode
- submitted entries
- imported count if available
- workflow/import errors if any

## Rules

- Bounded first pass: default 10-30 items.
- Do not collect comments by default; use comments capability when wired.
- Do not invent collected records before callback/import completes.
- Keyword mode is TikTok-only in the current Web API.
