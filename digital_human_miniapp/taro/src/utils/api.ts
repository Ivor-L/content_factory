import Taro from '@tarojs/taro';
import { createClient } from '@supabase/supabase-js';

function getApiBaseUrl(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromDefine = typeof __API_BASE_URL__ !== 'undefined' ? (String((__API_BASE_URL__ as any) || '').trim()) : '';
    if (fromDefine) return fromDefine.replace(/\/$/, '');
  } catch {
    // ignore
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runtime = (typeof globalThis !== 'undefined' ? (globalThis as any) : null);
    const fromProcess = runtime?.process?.env?.TARO_APP_API_BASE_URL;
    if (typeof fromProcess === 'string' && fromProcess.trim()) {
      return fromProcess.trim().replace(/\/$/, '');
    }
  } catch {
    // ignore
  }
  return '';
}

const API_BASE_URL = getApiBaseUrl();
const SUPABASE_URL = (typeof __SUPABASE_URL__ !== 'undefined' ? String(__SUPABASE_URL__ || '') : '').trim();
const SUPABASE_ANON_KEY = (typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? String(__SUPABASE_ANON_KEY__ || '') : '').trim();
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

export type DigitalHumanMode = 'VOICE_CLONE' | 'LIP_SYNC';
export type DigitalHumanSourceType = 'IMAGE' | 'VIDEO';

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
  sourceType?: DigitalHumanSourceType | null;
  imageUrl: string;
  audioUrl: string;
  scriptContent?: string | null;
  resultUrl?: string | null;
  durationSeconds?: number | null;
  workflowId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export class NotBoundError extends Error {
  openid: string;
  constructor(openid: string) {
    super('NOT_BOUND');
    this.openid = openid;
  }
}

export interface MiniappLoginPayload {
  apiKey: string;
  userId: string;
  username: string | null;
  avatarUrl: string | null;
}

export interface ProfilePayload {
  id: string;
  username: string | null;
  avatarUrl: string | null;
  memberLevel?: string | null;
}

function getApiKey(): string | null {
  try {
    return Taro.getStorageSync('API_KEY') || null;
  } catch {
    return null;
  }
}

function resolveUrl(path: string): string {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

async function request<T = unknown>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    data?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const apiKey = getApiKey();
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    header['X-User-Api-Key'] = apiKey;
  }

  const res = await Taro.request({
    url: resolveUrl(path),
    method: options.method ?? (options.data ? 'POST' : 'GET'),
    data: options.data,
    header,
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    const payload = res.data as Record<string, unknown> | null;
    const message = (payload?.error as string) ?? `HTTP ${res.statusCode}`;
    throw new ApiError(res.statusCode, message, payload);
  }

  const payload = res.data as Record<string, unknown> | null;
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data as T;
  }
  return payload as T;
}

