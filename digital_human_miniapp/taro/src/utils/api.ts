import Taro from '@tarojs/taro';

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
const AUTH_API_BASE_URL = 'https://auth.atomx.top';
const ACCESS_TOKEN_STORAGE_KEY = 'MINIAPP_ACCESS_TOKEN';
const REQUEST_TIMEOUT_MS = 30000;

export type DigitalHumanMode = 'VOICE_CLONE' | 'LIP_SYNC' | 'ACTION_TRANSFER';
export type DigitalHumanSourceType = 'IMAGE' | 'VIDEO' | 'ACTION_TRANSFER';

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
  segmentIndex?: number | null;
  segmentCount?: number | null;
  isSegmented?: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface DigitalHumanTaskCreateResult extends DigitalHumanVideoRecord {
  jobs?: DigitalHumanVideoRecord[];
  videoIds?: string[];
  jobCount?: number;
  split?: boolean;
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
  apiKey?: string | null;
}

interface UploadMediaOptions {
  direct?: boolean;
  type?: string;
  onProgress?: (progress: number, phase?: 'uploading' | 'confirming' | 'processing' | 'done') => void;
}

interface PresignUploadPayload {
  uploadUrl?: string;
  publicUrl: string;
  key: string;
  postUploadUrl?: string;
  postFormData?: Record<string, string>;
  postMaxBytes?: number;
}

function clampUploadProgress(value: number): number {
  return Math.max(0, Math.min(99, Number(value) || 0));
}

function isUploadBytesComplete(progress: {
  progress?: number;
  totalBytesExpectedToSend?: number;
  totalBytesSent?: number;
}): boolean {
  const percent = Number(progress.progress) || 0;
  const expected = Number(progress.totalBytesExpectedToSend) || 0;
  const sent = Number(progress.totalBytesSent) || 0;
  return percent >= 100 || (expected > 0 && sent >= expected);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function confirmPublicUrlReady(url: string): Promise<void> {
  const target = String(url || '').trim();
  if (!target) throw new Error('Missing uploaded file URL');

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const res = await Taro.request({
        url: target,
        method: 'HEAD' as 'GET',
        timeout: 3000,
      });
      if (res.statusCode >= 200 && res.statusCode < 400) return;
    } catch {
      // The upload task result remains the final fallback if HEAD is unavailable.
    }
    await wait(450);
  }

  throw new Error('Uploaded file URL is not ready yet');
}

async function notifyUploadServerSide(
  publicUrl: string,
  name: string,
  mimeType: string,
): Promise<void> {
  try {
    const apiKey = getApiKey();
    const accessToken = getAccessToken();
    const header: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) header['X-User-Api-Key'] = apiKey;
    if (accessToken) header.Authorization = `Bearer ${accessToken}`;
    const res = await Taro.request({
      url: resolveUrl('/api/upload/confirm'),
      method: 'POST',
      data: { url: publicUrl, filename: name, contentType: mimeType },
      header,
      timeout: 15000,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new ApiError(res.statusCode, `Upload confirm failed: HTTP ${res.statusCode}`, res.data);
    }
  } catch (error) {
    void reportClientLog('miniapp_upload_oss_confirm_notify_failed', {
      name,
      mimeType,
      publicUrl,
      error: toLoggableError(error),
    });
  }
}

function getApiKey(): string | null {
  try {
    return Taro.getStorageSync('API_KEY') || null;
  } catch {
    return null;
  }
}

function getAccessToken(): string | null {
  try {
    const token = String(Taro.getStorageSync(ACCESS_TOKEN_STORAGE_KEY) || '').trim();
    return token || null;
  } catch {
    return null;
  }
}

