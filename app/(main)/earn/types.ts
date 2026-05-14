export type EarnTaskMaterial = {
  id: string;
  taskId: string;
  title: string | null;
  description: string | null;
  type: string;
  payload: unknown;
  usedCount: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EarnTask = {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  platforms: unknown;
  coverUrl: string | null;
  rewardAmount: number;
  maxParticipants: number;
  currentParticipants: number;
  deadlineAt: string | null;
  keepSeconds: number;
  requiresPlugin: boolean;
  requiresShoppingCart: boolean;
  requirements: unknown;
  actionConfig: unknown;
  createdAt: string;
  updatedAt: string;
  materials?: EarnTaskMaterial[];
  _count?: {
    materials?: number;
    userTasks?: number;
  };
};

export type EarnUserTask = {
  id: string;
  taskId: string;
  userId: string;
  platform: string;
  platformUid: string;
  platformAccountName: string | null;
  taskMaterialId: string | null;
  status: string;
  submissionUrl: string | null;
  screenshotUrls: unknown;
  pluginEvidence: unknown;
  qrCodeScanResult: string | null;
  submissionTime: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  rewardAmount: number;
  rewardedAt: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  task?: EarnTask;
  taskMaterial?: EarnTaskMaterial | null;
};

export function parsePlatforms(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string');
    } catch {
      return value.split(',').map(item => item.trim()).filter(Boolean);
    }
  }
  return [];
}

export function platformLabel(value: string) {
  if (value === 'xhs') return '小红书';
  if (value === 'douyin') return '抖音';
  if (value === 'video_account') return '视频号';
  return value || '全平台';
}

export function taskStatusLabel(value: string) {
  const map: Record<string, string> = {
    draft: '草稿',
    active: '上架',
    paused: '暂停',
    archived: '归档',
    doing: '进行中',
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝',
    cancelled: '已取消',
    expired: '已过期',
    rewarded: '已发放',
  };
  return map[value] || value;
}

export function formatReward(value: number) {
  return `¥${(value / 100).toFixed(2)}`;
}

export function formatDate(value: string | null) {
  if (!value) return '长期';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