async function uploadFile(file: string, name: string, mimeType: string): Promise<string> {
  const apiKey = getApiKey();
  const header: Record<string, string> = {};
  if (apiKey) {
    header['X-User-Api-Key'] = apiKey;
  }

  const res = await Taro.uploadFile({
    url: resolveUrl('/api/upload'),
    filePath: file,
    name: 'file',
    header,
    formData: { filename: name, contentType: mimeType },
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new ApiError(res.statusCode, 'Upload failed');
  }

  const data = typeof res.data === 'string'
    ? (JSON.parse(res.data) as Record<string, unknown>)
    : (res.data as Record<string, unknown>);

  if (!data?.url) throw new ApiError(500, 'No URL returned from upload');
  return data.url as string;
}

export const api = {
  // ── 微信登录 ──────────────────────────────────────────

  async wechatLogin(): Promise<MiniappLoginPayload> {
    const { code } = await Taro.login();
    const res = await Taro.request({
      url: resolveUrl('/api/auth/wechat/login'),
      method: 'POST',
      data: { code },
      header: { 'Content-Type': 'application/json' },
    });

    if (res.statusCode === 404) {
      const payload = res.data as { error: string; openid: string };
      if (payload?.error === 'NOT_BOUND') {
        throw new NotBoundError(payload.openid);
      }
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      const message = (res.data as Record<string, unknown>)?.error as string ?? 'Login failed';
      throw new ApiError(res.statusCode, message);
    }

    const payload = res.data as { data: MiniappLoginPayload };
    return payload.data;
  },

  async wechatBind(openid: string, apiKey: string) {
    return request<{ apiKey: string; userId: string }>('/api/auth/wechat/bind', {
      method: 'POST',
      data: { openid, apiKey },
    });
  },

  async wechatPhoneLogin(code: string): Promise<MiniappLoginPayload> {
    return request<MiniappLoginPayload>('/api/auth/wechat/phone-login', {
      method: 'POST',
      data: { code },
    });
  },

  async phoneSendCode(phone: string, purpose: 'login' | 'bind') {
    return request<{ ok: boolean; ttlSeconds: number; devCode?: string }>('/api/auth/phone/send-code', {
      method: 'POST',
      data: { phone, purpose },
    });
  },

  async phoneVerify(payload: { phone: string; code: string; purpose: 'login' | 'bind'; email?: string; }) {
    return request<{
      ok: boolean;
      needSignup?: boolean;
      message?: string;
      userId?: string;
      apiKey?: string;
      username?: string | null;
      avatarUrl?: string | null;
    }>('/api/auth/phone/verify', {
      method: 'POST',
      data: payload as unknown as Record<string, unknown>,
    });
  },

  async emailSendCode(email: string) {
    return request<{ ok: boolean; ttlSeconds?: number }>('/api/auth/email/send-code', {
      method: 'POST',
      data: { email },
    });
  },

  async emailVerify(payload: { email: string; otp: string }) {
    return request<{ session?: { access_token?: string } }>('/api/auth/verify-otp', {
      method: 'POST',
      data: payload as unknown as Record<string, unknown>,
    });
  },

  async createMiniappSession(accessToken: string) {
    return request<{ ok: boolean }>('/api/auth/session', {
      method: 'POST',
      data: { accessToken },
    });
  },

  async getProfile(): Promise<ProfilePayload & { apiKey: string | null }> {
    const profile = await request<ProfilePayload>('/api/user/profile');
    return {
      ...profile,
      apiKey: getApiKey(),
    };
  },

  async emailPasswordLogin(payload: { email: string; password: string }) {
    // prefer server-side password auth endpoint to avoid shipping extra auth flows in miniapp
    const res = await request<{ ok?: boolean; accessToken?: string }>('/api/auth/email/password-login', {
      method: 'POST',
      data: {
        email: payload.email,
        password: payload.password,
      },
    });
    const accessToken = String(res?.accessToken || '').trim();
    if (!accessToken) throw new Error('邮箱密码登录失败');
    await this.createMiniappSession(accessToken);
    return accessToken;
  },

  async signOutSupabaseClient() {
    if (!supabase) return;
    await supabase.auth.signOut().catch(() => {});
  },

  // ── 数字人形象 ────────────────────────────────────────

  async getDigitalHumans(): Promise<DigitalHumanCharacter[]> {
    const list = await request<Record<string, unknown>[]>('/api/characters');
    if (!Array.isArray(list)) return [];
    return list.map((item) => ({
      id: item.id as string,
      name: item.name as string,
      imageUrl: item.avatar as string,
      voiceUrl: (item.voiceId as string | null) ?? null,
      createdAt: item.createdAt as string | undefined,
    }));
  },

  async addDigitalHuman(data: { name: string; imageUrl: string; voiceUrl?: string | null }): Promise<DigitalHumanCharacter> {
    const payload = await request<Record<string, unknown>>('/api/characters', {
      method: 'POST',
      data: { name: data.name, avatar: data.imageUrl, voiceId: data.voiceUrl },
    });
    return {
      id: payload.id as string,
      name: payload.name as string,
      imageUrl: (payload.avatar ?? data.imageUrl) as string,
      voiceUrl: (payload.voiceId ?? data.voiceUrl ?? null) as string | null,
      createdAt: payload.createdAt as string | undefined,
    };
  },

  async deleteDigitalHuman(id: string) {
    await request(`/api/characters/${id}`, { method: 'DELETE' });
  },

  // ── 媒体上传 ──────────────────────────────────────────

  async uploadMedia(filePath: string, name: string, mimeType: string): Promise<string> {
    return uploadFile(filePath, name, mimeType);
  },

  // ── 生成记录 ──────────────────────────────────────────

  async getRecords(): Promise<DigitalHumanVideoRecord[]> {
    return request<DigitalHumanVideoRecord[]>('/api/digital-human/videos');
  },

  async createDigitalHumanTask(payload: {
    type: DigitalHumanMode;
    sourceType?: DigitalHumanSourceType;
    imageUrl?: string;
    videoUrl?: string;
    audioUrl: string;
    scriptContent?: string;
    emoAudioUrl?: string | null;
    durationSeconds?: number | null;
  }): Promise<DigitalHumanVideoRecord> {
    return request<DigitalHumanVideoRecord>('/api/digital-human/videos', {
      method: 'POST',
      data: payload as unknown as Record<string, unknown>,
    });
  },
};
