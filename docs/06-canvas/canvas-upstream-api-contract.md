# Canvas Upstream API Contract

This project now uses an independent adapter layer under `/api/canvas/*`.

If your own backend already has canvas endpoints, set env vars and the adapter will proxy directly.
If not, implement the following interfaces on your backend:

## 1) Chat Completions

- Method: `POST`
- Path: `/chat/completions`
- Request (OpenAI-like):
```json
{
  "model": "gpt-4o-mini",
  "messages": [{ "role": "user", "content": "hello" }],
  "stream": true
}
```
- Response (non-stream):
```json
{
  "choices": [
    { "message": { "content": "..." } }
  ]
}
```
- Response (stream): SSE with `data: {...}` chunks, each chunk containing:
```json
{
  "choices": [
    { "delta": { "content": "..." } }
  ]
}
```
and final `data: [DONE]`.

## 2) Image Generations

- Method: `POST`
- Path: `/images/generations`
- Request:
```json
{
  "model": "nano-banana-pro",
  "prompt": "a product shot",
  "size": "1x1",
  "n": 1,
  "image": "https://...",
  "quality": "standard"
}
```
- Response:
```json
{
  "data": [
    { "url": "https://...", "revised_prompt": "..." }
  ]
}
```

## 3) Video Task Create

- Method: `POST`
- Path: `/videos`
- Request:
```json
{
  "model": "veo3",
  "prompt": "cinematic shot",
  "first_frame_image": "https://... or data:image/...",
  "last_frame_image": "https://... or data:image/...",
  "size": "9:16",
  "seconds": 5
}
```
- Response (async):
```json
{
  "task_id": "task_xxx",
  "status": "processing"
}
```
- Response (sync direct video):
```json
{
  "url": "https://..."
}
```

## 4) Video Task Query

- Method: `GET`
- Path: `/videos/{taskId}`
- Response (running):
```json
{ "status": "processing" }
```
- Response (completed):
```json
{
  "status": "completed",
  "data": { "url": "https://..." }
}
```
- Response (failed):
```json
{
  "status": "failed",
  "error": { "message": "..." }
}
```

## Adapter Environment Variables

Set one of:

- `CANVAS_API_BASE_URL` (base URL, uses default paths above), or
- full per-endpoint URLs:
  - `CANVAS_CHAT_COMPLETIONS_URL`
  - `CANVAS_IMAGE_GENERATIONS_URL`
  - `CANVAS_VIDEO_GENERATIONS_URL`
  - `CANVAS_VIDEO_TASK_URL_TEMPLATE`

Optional:

- path overrides with base URL:
  - `CANVAS_CHAT_COMPLETIONS_PATH`
  - `CANVAS_IMAGE_GENERATIONS_PATH`
  - `CANVAS_VIDEO_GENERATIONS_PATH`
  - `CANVAS_VIDEO_TASK_PATH`
- upstream auth:
  - `CANVAS_UPSTREAM_BEARER_TOKEN`
  - `CANVAS_UPSTREAM_ADMIN_TOKEN`
