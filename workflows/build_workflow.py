#!/usr/bin/env python3
"""Build 分镜拆解-网页版.json from Python dicts so json.dumps handles all escaping."""
import json, os

# ── JS code for each Code node (Python strings, no manual escaping needed) ──

CODE_PREPARE = r"""const body = $json.body || $json;

const taskId = String(body.task_id || body.taskId || '').trim();
const videoUrl = String(body.video_url || body.videoUrl || '').trim();
const productName = String(body.product_name || body.productName || '');
const productDescription = String(body.product_description || body.productDescription || '');
const productSellingPoints = String(body.product_selling_points || body.productSellingPoints || '');
const scriptContent = String(body.script_content || body.scriptContent || '');
const callbackUrl = String(body.callback_url || body.callbackUrl || '').trim().replace(/\/$/, '');
const apiKey = String(body.api_key || body.apiKey || '').trim();
const adminToken = String(body.admin_token || body.adminToken || '').trim();
const workflowId = String(body.workflow_id || body.workflowId || 'flow_storyboard_disassembly').trim();
const targetLanguage = String(body.target_language || body.targetLanguage || 'en').trim();
const targetCountry = String(body.target_country || body.targetCountry || 'US').trim();

const SUPABASE_DEFAULT_URL = 'https://supabase-api.atomx.top';
function normalizeSupabaseUrl(url) {
  if (!url) return '';
  let normalized = String(url).trim();
  normalized = normalized.replace(/\/+$/, '');
  const suffixes = ['/rest/v1', '/storage/v1', '/realtime/v1', '/auth/v1', '/functions/v1'];
  for (const suffix of suffixes) {
    if (normalized.toLowerCase().endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
      normalized = normalized.replace(/\/+$/, '');
    }
  }
  return normalized;
}

function normalizeSourceUrl(value, supabaseBase) {
  if (!value) return '';
  let trimmed = String(value).trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;

  const base = supabaseBase || SUPABASE_DEFAULT_URL;
  const join = (path) => `${base}/${path.replace(/^\/+/, '')}`;

  if (trimmed.startsWith('/')) {
    return `${base}${trimmed}`;
  }
  if (trimmed.startsWith('storage/')) {
    return join(trimmed);
  }
  if (trimmed.startsWith('uploads/')) {
    return join(`storage/v1/object/${trimmed}`);
  }
  if (/^[\w.-]+\.[\w.-]+(?:\/|$)/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

const supabaseUrl = normalizeSupabaseUrl(
  body.supabase_url || body.supabaseUrl || ''
) || SUPABASE_DEFAULT_URL;

const supabaseApiKey = String(
  body.supabase_api_key || body.supabaseApiKey || 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz'
).trim();

const supabaseBucket = String(
  body.supabase_bucket || body.supabaseBucket || 'uploads'
).trim();

const normalizedVideoUrl = normalizeSourceUrl(videoUrl, supabaseUrl);

if (!taskId) throw new Error('task_id is required');
if (!videoUrl) throw new Error('video_url is required');
if (!callbackUrl) throw new Error('callback_url is required');
if (!apiKey) throw new Error('api_key is required');
if (!normalizedVideoUrl || !/^https?:\/\//i.test(normalizedVideoUrl)) {
  throw new Error('video_url must be an absolute HTTP(S) URL after normalization');
}

const workDir = `/tmp/sb_bd_${taskId}`;

return {
  json: {
    taskId, productName, productDescription, productSellingPoints,
    scriptContent, callbackUrl, apiKey, adminToken, workflowId, workDir,
    targetLanguage, targetCountry,
    original_video_url: videoUrl,
    videoUrl: normalizedVideoUrl,
    supabase_url: supabaseUrl,
    supabase_api_key: supabaseApiKey,
    supabase_bucket: supabaseBucket
  }
};"""

CMD_DOWNLOAD = r"""WORK_DIR="{{ $json.workDir }}"
VIDEO_URL="{{ $json.videoUrl }}"
LOCAL_VIDEO_PATH="$WORK_DIR/input.mp4"
TASK_ID="{{ $json.taskId }}"

mkdir -p "$WORK_DIR" || exit 1
export WORK_DIR VIDEO_URL LOCAL_VIDEO_PATH TASK_ID

node <<'NODE'
const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const videoUrl = process.env.VIDEO_URL;
const outputPath = process.env.LOCAL_VIDEO_PATH;
const taskId = process.env.TASK_ID;

if (!videoUrl) { console.error('{"success":false,"message":"VIDEO_URL is empty"}'); process.exit(1); }

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(url, (res) => {
      const code = res.statusCode || 0;
      if ([301,302,303,307,308].includes(code) && res.headers.location) {
        const nextUrl = new URL(res.headers.location, url).toString();
        res.resume();
        return resolve(download(nextUrl, dest, redirects + 1));
      }
      if (code < 200 || code >= 300) { res.resume(); return reject(new Error(`download failed with status ${code}`)); }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          try {
            const stat = fs.statSync(dest);
            if (!stat.size) return reject(new Error('empty file'));
            process.stdout.write(JSON.stringify({ taskId, localVideoPath: dest }) + '\n');
            resolve();
          } catch(e) { reject(e); }
        });
      });
      file.on('error', (err) => { file.destroy(); reject(err); });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('download timeout')));
  });
}

download(videoUrl, outputPath).catch((err) => {
  console.error(JSON.stringify({ success: false, message: err.message }));
  process.exit(1);
});
NODE"""

