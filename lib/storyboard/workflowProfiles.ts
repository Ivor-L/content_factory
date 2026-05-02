export type StoryboardPipelineKey = 'script_to_storyboard' | 'viral_clone' | 'skeleton_video';

export interface StoryboardWorkflowProfile {
  pipelineKey: StoryboardPipelineKey;
  workflowId: string;
  workflowName: string;
  webhookUrl: string;
  callbackPath: string;
  defaultSource: string;
}

const DEFAULT_STORYBOARD_SCRIPT_WEBHOOK =
  'https://n8n.atomx.top/webhook/897bb7fb-b878-4135-9aaf-d60beba1dbef';
const DEFAULT_STORYBOARD_BREAKDOWN_WEBHOOK = 'https://hooks.atomx.top/webhook/storyboard_disassembly_web';
const DEFAULT_SKELETON_WEBHOOK = 'https://hooks.atomx.top/webhook/veo-gg-web';

const RAW_PROFILES: Record<StoryboardPipelineKey, StoryboardWorkflowProfile> = {
  script_to_storyboard: {
    pipelineKey: 'script_to_storyboard',
    workflowId: 'flow_xhs_chuangzuo',
    workflowName: '正文转视频分镜',
    webhookUrl: (process.env.N8N_STORYBOARD_SCRIPT_WEBHOOK || '').trim() || DEFAULT_STORYBOARD_SCRIPT_WEBHOOK,
    callbackPath: '/api/webhook/storyboard/unified',
    defaultSource: 'creative_workspace',
  },
  viral_clone: {
    pipelineKey: 'viral_clone',
    workflowId: 'flow_storyboard_disassembly',
    workflowName: '分镜拆解',
    webhookUrl: (process.env.N8N_STORYBOARD_BREAKDOWN_WEBHOOK || '').trim() || DEFAULT_STORYBOARD_BREAKDOWN_WEBHOOK,
    callbackPath: '/api/webhook/storyboard/unified',
    defaultSource: 'storyboard',
  },
  skeleton_video: {
    pipelineKey: 'skeleton_video',
    workflowId: 'flow_storyboard_skeleton_video',
    workflowName: '骷髅分镜视频',
    webhookUrl: (process.env.N8N_STORYBOARD_SKELETON_WEBHOOK || '').trim() || DEFAULT_SKELETON_WEBHOOK,
    callbackPath: '/api/webhook/storyboard/unified',
    defaultSource: 'storyboard',
  },
};

export function getStoryboardWorkflowProfile(pipelineKey: StoryboardPipelineKey): StoryboardWorkflowProfile {
  return RAW_PROFILES[pipelineKey];
}

export function isStoryboardPipelineKey(value: unknown): value is StoryboardPipelineKey {
  return value === 'script_to_storyboard' || value === 'viral_clone' || value === 'skeleton_video';
}
