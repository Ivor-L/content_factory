"""Build 小程序首页-爆款拆解-分镜网格-OSS.json.

The workflow is intentionally generated from code because n8n JSON nodes contain
large prompt strings and shell scripts that are painful to maintain by hand.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "小程序首页-爆款拆解-分镜网格-OSS.json"


def node(name, node_type, position, parameters, type_version=2, node_id=None, credentials=None):
    item = {
        "parameters": parameters,
        "id": node_id or name,
        "name": name,
        "position": position,
        "type": node_type,
        "typeVersion": type_version,
    }
    if credentials:
        item["credentials"] = credentials
    return item


CODE_PREPARE = r"""const root = $json || {};
const body = root.body && typeof root.body === 'object' && !Array.isArray(root.body)
  ? root.body
  : root;

function parseMaybeJson(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const data = parseMaybeJson(body.data || root.data);
const metadata = {
  ...parseMaybeJson(root.metadata),
  ...parseMaybeJson(body.metadata),
  ...parseMaybeJson(data.metadata),
};

const pick = (...vals) => {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

function normalizeSourceUrl(value) {
  const raw = pick(value);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  return raw;
}

const taskId = pick(
  body.task_id, body.taskId, body.record_id, body.recordId,
  data.task_id, data.taskId, data.record_id, data.recordId,
  root.task_id, root.taskId, root.record_id, root.recordId
);
const videoUrl = normalizeSourceUrl(pick(
  body.video_url, body.videoUrl, body.url,
  body.reference_video_url, body.referenceVideoUrl,
  data.video_url, data.videoUrl, data.url,
  data.reference_video_url, data.referenceVideoUrl,
  metadata.video_url, metadata.videoUrl,
  metadata.reference_video_url, metadata.referenceVideoUrl
));
const callbackUrl = pick(body.callback_url, body.callbackUrl, data.callback_url, data.callbackUrl, root.callback_url, root.callbackUrl).replace(/\/$/, '');
const appUrl = pick(body.app_url, body.appUrl, data.app_url, data.appUrl, root.app_url, root.appUrl).replace(/\/$/, '');
const adminToken = pick(body.admin_token, body.adminToken, data.admin_token, data.adminToken, root.admin_token, root.adminToken);
const apiKey = pick(body.api_key, body.apiKey, data.api_key, data.apiKey, root.api_key, root.apiKey);

if (!taskId) throw new Error('task_id/taskId is required');
if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) {
  throw new Error(
    `video_url is required; tried video_url/videoUrl/url/reference_video_url/referenceVideoUrl/metadata.reference_video_url. body_keys=${Object.keys(body).join(',')}; data_keys=${Object.keys(data).join(',')}; metadata_keys=${Object.keys(metadata).join(',')}`
  );
}
if (!callbackUrl) throw new Error('callback_url is required');

const frameIntervalSec = Math.max(0.5, Number(body.frame_interval_s || body.frameIntervalSec || 1) || 1);
const maxOverviewFrames = Math.max(10, Number(body.max_overview_frames || body.maxOverviewFrames || 40) || 40);
const clipMaxSeconds = Math.min(15, Math.max(4, Number(body.clip_max_seconds || body.clipMaxSeconds || 15) || 15));

return {
  json: {
    taskId,
    record_id: taskId,
    videoUrl,
    original_video_url: videoUrl,
    callbackUrl,
    appUrl,
    adminToken,
    apiKey,
    userId: pick(body.user_id, body.userId, data.user_id, data.userId),
    productName: pick(body.product_name, body.productName, data.product_name, data.productName, metadata.product_name, metadata.productName),
    productDescription: pick(body.product_description, body.productDescription, data.product_description, data.productDescription, metadata.product_description, metadata.productDescription),
    productSellingPoints: pick(body.product_selling_points, body.productSellingPoints, data.product_selling_points, data.productSellingPoints, metadata.product_selling_points, metadata.productSellingPoints),
    targetLanguage: pick(body.target_language, body.targetLanguage, data.target_language, data.targetLanguage, metadata.target_language, metadata.targetLanguage, '中文'),
    targetCountry: pick(body.target_country, body.targetCountry, data.target_country, data.targetCountry, metadata.target_country, metadata.targetCountry, '中国'),
    workflowId: pick(body.workflow_id, body.workflowId, data.workflow_id, data.workflowId, 'flow_miniapp_viral_breakdown'),
    workflowName: pick(body.workflow_name, body.workflowName, data.workflow_name, data.workflowName, '小程序首页爆款拆解'),
    pipelineKey: 'miniapp_viral_breakdown_grid',
    frameIntervalSec,
    maxOverviewFrames,
    clipMaxSeconds,
    workDir: `/tmp/miniapp_viral_bd_${taskId}`
  }
};"""


CMD_DOWNLOAD = r"""=WORK_DIR="{{ $json.workDir }}"
VIDEO_URL="{{ $json.videoUrl }}"
LOCAL_VIDEO_PATH="$WORK_DIR/input.mp4"
TASK_ID="{{ $json.taskId }}"

mkdir -p "$WORK_DIR" || exit 1
export VIDEO_URL LOCAL_VIDEO_PATH TASK_ID

node <<'NODE'
const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const videoUrl = process.env.VIDEO_URL;
const outputPath = process.env.LOCAL_VIDEO_PATH;
const taskId = process.env.TASK_ID;

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(url, (res) => {
      const code = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
        const nextUrl = new URL(res.headers.location, url).toString();
        res.resume();
        return resolve(download(nextUrl, dest, redirects + 1));
      }
      if (code < 200 || code >= 300) {
        res.resume();
        return reject(new Error(`download failed with status ${code}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          const stat = fs.statSync(dest);
          if (!stat.size) return reject(new Error('empty file'));
          process.stdout.write(JSON.stringify({ taskId, localVideoPath: dest, size: stat.size }) + '\n');
          resolve();
        });
      });
      file.on('error', reject);
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
try { parsed = JSON.parse(raw); } catch (e) {
  throw new Error(`解析下载结果失败: ${e.message}; raw=${raw.slice(0, 500)}`);
}
if (!parsed.localVideoPath) throw new Error('下载结果缺少 localVideoPath');
return { json: { ...$('准备参数').first().json, localVideoPath: parsed.localVideoPath, videoSize: parsed.size || 0 } };"""


CMD_FFPROBE = r"""=sh -c '
IN="{{ $json.localVideoPath }}";
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$IN"
'"""


CODE_PARSE_DURATION = r"""const base = $('解析下载结果').first().json;
const duration = Number(String($json.stdout || '').trim());
if (!Number.isFinite(duration) || duration <= 0) {
  throw new Error(`ffprobe duration invalid: ${$json.stdout}`);
}
const clipMaxSeconds = Number(base.clipMaxSeconds || 15);
const totalClips = Math.max(1, Math.ceil(duration / clipMaxSeconds));
return {
  json: {
    ...base,
    videoDurationSec: Number(duration.toFixed(3)),
    totalClips
  }
};"""


CMD_GENERATE_GRIDS = r"""=WORK_DIR="{{ $json.workDir }}"
IN="{{ $json.localVideoPath }}"
DURATION="{{ $json.videoDurationSec }}"
FRAME_INTERVAL="{{ $json.frameIntervalSec }}"
MAX_OVERVIEW="{{ $json.maxOverviewFrames }}"
CLIP_MAX="{{ $json.clipMaxSeconds }}"
TASK_ID="{{ $json.taskId }}"

mkdir -p "$WORK_DIR/grids"
export WORK_DIR IN DURATION FRAME_INTERVAL MAX_OVERVIEW CLIP_MAX TASK_ID

node <<'NODE'
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const workDir = process.env.WORK_DIR;
const input = process.env.IN;
const duration = Number(process.env.DURATION);
const configuredInterval = Number(process.env.FRAME_INTERVAL || 1);
const maxOverview = Number(process.env.MAX_OVERVIEW || 40);
const clipMax = Math.min(15, Number(process.env.CLIP_MAX || 15));
const taskId = process.env.TASK_ID;

function ceil(n) { return Math.max(1, Math.ceil(n)); }
function fmt(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
function escapeDrawtext(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}
function safeTs(sec) {
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, Number(sec) || 0);
  return Math.min(Math.max(0, Number(sec) || 0), Math.max(0, duration - 0.05));
}
function makeGrid({ start, len, kind, clipIndex }) {
  const expected = Math.max(1, Math.ceil(len / configuredInterval));
  const frameCount = kind === 'full' ? Math.min(maxOverview, expected) : Math.min(15, expected);
  const interval = Math.max(0.25, len / frameCount);
  const rows = ceil(frameCount / 5);
  const frameDir = path.join(workDir, 'grids', `${kind}_${String(clipIndex).padStart(2, '0')}_frames`);
  const out = path.join(workDir, 'grids', `${kind}_${String(clipIndex).padStart(2, '0')}.jpg`);
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir, { recursive: true });

  for (let i = 0; i < frameCount; i += 1) {
    const offset = Math.min(Math.max(0, len - 0.05), i * interval);
    const ts = safeTs(start + offset);
    const framePath = path.join(frameDir, `frame_${String(i + 1).padStart(3, '0')}.jpg`);
    const label = `${kind === 'full' ? 'FULL' : 'CLIP ' + clipIndex}  #${i + 1}  ${fmt(ts)}`;
    const vf = [
      'scale=360:-2',
      `drawtext=text='${escapeDrawtext(label)}':x=10:y=10:fontsize=22:fontcolor=yellow:borderw=3:bordercolor=black`
    ].join(',');
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', String(ts),
      '-i', input,
      '-frames:v', '1',
      '-vf', vf,
      '-q:v', '3',
      framePath
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
  }

  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', '1',
    '-i', path.join(frameDir, 'frame_%03d.jpg'),
    '-vf', `tile=5x${rows}:margin=2:padding=2:color=black`,
    '-frames:v', '1',
    '-q:v', '3',
    out
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const stat = fs.statSync(out);
  if (!stat.size) throw new Error(`grid output empty: ${out}`);

  return {
    kind,
    clip_index: clipIndex,
    filePath: out,
    fileName: `${taskId}_${kind}_${String(clipIndex).padStart(2, '0')}.jpg`,
    start_sec: Number(start.toFixed(3)),
    end_sec: Number(Math.min(duration, start + len).toFixed(3)),
    duration: Number(len.toFixed(3)),
    time_range: `${fmt(start)}-${fmt(Math.min(duration, start + len))}`,
    columns: 5,
    rows,
    frame_count: frameCount
  };
}

const grids = [];
grids.push(makeGrid({ start: 0, len: duration, kind: 'full', clipIndex: 0 }));

const totalClips = Math.max(1, Math.ceil(duration / clipMax));
for (let i = 0; i < totalClips; i += 1) {
  const start = i * clipMax;
  const len = Math.max(0.2, Math.min(clipMax, duration - start));
  grids.push(makeGrid({ start, len, kind: 'clip', clipIndex: i + 1 }));
}

process.stdout.write(JSON.stringify({ taskId, duration, total_clips: totalClips, grids }) + '\n');
NODE"""


CODE_PARSE_GRIDS = r"""const raw = String($json.stdout || '').trim();
if (!raw) throw new Error('生成分镜网格没有返回 stdout');
let parsed;
try { parsed = JSON.parse(raw); } catch (e) {
  throw new Error(`解析分镜网格失败: ${e.message}; raw=${raw.slice(0, 1000)}`);
}
if (!Array.isArray(parsed.grids) || !parsed.grids.length) throw new Error('未生成任何分镜网格');
const base = $('解析视频时长').first().json;
return parsed.grids.map((grid) => ({ json: { ...base, ...grid, gridCount: parsed.grids.length, totalClipBoards: parsed.total_clips } }));"""


CODE_ATTACH_OSS = r"""const uploads = $input.all();
const grids = $('解析网格列表').all();
return uploads.map((item, index) => {
  const upload = item.json || {};
  const grid = grids[index]?.json || {};
  const url = String(upload.url || upload.data?.url || upload.fileUrl || upload.publicUrl || '').trim();
  if (!url) {
    throw new Error(`OSS 上传结果缺少 url，index=${index}, response=${JSON.stringify(upload).slice(0, 500)}`);
  }
  return { json: { ...grid, oss_url: url, upload_response: upload } };
});"""


CODE_AGGREGATE_BOARDS = r"""const boards = $input.all().map(i => i.json || {});
const base = $('解析视频时长').first().json;
const full = boards.find(b => b.kind === 'full');
const clips = boards
  .filter(b => b.kind === 'clip')
  .sort((a, b) => Number(a.clip_index || 0) - Number(b.clip_index || 0));
if (!full?.oss_url) throw new Error('缺少全片分镜网格 OSS URL');
return [{
  json: {
    ...base,
    storyboard_grid_url: full.oss_url,
    storyboard_grid: full,
    clip_boards: clips.map(c => ({
      clip_index: c.clip_index,
      time_range: c.time_range,
      duration: c.duration,
      start_sec: c.start_sec,
      end_sec: c.end_sec,
      grid_url: c.oss_url,
      rows: c.rows,
      columns: c.columns,
      frame_count: c.frame_count
    }))
  }
}];"""


CODE_GEMINI_BODY = r"""function pickBinaryKey(bin) {
  if (!bin || typeof bin !== 'object') return '';
  if (bin.data) return 'data';
  const keys = Object.keys(bin);
  return keys[0] || '';
}
function text(v, fallback = '') {
  const s = v == null ? '' : String(v).trim();
  return s || fallback;
}

const item = $input.first();
const j = item.json || {};
const binaryKey = pickBinaryKey(item.binary || {});
if (!binaryKey) throw new Error('读取视频文件后缺少 binary data');
const buffer = await this.helpers.getBinaryDataBuffer(0, binaryKey);
if (!buffer?.length) throw new Error('视频 binary 为空');

const clipBoards = Array.isArray(j.clip_boards) ? j.clip_boards : [];

const instruction = `
你是一个爆款短视频拆解与复刻提示词专家。你正在为“小程序首页-爆款复刻”的第一步“爆款拆解”生成结构化结果。

你会收到完整视频。n8n 已经用 ffmpeg 生成了分镜网格图：
- 全片总览分镜图：${j.storyboard_grid_url}
- 分段分镜板：${JSON.stringify(clipBoards)}

你必须严格参考 Arcads clone-ad / analyze-video skill 的拆解方式：
1. 先做 source video analysis：识别总时长、核心风格、镜头数量、对白词数、叙事类型。
2. 再做 beat map：按真实内容节奏拆为 HOOK / SHOW / DEMO / PROOF / VERDICT / CTA 等节拍。
3. 提炼 defining traits：找出 2-4 个让这个视频区别于普通 UGC/广告的特征。
4. 区分 what transfers 与 what gets swapped：
   - transfers：节奏、镜头语法、构图、情绪曲线、产品出现方式、转场、信任机制、CTA方式。
   - swapped：原产品、原品牌、原卖点、原人物身份、原场景中不可复用的信息。
5. 改写复刻提示词时复制“广告语法”，不要复制原品牌名或原素材本身。

任务：
1. 先理解完整视频的爆款机制，不要只做画面描述。
2. 输出中文内容结构：开头钩子、中间铺垫、高潮、结尾CTA。
3. 输出可复刻提示词。
4. 如果视频总时长超过15秒，clone_prompt.clips 必须拆成多个 <=15秒 clip，按顺序生成；不要输出一个超长提示词。
5. 每个 clip 都要有 start_state、end_state、handoff_to_next，方便后续按顺序生成和拼接。
6. 输出 scenes，用于兼容现有分镜表和后续首帧/视频生成。

硬性要求：
- 输出 ONLY JSON，不要 markdown，不要解释。
- 中文字段用中文。
- image_prompt 和 video_prompt 用英文，适合后续视频/图片模型。
- clone_prompt.global_prompt 可以中英混合，但 clip.prompt 必须是英文模型提示词。
- 每个 clone_prompt.clips[].duration 必须 <= 15。
- 如果总时长 <= 15，也至少输出 1 个 clip。
- 保留原视频的广告语法：镜头节奏、画面顺序、情绪推进、CTA方式、字幕/贴纸/口播结构、产品出现方式。
- 不要照抄具体品牌名，除非它是用户提供的新产品。
- 生成提示词遵循 Subject + Action + Camera + Style + Constraints 的顺序。
- UGC/广告复刻提示词必须包含真实拍摄缺陷：手机质感、轻微手持抖动、自然光/环境声/轻微过曝或虚焦等，除非原视频不是 UGC。
- 如果有对白或字幕，必须提取 dialogue_pattern：句式结构、语气、停顿、爆点词，而不是照抄原句。
- 每个 clip.prompt 必须是可直接用于视频生成的英文提示词；超过15秒时，后续 clip 必须写明承接上一个 clip 的结尾状态。

输出 JSON schema：
{
  "pipeline_key": "miniapp_viral_breakdown_grid",
  "analysis_model": "gemini-3.1-flash-lite-preview",
  "total_duration": ${Number(j.videoDurationSec || 0)},
  "storyboard_grid_url": "${j.storyboard_grid_url}",
  "clip_boards": ${JSON.stringify(clipBoards)},
  "source_video_analysis": {
    "duration": 0,
    "style_name": "",
    "format": "UGC / product demo / skit / testimonial / product hero / other",
    "aspect_ratio": "",
    "shot_count": 0,
    "dialogue_word_count": 0,
    "dialogue_pattern": "",
    "edit_rhythm": "",
    "camera_language": "",
    "technical_texture": "",
    "product_role": ""
  },
  "beat_map": [
    {
      "time_range": "00:00-00:03",
      "beat": "HOOK",
      "visual": "",
      "dialogue_or_text": "",
      "function": "",
      "replication_note": ""
    }
  ],
  "defining_traits": [],
  "what_transfers": [],
  "what_gets_swapped": [],
  "content_structure": {
    "hook": {"time_range": "", "summary": "", "mechanism": "", "replication_note": ""},
    "buildup": {"time_range": "", "summary": "", "mechanism": "", "replication_note": ""},
    "climax": {"time_range": "", "summary": "", "mechanism": "", "replication_note": ""},
    "cta": {"time_range": "", "summary": "", "mechanism": "", "replication_note": ""}
  },
  "viral_mechanism": {
    "core_idea": "",
    "attention_triggers": [],
    "retention_devices": [],
    "trust_devices": [],
    "conversion_devices": []
  },
  "clone_prompt": {
    "generation_strategy": "single_clip or multi_clip_sequential",
    "global_style_rules": "",
    "global_negative_rules": "",
    "dialogue_adaptation_rules": "",
    "clips": [
      {
        "clip_index": 1,
        "time_range": "00:00-00:15",
        "duration": 15,
        "role": "hook/setup/climax/cta",
        "start_state": "",
        "prompt": "English model-ready prompt for this <=15s clip, with timestamp beats if useful.",
        "end_state": "",
        "handoff_to_next": ""
      }
    ]
  },
  "scenes": [
    {
      "order": 1,
      "time_range": "00:00-00:03",
      "duration": 3,
      "start_time": "00:00",
      "shot_goal": "",
      "visual_content_description": "",
      "location_setting": "",
      "character_desc": "",
      "emotion_state": "",
      "action_blocking": "",
      "product_desc": "",
      "must_show": "",
      "on_screen_text_graphics": "",
      "camera_shot_size": "",
      "camera_angle": "",
      "camera_movement": "",
      "composition_notes": "",
      "lighting_atmosphere": "",
      "color_grading": "",
      "original_script": "",
      "rewritten_script": "",
      "language_style": "",
      "emphasis_notes": "",
      "audio_bgm": "",
      "audio_sfx": "",
      "ambient_sound": "",
      "editing_transition": "",
      "pacing_notes": "",
      "constraints_real_shoot": "",
      "constraints_compliance": "",
      "image_prompt": "English image prompt",
      "video_prompt": "English video prompt",
      "visual_description": "",
      "camera_notes": "",
      "lighting_notes": "",
      "has_person": true,
      "has_product": true
    }
  ]
}

用户新产品信息：
- product_name: ${text(j.productName, '未提供')}
- product_description: ${text(j.productDescription, '未提供')}
- product_selling_points: ${text(j.productSellingPoints, '未提供')}

目标语言/地区：
- language: ${text(j.targetLanguage, '中文')}
- country: ${text(j.targetCountry, '中国')}
`.trim();

return [{
  json: {
    ...j,
    gemini_body: {
      contents: [{
        role: 'user',
        parts: [
          { text: instruction },
          { inline_data: { mime_type: 'video/mp4', data: buffer.toString('base64') } }
        ]
      }],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 12000
      }
    }
  },
  binary: item.binary
}];"""


CODE_PARSE_GEMINI = r"""const base = $('汇总OSS网格').first().json || {};
const current = $json || {};

function getAllText(root) {
  const parts = root?.candidates?.[0]?.content?.parts || root?.response?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p?.text || '').join('\n').trim();
}
function stripFence(value) {
  let t = String(value || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const startObj = t.indexOf('{');
  const endObj = t.lastIndexOf('}');
  if (startObj >= 0 && endObj > startObj) t = t.slice(startObj, endObj + 1);
  return t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}
function parseJson(raw) {
  const text = stripFence(raw);
  try { return JSON.parse(text); } catch (e) {
    const fixed = text.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(fixed);
  }
}
function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function text(v) {
  return v == null ? '' : String(v).trim();
}
function normalizeClipDurations(clonePrompt, totalDuration) {
  const clips = Array.isArray(clonePrompt?.clips) ? clonePrompt.clips : [];
  if (!clips.length) return clonePrompt;
  clonePrompt.clips = clips.map((clip, idx) => {
    const duration = Math.min(15, Math.max(0.2, toNumber(clip.duration, 15)));
    return {
      clip_index: toNumber(clip.clip_index, idx + 1),
      time_range: text(clip.time_range),
      duration,
      role: text(clip.role),
      start_state: text(clip.start_state),
      prompt: text(clip.prompt),
      end_state: text(clip.end_state),
      handoff_to_next: text(clip.handoff_to_next),
    };
  });
  clonePrompt.generation_strategy = totalDuration > 15 ? 'multi_clip_sequential' : (clonePrompt.generation_strategy || 'single_clip');
  return clonePrompt;
}

const rawText = getAllText(current);
if (!rawText) throw new Error(`Gemini 返回格式异常: ${JSON.stringify(current).slice(0, 1200)}`);

let parsed;
try { parsed = parseJson(rawText); } catch (e) {
  throw new Error(`Gemini JSON 解析失败: ${e.message}; raw=${rawText.slice(0, 2000)}`);
}

const totalDuration = toNumber(parsed.total_duration, base.videoDurationSec || 0);
const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
if (!scenes.length) throw new Error('Gemini 未返回 scenes 数组');

const normalized = {
  ...parsed,
  pipeline_key: parsed.pipeline_key || base.pipelineKey,
  analysis_model: 'gemini-3.1-flash-lite-preview',
  total_duration: totalDuration,
  scene_count: scenes.length,
  storyboard_grid_url: parsed.storyboard_grid_url || base.storyboard_grid_url,
  clip_boards: Array.isArray(parsed.clip_boards) && parsed.clip_boards.length ? parsed.clip_boards : base.clip_boards,
  clone_prompt: normalizeClipDurations(parsed.clone_prompt || {}, totalDuration),
  scenes,
};

const segments = scenes.map((scene, idx) => ({
  ...scene,
  order: toNumber(scene.order, idx + 1),
  duration: toNumber(scene.duration, 8),
  time_range: text(scene.time_range),
  original_script: text(scene.original_script),
  rewritten_script: text(scene.rewritten_script),
  visual_description: text(scene.visual_description || scene.visual_content_description),
  camera_notes: text(scene.camera_notes || [scene.camera_shot_size, scene.camera_angle, scene.camera_movement].filter(Boolean).join(' / ')),
  lighting_notes: text(scene.lighting_notes || scene.lighting_atmosphere),
  image_prompt: text(scene.image_prompt),
  video_prompt: text(scene.video_prompt),
  has_person: scene.has_person !== false,
  has_product: scene.has_product !== false,
}));

return {
  json: {
    ...base,
    workflow_data: normalized,
    segments,
    sceneCount: segments.length,
    totalDuration,
    gemini_raw_text: rawText
  }
};"""


CODE_CALLBACK_PAYLOAD = r"""const data = $json || {};
const workflowData = data.workflow_data || {};
return {
  json: {
    task_id: data.taskId,
    taskId: data.taskId,
    record_id: data.taskId,
    status: 'completed',
    storyboard_grid_url: workflowData.storyboard_grid_url || data.storyboard_grid_url,
    segments: data.segments || [],
    workflow_data: workflowData,
    api_key: data.apiKey || ''
  }
};"""


workflow = {
    "name": "小程序首页-爆款拆解-分镜网格-OSS",
    "nodes": [
        node("Webhook", "n8n-nodes-base.webhook", [-1600, 0], {
            "httpMethod": "POST",
            "path": "miniapp_viral_breakdown_grid",
            "options": {},
        }, type_version=2, node_id="miniapp-viral-webhook"),
        node("准备参数", "n8n-nodes-base.code", [-1376, 0], {
            "mode": "runOnceForEachItem",
            "jsCode": CODE_PREPARE,
        }, node_id="miniapp-viral-prepare"),
        node("下载视频到本地", "n8n-nodes-base.executeCommand", [-1152, 0], {
            "command": CMD_DOWNLOAD,
        }, type_version=1, node_id="miniapp-viral-download"),
        node("解析下载结果", "n8n-nodes-base.code", [-928, 0], {
            "mode": "runOnceForEachItem",
            "jsCode": CODE_PARSE_DOWNLOAD,
        }, node_id="miniapp-viral-parse-download"),
        node("ffprobe 获取时长", "n8n-nodes-base.executeCommand", [-704, 0], {
            "command": CMD_FFPROBE,
        }, type_version=1, node_id="miniapp-viral-ffprobe"),
        node("解析视频时长", "n8n-nodes-base.code", [-480, 0], {
            "mode": "runOnceForEachItem",
            "jsCode": CODE_PARSE_DURATION,
        }, node_id="miniapp-viral-parse-duration"),
        node("ffmpeg生成5列分镜网格", "n8n-nodes-base.executeCommand", [-256, 0], {
            "command": CMD_GENERATE_GRIDS,
        }, type_version=1, node_id="miniapp-viral-generate-grids"),
        node("解析网格列表", "n8n-nodes-base.code", [-32, 0], {
            "jsCode": CODE_PARSE_GRIDS,
        }, node_id="miniapp-viral-parse-grids"),
        node("读取网格图片", "n8n-nodes-base.readWriteFile", [192, 0], {
            "fileSelector": "={{ $json.filePath }}",
            "options": {},
        }, type_version=1, node_id="miniapp-viral-read-grid"),
        node("上传网格到OSS", "n8n-nodes-base.httpRequest", [416, 0], {
            "method": "POST",
            "url": "https://atomx.top/api/upload/image",
            "sendBody": True,
            "contentType": "multipart-form-data",
            "bodyParameters": {
                "parameters": [
                    {
                        "parameterType": "formBinaryData",
                        "name": "file",
                        "inputDataFieldName": "data",
                    }
                ]
            },
            "options": {},
        }, type_version=4.2, node_id="miniapp-viral-upload-oss"),
        node("绑定OSS网格URL", "n8n-nodes-base.code", [640, 0], {
            "jsCode": CODE_ATTACH_OSS,
        }, node_id="miniapp-viral-attach-oss"),
        node("汇总OSS网格", "n8n-nodes-base.code", [864, 0], {
            "jsCode": CODE_AGGREGATE_BOARDS,
        }, node_id="miniapp-viral-aggregate-boards"),
        node("读取视频文件", "n8n-nodes-base.readWriteFile", [1088, 0], {
            "fileSelector": "={{ $json.localVideoPath }}",
            "options": {},
        }, type_version=1, node_id="miniapp-viral-read-video"),
        node("组装Gemini拆解请求", "n8n-nodes-base.code", [1312, 0], {
            "jsCode": CODE_GEMINI_BODY,
        }, node_id="miniapp-viral-build-gemini"),
        node("Gemini爆款拆解", "n8n-nodes-base.httpRequest", [1536, 0], {
            "method": "POST",
            "url": "https://yunwu.ai/v1beta/models/gemini-3.1-flash-lite-preview:generateContent",
            "authentication": "genericCredentialType",
            "genericAuthType": "httpHeaderAuth",
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [{"name": "Content-Type", "value": "application/json"}]
            },
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": "={{ $json.gemini_body }}",
            "options": {"timeout": 900000},
        }, type_version=4.2, node_id="miniapp-viral-gemini",
            credentials={"httpHeaderAuth": {"id": "mMIH382GnJoMSu4L", "name": "Header Auth account"}}),
        node("解析Gemini拆解结果", "n8n-nodes-base.code", [1760, 0], {
            "mode": "runOnceForEachItem",
            "jsCode": CODE_PARSE_GEMINI,
        }, node_id="miniapp-viral-parse-gemini"),
        node("准备App回调Payload", "n8n-nodes-base.code", [1984, 0], {
            "mode": "runOnceForEachItem",
            "jsCode": CODE_CALLBACK_PAYLOAD,
        }, node_id="miniapp-viral-callback-payload"),
        node("回调App-爆款拆解完成", "n8n-nodes-base.httpRequest", [2208, 0], {
            "method": "POST",
            "url": "={{ $('准备参数').first().json.callbackUrl }}",
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [
                    {"name": "x-admin-token", "value": "={{ $('准备参数').first().json.adminToken }}"},
                    {"name": "Content-Type", "value": "application/json"},
                ]
            },
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": "={{ $json }}",
            "options": {},
        }, type_version=4.2, node_id="miniapp-viral-callback"),
        node("清理临时文件", "n8n-nodes-base.executeCommand", [2432, 0], {
            "command": "=rm -rf {{ $('准备参数').first().json.workDir }}",
        }, type_version=1, node_id="miniapp-viral-cleanup"),
    ],
    "connections": {
        "Webhook": {"main": [[{"node": "准备参数", "type": "main", "index": 0}]]},
        "准备参数": {"main": [[{"node": "下载视频到本地", "type": "main", "index": 0}]]},
        "下载视频到本地": {"main": [[{"node": "解析下载结果", "type": "main", "index": 0}]]},
        "解析下载结果": {"main": [[{"node": "ffprobe 获取时长", "type": "main", "index": 0}]]},
        "ffprobe 获取时长": {"main": [[{"node": "解析视频时长", "type": "main", "index": 0}]]},
        "解析视频时长": {"main": [[{"node": "ffmpeg生成5列分镜网格", "type": "main", "index": 0}]]},
        "ffmpeg生成5列分镜网格": {"main": [[{"node": "解析网格列表", "type": "main", "index": 0}]]},
        "解析网格列表": {"main": [[{"node": "读取网格图片", "type": "main", "index": 0}]]},
        "读取网格图片": {"main": [[{"node": "上传网格到OSS", "type": "main", "index": 0}]]},
        "上传网格到OSS": {"main": [[{"node": "绑定OSS网格URL", "type": "main", "index": 0}]]},
        "绑定OSS网格URL": {"main": [[{"node": "汇总OSS网格", "type": "main", "index": 0}]]},
        "汇总OSS网格": {"main": [[{"node": "读取视频文件", "type": "main", "index": 0}]]},
        "读取视频文件": {"main": [[{"node": "组装Gemini拆解请求", "type": "main", "index": 0}]]},
        "组装Gemini拆解请求": {"main": [[{"node": "Gemini爆款拆解", "type": "main", "index": 0}]]},
        "Gemini爆款拆解": {"main": [[{"node": "解析Gemini拆解结果", "type": "main", "index": 0}]]},
        "解析Gemini拆解结果": {"main": [[{"node": "准备App回调Payload", "type": "main", "index": 0}]]},
        "准备App回调Payload": {"main": [[{"node": "回调App-爆款拆解完成", "type": "main", "index": 0}]]},
        "回调App-爆款拆解完成": {"main": [[{"node": "清理临时文件", "type": "main", "index": 0}]]},
    },
    "settings": {
        "executionOrder": "v1",
        "callerPolicy": "workflowsFromSameOwner",
        "availableInMCP": False,
    },
    "pinData": {},
    "tags": [],
    "active": False,
    "versionId": "miniapp-viral-breakdown-grid-oss-v1",
    "meta": {"instanceId": "generated-by-codex"},
}


if __name__ == "__main__":
    OUT.write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}")