function setAccessToken(accessToken: string | null) {
  try {
    const token = String(accessToken || '').trim();
    if (token) {
      Taro.setStorageSync(ACCESS_TOKEN_STORAGE_KEY, token);
    } else {
      Taro.removeStorageSync(ACCESS_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

function shouldUseAuthApi(path: string): boolean {
  return path.startsWith('/api/auth/') || path === '/api/user/profile';
}

function resolveUrl(path: string): string {
  const base = shouldUseAuthApi(path) ? AUTH_API_BASE_URL : API_BASE_URL;
  return base ? `${base}${path}` : path;
}

function getCurrentPageRoute(): string {
  try {
    const pages = Taro.getCurrentPages();
    const current = pages[pages.length - 1] as { route?: string; options?: Record<string, unknown> } | undefined;
    return current?.route || '';
  } catch {
    return '';
  }
}

function toLoggableError(error: unknown): Record<string, unknown> {
  if (error instanceof ApiError) {
    return {
      name: error.name,
      message: error.message,
      status: error.status,
      payload: error.payload,
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return {
    message: String(error || 'Unknown error'),
  };
}

export async function reportClientLog(event: string, payload: Record<string, unknown> = {}): Promise<void> {
  try {
    await Taro.request({
      url: resolveUrl('/api/client-logs'),
      method: 'POST',
      data: {
        event,
        payload,
        client: 'weapp',
        route: getCurrentPageRoute(),
        hasApiKey: Boolean(getApiKey()),
        createdAt: new Date().toISOString(),
      },
      header: { 'Content-Type': 'application/json' },
      timeout: 5000,
    });
  } catch {
    // Best-effort diagnostics only.
  }
}

async function request<T = unknown>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    data?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const apiKey = getApiKey();
  const accessToken = getAccessToken();
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    header['X-User-Api-Key'] = apiKey;
  }
  if (accessToken) {
    header.Authorization = `Bearer ${accessToken}`;
  }

  const res = await Taro.request({
    url: resolveUrl(path),
    method: options.method ?? (options.data ? 'POST' : 'GET'),
    data: options.data,
    header,
    timeout: REQUEST_TIMEOUT_MS,
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

async function uploadFile(
  file: string,
  name: string,
  mimeType: string,
  options: UploadMediaOptions = {},
): Promise<string> {
  void reportClientLog('miniapp_upload_server_start', {
    name,
    mimeType,
    type: options.type || null,
  });

  const apiKey = getApiKey();
  const header: Record<string, string> = {};
  if (apiKey) {
    header['X-User-Api-Key'] = apiKey;
  }

  const uploadTask = Taro.uploadFile({
    url: resolveUrl('/api/upload'),
    filePath: file,
    name: 'file',
    header,
    formData: { filename: name, contentType: mimeType },
  });
  uploadTask.progress((progress) => {
    options.onProgress?.(
      clampUploadProgress(progress.progress),
      isUploadBytesComplete(progress) ? 'confirming' : 'uploading',
    );
  });
  const res = await uploadTask;

  if (res.statusCode < 200 || res.statusCode >= 300) {
    let payload: unknown = null;
    try {
      payload = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    } catch {
      payload = res.data;
    }
    const message =
      payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).error === 'string'
        ? String((payload as Record<string, unknown>).error)
        : `Upload failed: HTTP ${res.statusCode}`;
    void reportClientLog('miniapp_upload_server_failed', {
      name,
      mimeType,
      statusCode: res.statusCode,
      payload,
      message,
    });
    throw new ApiError(res.statusCode, message, payload);
  }

  const data = typeof res.data === 'string'
    ? (JSON.parse(res.data) as Record<string, unknown>)
    : (res.data as Record<string, unknown>);

  if (!data?.url) throw new ApiError(500, 'No URL returned from upload');
  options.onProgress?.(100, 'done');
  void reportClientLog('miniapp_upload_server_success', {
    name,
    mimeType,
    url: data.url,
  });
  return data.url as string;
}

async function requestUploadPresign(name: string, mimeType: string, type?: string): Promise<PresignUploadPayload> {
  return request<PresignUploadPayload>('/api/upload/presign', {
    method: 'POST',
    data: { filename: name, contentType: mimeType, type },
  });
}

async function uploadFileDirectToOss(
  file: string,
  name: string,
  mimeType: string,
  options: UploadMediaOptions,
): Promise<string> {
  void reportClientLog('miniapp_upload_oss_presign_start', {
    name,
    mimeType,
    type: options.type || null,
  });
  const presign = await requestUploadPresign(name, mimeType, options.type);
  void reportClientLog('miniapp_upload_oss_presign_success', {
    name,
    mimeType,
    type: options.type || null,
    hasPostUploadUrl: Boolean(presign.postUploadUrl),
    hasPostFormData: Boolean(presign.postFormData),
    publicUrl: presign.publicUrl || null,
    postMaxBytes: presign.postMaxBytes || null,
  });
  if (!presign.postUploadUrl || !presign.postFormData || !presign.publicUrl) {
    throw new ApiError(503, 'Direct upload unavailable');
  }

  let resolveConfirmed: ((res: { statusCode: number; data: string }) => void) | null = null;
  let confirmStarted = false;
  const confirmedByPublicUrl = new Promise<{ statusCode: number; data: string }>((resolve) => {
    resolveConfirmed = resolve;
  });

  const startPublicUrlConfirm = () => {
    if (confirmStarted) return;
    confirmStarted = true;
    void confirmPublicUrlReady(presign.publicUrl)
      .then(() => {
        void reportClientLog('miniapp_upload_oss_public_url_confirmed', {
          name,
          mimeType,
          publicUrl: presign.publicUrl,
        });
        resolveConfirmed?.({ statusCode: 200, data: '' });
      })
      .catch((error) => {
        void reportClientLog('miniapp_upload_oss_public_url_confirm_failed', {
          name,
          mimeType,
          publicUrl: presign.publicUrl,
          error: toLoggableError(error),
        });
      });
  };

  const uploadTask = Taro.uploadFile({
    url: presign.postUploadUrl,
    filePath: file,
    name: 'file',
    formData: presign.postFormData,
    timeout: 10 * 60 * 1000,
  });
  uploadTask.progress((progress) => {
    if (isUploadBytesComplete(progress)) {
      options.onProgress?.(99, 'confirming');
      startPublicUrlConfirm();
      return;
    }
    options.onProgress?.(clampUploadProgress(progress.progress), 'uploading');
  });
  uploadTask.catch((error) => {
    void reportClientLog('miniapp_upload_oss_task_late_failed', {
      name,
      mimeType,
      error: toLoggableError(error),
    });
  });
  const res = await Promise.race([uploadTask, confirmedByPublicUrl]);

  if (res.statusCode < 200 || res.statusCode >= 300) {
    void reportClientLog('miniapp_upload_oss_failed', {
      name,
      mimeType,
      statusCode: res.statusCode,
      data: res.data || null,
    });
    throw new ApiError(res.statusCode, `Direct upload failed: HTTP ${res.statusCode}`, res.data);
  }

  options.onProgress?.(99, 'processing');
  void notifyUploadServerSide(presign.publicUrl, name, mimeType);
  options.onProgress?.(100, 'done');
  void reportClientLog('miniapp_upload_oss_success', {
    name,
    mimeType,
    publicUrl: presign.publicUrl,
    statusCode: res.statusCode,
  });
  return presign.publicUrl;
}

async function uploadMediaFile(
  file: string,
  name: string,
  mimeType: string,
  options: UploadMediaOptions = {},
): Promise<string> {
  if (options.direct) {
    try {
      return await uploadFileDirectToOss(file, name, mimeType, options);
    } catch (error) {
      console.warn('[upload] direct OSS upload failed, falling back to server upload:', error);
      void reportClientLog('miniapp_upload_oss_fallback_to_server', {
        name,
        mimeType,
        type: options.type || null,
        error: toLoggableError(error),
      });
      options.onProgress?.(0);
    }
  }
  return uploadFile(file, name, mimeType, options);
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
    const result = await request<{ ok: boolean }>('/api/auth/session', {
      method: 'POST',
      data: { accessToken },
    });
    setAccessToken(accessToken);
    return result;
  },

  async getProfile(): Promise<ProfilePayload & { apiKey: string | null }> {
    const profile = await request<ProfilePayload>('/api/user/profile');
    const serverApiKey = typeof profile?.apiKey === 'string' ? profile.apiKey.trim() : '';
    return {
      ...profile,
      apiKey: serverApiKey || getApiKey(),
    };
  },

  async updateProfile(payload: { username?: string; fullName?: string; avatarUrl?: string | null }) {
    return request<ProfilePayload>('/api/user/profile', {
      method: 'PUT',
      data: payload as Record<string, unknown>,
    });
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
    setAccessToken(null);
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

  async uploadMedia(
    filePath: string,
    name: string,
    mimeType: string,
    options?: UploadMediaOptions,
  ): Promise<string> {
    return uploadMediaFile(filePath, name, mimeType, options);
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
  }): Promise<DigitalHumanTaskCreateResult> {
    const apiKey = getApiKey();
    const accessToken = getAccessToken();
    const header: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) header['X-User-Api-Key'] = apiKey;
    if (accessToken) header.Authorization = `Bearer ${accessToken}`;

    const res = await Taro.request({
      url: resolveUrl('/api/digital-human/videos'),
      method: 'POST',
      data: payload as unknown as Record<string, unknown>,
      header,
      timeout: REQUEST_TIMEOUT_MS,
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      const responsePayload = res.data as Record<string, unknown> | null;
      const message = (responsePayload?.error as string) ?? `HTTP ${res.statusCode}`;
      throw new ApiError(res.statusCode, message, responsePayload);
    }

    const responsePayload = res.data as {
      data?: DigitalHumanVideoRecord;
      jobs?: DigitalHumanVideoRecord[];
      videoIds?: string[];
      jobCount?: number;
      split?: boolean;
    } | null;
    return {
      ...(responsePayload?.data as DigitalHumanVideoRecord),
      jobs: responsePayload?.jobs,
      videoIds: responsePayload?.videoIds,
      jobCount: responsePayload?.jobCount ?? responsePayload?.jobs?.length,
      split: responsePayload?.split,
    };
  },

  async createActionTransferTask(payload: {
    imageUrl: string;
    videoUrl: string;
    durationSeconds?: number | null;
  }): Promise<DigitalHumanVideoRecord> {
    return request<DigitalHumanVideoRecord>('/api/action-transfer/videos', {
      method: 'POST',
      data: payload as unknown as Record<string, unknown>,
    });
  },
};
