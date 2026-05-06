---
name: viral-breakdown-to-video-prompts
description: NexTide 爆款拆解并反推视频提示词。MVP 接入图文复刻任务创建与视频文案提取链路，适合“拆解这个爆款”“提取视频文案并反推提示词”“把参考内容变成复刻基底”等请求。
allowed-tools: Read, Write, Bash
---

# Viral Breakdown To Video Prompts

Follow shared NexTide rules in:

- `nextide-shared`

Use this skill when the user provides:

- a viral video URL
- a viral image-text note/card reference
- source title/text/images already collected from a platform

and wants a reusable breakdown or prompt base.

## Capability

Capability id:

```text
viral.breakdown.video_prompts
```

CLI contract:

```bash
npm run nextide -- capability run viral.breakdown.video_prompts \
  --input .nextide/input/viral-breakdown-video-prompts.json \
  --output .nextide/output/viral-breakdown-video-prompts-result.json \
  --mode submit \
  --user-api-key <NEX用户积分API_KEY>
```

## Input: Video Reference

```json
{
  "referenceVideo": "https://.../video.mp4",
  "sourcePlatform": "tiktok",
  "description": "可选参考说明",
  "language": "zh-CN"
}
```

The runner calls video copy extraction. If callback URL is configured, it may return `waiting_callback`.

## Input: Image-text Reference

```json
{
  "sourceTitle": "爆款标题",
  "sourceText": "原文正文...",
  "sourceImages": ["https://.../1.png"],
  "sourcePlatform": "xiaohongshu",
  "sourceUrl": "https://..."
}
```

The runner creates an image-text replication task.

## Output Handling

Video path may return transcript/copy data synchronously or pending async status.

Image-text path returns:

```json
{
  "taskId": "...",
  "status": "BREAKDOWN_COMPLETED"
}
```

## Prompt Rule

This capability creates/extracts the source base. To produce final Seedance/Veo prompts, combine with:

- `reference-decode`
- `reference-contract-builder`
- `video-request-architect`
- `prompt-preflight-qa`
- `seedance`

## Reference Contract

Always separate:

- learn: hook structure, pacing, scene grammar, information hierarchy
- do not copy: person identity, brand, exact text, logo, creator face, proprietary visual elements

## Rules

- Do not invent transcript or prompts if extraction is pending.
- If only a platform post URL is provided, collect it first with the relevant collector skill.
- Treat this as a source-prep capability, not final video generation.