CODE_PARSE_DOWNLOAD = r"""const raw = String($json.stdout || '').trim();
if (!raw) throw new Error('下载视频到本地没有返回 stdout');

let parsed;
try { parsed = JSON.parse(raw); }
catch (e) { throw new Error(`解析下载视频结果失败: ${e.message}; 原始输出: ${raw}`); }

if (!parsed.localVideoPath) throw new Error('下载视频成功后仍缺少 localVideoPath');

const base = $('准备参数').first().json;
return { json: { ...base, localVideoPath: parsed.localVideoPath } };"""

CODE_ASSEMBLE_GEMINI = r"""function pickFirst(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}
function pickBinaryKey(bin) {
  if (!bin || typeof bin !== 'object') return '';
  if (bin.data) return 'data';
  if (bin.video) return 'video';
  const keys = Object.keys(bin);
  return keys.length ? keys[0] : '';
}

const items = $input.all();
const output = [];

for (let i = 0; i < items.length; i++) {
  const item = items[i];
  const j = item.json || {};
  const bin = item.binary || {};
  const binaryKey = pickBinaryKey(bin);
  if (!binaryKey) throw new Error(`缺少视频binary字段，可用binary keys: ${Object.keys(bin||{}).join(', ')}`);

  const buffer = await this.helpers.getBinaryDataBuffer(i, binaryKey);
  if (!buffer || !buffer.length) throw new Error(`视频binary读取失败，binaryKey=${binaryKey}`);
  const base64 = buffer.toString('base64');

  const productName = pickFirst(j.productName, j.product_name, 'Unknown Product');
  const productDescription = pickFirst(j.productDescription, j.product_description, 'N/A');
  const productSellingPoints = pickFirst(j.productSellingPoints, j.product_selling_points, 'N/A');
  const scriptContent = pickFirst(j.scriptContent, j.script_content, '');
  const targetLanguage = pickFirst(j.targetLanguage, j.target_language, 'Chinese');
  const targetCountry = pickFirst(j.targetCountry, j.target_country, 'China');

  const promptText = `You are analyzing a complete source commercial video for viral-video cloning.

Your job is NOT to invent a new ad.
Your job is to reverse-engineer the original video into downstream production-ready shot data.
The full video must be read as a whole first, then segmented according to actual visual shot changes, action beats, product beats, and editing rhythm.
Do not segment only by equal time intervals.

Product Context:
- Product Name: ${productName}
- Description: ${productDescription}
- Selling Points: ${productSellingPoints}
${scriptContent ? `- Reference Script: ${scriptContent}` : ''}

Target Audience:
- Language: ${targetLanguage}
- Country/Region: ${targetCountry}

Global rules:
1. Read the ENTIRE video first, then decide segmentation.
2. Segment by real shot boundary, visual narrative beat, action change, camera change, or meaningful product emphasis change.
3. Generate ALL descriptive business fields in ${targetLanguage} for ${targetCountry} audience, except image_prompt and video_prompt, which MUST be in English.
4. The goal is downstream cloning: image_prompt must preserve original shot design and only replace person/product identity.
5. video_prompt must be detailed enough for downstream video generation, preserving original camera grammar, staging logic, action rhythm, and product role.
6. Output ONLY valid JSON. Do not output markdown. Do not wrap JSON in code fences. Do not explain anything outside the JSON.

For each scene/shot, you must output these fields:
- order, time_range, duration, start_time, shot_goal, visual_content_description, location_setting
- character_desc, emotion_state, action_blocking, product_desc, must_show, on_screen_text_graphics
- camera_shot_size, camera_angle, camera_movement, composition_notes
- lighting_atmosphere, color_grading
- original_script, rewritten_script, language_style, emphasis_notes
- audio_bgm, audio_sfx, ambient_sound
- editing_transition, pacing_notes
- constraints_real_shoot, constraints_compliance
- image_prompt, video_prompt
- visual_description, camera_notes, lighting_notes
- has_person, has_product
- locked_elements, replaceable_elements, character_continuity_rules, product_continuity_rules, video_motion_plan

Output JSON schema:
{
  "total_duration": 0,
  "scene_count": 0,
  "scenes": [
    {
      "order": 1,
      "time_range": "00:00-00:03",
      "duration": 3,
      "start_time": "00:00",
      "shot_goal": "...",
      "visual_content_description": "...",
      "location_setting": "...",
      "character_desc": "...",
      "emotion_state": "...",
      "action_blocking": "...",
      "product_desc": "...",
      "must_show": "...",
      "on_screen_text_graphics": "...",
      "camera_shot_size": "...",
      "camera_angle": "...",
      "camera_movement": "...",
      "composition_notes": "...",
      "lighting_atmosphere": "...",
      "color_grading": "...",
      "original_script": "...",
      "rewritten_script": "...",
      "language_style": "...",
      "emphasis_notes": "...",
      "audio_bgm": "...",
      "audio_sfx": "...",
      "ambient_sound": "...",
      "editing_transition": "...",
      "pacing_notes": "...",
      "locked_elements": { "composition": "...", "camera_language": "...", "scene_layout": "...", "lighting_logic": "...", "mood": "..." },
      "replaceable_elements": { "character_identity": true, "product_identity": true },
      "character_continuity_rules": { "pose_anchor": "...", "gaze_direction": "...", "gesture_logic": "...", "wardrobe_logic": "..." },
      "product_continuity_rules": { "scale_in_frame": "...", "orientation": "...", "interaction_logic": "...", "hero_priority": "..." },
      "video_motion_plan": { "start_state": "...", "motion_beat_1": "...", "motion_beat_2": "...", "motion_beat_3": "...", "end_state": "..." },
      "constraints_real_shoot": "...",
      "constraints_compliance": "...",
      "image_prompt": "English controlled reconstruction prompt.",
      "video_prompt": "English detailed controlled shot reconstruction prompt.",
      "visual_description": "...",
      "camera_notes": "...",
      "lighting_notes": "...",
      "has_person": true,
      "has_product": true
    }
  ]
}`;

  output.push({
    json: {
      ...j,
      gemini_body: {
        contents: [{ role: 'user', parts: [{ text: promptText }, { inline_data: { mime_type: 'video/mp4', data: base64 } }] }],
        generation_config: { response_mime_type: 'application/json', temperature: 0.3 }
      },
      _debug_binary: { binaryKey, buffer_length: buffer.length, base64_length: base64.length }
    },
    binary: item.binary
  });
}
return output;"""

