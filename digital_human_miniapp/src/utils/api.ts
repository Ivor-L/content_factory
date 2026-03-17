export type DigitalHumanMode = 'VOICE_CLONE' | 'LIP_SYNC';

export interface DigitalHumanCharacter {
  id: string;
  name: string;
  imageUrl: string;
  voiceUrl?: string | null;
  createdAt?: string;
}

export interface DigitalHumanVideoRecord {
  id: string;
  type: DigitalHumanMode;
  status: string;
  imageUrl: string;
  audioUrl: string;
  scriptContent?: string | null;
  resultUrl?: string | null;
  durationSeconds?: number | null;
  workflowId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreativeStageKey = 'diagnosis' | 'mining' | 'topic' | 'framework' | 'draft';

export interface StageMetaEntry {
  status?: 'pending' | 'in_progress' | 'completed' | 'blocked';
  aiOutput?: any;
  userNotes?: string;
  manualContent?: string;
  updatedAt?: string;
}

export interface CreativeTaskSummary {
  id: string;
  title?: string | null;
  ideaText?: string | null;
  channel?: string | null;
  stage: CreativeStageKey;
  status: string;
  createdAt: string;
  updatedAt: string;
  metadata?: {
    stages?: Record<string, StageMetaEntry>;
  } | null;
}

export interface CreativeTaskDetail extends CreativeTaskSummary {
  targetOutput?: string | null;
  metadata?: {
    stages?: Record<string, StageMetaEntry>;
    route?: string;
  } | null;
}

export class ApiError extends Error {
  status: number;
  payload: any;

  constructor(status: number, message: string, payload?: any) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export class MissingApiKeyError extends Error {
  constructor() {
    super('MISSING_API_KEY');
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const shouldIncludeCredentials = API_BASE_URL.length === 0;

type RequestOptions = {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  requiresApiKey?: boolean;
};

function resolveUrl(path: string) {
  if (API_BASE_URL) return `${API_BASE_URL}${path}`;
  return path;
}

function getStoredApiKey() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('API_KEY');
}

async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = resolveUrl(path);
  const headers: Record<string, string> = { ...(options.headers || {}) };
  const apiKey = getStoredApiKey();

  if (options.requiresApiKey && !apiKey) {
    throw new MissingApiKeyError();
  }

  if (apiKey) {
    headers['X-User-Api-Key'] = apiKey;
  }

  const init: RequestInit = {
    method: options.method || (options.body ? 'POST' : 'GET'),
    headers,
    credentials: shouldIncludeCredentials ? 'include' : 'omit',
  };

  if (options.body instanceof FormData) {
    init.body = options.body;
  } else if (options.body !== undefined) {
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  const response = await fetch(url, init);
  const text = await response.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, (payload && payload.error) || response.statusText, payload);
  }

  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const apiKey = getStoredApiKey();
  if (apiKey) {
    formData.append('apiKey', apiKey);
  }
  const res = await fetch(resolveUrl('/api/upload'), {
    method: 'POST',
    body: formData,
    credentials: shouldIncludeCredentials ? 'include' : 'omit',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || 'Upload failed', data);
  }
  return data.url;
}

export const api = {
  async getDigitalHumans(): Promise<DigitalHumanCharacter[]> {
    const list = await request<any[]>('/api/characters');
    if (!Array.isArray(list)) return [];
    return list.map((item) => ({
      id: item.id,
      name: item.name,
      imageUrl: item.avatar,
      voiceUrl: item.voiceId || null,
      createdAt: item.createdAt,
    }));
  },

  async addDigitalHuman(data: { name: string; imageUrl: string; voiceUrl?: string | null }) {
    const payload = await request<DigitalHumanCharacter>('/api/characters', {
      method: 'POST',
      body: {
        name: data.name,
        avatar: data.imageUrl,
        voiceId: data.voiceUrl,
      },
    });
    return {
      id: payload.id,
      name: payload.name,
      imageUrl: (payload as any).avatar ?? data.imageUrl,
      voiceUrl: (payload as any).voiceId ?? data.voiceUrl ?? null,
      createdAt: payload.createdAt,
    } as DigitalHumanCharacter;
  },

  async deleteDigitalHuman(id: string) {
    await request(`/api/characters/${id}`, { method: 'DELETE' });
  },

  async uploadMedia(file: File) {
    return uploadFile(file);
  },

  async getRecords(): Promise<DigitalHumanVideoRecord[]> {
    return request<DigitalHumanVideoRecord[]>('/api/digital-human/videos', {
      requiresApiKey: true,
    });
  },

  async createDigitalHumanTask(payload: {
    type: DigitalHumanMode;
    imageUrl: string;
    audioUrl: string;
    scriptContent?: string;
    emoAudioUrl?: string | null;
    durationSeconds?: number | null;
  }): Promise<DigitalHumanVideoRecord> {
    return request<DigitalHumanVideoRecord>('/api/digital-human/videos', {
      method: 'POST',
      body: payload,
      requiresApiKey: true,
    });
  },

  async getCreativeTasks(): Promise<CreativeTaskSummary[]> {
    return request<CreativeTaskSummary[]>('/api/creative-tasks', {
      requiresApiKey: true,
    });
  },

  async getCreativeTaskDetail(taskId: string): Promise<CreativeTaskDetail> {
    return request<CreativeTaskDetail>(`/api/creative-tasks/${taskId}`, {
      requiresApiKey: true,
    });
  },

  async createCreativeTask(payload: { title?: string; ideaText: string; channel?: string; targetOutput?: string }) {
    return request<CreativeTaskDetail>('/api/creative-tasks', {
      method: 'POST',
      body: payload,
      requiresApiKey: true,
    });
  },

  async generateCreativeStage(taskId: string, stage: CreativeStageKey) {
    return request(`/api/creative-tasks/${taskId}/generate`, {
      method: 'POST',
      body: { stage },
      requiresApiKey: true,
    });
  },

  async saveStage(taskId: string, data: { stage: CreativeStageKey; status?: string; userNotes?: string }) {
    return request(`/api/creative-tasks/${taskId}/stage`, {
      method: 'POST',
      body: data,
      requiresApiKey: true,
    });
  },
};
