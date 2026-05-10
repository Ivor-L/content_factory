/* eslint-disable @next/next/no-img-element -- Report renders remote storyboard grids from task artifacts. */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asArray(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value);
}

function pick(record: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    const text = readString(value);
    if (text) return text;
  }
  return '';
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function chip(label: string, value: unknown) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{readString(value) || '-'}</div>
    </div>
  );
}

export default async function StoryboardReportPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const task = await prisma.storyboardTask.findUnique({
    where: { id },
    include: {
      product: true,
      segments: { orderBy: { order: 'asc' } },
    },
  });

  if (!task) notFound();

  const breakdown = asRecord(task.detailedBreakdown);
  const metadata = asRecord(breakdown.metadata);
  const mechanism = asRecord(breakdown.viral_mechanism);
  const sourceAnalysis = asRecord(breakdown.source_video_analysis);
  const contentStructure = asRecord(breakdown.content_structure);
  const clonePrompt = asRecord(breakdown.clone_prompt);
  const scenes = asArray(breakdown.scenes).length ? asArray(breakdown.scenes) : task.segments.map((segment) => ({
    order: segment.order,
    timeRange: segment.timeRange,
    duration: segment.duration,
    imagePrompt: segment.imagePrompt,
    videoPrompt: segment.videoPrompt,
    originalScript: segment.originalScript,
    rewrittenScript: segment.rewrittenScript,
    visualDescription: segment.visualDescription,
  }));
  const beats = asArray(breakdown.beat_map);
  const clips = asArray(clonePrompt.clips);
  const storyboardGridUrl = readString(task.storyboardImageUrl || task.coverImage || breakdown.storyboard_grid_url || breakdown.storyboardGridUrl);
  const referenceVideoUrl = pick(metadata, ['reference_video_url', 'referenceVideoUrl', 'reference_url', 'referenceUrl']);
  const learnItems = Array.isArray(breakdown.what_transfers) ? breakdown.what_transfers.map(readString).filter(Boolean) : [];
  const swapItems = Array.isArray(breakdown.what_gets_swapped) ? breakdown.what_gets_swapped.map(readString).filter(Boolean) : [];
  const timelineItems = beats.length ? beats : scenes;
  const title = readString(sourceAnalysis.style_name || metadata.title || '爆款视频复刻拆解报告');

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 to-black p-6 shadow-2xl">
          <div className="text-sm text-zinc-400">爆款视频复刻拆解报告</div>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
              <p className="mt-3 max-w-4xl break-all text-sm leading-6 text-zinc-400">
                任务：{task.id} · 状态：{task.status} · 进度：{task.progress}% · 来源：{referenceVideoUrl || '未记录'}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={`/storyboard/${task.id}`} className="rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200">
                打开工作台
              </Link>
              {storyboardGridUrl ? (
                <a href={storyboardGridUrl} target="_blank" rel="noreferrer" className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10">
                  查看分镜板原图
                </a>
              ) : null}
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {chip('总时长', breakdown.total_duration || breakdown.duration_seconds ? `${breakdown.total_duration || breakdown.duration_seconds} 秒` : '-')}
            {chip('分镜数', scenes.length)}
            {chip('Clip Prompt', clips.length)}
            {chip('目标语言', metadata.target_language || metadata.targetLanguage || '-')}
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-zinc-900/70 p-5">
          <h2 className="text-xl font-semibold text-white">分镜板预览</h2>
          {storyboardGridUrl ? (
            <img src={storyboardGridUrl} alt="storyboard grid" className="mt-4 w-full rounded-2xl border border-white/10" />
          ) : (
            <p className="mt-4 text-sm text-zinc-400">暂无分镜板预览。</p>
          )}
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-zinc-900/70 p-5">
            <h2 className="text-xl font-semibold text-white">爆款机制</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-300">{readString(mechanism.core_idea) || '暂无核心机制摘要。'}</p>
            <pre className="mt-4 max-h-96 overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs leading-5 text-zinc-300">{formatJson({
              attention: mechanism.attention_triggers || [],
              retention: mechanism.retention_devices || [],
              trust: mechanism.trust_devices || [],
              conversion: mechanism.conversion_devices || [],
            })}</pre>
          </div>
          <div className="rounded-3xl border border-white/10 bg-zinc-900/70 p-5">
            <h2 className="text-xl font-semibold text-white">内容结构</h2>
            <pre className="mt-4 max-h-96 overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs leading-5 text-zinc-300">{formatJson(contentStructure)}</pre>
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-zinc-900/70 p-5">
          <h2 className="text-xl font-semibold text-white">时间线 / Beat Map</h2>
          <div className="mt-4 grid gap-3">
            {timelineItems.length ? timelineItems.map((item, index) => {
              const label = pick(item, ['beat', 'role', 'order']) || `STEP ${index + 1}`;
              const timeRange = pick(item, ['time_range', 'timeRange', 'start_time']);
              const visual = pick(item, ['visual', 'visual_description', 'visualDescription', 'shot_goal', 'summary']);
              const note = pick(item, ['function', 'replication_note', 'dialogue_or_text', 'original_script', 'originalScript']);
              return (
                <div key={`${label}-${index}`} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">{label}</span>
                    <span className="text-xs text-zinc-400">{timeRange}</span>
                  </div>
                  <div className="mt-3 text-sm font-medium leading-6 text-white">{visual}</div>
                  <div className="mt-2 text-sm leading-6 text-zinc-400">{note}</div>
                </div>
              );
            }) : <p className="text-sm text-zinc-400">暂无时间线。</p>}
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-zinc-900/70 p-5">
          <h2 className="text-xl font-semibold text-white">分镜列表</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-black/40 text-xs uppercase text-zinc-400">
                <tr>
                  <th className="px-3 py-3">场景</th>
                  <th className="px-3 py-3">时间</th>
                  <th className="px-3 py-3">时长</th>
                  <th className="px-3 py-3">画面</th>
                  <th className="px-3 py-3">imagePrompt</th>
                  <th className="px-3 py-3">videoPrompt</th>
                  <th className="px-3 py-3">台词</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-zinc-300">
                {scenes.map((scene, index) => (
                  <tr key={index}>
                    <td className="px-3 py-3 align-top">{pick(scene, ['order', 'scene']) || index + 1}</td>
                    <td className="px-3 py-3 align-top">{pick(scene, ['time_range', 'timeRange'])}</td>
                    <td className="px-3 py-3 align-top">{pick(scene, ['duration'])}</td>
                    <td className="min-w-64 px-3 py-3 align-top">{pick(scene, ['visual_description', 'visualDescription', 'visual_content_description'])}</td>
                    <td className="min-w-80 px-3 py-3 align-top">{pick(scene, ['image_prompt', 'imagePrompt'])}</td>
                    <td className="min-w-80 px-3 py-3 align-top">{pick(scene, ['video_prompt', 'videoPrompt'])}</td>
                    <td className="min-w-72 px-3 py-3 align-top">{pick(scene, ['original_script', 'originalScript'])}<br />{pick(scene, ['rewritten_script', 'rewrittenScript'])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-zinc-900/70 p-5">
          <h2 className="text-xl font-semibold text-white">Clip 视频提示词</h2>
          <div className="mt-4 grid gap-4">
            {clips.length ? clips.map((clip, index) => (
              <div key={index} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>Clip {pick(clip, ['clip_index', 'clipIndex']) || index + 1}</strong>
                  <span className="text-xs text-zinc-400">{pick(clip, ['time_range', 'timeRange'])} · {pick(clip, ['duration'])}s</span>
                </div>
                <pre className="mt-3 whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-black/50 p-4 text-xs leading-5 text-zinc-200">{pick(clip, ['prompt']) || formatJson(clip)}</pre>
              </div>
            )) : <p className="text-sm text-zinc-400">暂无 Clip Prompt。</p>}
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-zinc-900/70 p-5">
            <h2 className="text-xl font-semibold text-white">可以学习</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-300">
              {learnItems.length ? learnItems.map((item) => <li key={item}>{item}</li>) : <li>暂无。</li>}
            </ul>
          </div>
          <div className="rounded-3xl border border-white/10 bg-zinc-900/70 p-5">
            <h2 className="text-xl font-semibold text-white">必须替换 / 不要照抄</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-300">
              {swapItems.length ? swapItems.map((item) => <li key={item}>{item}</li>) : <li>暂无。</li>}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
