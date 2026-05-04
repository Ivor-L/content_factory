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
    targetLanguage: pick(body.target_language, body.targetLanguage, data.target_language, data.targetLanguage, metadata.target_language, metadata.targetLanguage, 'source'),
    targetCountry: pick(body.target_country, body.targetCountry, data.target_country, data.targetCountry, metadata.target_country, metadata.targetCountry, 'auto'),
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
function arcadsFrameCount(totalSec) {
  if (totalSec < 10) return 8;
  if (totalSec < 20) return 12;
  if (totalSec < 30) return 16;
  return 20;
}
function panelsForRange(panels, start, end) {
  const selected = panels.filter((panel) => panel.time_sec >= start - 0.001 && panel.time_sec <= end + 0.001);
  if (selected.length) return selected;
  const startPanel = panels.reduce((best, panel) => Math.abs(panel.time_sec - start) < Math.abs(best.time_sec - start) ? panel : best, panels[0]);
  const endPanel = panels.reduce((best, panel) => Math.abs(panel.time_sec - end) < Math.abs(best.time_sec - end) ? panel : best, panels[panels.length - 1]);
  const a = Math.min(startPanel.panel, endPanel.panel);
  const b = Math.max(startPanel.panel, endPanel.panel);
  return panels.filter((panel) => panel.panel >= a && panel.panel <= b);
}
function makeGlobalGrid() {
  const expected = Math.max(1, Math.ceil(duration / configuredInterval));
  const frameCount = Math.min(maxOverview, Math.max(arcadsFrameCount(duration), Math.min(expected, maxOverview)));
  const interval = Math.max(0.25, duration / frameCount);
  const rows = ceil(frameCount / 5);
  const frameDir = path.join(workDir, 'grids', 'global_frames');
  const out = path.join(workDir, 'grids', 'global_storyboard.jpg');
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir, { recursive: true });

  const panels = [];
  for (let i = 0; i < frameCount; i += 1) {
    const offset = Math.min(Math.max(0, duration - 0.05), i * interval);
    const ts = safeTs(offset);
    const framePath = path.join(frameDir, `frame_${String(i + 1).padStart(3, '0')}.jpg`);
    const panel = {
      panel: i + 1,
      label: `Panel ${i + 1}`,
      time_sec: Number(ts.toFixed(3)),
      timestamp: fmt(ts),
    };
    panels.push(panel);
    const label = `${panel.label}  ${panel.timestamp}`;
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

  const totalClips = Math.max(1, Math.ceil(duration / clipMax));
  const clipPlan = [];
  for (let i = 0; i < totalClips; i += 1) {
    const start = i * clipMax;
    const end = Math.min(duration, start + clipMax);
    const selectedPanels = panelsForRange(panels, start, end);
    const firstPanel = selectedPanels[0] || panels[0];
    const lastPanel = selectedPanels[selectedPanels.length - 1] || firstPanel;
    clipPlan.push({
      clip_index: i + 1,
      time_range: `${fmt(start)}-${fmt(end)}`,
      duration: Number(Math.max(0.2, end - start).toFixed(3)),
      start_sec: Number(start.toFixed(3)),
      end_sec: Number(end.toFixed(3)),
      panel_start: firstPanel.panel,
      panel_end: lastPanel.panel,
      panel_range: `Panel ${firstPanel.panel} to Panel ${lastPanel.panel}`,
      frame_count: selectedPanels.length,
      notes: 'Suggested max-15s clip window. Gemini may move the boundary to the nearest natural beat as long as each clip remains <=15s, clips stay continuous, and panel_range is updated from the same global storyboard grid.'
    });
  }

  return {
    kind: 'full',
    clip_index: 0,
    filePath: out,
    fileName: `${taskId}_global_storyboard.jpg`,
    start_sec: 0,
    end_sec: Number(duration.toFixed(3)),
    duration: Number(duration.toFixed(3)),
    time_range: `${fmt(0)}-${fmt(duration)}`,
    columns: 5,
    rows,
    frame_count: frameCount,
    panels,
    clip_plan: clipPlan
  };
}