CODE_PARSE_GEMINI = r"""const downloaded = $('解析下载结果').first().json || {};
const current = $json || {};

function getAllText(root) {
  const r = Array.isArray(root) ? root[0] : root;
  const parts = r?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p?.text || '').join('\n').trim();
}
function stripCodeFence(text) {
  return String(text || '').replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
}
function tryParseJsonWithFixes(text) {
  const errs = [];
  try { return { obj: JSON.parse(text), fixedText: text, errs }; } catch(e) { errs.push('direct: '+e.message); }
  let fixed = text;
  fixed = fixed.replace(/(\"time_range\"\s*:\s*)([^\"\s][^,\n}]*)/g,(m,p1,p2)=>`${p1}"${String(p2).trim().replace(/^\"+|\"+$/g,'')}"`);
  fixed = fixed.replace(/,\s*([}\]])/g,'$1');
  try { return { obj: JSON.parse(fixed), fixedText: fixed, errs }; } catch(e) { errs.push('fixed: '+e.message); }
  return { obj: null, fixedText: fixed, errs };
}

const rawText = getAllText(current);
if (!rawText) throw new Error(`Gemini返回格式异常: ${JSON.stringify(current).slice(0,1500)}`);

const cleanText = stripCodeFence(rawText);
const { obj: parsed, fixedText, errs } = tryParseJsonWithFixes(cleanText);
if (!parsed) throw new Error(`Gemini返回JSON解析失败: ${errs.join(' | ')}; 原始文本: ${cleanText.slice(0,2000)}`);
if (!parsed.scenes || !Array.isArray(parsed.scenes)) throw new Error('Gemini未返回scenes数组');

return {
  json: { ...downloaded, ...current, scenes: parsed.scenes, totalDuration: parsed.total_duration ?? 0, sceneCount: parsed.scene_count ?? parsed.scenes.length, gemini_raw_text: fixedText },
  binary: $binary
};"""

CODE_EXTRACT_KEYFRAMES = r"""const root = $input.first().json || {};
const downloaded = $('解析下载结果').first().json || {};

const scenes = root.scenes || [];
const localVideoPath = root.localVideoPath || downloaded.localVideoPath;
const taskId = root.taskId || downloaded.taskId;
const workDir = root.workDir || downloaded.workDir;

if (!Array.isArray(scenes) || !scenes.length) throw new Error('No scenes from Gemini');
if (!localVideoPath) throw new Error('缺少 localVideoPath');
if (!workDir) throw new Error('缺少 workDir');

return scenes.map((scene, i) => {
  const order = Number(scene.order || (i + 1));
  const timestamp = String(scene.start_time || scene.time_range?.split('-')[0] || '00:00').trim() || '00:00';
  const fileName = `frame_${String(order).padStart(3,'0')}.png`;
  const outputPath = `${workDir}/${fileName}`;
  const sceneDataBase64 = Buffer.from(JSON.stringify(scene),'utf8').toString('base64');
  return {
    json: {
      ...root, taskId, localVideoPath, workDir, order, timestamp, fileName, outputPath,
      supabase_url: root.supabase_url || downloaded.supabase_url,
      supabase_api_key: root.supabase_api_key || downloaded.supabase_api_key,
      supabase_bucket: root.supabase_bucket || downloaded.supabase_bucket || 'uploads',
      sceneDataBase64
    }
  };
});"""

