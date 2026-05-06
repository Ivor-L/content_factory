# TikTok Creator Distiller Workflow

## MVP flow

```text
creator account
  → social.tiktok.collect(mode=creator)
  → export run artifacts
  → normalize/rank videos
  → viral.breakdown.video_prompts for TOP N
  → markdown report + formulas JSON
```

## Default limits

```text
collectLimit: 20
topN: 5
max topN without explicit confirmation: 8
```

## Required capabilities

```text
social.tiktok.collect
viral.breakdown.video_prompts
```

## Key safety rule

Do not invent creator videos or video breakdowns. If collection is still `waiting_callback`, return runId and status/result commands.