const globalGrid = makeGlobalGrid();
process.stdout.write(JSON.stringify({
  taskId,
  duration,
  total_clips: globalGrid.clip_plan.length,
  grids: [globalGrid],
  storyboard_grid: globalGrid,
  clip_plan: globalGrid.clip_plan
}) + '\n');
NODE"""


CODE_PARSE_GRIDS = r"""const raw = String($json.stdout || '').trim();
if (!raw) throw new Error('生成分镜网格没有返回 stdout');
let parsed;
try { parsed = JSON.parse(raw); } catch (e) {
  throw new Error(`解析分镜网格失败: ${e.message}; raw=${raw.slice(0, 1000)}`);
}
if (!Array.isArray(parsed.grids) || !parsed.grids.length) throw new Error('未生成任何分镜网格');
const base = $('解析视频时长').first().json;
return parsed.grids.map((grid) => ({
  json: {
    ...base,
    ...grid,
    gridCount: parsed.grids.length,
    totalClipBoards: parsed.total_clips,
    clip_plan: Array.isArray(parsed.clip_plan) ? parsed.clip_plan : (Array.isArray(grid.clip_plan) ? grid.clip_plan : [])
  }
}));"""


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
if (!full?.oss_url) throw new Error('缺少全片分镜网格 OSS URL');
const clipPlan = (Array.isArray(full.clip_plan) ? full.clip_plan : []).map(c => ({
  clip_index: c.clip_index,
  time_range: c.time_range,
  duration: c.duration,
  start_sec: c.start_sec,
  end_sec: c.end_sec,
  panel_start: c.panel_start,
  panel_end: c.panel_end,
  panel_range: c.panel_range,
  frame_count: c.frame_count,
  notes: c.notes || ''
}));
const storyboardGrid = {
  kind: 'full',
  grid_url: full.oss_url,
  url: full.oss_url,
  time_range: full.time_range,
  duration: full.duration,
  start_sec: full.start_sec,
  end_sec: full.end_sec,
  rows: full.rows,
  columns: full.columns,
  frame_count: full.frame_count,
  panels: Array.isArray(full.panels) ? full.panels : []
};
return [{
  json: {
    ...base,
    storyboard_grid_url: full.oss_url,
    storyboard_grid: storyboardGrid,
    clip_plan: clipPlan,
    clip_boards: clipPlan
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

const clipPlan = Array.isArray(j.clip_plan) ? j.clip_plan : (Array.isArray(j.clip_boards) ? j.clip_boards : []);
const storyboardGrid = j.storyboard_grid && typeof j.storyboard_grid === 'object' ? j.storyboard_grid : {};
const panels = Array.isArray(storyboardGrid.panels) ? storyboardGrid.panels : [];
const suggestedClipRanges = clipPlan.length
  ? clipPlan.map(c => `${c.clip_index}: ${c.time_range} (${c.duration}s, ${c.panel_range})`).join('; ')
  : 'Use the minimum number of sequential clips; every clip must be <=15s.';

const instruction = `
你是一个爆款短视频拆解与复刻提示词专家。你正在为“小程序首页-爆款复刻”的第一步“爆款拆解”生成结构化结果。

你会收到完整视频。n8n 已经用 ffmpeg 生成了唯一一张 5xN 全局 storyboard contact sheet。
- 全局分镜元数据：${JSON.stringify(storyboardGrid)}
- 预估 15s 上限分段，仅供参考：${suggestedClipRanges}

你必须严格参考 Arcads clone-ad / analyze-video skill 的拆解方式：
1. 先做 source video analysis：识别总时长、核心风格、镜头数量、对白词数、叙事类型。
2. 再做 beat map：按真实内容节奏拆为 HOOK / SHOW / DEMO / PROOF / VERDICT / CTA 等节拍。
3. 提炼 defining traits：找出 2-4 个让这个视频区别于普通 UGC/广告的特征。
4. 区分 what transfers 与 what gets swapped：
   - transfers：节奏、镜头语法、构图、情绪曲线、产品出现方式、转场、信任机制、CTA方式。
   - swapped：原产品、原品牌、原卖点、原人物身份、原场景中不可复用的信息。
5. 改写复刻提示词时复制“广告语法”，不要复制原品牌名或原素材本身。
6. 对超过 15s 的视频，学习 Arcads 的切分逻辑：先从 beat map 找自然断点，再受生成模型 15s 上限约束拆成最少数量的连续 clip；不能机械按 00:15 硬切，除非 15s 正好落在自然节拍边界。

任务：
1. 先理解完整视频的爆款机制，不要只做画面描述。
2. 输出中文内容结构：开头钩子、中间铺垫、高潮、结尾CTA。
3. 输出可复刻提示词。
4. 如果视频总时长超过15秒，clone_prompt.clips 必须拆成多个 <=15秒 clip，按顺序生成；不要输出一个超长提示词。
5. 每个 clip 都要有 start_state、end_state、handoff_to_next，形成 Arcads chained multi-clip 的连续状态交接。
6. 输出 scenes，用于兼容现有分镜表和后续首帧/视频生成。
7. 必须输出完整口播：full_original_script 为原视频按时间顺序拼接的完整口播；full_rewritten_script 为面向用户新产品的完整改写口播。
8. beat_map 每一项都必须有 rewritten_dialogue_or_text，scenes 每一项都必须有 rewritten_script；不要把 rewritten_script 原样复制 original_script。
9. clone_prompt.clips 的数量通常等于 ceil(total_duration/15)，但切点必须尽量靠近 HOOK/SHOW/DEMO/PROOF/CTA 的自然节拍边界；每段 duration <= 15，连续覆盖 00:00 到 total_duration，不得遗漏最后一段。
10. 每个 clip 必须输出 panel_start、panel_end、panel_range。Panel 范围来自同一张全局 storyboard_grid，不得虚构第二张、第三张分镜板。

硬性要求：
- 输出 ONLY JSON，不要 markdown，不要解释。
- 给人看的字段必须全部用中文，包括 source_video_analysis、beat_map、defining_traits、what_transfers、what_gets_swapped、content_structure、viral_mechanism、scenes、full_original_script、full_rewritten_script、beat_map.rewritten_dialogue_or_text、scenes.rewritten_script、clone_prompt 的 rules/role/start_state/end_state/handoff_to_next。
- 只有给 AI 模型直接使用的字段可以用英文：scenes.image_prompt、scenes.video_prompt、clone_prompt.clips[].prompt。
- clone_prompt.global_style_rules、global_negative_rules、dialogue_adaptation_rules 是页面给人看的规则摘要，必须中文。
- 每个 clone_prompt.clips[].duration 必须 <= 15，并且所有 clips 的 time_range 必须连续覆盖 00:00 到 total_duration。
- 如果总时长 <= 15，也至少输出 1 个 clip。
- clip_boards/clip_plan 只需要表达分段元数据和 Panel 范围。
- clip_plan 每项必须包含 clip_index、time_range、duration、start_sec、end_sec、panel_start、panel_end、panel_range；不要只输出 panels: "1-5"。
- scenes 必须覆盖 beat_map 的所有关键节拍，不能只给 1-2 条示例。至少每个 HOOK/SHOW/DEMO/PROOF/CTA 都要有一条 scene，除非原视频确实没有该节拍。
- 保留原视频的广告语法：镜头节奏、画面顺序、情绪推进、CTA方式、字幕/贴纸/口播结构、产品出现方式。
- 不要照抄具体品牌名，除非它是用户提供的新产品。
- 如果 product_name 未提供，不要自造具体品牌名（例如 New Pet Health Bites）；改写口播中使用中性占位 "[user product]" 或 "the new product"。
- 生成提示词遵循 Subject + Action + Camera + Style + Constraints 的顺序。
- UGC/广告复刻提示词必须包含真实拍摄缺陷：手机质感、轻微手持抖动、自然光/环境声/轻微过曝或虚焦等，除非原视频不是 UGC。
- 如果有对白或字幕，必须提取 dialogue_pattern：句式结构、语气、停顿、爆点词，而不是照抄原句。
- 改写口播必须保留原视频句式节奏和宠物/人物视角，但替换成适合用户新产品的中文/目标语言表达；不能只返回第一句。
- 每个 clip.prompt 必须是可直接用于视频生成的英文详细复刻提示词；不能是一句话摘要。
- 每个 clip.prompt 必须使用用户要求的分段提示词格式，且用英文显式标注这些块：
  1) "### Clip X"
  2) "Clip info and SRT:"
  3) "Timeline:"
  4) "Storyboard panels: Panel X to Panel Y"
  5) "Matched SRT:"
  6) "Visual audit:"
  7) "Generation Prompt:"
  8) "[Sequence Details: Panel X ... -> Panel Y ...]"
  9) "[Global Visual Anchor: @Image2 is the single full-video storyboard contact sheet; follow only Panel X to Panel Y for composition, shot order, and rhythm.]"
  10) "[Audio/Action Cues: Voice Profile ... Timed Voiceover ... Ambient Foley ... ABSOLUTELY NO BGM, NO BACKGROUND MUSIC. Pure voice/dialogue and ambient foley only.]"
- 音频硬规则：不要 BGM。所有 scene.audio_bgm 必须为空字符串；所有 video_prompt 与 clone_prompt.clips[].prompt 必须明确写入 "ABSOLUTELY NO BGM, NO BACKGROUND MUSIC. Pure voice/dialogue and ambient foley only."。
- 如果后续使用全能参考，多参考图约定为：@Image1 是当前片段首帧/产品替换后的参考图，@Image2 是全片分镜网格图。clip.prompt 必须说明 @Image2 只是 storyboard contact sheet，只参考对应 Panel 范围的构图/节奏，不要生成拼贴、九宫格、边框、分镜编号或分屏画面。
- 每个 clip.prompt 建议 100-260 英文词，必须覆盖该 clip 内所有 beat，超过15秒时后续 clip 必须写明承接上一个 clip 的结尾状态。
- 避免视频模型容易跑偏词：cinematic, professional, stunning, 8k, studio, perfect。用 documentary / photorealistic / handheld / phone quality 替代。

输出 JSON schema：
{
  "pipeline_key": "miniapp_viral_breakdown_grid",
  "analysis_model": "gemini-3-flash-preview",
  "total_duration": ${Number(j.videoDurationSec || 0)},
  "storyboard_grid": ${JSON.stringify(storyboardGrid)},
  "clip_plan": ${JSON.stringify(clipPlan)},
  "clip_boards": ${JSON.stringify(clipPlan)},
  "full_original_script": "",
  "full_rewritten_script": "",
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
      "rewritten_dialogue_or_text": "",
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
        "panel_start": 1,
        "panel_end": 8,
        "panel_range": "Panel 1 to Panel 8",
        "role": "hook/setup/climax/cta",
        "start_state": "",
        "prompt": "### Clip 1\\nClip info and SRT: ...\\nTimeline: 00:00-00:15\\nStoryboard panels: Panel 1 to Panel 8\\nMatched SRT: ...\\nVisual audit: ...\\nGeneration Prompt: ...\\n[Sequence Details: Panel 1 ... -> Panel 8 ...]\\n[Global Visual Anchor: @Image2 is the single full-video storyboard contact sheet; follow only Panel 1 to Panel 8 for composition, shot order, and rhythm.]\\n[Audio/Action Cues: Voice Profile ... Timed Voiceover ... Ambient Foley ... ABSOLUTELY NO BGM, NO BACKGROUND MUSIC. Pure voice/dialogue and ambient foley only.]",
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
- language: ${text(j.targetLanguage, 'source')}
- country: ${text(j.targetCountry, 'auto')}

语言规则：
- 如果 language 是 source / auto / 跟随原视频：原始口播 full_original_script 保持原视频语言；改写口播 full_rewritten_script、beat_map.rewritten_dialogue_or_text、scenes.rewritten_script 默认使用中文，除非用户显式选择其他目标语言。
- 如果 language 是 en / English：改写口播必须输出英文。
- 如果 language 是 zh-CN / 中文：改写口播必须输出中文。
- 如果 language 是 ja / ko / es 等：改写口播必须输出对应语言。
- clone_prompt.clips[].prompt 仍然使用英文视频生成提示词，但其中引用的口播文本可以保持目标语言原文。
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
function url(v) {
  const s = text(v);
  if (!s || /^(undefined|null|nan)$/i.test(s)) return '';
  return /^https?:\/\//i.test(s) ? s : '';
}
function toRecordArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    : [];
}
function toTime(sec) {
  const value = Math.max(0, Number(sec) || 0);
  const mm = Math.floor(value / 60);
  const ss = Math.floor(value % 60);
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
function timeToSeconds(value) {
  const raw = text(value);
  const matched = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!matched) return NaN;
  return Number(matched[1]) * 60 + Number(matched[2]);
}
function rangeToSeconds(range) {
  const raw = text(range);
  const matched = raw.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (!matched) return null;
  return {
    start: Number(matched[1]) * 60 + Number(matched[2]),
    end: Number(matched[3]) * 60 + Number(matched[4]),
  };
}
function parsePanelRange(value) {
  const raw = text(value);
  const matched = raw.match(/(?:Panel\s*)?(\d+)\s*(?:-|to|到|至|~|–)\s*(?:Panel\s*)?(\d+)/i);
  if (!matched) return null;
  const start = Number(matched[1]);
  const end = Number(matched[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
    range: `Panel ${Math.min(start, end)} to Panel ${Math.max(start, end)}`,
  };
}
function panelForSecond(sec) {
  const panels = Array.isArray(base.storyboard_grid?.panels) ? base.storyboard_grid.panels : [];
  if (!panels.length) return 0;
  return panels.reduce((best, panel) => Math.abs(toNumber(panel.time_sec, 0) - sec) < Math.abs(toNumber(best.time_sec, 0) - sec) ? panel : best, panels[0]).panel || 0;
}
function normalizeClipPlanItem(clip, idx, basePlan = {}) {
  const range = rangeToSeconds(clip.time_range || basePlan.time_range || '');
  const start = toNumber(clip.start_sec ?? basePlan.start_sec, range?.start ?? 0);
  const durationValue = toNumber(clip.duration ?? basePlan.duration, NaN);
  const end = toNumber(clip.end_sec ?? basePlan.end_sec, range?.end ?? (Number.isFinite(durationValue) ? start + durationValue : start + 15));
  const parsedPanels = parsePanelRange(clip.panel_range || clip.panels || clip.panelRange || basePlan.panel_range || basePlan.panels);
  const panelStart = toNumber(clip.panel_start ?? clip.panelStart ?? basePlan.panel_start ?? basePlan.panelStart, parsedPanels?.start ?? panelForSecond(start));
  const panelEnd = toNumber(clip.panel_end ?? clip.panelEnd ?? basePlan.panel_end ?? basePlan.panelEnd, parsedPanels?.end ?? panelForSecond(end));
  return {
    clip_index: toNumber(clip.clip_index ?? clip.clipIndex, idx + 1),
    time_range: text(clip.time_range || basePlan.time_range || `${toTime(start)}-${toTime(end)}`),
    duration: Math.min(15, Math.max(0.2, toNumber(clip.duration ?? basePlan.duration, end - start))),
    start_sec: start,
    end_sec: end,
    panel_start: panelStart,
    panel_end: panelEnd,
    panel_range: text(clip.panel_range || parsedPanels?.range || basePlan.panel_range || (panelStart ? `Panel ${panelStart} to Panel ${panelEnd || panelStart}` : '')),
    frame_count: toNumber(clip.frame_count ?? clip.frameCount ?? basePlan.frame_count, Math.max(0, panelEnd - panelStart + 1)),
    notes: text(clip.notes || basePlan.notes),
  };
}
function deriveClipPlanFromClips(clips) {
  return clips.map((clip, idx) => normalizeClipPlanItem(clip, idx));
}
function overlapSeconds(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}
function pickRowsInRange(rows, range) {
  const target = rangeToSeconds(range);
  if (!target) return rows;
  const selected = rows.filter((row) => overlapSeconds(target, rangeToSeconds(row.time_range || row.timeRange || '')) > 0);
  return selected.length ? selected : rows;
}
function ensureFullScript(parsed, scenes) {
  if (!text(parsed.full_original_script)) {
    parsed.full_original_script = scenes
      .map((scene) => text(scene.original_script || scene.dialogue_or_text || scene.on_screen_text_graphics))
      .filter(Boolean)
      .join(' ');
  }
  if (!text(parsed.full_rewritten_script)) {
    parsed.full_rewritten_script = scenes
      .map((scene) => text(scene.rewritten_script || scene.rewritten_text))
      .filter(Boolean)
      .join(' ');
  }
}
function ensureSceneCoverage(parsed, scenes) {
  const rows = Array.isArray(scenes) ? scenes : [];
  const beats = toRecordArray(parsed.beat_map || parsed.beatMap);
  if (!beats.length || rows.length >= beats.length) return rows;
  return beats.map((beat, idx) => {
    const existing = pickRowsInRange(rows, beat.time_range || '')[0] || rows[idx] || {};
    const range = rangeToSeconds(beat.time_range || '') || { start: idx * 3, end: idx * 3 + 3 };
    return {
      ...existing,
      order: toNumber(existing.order, idx + 1),
      time_range: text(existing.time_range || beat.time_range),
      duration: toNumber(existing.duration, Math.max(0.2, range.end - range.start)),
      start_time: text(existing.start_time || toTime(range.start)),
      shot_goal: text(existing.shot_goal || beat.function || beat.beat),
      visual_content_description: text(existing.visual_content_description || existing.visual_description || beat.visual),
      location_setting: text(existing.location_setting),
      character_desc: text(existing.character_desc),
      emotion_state: text(existing.emotion_state),
      action_blocking: text(existing.action_blocking || beat.replication_note),
      product_desc: text(existing.product_desc || parsed.source_video_analysis?.product_role),
      must_show: text(existing.must_show || beat.visual),
      on_screen_text_graphics: text(existing.on_screen_text_graphics || beat.dialogue_or_text),
      camera_shot_size: text(existing.camera_shot_size),
      camera_angle: text(existing.camera_angle),
      camera_movement: text(existing.camera_movement || parsed.source_video_analysis?.camera_language),
      composition_notes: text(existing.composition_notes || beat.replication_note),
      lighting_atmosphere: text(existing.lighting_atmosphere || parsed.source_video_analysis?.technical_texture),
      color_grading: text(existing.color_grading),
      original_script: text(existing.original_script || beat.dialogue_or_text),
      rewritten_script: text(existing.rewritten_script || beat.rewritten_dialogue_or_text),
      language_style: text(existing.language_style || parsed.source_video_analysis?.dialogue_pattern),
      emphasis_notes: text(existing.emphasis_notes || beat.function),
      audio_bgm: '',
      audio_sfx: text(existing.audio_sfx),
      ambient_sound: text(existing.ambient_sound),
      editing_transition: text(existing.editing_transition || 'Hard cut.'),
      pacing_notes: text(existing.pacing_notes || parsed.source_video_analysis?.edit_rhythm),
      constraints_real_shoot: text(existing.constraints_real_shoot),
      constraints_compliance: text(existing.constraints_compliance),
      image_prompt: text(existing.image_prompt || `A vertical phone photo matching this ad beat: ${beat.visual || ''}`),
      video_prompt: ensureNoBgmPrompt(existing.video_prompt || `Vertical handheld phone video matching this ad beat: ${beat.visual || ''}.`),
      visual_description: text(existing.visual_description || existing.visual_content_description || beat.visual),
      camera_notes: text(existing.camera_notes || existing.camera_movement || parsed.source_video_analysis?.camera_language),
      lighting_notes: text(existing.lighting_notes || existing.lighting_atmosphere || parsed.source_video_analysis?.technical_texture),
      has_person: existing.has_person !== false,
      has_product: existing.has_product !== false,
    };
  });
}
function ensureNoBgmPrompt(value) {
  const rule = 'ABSOLUTELY NO BGM, NO BACKGROUND MUSIC. Pure voice/dialogue and ambient foley only.';
  const prompt = text(value);
  if (!prompt) return rule;
  return /no\s+(bgm|background music)|without\s+(bgm|background music)/i.test(prompt)
    ? prompt
    : `${prompt}\n${rule}`;
}
function clipPlans() {
  return Array.isArray(base.clip_plan) && base.clip_plan.length
    ? base.clip_plan
    : (Array.isArray(base.clip_boards) ? base.clip_boards : []);
}
function buildFallbackPrompt(clip, idx, parsed, scenes, beats, totalDuration) {
  const plan = clipPlans()[idx] || {};
  const clipRange = text(clip.time_range || plan.time_range || `${toTime(idx * 15)}-${toTime(Math.min(totalDuration, (idx + 1) * 15))}`);
  const duration = Math.min(15, Math.max(0.2, toNumber(clip.duration || plan.duration, 15)));
  const panelRange = text(clip.panel_range || plan.panel_range || `Panel ${toNumber(clip.panel_start || plan.panel_start, 1)} to Panel ${toNumber(clip.panel_end || plan.panel_end, 1)}`);
  const relatedBeats = pickRowsInRange(beats, clipRange);
  const relatedScenes = pickRowsInRange(scenes, clipRange);
  const firstScene = relatedScenes[0] || {};
  const lastScene = relatedScenes[relatedScenes.length - 1] || firstScene;
  const beatText = relatedBeats.slice(0, 4).map((beat, beatIdx) => {
    const localStart = Math.min(Math.floor((duration / Math.max(3, relatedBeats.length)) * beatIdx), Math.max(0, duration - 1));
    const localEnd = beatIdx === relatedBeats.length - 1
      ? duration
      : Math.min(duration, Math.floor((duration / Math.max(3, relatedBeats.length)) * (beatIdx + 1)));
    return `${localStart}-${localEnd}s ${text(beat.beat || `Beat ${beatIdx + 1}`)}: ${text(beat.visual || beat.function || '')}; ${text(beat.rewritten_dialogue_or_text || beat.dialogue_or_text || '')}`;
  });
  while (beatText.length < 3) {
    const n = beatText.length;
    beatText.push(`${Math.floor((duration / 3) * n)}-${Math.floor((duration / 3) * (n + 1))}s beat ${n + 1}: continue the same ad grammar with clear product action and viewer-facing payoff.`);
  }
  const product = text(firstScene.product_desc || parsed.source_video_analysis?.product_role || base.productName || 'the user product');
  const setting = text(firstScene.location_setting || 'a real everyday environment matching the source ad');
  const character = text(firstScene.character_desc || 'the same type of believable subject from the source video');
  const visual = text(firstScene.visual_content_description || firstScene.visual_description || relatedBeats[0]?.visual || 'a social ad scene');
  const finalVisual = text(lastScene.visual_content_description || lastScene.visual_description || relatedBeats[relatedBeats.length - 1]?.visual || visual);
  const camera = text(firstScene.camera_notes || [firstScene.camera_shot_size, firstScene.camera_angle, firstScene.camera_movement].filter(Boolean).join(', ') || parsed.source_video_analysis?.camera_language || 'handheld phone camera with quick social cuts');
  const lighting = text(firstScene.lighting_notes || firstScene.lighting_atmosphere || parsed.source_video_analysis?.technical_texture || 'natural available light with small real-world imperfections');
  const originalScript = relatedScenes.map((scene) => text(scene.original_script)).filter(Boolean).join(' ');
  const rewrittenScript = relatedScenes.map((scene) => text(scene.rewritten_script)).filter(Boolean).join(' ');
  const dialogue = text(rewrittenScript || clip.rewritten_script || parsed.full_rewritten_script || 'Use short natural subtitles matching the source pacing and adapted to the user product.');
  const handoff = idx > 0
    ? `This clip begins from the previous clip ending state: ${text(clip.start_state || visual)}.`
    : 'This is the first clip and must establish the hook immediately.';

  return [
    `### Clip ${idx + 1}`,
    `Clip info and SRT: ${duration} seconds vertical social ad segment. Source/adapted script rhythm: ${text(originalScript || parsed.source_video_analysis?.dialogue_pattern || 'short hook, product proof, and CTA')} -> "${dialogue}".`,
    `Timeline: ${clipRange}`,
    `Storyboard panels: ${panelRange}`,
    `Matched SRT: ${beatText.join(' | ')}`,
    `Visual audit: subject is ${character}; product is ${product}; setting is ${setting}; start with ${visual}; end with ${finalVisual}; camera uses ${camera}; lighting/texture is ${lighting}.`,
    `Generation Prompt: ${duration} seconds vertical UGC-style ad, filmed on smartphone. ${handoff} Keep one primary action per beat, visible product handling, natural jump cuts matching the source ad grammar, and clear continuity into the next clip. Photorealistic documentary phone quality, handheld, slight shake, soft focus on fast movement, natural phone mic ambience, no filters, no color-graded look. The product must remain visually unchanged if a product reference is supplied.`,
    `[Sequence Details: ${panelRange}; ${beatText.join(' -> ')}]`,
    `[Global Visual Anchor: @Image2 is the single full-video storyboard contact sheet; follow only ${panelRange} for composition, shot order, and rhythm. Do not output a collage, grid, split-screen, border, panel number, or frame label.]`,
    `[Audio/Action Cues: Voice Profile natural phone-recorded social ad voice. Timed Voiceover "${dialogue}". Ambient Foley from the real setting only. ABSOLUTELY NO BGM, NO BACKGROUND MUSIC. Pure voice/dialogue and ambient foley only. No watermark, no distorted hands, no extra products, no cinematic, no professional, no studio, no 8k.]`
  ].join('\n');
}
function repairClonePrompt(clonePrompt, parsed, scenes, totalDuration) {
  const boards = clipPlans();
  const expected = boards.length || (totalDuration > 15 ? Math.ceil(totalDuration / 15) : 1);
  const sourceClips = Array.isArray(clonePrompt?.clips) ? clonePrompt.clips : [];
  const beats = toRecordArray(parsed.beat_map || parsed.beatMap);
  const clips = [];
  for (let idx = 0; idx < expected; idx += 1) {
    const board = normalizeClipPlanItem(boards[idx] || {}, idx);
    const original = sourceClips[idx] || {};
    const duration = Math.min(15, Math.max(0.2, toNumber(original.duration ?? board.duration, Math.min(15, totalDuration || 15))));
    const timeRange = text(original.time_range || board.time_range || `${toTime(idx * 15)}-${toTime(Math.min(totalDuration || duration, idx * 15 + duration))}`);
    const normalizedOriginal = normalizeClipPlanItem(original, idx, board);
    const panelStart = normalizedOriginal.panel_start;
    const panelEnd = normalizedOriginal.panel_end;
    const panelRange = normalizedOriginal.panel_range;
    const prompt = ensureNoBgmPrompt(original.prompt);
    const hasMarkers = ['### Clip', 'Storyboard panels:', '[Sequence Details:', '[Global Visual Anchor:', '[Audio/Action Cues:'].every((marker) => prompt.includes(marker));
    clips.push({
      clip_index: toNumber(original.clip_index, idx + 1),
      time_range: timeRange,
      duration,
      panel_start: panelStart,
      panel_end: panelEnd,
      panel_range: panelRange,
      role: text(original.role || (idx === 0 ? 'hook/setup' : idx === expected - 1 ? 'climax/cta' : 'demo/proof')),
      start_state: text(original.start_state || pickRowsInRange(scenes, timeRange)[0]?.visual_content_description || ''),
      prompt: hasMarkers && prompt.length >= 360
        ? prompt
        : buildFallbackPrompt({ ...original, time_range: timeRange, duration, panel_start: panelStart, panel_end: panelEnd, panel_range: panelRange }, idx, parsed, scenes, beats, totalDuration),
      end_state: text(original.end_state || pickRowsInRange(scenes, timeRange).slice(-1)[0]?.visual_content_description || ''),
      handoff_to_next: text(original.handoff_to_next || (idx < expected - 1 ? `Continue into clip ${idx + 2} from this exact final action and visual state.` : 'Final CTA frame.')),
    });
  }
  return {
    ...clonePrompt,
    generation_strategy: totalDuration > 15 ? 'multi_clip_sequential' : 'single_clip',
    global_style_rules: text(clonePrompt?.global_style_rules || clonePrompt?.globalStyleRules || '保留源视频广告语法：节拍顺序、镜头节奏、产品露出方式、情绪推进和 CTA 结构。'),
    global_negative_rules: ensureNoBgmPrompt(clonePrompt?.global_negative_rules || clonePrompt?.globalNegativeRules || '不要复制原品牌、原标签、原人物身份、水印、平台 UI 或背景音乐；避免棚拍和过度精修质感。'),
    dialogue_adaptation_rules: text(clonePrompt?.dialogue_adaptation_rules || clonePrompt?.dialogueAdaptationRules || '保留原视频句式、行数、停顿和能量曲线，只替换产品卖点与行动号召。'),
    clips,
  };
}
function normalizeClipDurations(clonePrompt, totalDuration) {
  const clips = Array.isArray(clonePrompt?.clips) ? clonePrompt.clips : [];
  if (!clips.length) return clonePrompt;
  clonePrompt.clips = clips.map((clip, idx) => {
    const board = clipPlans()[idx] || null;
    const duration = Math.min(15, Math.max(0.2, toNumber(clip.duration ?? board?.duration, 15)));
    return {
      clip_index: toNumber(clip.clip_index, idx + 1),
      time_range: text(clip.time_range || board?.time_range),
      duration,
      panel_start: toNumber(clip.panel_start ?? board?.panel_start, 0),
      panel_end: toNumber(clip.panel_end ?? board?.panel_end, 0),
      panel_range: text(clip.panel_range || board?.panel_range),
      role: text(clip.role),
      start_state: text(clip.start_state),
      prompt: ensureNoBgmPrompt(clip.prompt),
      end_state: text(clip.end_state),
      handoff_to_next: text(clip.handoff_to_next),
    };
  });
  clonePrompt.generation_strategy = totalDuration > 15 ? 'multi_clip_sequential' : (clonePrompt.generation_strategy || 'single_clip');
  return clonePrompt;
}
function validateClonePrompt(clonePrompt) {
  const clips = Array.isArray(clonePrompt?.clips) ? clonePrompt.clips : [];
  const expected = clipPlans().length ? clipPlans().length : (totalDuration > 15 ? Math.ceil(totalDuration / 15) : 1);
  if (clips.length !== expected) {
    throw new Error(`clone_prompt.clips 数量不对：expected=${expected}, got=${clips.length}`);
  }
  clips.forEach((clip, idx) => {
    const prompt = text(clip.prompt);
    if (prompt.length < 360) {
      throw new Error(`clip ${idx + 1} prompt 太短：${prompt.length} chars，必须输出 Arcads 级详细复刻提示词`);
    }
    for (const marker of ['### Clip', 'Storyboard panels:', '[Sequence Details:', '[Global Visual Anchor:', '[Audio/Action Cues:']) {
      if (!prompt.includes(marker)) {
        throw new Error(`clip ${idx + 1} prompt 缺少 ${marker}`);
      }
    }
    if (!text(clip.panel_range)) throw new Error(`clip ${idx + 1} 缺少 panel_range`);
  });
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
ensureFullScript(parsed, scenes);
const storyboardGridUrl = url(base.storyboard_grid_url);
if (!storyboardGridUrl) throw new Error('上游缺少 storyboard_grid_url，不能使用 Gemini 返回值兜底');
const parsedClips = Array.isArray(parsed.clone_prompt?.clips) ? parsed.clone_prompt.clips : [];
const clipPlan = Array.isArray(parsed.clip_plan) && parsed.clip_plan.length
  ? parsed.clip_plan
  : (Array.isArray(parsed.clip_boards) && parsed.clip_boards.length
      ? parsed.clip_boards
      : (parsedClips.length ? deriveClipPlanFromClips(parsedClips) : clipPlans()));
const cleanClipPlan = clipPlan.map((clip, idx) => normalizeClipPlanItem(clip, idx, clipPlans()[idx] || {}));
const repairedClonePrompt = repairClonePrompt(parsed.clone_prompt || {}, parsed, scenes, totalDuration);
const coveredScenes = ensureSceneCoverage(parsed, scenes);

const normalized = {
  ...parsed,
  pipeline_key: parsed.pipeline_key || base.pipelineKey,
  analysis_model: 'gemini-3-flash-preview',
  total_duration: totalDuration,
  scene_count: scenes.length,
  storyboard_grid_url: storyboardGridUrl,
  storyboard_grid: parsed.storyboard_grid || base.storyboard_grid || {},
  clip_plan: cleanClipPlan,
  clip_boards: cleanClipPlan,
  clone_prompt: validateClonePrompt(normalizeClipDurations(repairedClonePrompt, totalDuration)),
  scenes: coveredScenes,
};

const segments = coveredScenes.map((scene, idx) => ({
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
  audio_bgm: '',
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
function cleanUrl(v) {
  const s = v == null ? '' : String(v).trim();
  if (!s || /^(undefined|null|nan)$/i.test(s)) return '';
  return /^https?:\/\//i.test(s) ? s : '';
}
return {
  json: {
    task_id: data.taskId,
    taskId: data.taskId,
    record_id: data.taskId,
    status: 'completed',
    storyboard_grid_url: cleanUrl(workflowData.storyboard_grid_url) || cleanUrl(data.storyboard_grid_url),
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
            "url": "https://yunwu.ai/v1beta/models/gemini-3-flash-preview:generateContent",
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