CMD_FFMPEG = r"""WORK_DIR="{{ $json.workDir }}"
LOCAL_VIDEO_PATH="{{ $json.localVideoPath }}"
VIDEO_URL="{{ $json.videoUrl || $json.video_url || $('准备参数').first().json.videoUrl || $('准备参数').first().json.video_url }}"
TIMESTAMP="{{ $json.timestamp }}"
OUTPUT_PATH="{{ $json.outputPath }}"
TASK_ID="{{ $json.taskId }}"
ORDER="{{ $json.order }}"
FILE_NAME="{{ $json.fileName }}"
SCENE_B64="{{ $json.sceneDataBase64 }}"

mkdir -p "$WORK_DIR" || exit 1

if [ ! -s "$LOCAL_VIDEO_PATH" ]; then
  node -e "
const fs=require('fs'),http=require('http'),https=require('https');
const url=process.argv[1],out=process.argv[2];
if(!url){console.error('missing video url');process.exit(1);}
const client=url.startsWith('https')?https:http;
const file=fs.createWriteStream(out);
client.get(url,(res)=>{
  if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){
    const rc=res.headers.location.startsWith('https')?https:http;
    rc.get(res.headers.location,(r2)=>{if(r2.statusCode!==200){console.error('redirect failed '+r2.statusCode);process.exit(1);}r2.pipe(file);file.on('finish',()=>file.close());}).on('error',(e)=>{console.error(e.message);process.exit(1);});return;
  }
  if(res.statusCode!==200){console.error('download failed '+res.statusCode);process.exit(1);}
  res.pipe(file);file.on('finish',()=>file.close());
}).on('error',(e)=>{console.error(e.message);process.exit(1);});
" "$VIDEO_URL" "$LOCAL_VIDEO_PATH"
fi

if [ ! -s "$LOCAL_VIDEO_PATH" ]; then
  echo '{"success":false,"message":"local video file not found after re-download"}' >&2
  exit 1
fi

ffmpeg -nostats -loglevel error -y -ss "$TIMESTAMP" -i "$LOCAL_VIDEO_PATH" -frames:v 1 "$OUTPUT_PATH" >/dev/null 2>&1

if [ ! -f "$OUTPUT_PATH" ]; then
  ffmpeg -nostats -loglevel error -y -sseof -1 -i "$LOCAL_VIDEO_PATH" -frames:v 1 "$OUTPUT_PATH" >/dev/null 2>&1
fi

if [ ! -f "$OUTPUT_PATH" ]; then
  echo '{"success":false,"message":"frame file not found after ffmpeg"}' >&2
  exit 1
fi

printf '{"taskId":"%s","order":%s,"fileName":"%s","outputPath":"%s","sceneDataBase64":"%s"}\n' \
  "$TASK_ID" "$ORDER" "$FILE_NAME" "$OUTPUT_PATH" "$SCENE_B64" """

CODE_PARSE_FRAME = r"""const raw = String($json.stdout || '').trim();
if (!raw) throw new Error('FFmpeg提取单帧没有返回 stdout');

let parsed;
try { parsed = JSON.parse(raw); }
catch(e) { throw new Error(`解析抽帧结果失败: ${e.message}; 原始输出: ${raw}`); }

const sceneDataBase64 = parsed.sceneDataBase64 || '';
if (!sceneDataBase64) throw new Error('缺少 sceneDataBase64');

let sceneData;
try { sceneData = JSON.parse(Buffer.from(sceneDataBase64,'base64').toString('utf8')); }
catch(e) { throw new Error(`sceneDataBase64 解码失败: ${e.message}`); }

const base = $('提取场景关键帧').item.json;
return {
  json: {
    taskId: parsed.taskId, order: parsed.order, fileName: parsed.fileName, outputPath: parsed.outputPath,
    supabase_url: base.supabase_url, supabase_api_key: base.supabase_api_key, supabase_bucket: base.supabase_bucket || 'uploads',
    sceneDataBase64, sceneData, ...sceneData
  }
};"""

