import type {
  AgentCapabilityRunArtifact,
  AgentCapabilityRunBusiness,
  AgentCapabilityRunResult,
} from '@/lib/agent-capabilities/types';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function uniqueArtifacts(artifacts: AgentCapabilityRunArtifact[]): AgentCapabilityRunArtifact[] {
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    const key = `${artifact.type}:${artifact.url || artifact.path || artifact.name || JSON.stringify(artifact.data || '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractBusiness(result: unknown): AgentCapabilityRunBusiness | undefined {
  const record = asRecord(result);
  const business = asRecord(record.business);
  if (Object.keys(business).length) return business as AgentCapabilityRunBusiness;
  return undefined;
}

function extractData(result: unknown): unknown {
  const record = asRecord(result);
  return Object.prototype.hasOwnProperty.call(record, 'data') ? record.data : result;
}

function urlArtifact(type: string, url: unknown, name: string): AgentCapabilityRunArtifact[] {
  return typeof url === 'string' && url ? [{ type, url, name }] : [];
}

function jsonArtifact(name: string, data: unknown): AgentCapabilityRunArtifact {
  return { type: 'json', name, data, mimeType: 'application/json' };
}

function imageArtifactsFromUnknown(value: unknown, prefix = 'image'): AgentCapabilityRunArtifact[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      const record = asRecord(item);
      return typeof record.url === 'string' ? record.url : '';
    })
    .filter((url): url is string => Boolean(url))
    .map((url, index) => ({ type: 'image', url, name: `${prefix}-${index + 1}.png` }));
}

function inferCapabilityArtifacts(run: AgentCapabilityRunResult, data: unknown): AgentCapabilityRunArtifact[] {
  const artifacts: AgentCapabilityRunArtifact[] = [];
  const record = asRecord(data);

  if (run.capabilityId === 'viral.midform.video.generate') {
    const dataRecord = asRecord(record.data);
    const metadata = asRecord(dataRecord.metadata);
    const custom = asRecord(metadata.custom);
    const shots = Array.isArray(record.shots)
      ? record.shots
      : Array.isArray(dataRecord.shots)
        ? dataRecord.shots
        : Array.isArray(custom.t2v_shots)
          ? custom.t2v_shots
          : undefined;
    if (shots) artifacts.push(jsonArtifact('storyboard-shots.json', shots));
    const storyboardTaskId = record.storyboardTaskId || dataRecord.storyboardTaskId || custom.t2v_storyboard_id;
    if (storyboardTaskId) artifacts.push({ type: 'json', name: 'storyboard-task.json', data: { storyboardTaskId }, mimeType: 'application/json' });
    const finalVideoUrl = record.finalVideoUrl || dataRecord.finalVideoUrl;
    artifacts.push(...urlArtifact('video', finalVideoUrl, 'midform-video.mp4'));
  }

  if (run.capabilityId === 'viral.breakdown.video_prompts') {
    artifacts.push(jsonArtifact('video-prompts.json', data));
  }

  if (run.capabilityId === 'xhs.card.layout') {
    const pages = record.pages || asRecord(record.data).pages;
    if (pages) artifacts.push(jsonArtifact('xhs-card-pages.json', pages));
  }

  if (run.capabilityId === 'xhs.infographic.generate') {
    artifacts.push(...imageArtifactsFromUnknown(record.images || record.generatedImages || asRecord(record.data).images, 'xhs-infographic'));
  }

  if (run.capabilityId === 'digital-human.video.generate') {
    artifacts.push(...urlArtifact('video', record.resultUrl || record.videoUrl || asRecord(record.data).resultUrl, 'digital-human.mp4'));
  }

  if (run.capabilityId === 'motion.replication.image_to_video') {
    artifacts.push(...urlArtifact('video', record.resultUrl || record.videoUrl || asRecord(record.data).resultUrl, 'motion-replication.mp4'));
  }

  if (run.capabilityId.startsWith('social.')) {
    const items = record.items || asRecord(record.data).items;
    artifacts.push(jsonArtifact('social-items.json', items || data));
  }

  if (run.capabilityId === 'product.selling_point.analysis') {
    artifacts.push(jsonArtifact('product-selling-points.json', data));
  }

  if (run.capabilityId === 'content.wechat.longform.write') {
    const article = typeof record.article === 'string' ? record.article : typeof data === 'string' ? data : undefined;
    if (article) artifacts.push({ type: 'text', name: 'wechat-article.md', data: article, mimeType: 'text/markdown' });
  }

  return artifacts;
}

export function normalizeAgentRunResult(run: AgentCapabilityRunResult) {
  const existingArtifacts = Array.isArray(run.artifacts) ? run.artifacts : [];
  const business = extractBusiness(run.result);
  const data = extractData(run.result);
  const artifacts = uniqueArtifacts([
    ...existingArtifacts,
    ...inferCapabilityArtifacts(run, data),
  ]);

  return {
    run,
    result: data,
    artifacts,
    business,
    error: run.error || null,
  };
}
