---
name: digital-human-generator
description: NexTide 数字人生成。使用人物图片/视频、音频和口播文本创建图片源或视频源数字人口播任务。适合“生成数字人视频”“用这张人物图做口播”“图片数字人/视频数字人”等请求。
allowed-tools: Read, Write, Bash
---

# Digital Human Generator

Follow shared NexTide rules in:

- `nextide-shared`

Use this skill when the user wants to create a digital human video from:

- person image + audio
- person image + audio + script
- person video + audio

## Capability

Capability id:

```text
digital-human.video.generate
```

CLI contract:

```bash
npm run nextide -- capability run digital-human.video.generate \
  --input .nextide/input/digital-human-video.json \
  --output .nextide/output/digital-human-video-result.json \
  --mode submit \
  --user-api-key <NEX用户积分API_KEY>
```

## Input JSON

Image source lip-sync:

```json
{
  "sourceType": "IMAGE",
  "imageUrl": "https://.../person.png",
  "audioUrl": "https://.../voice.mp3",
  "type": "LIP_SYNC"
}
```

Voice clone / script-aware task:

```json
{
  "sourceType": "IMAGE",
  "personImage": "https://.../person.png",
  "audioUrl": "https://.../voice.mp3",
  "script": "大家好，今天讲一个...",
  "type": "VOICE_CLONE",
  "durationSeconds": 30
}
```

Aliases:

- `personImage` / `sourceImage` → `imageUrl`
- `personVideo` / `sourceVideo` → `videoUrl`
- `voiceUrl` → `audioUrl`
- `script` / `text` → `scriptContent`

## Long-running Rule

Digital human generation can take up to 60 minutes.

The capability usually returns:

```text
waiting_callback
```

The result contains a `data.id`, which is the NexTide `digitalHumanVideo` record id.

Progress can be inspected in NexTide UI or through the underlying API:

```text
GET /api/digital-human/videos/<id>
```

## Output Handling

Expected result shape:

```json
{
  "run": {
    "status": "waiting_callback",
    "result": {
      "data": {
        "id": "...",
        "status": "GENERATING",
        "resultUrl": null
      }
    }
  }
}
```

If `resultUrl` is present, return it as the generated video.

## Rules

- Do not wait 60 minutes by default.
- Do not claim the video is finished until `resultUrl` exists or status is completed.
- User must have rights to the face/image/video/audio source.
- This skill does not generate TTS/audio in MVP; require `audioUrl`.