CODE_ASSEMBLE_FRAME_URL = r"""function text(v) { return v == null ? '' : String(v).trim(); }
function getNameFromPath(value) {
  const raw = text(value);
  if (!raw) return '';
  const clean = raw.split('?')[0].replace(/\\+/g, '/');
  const parts = clean.split('/').filter(Boolean);
  if (!parts.length) return clean;
  return parts[parts.length - 1];
}
function toPretty(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}
function joinBlocks(blocks) { return blocks.filter(Boolean).join('\n\n').trim(); }
function getFileName(meta) {
  const direct = getNameFromPath(meta.fileName) || getNameFromPath(meta.filename) || getNameFromPath(meta.file_name) ||
    getNameFromPath(meta.name) || getNameFromPath(meta.Key) || getNameFromPath(meta.key);
  if (direct) return direct;
  const op = getNameFromPath(meta.outputPath || meta.output_path || meta.path);
  if (op) return op;
  const url = getNameFromPath(meta.publicUrl || meta.public_url || meta.url);
  if (url) return url;
  return '';
}

const meta = $json || {};
const sceneData = meta.sceneData || {};
const base = $('准备参数').first().json || {};

const supabaseUrl = text(meta.supabase_url || base.supabase_url);
const bucket = text(meta.supabase_bucket || base.supabase_bucket || 'uploads');
const taskId = text(meta.taskId || meta.task_id || base.taskId || base.task_id);
const fileName = getFileName(meta);
const publicUrl = supabaseUrl && taskId && fileName
  ? `${supabaseUrl}/storage/v1/object/public/${bucket}/${taskId}/${fileName}` : '';

const productName = text(base.productName || base.product_name);
const productDescription = text(base.productDescription || base.product_description);
const productSellingPoints = text(base.productSellingPoints || base.product_selling_points);
const characterName = text(base.characterName||base.character_name||base.characterId||base.character_id);

const shotGoal = text(sceneData.shot_goal);
const visualContentDescription = text(sceneData.visual_content_description);
const locationSetting = text(sceneData.location_setting);
const characterDesc = text(sceneData.character_desc);
const emotionState = text(sceneData.emotion_state);
const actionBlocking = text(sceneData.action_blocking);
const productDesc = text(sceneData.product_desc);
const mustShow = text(sceneData.must_show);
const onScreenTextGraphics = text(sceneData.on_screen_text_graphics);
const cameraShotSize = text(sceneData.camera_shot_size);
const cameraAngle = text(sceneData.camera_angle);
const cameraMovement = text(sceneData.camera_movement);
const compositionNotes = text(sceneData.composition_notes);
const lightingAtmosphere = text(sceneData.lighting_atmosphere);
const colorGrading = text(sceneData.color_grading);
const pacingNotes = text(sceneData.pacing_notes);
const editingTransition = text(sceneData.editing_transition);
const cameraNotes = text(sceneData.camera_notes);
const lightingNotes = text(sceneData.lighting_notes);
const lockedElements = toPretty(sceneData.locked_elements);
const replaceableElements = toPretty(sceneData.replaceable_elements);
const characterContinuityRules = toPretty(sceneData.character_continuity_rules);
const productContinuityRules = toPretty(sceneData.product_continuity_rules);
const videoMotionPlan = toPretty(sceneData.video_motion_plan);
const hasPerson = sceneData.has_person === true;
const hasProduct = sceneData.has_product === true;

const finalImagePrompt = joinBlocks([
  `You are rebuilding a commercial still from a source-video shot for viral-clone production.`,
  `Core rule:\nPreserve the original shot design, composition, camera logic, scene structure, lighting logic, emotional purpose, and action staging.\nOnly replace subject identity where applicable.\nDo not redesign the shot.`,
  `Reference image usage rules:\n- The reference frame image is the primary anchor for composition, crop, perspective, camera height, subject placement, scene layout, background structure, lighting direction, shadow logic, and storytelling purpose.\n- The character reference image, if provided, is only for replacing and locking character identity.\n- The product reference image, if provided, is only for replacing and locking product identity.\n- Do not let the character reference image change the shot design.\n- Do not let the product reference image change the shot design.\n- Do not print or describe any image URLs in the output.`,
  `Character identity:\n- character_name: ${characterName||'N/A'}\n- shot_has_person: ${hasPerson?'true':'false'}\n- character_desc: ${characterDesc||'N/A'}`,
  `Product identity:\n- product_name: ${productName||'N/A'}\n- product_description: ${productDescription||'N/A'}\n- product_selling_points: ${productSellingPoints||'N/A'}\n- shot_has_product: ${hasProduct?'true':'false'}\n- product_desc_in_shot: ${productDesc||'N/A'}`,
  `Shot purpose and visual anchor:\n- shot_goal: ${shotGoal||'N/A'}\n- visual_content_description: ${visualContentDescription||'N/A'}\n- location_setting: ${locationSetting||'N/A'}\n- emotion_state: ${emotionState||'N/A'}\n- action_blocking: ${actionBlocking||'N/A'}\n- must_show: ${mustShow||'N/A'}\n- on_screen_text_graphics: ${onScreenTextGraphics||'none'}`,
  `Camera and composition:\n- camera_shot_size: ${cameraShotSize||'N/A'}\n- camera_angle: ${cameraAngle||'N/A'}\n- camera_movement: ${cameraMovement||'N/A'}\n- composition_notes: ${compositionNotes||'N/A'}\n- camera_notes: ${cameraNotes||'N/A'}`,
  `Lighting and color:\n- lighting_atmosphere: ${lightingAtmosphere||'N/A'}\n- color_grading: ${colorGrading||'N/A'}\n- lighting_notes: ${lightingNotes||'N/A'}`,
  lockedElements ? `Locked elements to preserve exactly:\n${lockedElements}` : '',
  replaceableElements ? `Replaceable elements:\n${replaceableElements}` : '',
  characterContinuityRules ? `Character continuity rules:\n${characterContinuityRules}` : '',
  productContinuityRules ? `Product continuity rules:\n${productContinuityRules}` : '',
  `Negative rules:\n- no new composition\n- no new camera angle\n- no new scene concept\n- no extra people\n- no extra products\n- no subtitles\n- no UI overlays\n- no watermark\n- no border\n- no collage\n- no product deformation\n- no off-model face`,
  `Output target:\nA photorealistic commercial still that looks like the same original shot, with only the character identity and/or product identity replaced when applicable.`
]);

const finalVideoPrompt = joinBlocks([
  `Create a short commercial video shot that faithfully reconstructs the original source-video shot logic.`,
  `Core rule:\nThis is not a new concept. This is a controlled shot reconstruction.\nPreserve the original shot design, camera grammar, staging logic, reveal logic, product role, emotional purpose, and pacing.\nOnly replace subject identity where applicable.`,
  `Character:\n- character_name: ${characterName||'N/A'}\n- shot_has_person: ${hasPerson?'true':'false'}\n- character_desc: ${characterDesc||'N/A'}`,
  `Product:\n- product_name: ${productName||'N/A'}\n- product_description: ${productDescription||'N/A'}\n- product_selling_points: ${productSellingPoints||'N/A'}\n- shot_has_product: ${hasProduct?'true':'false'}\n- product_desc_in_shot: ${productDesc||'N/A'}`,
  `Shot purpose:\n- shot_goal: ${shotGoal||'N/A'}\n- emotion_state: ${emotionState||'N/A'}\n- must_show: ${mustShow||'N/A'}`,
  `Visual anchor:\n- visual_content_description: ${visualContentDescription||'N/A'}\n- location_setting: ${locationSetting||'N/A'}\n- action_blocking: ${actionBlocking||'N/A'}`,
  `Camera direction:\n- camera_shot_size: ${cameraShotSize||'N/A'}\n- camera_angle: ${cameraAngle||'N/A'}\n- camera_movement: ${cameraMovement||'N/A'}\n- composition_notes: ${compositionNotes||'N/A'}\n- camera_notes: ${cameraNotes||'N/A'}`,
  `Scene and light:\n- lighting_atmosphere: ${lightingAtmosphere||'N/A'}\n- color_grading: ${colorGrading||'N/A'}\n- lighting_notes: ${lightingNotes||'N/A'}`,
  `Editing and pace:\n- pacing_notes: ${pacingNotes||'N/A'}\n- editing_transition: ${editingTransition||'N/A'}`,
  lockedElements ? `Locked elements to preserve:\n${lockedElements}` : '',
  replaceableElements ? `Replaceable elements:\n${replaceableElements}` : '',
  characterContinuityRules ? `Character continuity rules:\n${characterContinuityRules}` : '',
  productContinuityRules ? `Product continuity rules:\n${productContinuityRules}` : '',
  videoMotionPlan ? `Motion plan:\n${videoMotionPlan}` : '',
  `Negative rules:\n- no extra characters\n- no extra products\n- no subtitle text\n- no UI overlays\n- no random decorative props\n- no scene redesign\n- no exaggerated fantasy motion\n- no product deformation\n- no logo corruption\n- no off-model faces`,
  `Output target:\nA photorealistic ad shot video that preserves the original shot design and only replaces the character identity and/or product identity where applicable.`
]);

return {
  json: {
    ...sceneData, ...meta, taskId, order: meta.order,
    file_name: fileName || '', reference_frame_url: publicUrl || '',
    final_image_prompt: finalImagePrompt, final_video_prompt: finalVideoPrompt
  }
};"""

