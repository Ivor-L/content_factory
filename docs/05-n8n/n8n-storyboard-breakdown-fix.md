# N8N Storyboard Breakdown Workflow Fix

## Current Issues

1. **❌ Wrong frame extraction logic**: ffmpeg cuts every 8 seconds regardless of actual scene changes
2. **❌ Missing reference frames**: Extracted frames not appearing in UI's "主体参考" column
3. **❌ Language ignored**: Prompts always in Chinese, ignoring `target_language` parameter
4. **❌ Duration UI meaningless**: Duration selector has no effect in viral-clone mode

## Required Workflow Changes

### 1. Gemini-First Scene Detection

**Current (wrong)**: Extract frames every 8s → Analyze frames with Gemini
**Required (correct)**: Analyze full video with Gemini → Extract frames at detected timestamps

```
Input: videoUrl, target_language, target_country
↓
Gemini 2.5 Pro Video Analysis
  - Analyze full video
  - Detect scene cuts/transitions
  - Output: Array of scenes with timestamps
↓
FFmpeg Frame Extraction
  - Extract ONE frame per scene at specific timestamp
  - Use: ffmpeg -ss {timestamp} -i {video} -frames:v 1 frame_{order}.jpg
↓
Generate Prompts (using target_language)
  - image_prompt
  - video_prompt
  - visual_description
  - camera_notes, lighting_notes
↓
Return segments to webhook
```

### 2. Segment Data Structure

Each segment must include:

```json
{
  "order": 1,
  "time_range": "00:00-00:03",
  "duration": 3,
  "reference_frame_url": "https://storage.../frame_1.jpg",
  "image_prompt": "A woman in red dress...",
  "video_prompt": "Camera slowly zooms in...",
  "visual_description": "Close-up shot...",
  "camera_notes": "Handheld, slight shake",
  "lighting_notes": "Natural daylight",
  "original_script": "原始旁白文本",
  "rewritten_script": "改写后的文本",
  "has_person": true,
  "has_product": false
}
```

### 3. Language Handling

Use `target_language` parameter for ALL generated text:
- `image_prompt` → in target_language
- `video_prompt` → in target_language
- `visual_description` → in target_language
- `camera_notes` → in target_language
- `lighting_notes` → in target_language

Example Gemini prompt:
```
Analyze this video and identify scene cuts. For each scene, provide:
- Start/end timestamps
- Visual description
- Camera movement
- Lighting style

IMPORTANT: Generate ALL descriptions in {target_language} language.
Target audience: {target_country}
```

### 4. FFmpeg Command Template

For each scene detected by Gemini:

```bash
ffmpeg -ss {start_timestamp} -i {video_url} -frames:v 1 -q:v 2 frame_{order}.jpg
```

Example:
- Scene 1: 00:00-00:03 → `ffmpeg -ss 00:00 -i video.mp4 -frames:v 1 frame_1.jpg`
- Scene 2: 00:03-00:08 → `ffmpeg -ss 00:03 -i video.mp4 -frames:v 1 frame_2.jpg`
- Scene 3: 00:08-00:15 → `ffmpeg -ss 00:08 -i video.mp4 -frames:v 1 frame_3.jpg`

### 5. Webhook Response Format

```json
{
  "task_id": "xxx",
  "status": "completed",
  "segments": [
    {
      "order": 1,
      "time_range": "00:00-00:03",
      "duration": 3,
      "reference_frame_url": "https://...",
      "image_prompt": "...",
      "video_prompt": "...",
      "visual_description": "...",
      "camera_notes": "...",
      "lighting_notes": "...",
      "has_person": true,
      "has_product": false
    }
  ],
  "workflow_data": {
    "total_duration": 15,
    "scene_count": 3,
    "analysis_model": "gemini-2.5-pro"
  }
}
```

## Testing Checklist

- [ ] 15-second video produces 2-3 scenes (not 1 frame)
- [ ] Each segment has valid `reference_frame_url`
- [ ] Frames extracted at correct timestamps (not every 8s)
- [ ] All prompts in `target_language` (e.g., English when target_language=en)
- [ ] `has_person` / `has_product` correctly detected
- [ ] Duration reflects actual scene length from Gemini analysis

## Frontend Changes (Already Done)

✅ Webhook handler expects `reference_frame_url` in segments
✅ UI displays reference frames in "主体参考" column
✅ Language/country parameters sent in payload
✅ Duration selector hidden in viral-clone mode