# ── NEW: 准备分镜写入数据 ──
CODE_PREPARE_SEGMENT = r"""const meta = $json || {};
const sceneData = meta.sceneData || {};
const base = $('准备参数').first().json || {};

const taskId = String(meta.taskId || base.taskId || '');
const order = Number(meta.order || 0);

const cameraList = [
  sceneData.camera_shot_size, sceneData.camera_angle, sceneData.camera_movement
].filter(Boolean).join(' / ');

const segmentId = 'seg_' + taskId + '_' + String(order).padStart(4, '0');

return {
  json: {
    ...meta,
    _supabase_url: base.supabase_url,
    _supabase_api_key: base.supabase_api_key,
    _segment_body: {
      id: segmentId,
      task_id: taskId,
      order: order,
      duration: Number(sceneData.duration || meta.duration || 8),
      time_range: sceneData.time_range || meta.time_range || null,
      image_prompt: meta.final_image_prompt || null,
      video_prompt: meta.final_video_prompt || null,
      original_script: sceneData.original_script || null,
      rewritten_script: sceneData.rewritten_script || null,
      visual_description: sceneData.visual_description || sceneData.visual_content_description || null,
      camera_notes: sceneData.camera_notes || cameraList || null,
      lighting_notes: sceneData.lighting_notes || sceneData.lighting_atmosphere || null,
      status: 'PENDING_IMAGE',
      updated_at: new Date().toISOString(),
      generation_params: {
        reference_frame_url: meta.reference_frame_url || null,
        has_person: sceneData.has_person ?? true,
        has_product: sceneData.has_product ?? true,
        subject_refs: [],
        image_history: []
      }
    }
  }
};"""

# ── MODIFIED: 汇总全部分镜 ──
CODE_AGGREGATE = r"""// 从组装参考帧URL节点读取所有已处理的分镜
// 这样即使 写入分镜-Supabase 节点出现错误，汇总逻辑也不受影响
const items = $('组装参考帧URL').all();
if (!items.length) throw new Error('No uploaded frame items to aggregate');

const base = $('准备参数').first().json;
const parsed = $('解析拆解结果').first().json;

const segments = items
  .map(item => item.json)
  .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

return [{
  json: {
    taskId: base.taskId, callbackUrl: base.callbackUrl,
    apiKey: base.apiKey, workflowId: base.workflowId, workDir: base.workDir,
    totalDuration: parsed.totalDuration, sceneCount: parsed.sceneCount, segments
  }
}];"""

# ── Build nodes list ──
nodes = [
  {
    "parameters": {"httpMethod": "POST", "path": "storyboard_disassembly_web", "options": {}},
    "id": "50146697-c1bd-4381-84c2-0f7efcf09d86", "name": "Webhook",
    "position": [6656, -832], "type": "n8n-nodes-base.webhook", "typeVersion": 2,
    "webhookId": "34bcd0ec-a8b7-48cd-a6fd-27a25e4b4e6b"
  },
  {
    "parameters": {"mode": "runOnceForEachItem", "jsCode": CODE_PREPARE},
    "id": "21f3ccb9-3333-4dcd-931a-a4e6dfdea05f", "name": "准备参数",
    "position": [6880, -832], "type": "n8n-nodes-base.code", "typeVersion": 2
  },
  {
    "parameters": {"command": CMD_DOWNLOAD},
    "id": "7908e599-162f-441b-9635-e638deebf9fd", "name": "下载视频到本地",
    "position": [7104, -832], "type": "n8n-nodes-base.executeCommand", "typeVersion": 1
  },
  {
    "parameters": {"mode": "runOnceForEachItem", "jsCode": CODE_PARSE_DOWNLOAD},
    "id": "75016500-5b74-4bb9-82e1-866632dd5062", "name": "解析下载结果",
    "position": [7328, -832], "type": "n8n-nodes-base.code", "typeVersion": 2
  },
  {
    "parameters": {"fileSelector": "={{ $json.localVideoPath }}", "options": {}},
    "id": "132de73c-10c8-4c33-ae2f-91c01e94a6fa", "name": "读取视频文件",
    "position": [7552, -832], "type": "n8n-nodes-base.readWriteFile", "typeVersion": 1
  },
  {
    "parameters": {"jsCode": CODE_ASSEMBLE_GEMINI},
    "id": "c0df917e-1df8-4cf8-8da7-bddec589b39f", "name": "组装 gemini_body",
    "position": [7776, -832], "type": "n8n-nodes-base.code", "typeVersion": 2
  },
  {
    "parameters": {
      "method": "POST",
      "url": "https://yunwu.ai/v1beta/models/gemini-2.5-pro:generateContent",
      "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
      "sendHeaders": True,
      "headerParameters": {"parameters": [{"name": "Content-Type", "value": "application/json"}]},
      "sendBody": True, "specifyBody": "json", "jsonBody": "={{ $json.gemini_body }}",
      "options": {"timeout": 900000}
    },
    "id": "e9474469-8a22-4310-a44f-c5fd6d4e0c2a", "name": "Gemini视频分析",
    "position": [8000, -832], "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
    "credentials": {"httpHeaderAuth": {"id": "mMIH382GnJoMSu4L", "name": "Header Auth account"}}
  },
  {
    "parameters": {"mode": "runOnceForEachItem", "jsCode": CODE_PARSE_GEMINI},
    "id": "73c9fe63-7a44-4fba-a5b7-86cda0808f4c", "name": "解析拆解结果",
    "position": [8224, -832], "type": "n8n-nodes-base.code", "typeVersion": 2
  },
  {
    "parameters": {"jsCode": CODE_EXTRACT_KEYFRAMES},
    "id": "438f9676-6e83-4b32-bc3b-88c0257d24eb", "name": "提取场景关键帧",
    "position": [8448, -832], "type": "n8n-nodes-base.code", "typeVersion": 2
  },
  {
    "parameters": {"executeOnce": False, "command": CMD_FFMPEG},
    "id": "c3951ebe-15bc-44e6-9541-f0d6616bddee", "name": "FFmpeg提取单帧",
    "position": [8672, -832], "type": "n8n-nodes-base.executeCommand", "typeVersion": 1
  },
  {
    "parameters": {"mode": "runOnceForEachItem", "jsCode": CODE_PARSE_FRAME},
    "id": "f7c84a7f-5925-4e5e-bf9e-752c010149ca", "name": "解析抽帧结果",
    "position": [8896, -832], "type": "n8n-nodes-base.code", "typeVersion": 2
  },
  {
    "parameters": {"fileSelector": "={{ $json.outputPath }}", "options": {}},
    "id": "7072b25d-a2df-4987-8566-c64e75ebeedc", "name": "读取单帧文件",
    "position": [9120, -832], "type": "n8n-nodes-base.readWriteFile", "typeVersion": 1
  },
  {
    "parameters": {
      "method": "POST",
      "url": "={{ $('准备参数').item.json.supabase_url }}/storage/v1/object/{{ $json.supabase_bucket || 'uploads' }}/{{ $('准备参数').item.json.taskId }}/{{ $json.fileName }}",
      "sendHeaders": True,
      "headerParameters": {"parameters": [
        {"name": "Authorization", "value": "={{ 'Bearer ' + $('准备参数').item.json.supabase_api_key }}"},
        {"name": "apikey", "value": "={{ $('准备参数').item.json.supabase_api_key }}"},
        {"name": "Content-Type", "value": "={{$binary.data?.mimeType || 'image/png'}}"},
        {"name": "x-upsert", "value": "true"}
      ]},
      "sendBody": True, "contentType": "binaryData", "inputDataFieldName": "data", "options": {}
    },
    "id": "760aac7f-83b3-43de-96f5-9f3accdd6a10", "name": "HTTP上传到SupabaseStorage",
    "position": [9344, -832], "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2
  },
  {
    "parameters": {"mode": "runOnceForEachItem", "jsCode": CODE_ASSEMBLE_FRAME_URL},
    "id": "0056da3a-35ae-4e5b-8674-6b66da6f0d52", "name": "组装参考帧URL",
    "position": [9568, -832], "type": "n8n-nodes-base.code", "typeVersion": 2
  },
  # ── NEW NODE 1 ──
  {
    "parameters": {"mode": "runOnceForEachItem", "jsCode": CODE_PREPARE_SEGMENT},
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "name": "准备分镜写入数据",
    "position": [9792, -832], "type": "n8n-nodes-base.code", "typeVersion": 2
  },
  # ── NEW NODE 2 ──
  {
    "parameters": {
      "method": "POST",
      "url": "={{ $json._supabase_url }}/rest/v1/storyboard_segments",
      "sendHeaders": True,
      "headerParameters": {"parameters": [
        {"name": "apikey", "value": "={{ $json._supabase_api_key }}"},
        {"name": "Authorization", "value": "={{ 'Bearer ' + $json._supabase_api_key }}"},
        {"name": "Content-Type", "value": "application/json"},
        {"name": "Prefer", "value": "resolution=merge-duplicates,return=minimal"}
      ]},
      "sendBody": True, "specifyBody": "json", "jsonBody": "={{ $json._segment_body }}", "options": {}
    },
    "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901", "name": "写入分镜-Supabase",
    "position": [10016, -832], "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
    "alwaysOutputData": True, "onError": "continueRegularOutput"
  },
  # ── MODIFIED: 汇总全部分镜 ──
  {
    "parameters": {"jsCode": CODE_AGGREGATE},
    "id": "6ba586a8-1abe-4701-8501-ef7433c3ddeb", "name": "汇总全部分镜",
    "position": [10240, -832], "type": "n8n-nodes-base.code", "typeVersion": 2
  },
  {
    "parameters": {"url": "=http://47.107.158.233:8080/workflow-credits/query?workflow_id={{ $json.workflowId }}", "options": {}},
    "id": "5102dc1f-21fe-4ab9-8545-95fc7e1076b6", "name": "查询积分配置",
    "position": [10464, -832], "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2
  },
  {
    "parameters": {
      "method": "POST", "url": "=http://47.107.158.233:8080/api/credits/deduct",
      "sendBody": True,
      "bodyParameters": {"parameters": [
        {"name": "api_key", "value": "={{ $('汇总全部分镜').first().json.apiKey }}"},
        {"name": "workflow_id", "value": "={{ $('汇总全部分镜').first().json.workflowId }}"},
        {"name": "amount", "value": "={{ $json.credits || $json.data?.credits || $json.amount || 10 }}"}
      ]},
      "options": {}
    },
    "id": "5050036d-ade6-4575-b763-9bc6ef9cf36d", "name": "扣除积分",
    "position": [10688, -832], "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2
  },
  {
    "parameters": {
      "method": "POST", "url": "={{ $('准备参数').first().json.callbackUrl }}",
      "sendHeaders": True,
      "headerParameters": {"parameters": [
        {"name": "x-admin-token", "value": "={{ $('准备参数').first().json.adminToken }}"},
        {"name": "Content-Type", "value": "application/json"}
      ]},
      "sendBody": True,
      "bodyParameters": {"parameters": [
        {"name": "task_id", "value": "={{ $('汇总全部分镜').first().json.taskId }}"},
        {"name": "status", "value": "completed"},
        {"name": "segments", "value": "={{ JSON.stringify($('汇总全部分镜').first().json.segments) }}"},
        {"name": "workflow_data", "value": "={{ JSON.stringify({ total_duration: $('汇总全部分镜').first().json.totalDuration, scene_count: $('汇总全部分镜').first().json.sceneCount, analysis_model: 'gemini-2.5-pro' }) }}"},
        {"name": "api_key", "value": "={{ $('准备参数').first().json.apiKey }}"}
      ]},
      "options": {}
    },
    "id": "01813ae0-6d81-484d-806b-4131f80df0a2", "name": "回调App-拆解完成",
    "position": [10912, -832], "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2
  },
  {
    "parameters": {"command": "=rm -rf {{ $('汇总全部分镜').first().json.workDir }}"},
    "id": "f982e442-c99b-4580-b617-4e7b7b5083b0", "name": "清理缓存",
    "position": [11136, -832], "type": "n8n-nodes-base.executeCommand", "typeVersion": 1
  }
]

connections = {
  "Webhook": {"main": [[{"node":"准备参数","type":"main","index":0}]]},
  "准备参数": {"main": [[{"node":"下载视频到本地","type":"main","index":0}]]},
  "下载视频到本地": {"main": [[{"node":"解析下载结果","type":"main","index":0}]]},
  "解析下载结果": {"main": [[{"node":"读取视频文件","type":"main","index":0}]]},
  "读取视频文件": {"main": [[{"node":"组装 gemini_body","type":"main","index":0}]]},
  "组装 gemini_body": {"main": [[{"node":"Gemini视频分析","type":"main","index":0}]]},
  "Gemini视频分析": {"main": [[{"node":"解析拆解结果","type":"main","index":0}]]},
  "解析拆解结果": {"main": [[{"node":"提取场景关键帧","type":"main","index":0}]]},
  "提取场景关键帧": {"main": [[{"node":"FFmpeg提取单帧","type":"main","index":0}]]},
  "FFmpeg提取单帧": {"main": [[{"node":"解析抽帧结果","type":"main","index":0}]]},
  "解析抽帧结果": {"main": [[{"node":"读取单帧文件","type":"main","index":0}]]},
  "读取单帧文件": {"main": [[{"node":"HTTP上传到SupabaseStorage","type":"main","index":0}]]},
  "HTTP上传到SupabaseStorage": {"main": [[{"node":"组装参考帧URL","type":"main","index":0}]]},
  "组装参考帧URL": {"main": [[{"node":"准备分镜写入数据","type":"main","index":0}]]},
  "准备分镜写入数据": {"main": [[{"node":"写入分镜-Supabase","type":"main","index":0}]]},
  "写入分镜-Supabase": {"main": [[{"node":"汇总全部分镜","type":"main","index":0}]]},
  "汇总全部分镜": {"main": [[{"node":"查询积分配置","type":"main","index":0}]]},
  "查询积分配置": {"main": [[{"node":"扣除积分","type":"main","index":0}]]},
  "扣除积分": {"main": [[{"node":"回调App-拆解完成","type":"main","index":0}]]},
  "回调App-拆解完成": {"main": [[{"node":"清理缓存","type":"main","index":0}]]},
}

workflow = {
  "name": "分镜拆解-网页版",
  "nodes": nodes,
  "connections": connections,
  "settings": {"executionOrder": "v1"},
  "meta": {"instanceId": "f5de7f2967fea28691928d5cc106b2279dbf4197e0e2c62d616c8450d409e0e7"}
}

out_path = os.path.join(os.path.dirname(__file__), "分镜拆解-网页版.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(workflow, f, ensure_ascii=False, indent=2)

# Verify it parses cleanly
with open(out_path, encoding="utf-8") as f:
    json.load(f)

print(f"OK: {out_path}")
print(f"Size: {os.path.getsize(out_path)} bytes")
